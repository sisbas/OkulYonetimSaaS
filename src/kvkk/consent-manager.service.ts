import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { RequestContext } from '../common/context/request-context';
import {
  TRANSACTIONAL_AUDIT_WRITER,
  TransactionalAuditWriter,
} from '../common/audit/transactional-audit-writer';
import { RedactionReceipt } from '../common/audit/transactional-audit.types';
import { ConsentSubjectType } from './consent-authority';

export type ConsentRowSnapshot = Readonly<{
  consentId: string;
  subjectType: ConsentSubjectType;
  subjectRefId: string;
  consentType: string;
  status: string;
  version: number;
  revokedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  legalBasis: string | null;
  retentionDays: number | null;
}>;

export type ConsentRevokeResult = Readonly<{
  consentId: string;
  subjectType: ConsentSubjectType;
  subjectRefId: string;
  consentType: string;
  status: string;
  version: number;
}>;

export type ConsentRowRecord = {
  consent_id: string;
  subject_type: string;
  subject_ref_id: string;
  consent_type: string;
  status: string;
  version: number | null;
  revoked_at: Date | null;
  expires_at: Date | null;
  created_at: Date | null;
  legal_basis: string | null;
  retention_days: number | null;
};

function toSnapshot(row: ConsentRowRecord): ConsentRowSnapshot {
  return Object.freeze({
    consentId: String(row.consent_id),
    subjectType: String(row.subject_type) as ConsentSubjectType,
    subjectRefId: String(row.subject_ref_id),
    consentType: String(row.consent_type),
    status: String(row.status),
    version: Number(row.version ?? 0),
    revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : null,
    createdAt: new Date(String(row.created_at)).toISOString(),
    legalBasis: row.legal_basis === null ? null : String(row.legal_basis),
    retentionDays:
      row.retention_days === null ? null : Number(row.retention_days),
  });
}

/**
 * KVKK redaction kanıtı: audit metadata'sının kendisi PII taşımaz —
 * `redactionReceipt`, yazılan metadata anahtarları üzerinden DÜRÜSTçe
 * ölçülür (PR #414 Q5): evaluated = anahtar sayısı, redacted = 0,
 * skipped = evaluated (hiçbir alan maskelenmedi çünkü hiçbiri PII değil).
 */
function noneRedactionReceipt(
  metadata: Readonly<Record<string, unknown>>,
): RedactionReceipt {
  const evaluatedFieldCount = Object.keys(metadata).length;
  return Object.freeze({
    strategy: 'none' as const,
    evaluatedFieldCount,
    redactedFieldCount: 0,
    skippedFieldCount: evaluatedFieldCount,
    appliedAt: new Date().toISOString(),
  });
}

/**
 * TypeORM postgres sürücüsü UPDATE/DELETE sorgularında `[rows, rowCount]`
 * tuple'ı döner; SELECT/INSERT ise doğrudan `rows` dizisi. Ham sonucu
 * satır dizisine indirger (bkz. NotificationOutboxRepository.extractRows).
 */
function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as T[];
  }
  return (result ?? []) as T[];
}

/**
 * KVKK consent authority değişim yüzeyi (#266 / P1B-FINAL Stage 5).
 *
 * Okuma + revoke, `ConsentAuthority` ile AYNI tablo ve lineage
 * sözleşmesini kullanır (tenant + subject predicate, max-version).
 * Revoke, yalnız güncel `approved` satırı `revoked` yapar ve version
 * bump eder; `dataprotection.consent.revoked` audit kaydı domain mutasyonuyla
 * AYNI transaction'da `audit_logs` zincirine yazılır (Madde III: audit,
 * mutasyonla birlikte commit/rollback olur).
 *
 * Ham PII taşınmaz: liste/revoke yanıtları yalnız subject ref (UUID)
 * ve consent türü/statüsü döndürür.
 */
@Injectable()
export class ConsentManagerService {
  constructor(
    @Inject(TRANSACTIONAL_AUDIT_WRITER)
    private readonly audit: TransactionalAuditWriter,
  ) {}

  async listConsents(
    entityManager: EntityManager,
    context: RequestContext,
    subjectType?: string,
  ): Promise<ConsentRowSnapshot[]> {
    const tenantId = context?.tenantId;
    if (typeof tenantId !== 'string' || !tenantId.trim()) {
      throw new ForbiddenException('CONSENT_TENANT_SCOPE_REQUIRED');
    }
    const rows = (await entityManager.query(
      `SELECT c.id AS consent_id,
              s.subject_type, s.subject_ref_id,
              c.consent_type, c.status, c.version,
              c.revoked_at, c.expires_at, c.created_at,
              c.legal_basis, c.retention_days
         FROM kvkk_consents c
         JOIN kvkk_consent_subjects s
           ON s.id = c.subject_id AND s.tenant_id = c.tenant_id
        WHERE c.tenant_id = $1
          AND s.status = 'active'
          AND ($2::varchar IS NULL OR s.subject_type = $2)
        ORDER BY s.subject_ref_id, c.consent_type, c.version DESC`,
      [tenantId, subjectType ?? null],
    )) as ConsentRowRecord[];

    // Dayanıklı okuma audit'i (PR #414 Q7): hassas consent yüzeyine erişim
    // KVKK madde 12 gereği kayda geçer. `entityId` = tenant (consent
    // yüzeyinin sahibi); yanıt PII taşımaz (yalnızca ref UUID + statü).
    // Aynı transaction (Madde III): domain okuması rollback olursa audit de gitmez.
    const readMetadata = {
      schemaVersion: 1 as const,
      tenantId,
      actorUserId: context.userId ?? context.user?.userId ?? null,
      actorSessionId: null,
      requestId: context.requestId,
      entityType: 'dataprotection' as const,
      entityId: tenantId,
      result: 'success' as const,
      // Okuma hiçbir alanı değiştirmez; sahte 'purpose' beyanı yerine dürüst boş (#462).
      changedFields: [] as const,
    };
    await this.audit.write(entityManager, 'dataprotection.consent.read', {
      ...readMetadata,
      redactionReceipt: noneRedactionReceipt(readMetadata),
    });

    return rows.map(toSnapshot);
  }

  async revokeConsent(
    entityManager: EntityManager,
    context: RequestContext,
    input: Readonly<{
      subjectRefId: string;
      subjectType: ConsentSubjectType;
      consentType: string;
    }>,
  ): Promise<ConsentRevokeResult> {
    const tenantId = context?.tenantId;
    if (typeof tenantId !== 'string' || !tenantId.trim()) {
      throw new ForbiddenException('CONSENT_TENANT_SCOPE_REQUIRED');
    }
    if (!input.subjectRefId || !input.consentType) {
      throw new ForbiddenException('CONSENT_REVOKE_INPUT_REQUIRED');
    }

    const updated = extractRows<{
      id: string;
      consent_type: string;
      status: string;
      version: number | null;
    }>(
      await entityManager.query(
        `WITH latest AS (
         SELECT c.id, c.status
           FROM kvkk_consents c
           JOIN kvkk_consent_subjects s
             ON s.id = c.subject_id AND s.tenant_id = c.tenant_id
          WHERE c.tenant_id = $1
            AND s.subject_ref_id = $2
            AND s.subject_type = $3
            AND s.status = 'active'
            AND c.consent_type = $4
          ORDER BY c.version DESC NULLS LAST, c.created_at DESC NULLS LAST, c.id DESC
          LIMIT 1
       )
       UPDATE kvkk_consents c
          SET status = 'revoked',
              revoked_at = now(),
              updated_at = now(),
              version = c.version + 1
         FROM latest l
        WHERE c.id = l.id
          AND c.status = 'approved'
          AND c.revoked_at IS NULL
        RETURNING c.id, c.consent_type, c.status, c.version`,
        [tenantId, input.subjectRefId, input.subjectType, input.consentType],
      ),
    );

    if (updated.length === 0) {
      throw new ConflictException(
        'Consent not in an approved state for the given subject and type',
      );
    }

    const row = updated[0];
    // Dürüst audit kanıtı (PR #414 Q5): revoke'un gerçekte değiştirdiği
    // kolonlar (`status`, `revoked_at`, `version`) + payload'dan ölçülmüş
    // redactionReceipt. Uydurma `purpose`/`legalBasis` iddiası yoktur.
    const revokeMetadata = {
      schemaVersion: 1 as const,
      tenantId,
      actorUserId: context.userId ?? context.user?.userId ?? null,
      actorSessionId: null,
      requestId: context.requestId,
      entityType: 'dataprotection' as const,
      entityId: String(row.id),
      result: 'success' as const,
      changedFields: ['status', 'revokedAt', 'version'] as const,
    };
    await this.audit.write(entityManager, 'dataprotection.consent.revoked', {
      ...revokeMetadata,
      redactionReceipt: noneRedactionReceipt(revokeMetadata),
    });

    return Object.freeze({
      consentId: String(row.id),
      subjectType: input.subjectType,
      subjectRefId: input.subjectRefId,
      consentType: String(row.consent_type),
      status: String(row.status),
      version: Number(row.version ?? 0),
    });
  }
}