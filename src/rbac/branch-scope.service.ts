import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';

import { AuthorizationContextError } from '../common/context/authorization-context';
import { RequestBranch, RequestUser } from '../common/context/request-context';
import { ServerResolvedAuthority } from '../common/context/authorization-context';

/** Yetki girdisi: yalnızca sunucudan çözülmüş aktör bilgisi. */
export type BranchScopeActor = {
  tenantId: string;
  userId: string;
  roles: ReadonlyArray<string>;
  permissions: ReadonlyArray<string>;
};

export type BranchScopeEntry = { branchId: string; name: string; code?: string };
export type BranchSelection = { branchId?: string | null; branchName?: string | null; branchCode?: string | null };
export type SessionBranchContext = {
  authority: ServerResolvedAuthority;
  accessible: BranchScopeEntry[];
  branch: RequestBranch | null;
};

const OVERSIGHT_ROLES: ReadonlyArray<string> = ['tenant_admin', 'operations_manager'];
const BRANCH_READ_PERMISSION = 'tenant:branch:read';

function normalizeBranchName(value: string): string {
  return value.trim().toLocaleLowerCase('tr');
}

/**
 * Şube (branch) kapsamı — sunucu-tek-kaynak (#339 R4, madde 1 & 2).
 *
 * Kapsam SUNUCUDAN belirlenir:
 *  - gözetim rolleri (`tenant_admin`, `operations_manager`) veya
 *    `tenant:branch:read` izni olan aktör → tenant'ın TÜM aktif şubeleri;
 *  - `teachers` kaydına bağlı aktör → yalnızca `teacher_branches` üzerinden
 *    aktif dönemde atanmış şubeler;
 *  - diğer aktörler → BOŞ küme (fail-closed; şube yetkisi verilmez).
 *
 * İstemcinin gönderdiği `branchId`/şube adı yalnızca bir SEÇİM girdisidir:
 * sunucunun yetkili kümesinde karşılığı yoksa erişim reddedilir
 * (`unauthorized_branch` → non-enumerating 404).
 */
@Injectable()
export class BranchScopeService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  hasOversight(actor: BranchScopeActor): boolean {
    return (
      actor.roles.some((role) => OVERSIGHT_ROLES.includes(role)) ||
      actor.permissions.includes(BRANCH_READ_PERMISSION)
    );
  }

  /** Aktörün erişebildiği şubeler (insan-okur adlarla). */
  async listAccessibleBranches(actor: BranchScopeActor, database: Pick<EntityManager, 'query'> = this.dataSource): Promise<BranchScopeEntry[]> {
    if (this.hasOversight(actor)) {
      const rows = (await database.query(
        `
          SELECT b.id::text AS "branchId", b.name AS "name", b.code AS "code"
          FROM branches b
          WHERE b.tenant_id = $1::uuid
            AND b.status = 'active'
            AND b.deleted_at IS NULL
          ORDER BY "name" ASC, "code" ASC, "branchId" ASC
        `,
        [actor.tenantId],
      )) as BranchScopeEntry[];
      return rows ?? [];
    }

    const rows = (await database.query(
      `
        SELECT DISTINCT b.id::text AS "branchId", b.name AS "name", b.code AS "code"
        FROM branches b
        JOIN teacher_branches tb
          ON tb.branch_id = b.id
         AND tb.tenant_id = b.tenant_id
        JOIN teachers t
          ON t.id = tb.teacher_id
         AND t.tenant_id = tb.tenant_id
        WHERE b.tenant_id = $1::uuid
          AND b.status = 'active'
          AND b.deleted_at IS NULL
          AND t.user_id = $2::uuid
          AND t.status = 'active'
          AND t.deleted_at IS NULL
          AND tb.status = 'active'
          AND tb.deleted_at IS NULL
          AND tb.deactivated_at IS NULL
          AND tb.effective_from <= CURRENT_DATE
          AND (tb.effective_to IS NULL OR tb.effective_to >= CURRENT_DATE)
        ORDER BY "name" ASC, "code" ASC, "branchId" ASC
      `,
      [actor.tenantId, actor.userId],
    )) as BranchScopeEntry[];
    return rows ?? [];
  }

  /**
   * İstemci seçimini sunucunun yetkili kümesiyle eşler.
   *
   * - Seçim yok: erişilebilir tek şube varsa varsayılan olarak o kullanılır;
   *   sıfır veya birden fazla şube varsa örtük seçim YAPILMAZ (null).
   * - Seçim var: yetkili kümede tam olarak bir eşleşme yoksa
   *   `unauthorized_branch` fırlatılır (belirsiz ad da reddedilir).
   *
   * `preloadedAccessible` verilirse yetkili küme YENİDEN sorgulanmaz: aynı
   * istekte erişilebilir liste zaten yüklendiyse (ör. katalog uç noktası), hem
   * çift sorgu önlenir hem de `branches` ile `activeBranch` AYNI anlık
   * görüntüden gelir (eşzamanlı atama değişikliklerinde tutarsız yanıt olmaz).
   */
  async resolveSelection(
    actor: BranchScopeActor,
    selection: BranchSelection = {},
    preloadedAccessible?: ReadonlyArray<BranchScopeEntry>,
  ): Promise<RequestBranch | null> {
    const accessible = preloadedAccessible ?? (await this.listAccessibleBranches(actor));
    const requestedId = selection.branchId?.trim();
    const requestedName = selection.branchName?.trim();
    const requestedCode = selection.branchCode?.trim();
    if ((selection.branchName != null && !requestedName) ||
        (selection.branchCode != null && !requestedCode) ||
        (selection.branchId != null && !requestedId)) {
      throw new AuthorizationContextError('unauthorized_branch');
    }

    if (!requestedId && !requestedName && !requestedCode) {
      if (accessible.length !== 1) return null;
      return {
        branchId: accessible[0].branchId,
        branchName: accessible[0].name,
        source: 'membership_default',
      };
    }

    const matches = accessible.filter((entry) => {
      if (requestedCode && entry.code !== requestedCode) return false;
      if (requestedId) return entry.branchId === requestedId;
      if (!requestedName) return Boolean(requestedCode);
      return normalizeBranchName(entry.name) === normalizeBranchName(requestedName as string);
    });
    if (matches.length !== 1) {
      // 0 eşleşme (yok/başka tenant/başka şube) ve >1 eşleşme (belirsiz ad)
      // AYNI hatayı üretir; kaynak varlığı hakkında bilgi sızmaz.
      throw new AuthorizationContextError('unauthorized_branch');
    }
    return {
      branchId: matches[0].branchId,
      branchName: matches[0].name,
      source: 'request_selection',
    };
  }

  /** Fresh database authority and session binding, never the authority cache.
   * A repeatable-read snapshot binds the selection and authorized branch set.
   * Selection writes use SERIALIZABLE plus a session row lock. Serialization
   * conflicts fail closed; every subsequent request revalidates current access.
   */
  async sessionContext(
    user: RequestUser,
    options: { selection?: BranchSelection; requireSelection?: boolean; branchIdHeader?: string; recoverSelection?: boolean;
      resources?: ReadonlyArray<{ table: 'leave_requests' | 'schedule_events' | 'schedules' | 'attendance_sessions'; id: string }> } = {},
  ): Promise<SessionBranchContext> {
    if (!user.sessionId || user.authorizationVersion == null) {
      throw new AuthorizationContextError('missing_authenticated_user');
    }
    const selecting = options.selection !== undefined;
    return this.dataSource.transaction(selecting ? 'SERIALIZABLE' : 'REPEATABLE READ', async (manager) => {
      const rows = await manager.query(`
        SELECT s.selected_branch_id::text AS "selectedBranchId",
               s.selected_branch_version AS "selectedBranchVersion",
               u.token_version AS "tokenVersion"
        FROM user_sessions s
        JOIN users u ON u.id = s.user_id AND u.status = 'active' AND u.deleted_at IS NULL
        JOIN tenant_memberships tm ON tm.user_id = u.id AND tm.tenant_id = s.tenant_id
          AND tm.status = 'active' AND tm.deleted_at IS NULL
        JOIN tenants t ON t.id = s.tenant_id AND t.status = 'active' AND t.deleted_at IS NULL
        WHERE s.id = $1::uuid AND s.tenant_id = $2::uuid AND s.user_id = $3::uuid
          AND s.status = 'active' AND s.revoked_at IS NULL AND s.expires_at > now()
        ${selecting ? 'FOR UPDATE OF s' : ''}
      `, [user.sessionId, user.tenantId, user.userId]);
      const session = rows[0];
      if (!session) throw new AuthorizationContextError('missing_authenticated_user');
      if (Number(session.tokenVersion) !== Number(user.authorizationVersion)) {
        throw new AuthorizationContextError('stale_authorization_version');
      }
      const roleRows = await manager.query(`
        SELECT DISTINCT r.name AS role, p.code AS permission
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id AND r.tenant_id = ur.tenant_id AND r.deleted_at IS NULL
        LEFT JOIN role_permissions rp ON rp.role_id = r.id
        LEFT JOIN permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = $1::uuid AND ur.tenant_id = $2::uuid
      `, [user.userId, user.tenantId]);
      const roles: string[] = [...new Set<string>(roleRows.map((row: { role: string }) => row.role))].sort();
      if (roles.length === 0) throw new AuthorizationContextError('unresolved_authority');
      const permissions: string[] = [...new Set<string>(roleRows
        .map((row: { permission: string | null }) => row.permission).filter(Boolean))].sort();
      const actor = { tenantId: user.tenantId, userId: user.userId, roles, permissions };
      const accessible = await this.listAccessibleBranches(actor, manager);
      let branch: RequestBranch | null;
      if (selecting) {
        // An empty/whitespace selection is never a request to choose a default.
        if (!options.selection?.branchName?.trim() && !options.selection?.branchCode?.trim()) {
          throw new AuthorizationContextError('unauthorized_branch');
        }
        branch = await this.resolveSelection(actor, options.selection, accessible);
        if (!branch) throw new AuthorizationContextError('unauthorized_branch');
        const updated = await manager.query(`
          UPDATE user_sessions SET selected_branch_id = $4::uuid, selected_branch_version = $5
          WHERE id = $1::uuid AND tenant_id = $2::uuid AND user_id = $3::uuid
            AND status = 'active' AND revoked_at IS NULL AND expires_at > now()
          RETURNING id
        `, [user.sessionId, user.tenantId, user.userId, branch.branchId, session.tokenVersion]);
        if (updated[0].length !== 1) throw new AuthorizationContextError('missing_authenticated_user');
      } else if (options.recoverSelection) {
        // The authenticated selection route can replace a revoked selection.
        // It grants no business permission and still verifies fresh authority.
        branch = null;
      } else {
        if (session.selectedBranchId && Number(session.selectedBranchVersion) !== Number(session.tokenVersion)) {
          throw new AuthorizationContextError('stale_authorization_version');
        }
        branch = await this.resolveSelection(actor, { branchId: session.selectedBranchId }, accessible);
        if (!session.selectedBranchId && accessible.length > 1 && options.requireSelection) {
          throw new AuthorizationContextError('unauthorized_branch');
        }
      }
      if (options.branchIdHeader && options.branchIdHeader !== branch?.branchId) {
        throw new AuthorizationContextError('unauthorized_branch');
      }
      for (const resource of options.resources ?? []) {
        if (!branch) throw new AuthorizationContextError('unauthorized_branch');
        // Tables originate exclusively from the guard's closed route map.
        const matches = await manager.query(`SELECT id FROM ${resource.table}
          WHERE id = $1::uuid AND tenant_id = $2::uuid AND branch_id = $3::uuid`,
        [resource.id, user.tenantId, branch.branchId]);
        if (matches.length !== 1) throw new AuthorizationContextError('unauthorized_branch');
      }
      return { accessible, branch, authority: {
        roles, permissions, tokenVersion: Number(session.tokenVersion),
        resolvedAt: new Date().toISOString(), cache: 'disabled',
      } };
    });
  }
}
