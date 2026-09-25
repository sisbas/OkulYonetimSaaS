import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AuthorizationContextError } from '../common/context/authorization-context';
import { RequestBranch } from '../common/context/request-context';

/** Yetki girdisi: yalnızca sunucudan çözülmüş aktör bilgisi. */
export type BranchScopeActor = {
  tenantId: string;
  userId: string;
  roles: ReadonlyArray<string>;
  permissions: ReadonlyArray<string>;
};

export type BranchScopeEntry = { branchId: string; name: string };

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
  async listAccessibleBranches(actor: BranchScopeActor): Promise<BranchScopeEntry[]> {
    if (this.hasOversight(actor)) {
      const rows = (await this.dataSource.query(
        `
          SELECT b.id::text AS "branchId", b.name AS "name"
          FROM branches b
          WHERE b.tenant_id = $1::uuid
            AND b.status = 'active'
            AND b.deleted_at IS NULL
          ORDER BY b.name ASC, b.id ASC
        `,
        [actor.tenantId],
      )) as BranchScopeEntry[];
      return rows ?? [];
    }

    const rows = (await this.dataSource.query(
      `
        SELECT DISTINCT b.id::text AS "branchId", b.name AS "name"
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
        ORDER BY b.name ASC, b.id ASC
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
   */
  async resolveSelection(
    actor: BranchScopeActor,
    selection: { branchId?: string | null; branchName?: string | null } = {},
  ): Promise<RequestBranch | null> {
    const accessible = await this.listAccessibleBranches(actor);
    const requestedId = selection.branchId?.trim();
    const requestedName = selection.branchName?.trim();

    if (!requestedId && !requestedName) {
      if (accessible.length !== 1) return null;
      return {
        branchId: accessible[0].branchId,
        branchName: accessible[0].name,
        source: 'membership_default',
      };
    }

    const matches = accessible.filter((entry) => {
      if (requestedId) return entry.branchId === requestedId;
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
}
