import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { AuthorizationContextError, selectActiveRole } from '../common/context/authorization-context';
import { RequestBranch, RequestContext } from '../common/context/request-context';
import { contextCapabilities } from '../common/config/feature-flags';
import { BranchScopeActor, BranchScopeService, BranchSelection } from './branch-scope.service';

/**
 * Versioned context/catalog sözleşme sürümü (#339 R4, madde 3).
 *
 * v2 (#482): `capabilities` alanı eklendi (ADR 0003 D3). Alan additive
 * olduğu için sürüm bump'ı yalnız sözleşme tüketicilerine sinyal verir;
 * `permissions` kanalı K-43 gereği değişmez.
 */
export const CONTEXT_CATALOG_VERSION = 'context-catalog:v2';

export type ContextCatalog = {
  version: string;
  institution: { name: string };
  /**
   * Rol YALNIZ insan-okur etiketle döner (#339 review P2 / F2): iç snake_case
   * rol kodu (`operations_manager`) sözleşmeden kaldırılmıştır — iç
   * isimlendirme sızıntısı yasak (madde 3: iç UUID/ETag/jargon dönmez).
   */
  role: { label: string } | null;
  /**
   * Aktörün etkili izin anahtarları (#445): kapasite odaklı arayüz için
   * makine-okur yetkinlik kanalı. İzin anahtarı kullanıcıya sızdırılan
   * açıklayıcı metin DEĞİLDİR; gizlenen kontrol hiçbir zaman zorlama değildir
   * — zorlama sunucu @Permissions guard'ındadır (API seam testi #445).
   */
  permissions: string[];
  /**
   * Deploy'da AÇIK olan ürün yüzeyleri (#482, ADR 0003 D3). İzin kodu veya
   * yetki kararı değildir; yalnız "bu yüzey bu kurulumda var mı" sinyalidir.
   * Flag kapalıyken boş dizi döner ve ilgili route'lar hiç kaydedilmez (404).
   */
  capabilities: string[];
  branches: Array<{ name: string; code?: string }>;
  activeBranch: { name: string; code?: string } | null;
};

/**
 * Rol anahtarı → insan-okur etiket. Katalog yanıtı TÜRKÇE etiketi döner;
 * ham snake_case rol adı yanıta HİÇBİR alanda konmaz (iç isimlendirme sızıntısı
 * olarak değerlendirilir — bkz. `ContextCatalog.role` sözleşmesi).
 */
const ROLE_LABELS: Readonly<Record<string, string>> = {
  tenant_admin: 'Kurum Yöneticisi',
  operations_manager: 'Operasyon Yöneticisi',
  teacher: 'Öğretmen',
  teacher_assistant: 'Öğretmen Yardımcısı',
  student: 'Öğrenci',
  parent: 'Veli',
};

/**
 * Bilinmeyen roller için jargon üretmeyen okunabilir etiket:
 * `okul_muduru` → `Okul Muduru`.
 */
export function roleLabel(role: string | null | undefined): string | null {
  if (!role) return null;
  const known = ROLE_LABELS[role];
  if (known) return known;
  const humanized = role.replace(/[_:.]+/g, ' ').trim();
  if (!humanized) return null;
  return humanized.charAt(0).toLocaleUpperCase('tr') + humanized.slice(1);
}

/** İzin anahtarları: kopyaları atıp sıralar; null olmayanlar şablonla sınırlıdır. */
function uniqueSortedPermissions(values: unknown): string[] {
  return [...new Set(
    Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : [],
  )].sort();
}

/**
 * Erişilebilir kurum/şubeleri insan-okur adlarla döndüren versioned katalog.
 *
 * Sözleşme (madde 3): yanıt iç UUID, ETag, optimistic-lock anahtarı veya iç
 * izin kodu taşımaz; kurum/şube ADLARI ve rol ETİKETİ döner. İçerik daima
 * çağıranın sunucudan çözülmüş kapsamıyla sınırlıdır (başka kurum/şube sızmaz).
 */
@Injectable()
export class ContextCatalogService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly branchScope: BranchScopeService,
  ) {}

  async build(
    context: RequestContext,
    selection: BranchSelection = {},
  ): Promise<ContextCatalog> {
    const tenantId = context.tenantId;
    const userId = context.userId ?? context.user?.userId;
    if (!tenantId || !userId) {
      throw new AuthorizationContextError('missing_tenant_scope');
    }
    const actor: BranchScopeActor = {
      tenantId,
      userId,
      roles: context.roles ?? context.user?.roleIds ?? [],
      permissions: context.permissions ?? context.user?.permissions ?? [],
    };

    const persisted = context.user?.sessionId
      ? await this.branchScope.sessionContext(context.user, {
          ...(Object.keys(selection).length ? { selection } : {}),
        })
      : null;
    const accessible = persisted?.accessible ?? await this.branchScope.listAccessibleBranches(actor);
    // Seçim, ZATEN YÜKLENMİŞ kümeden çözülür: çift sorgu yok ve `branches` ile
    // `activeBranch` aynı anlık görüntüden gelir (#339 review P2).
    const activeBranch: RequestBranch | null = persisted ? persisted.branch : await this.branchScope.resolveSelection(
      actor,
      selection,
      accessible,
    );
    const institutionName = await this.loadInstitutionName(tenantId);
    const activeCode = accessible.find((entry) => entry.branchId === activeBranch?.branchId)?.code;
    const activeRole = persisted ? selectActiveRole(persisted.authority.roles as string[]) : context.activeRole;
    // İzin anahtarları sunucu-tek-kaynaktan (#339 madde 4): kalıcı oturumda
    // taze veritabanı yetkisinden, yoksa istek bağlamı claim'lerinden. Kopya
    // çıkarılıp sıralanır; boş küme fail-closed arayüz üretir (bugün hariç).
    const rawPermissions = persisted
      ? persisted.authority.permissions
      : actor.permissions;
    const permissions = uniqueSortedPermissions(rawPermissions);

    return {
      version: CONTEXT_CATALOG_VERSION,
      institution: { name: institutionName },
      // İç rol kodu (snake_case) YAYIMLANMAZ; yalnız insan-okur etiket (#339 review P2 / F2).
      role: activeRole ? { label: roleLabel(activeRole) as string } : null,
      permissions,
      capabilities: contextCapabilities(),
      branches: accessible.map((entry) => ({ name: entry.name, ...(entry.code ? { code: entry.code } : {}) })),
      activeBranch: activeBranch ? {
        name: activeBranch.branchName,
        ...(activeCode ? { code: activeCode } : {}),
      } : null,
    };
  }

  /** Kurum adı — tenant kapsamı dışına çıkılamaz (WHERE id = tenantId). */
  private async loadInstitutionName(tenantId: string): Promise<string> {
    const rows = (await this.dataSource.query(
      `
        SELECT t.name AS "name"
        FROM tenants t
        WHERE t.id = $1::uuid
          AND t.status = 'active'
          AND t.deleted_at IS NULL
        LIMIT 1
      `,
      [tenantId],
    )) as Array<{ name: string }>;
    const name = rows?.[0]?.name;
    if (!name) {
      // Kurum bulunamadı/pasif → bağlam çözülemez (fail-closed, enum yok).
      throw new AuthorizationContextError('missing_tenant_scope');
    }
    return name;
  }
}
