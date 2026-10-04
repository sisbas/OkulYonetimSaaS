import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';

import {
  contactBlindIndex,
  decryptContactValue,
  encryptContactValue,
  EncryptedContactEnvelope,
  resolveContactKeyRing,
} from '../kvkk/contact-crypto';
import { ContactChannel, ContactVerificationStatus } from './contact-point.entity';
import { maskContactValue } from './contact-masking';
import { ParentContactStatus } from './parent-contact.entity';
import { StudentParentContactStatus } from './student-parent-contact.entity';

/**
 * #266 N1a — Parent contact / contact point / student-link deposu.
 *
 * Sözleşme:
 * - Tüm yazımlar **çağıranın transaction'ında** çalışır
 *   (`entityManager`); domain mutasyonu, encrypted write ve
 *   (servis katmanındaki) audit aynı transaction'da atomiktir.
 * - Depo **yetki uygulamaz**: caller (servis/controller) tenant/
 *   branch/permission kontrolünü yapar; depo yalnızca tenant/
 *   branch predicate'lerini SQL'e zorunlu kılar (defense-in-depth).
 * - Ham contact değeri yalnız `createParentContactWithPoint`'te
 *   belirtilir ve **anında** AES-256-GCM envelope'a dönüştürülür;
 *   masked read hiç plaintext döndürmez; raw read yalnız
 *   yetkili actor için (caller permission'ı) ve purpose-bound
 *   AAD doğrulamasıyla çözülür.
 * - Optimistic concurrency: geçişler `expectedVersion` ile korunur;
 *   stale version'da 0 satır etkilenir → `ConflictException`.
 */

/** Contact encryption AAD purpose domain. */
export const CONTACT_CRYPTO_PURPOSE = 'parent_contact.point';

export type CreateParentContactInput = Readonly<{
  tenantId: string;
  guardianRefId: string | null;
  channel: ContactChannel;
  rawValue: string;
}>;

export type CreatedParentContact = Readonly<{
  parentContactId: string;
  contactPointId: string;
  maskedDisplay: string;
  blindIndex: string | null;
  channel: ContactChannel;
  verificationStatus: ContactVerificationStatus;
}>;

export type MaskedContactPoint = Readonly<{
  id: string;
  parentContactId: string;
  channel: ContactChannel;
  maskedDisplay: string;
  verificationStatus: ContactVerificationStatus;
  verificationEvidenceRef: string | null;
  status: string;
  version: number;
}>;

export type StudentContactReadInput = Readonly<{
  tenantId: string;
  studentId: string;
  branchId: string;
  at?: Date;
}>;

export type AuthorizedRawReadInput = Readonly<{
  tenantId: string;
  contactPointId: string;
}>;

export type LinkParentContactInput = Readonly<{
  tenantId: string;
  studentId: string;
  parentContactId: string;
  branchId: string;
  effectiveFrom?: Date;
  effectiveTo?: Date | null;
}>;

export type TransitionInput = Readonly<{
  tenantId: string;
  recordId: string;
  expectedVersion: number;
  status: string;
  verificationStatus?: ContactVerificationStatus;
  verificationEvidenceRef?: string | null;
}>;

type ContactPointRow = {
  id: string;
  tenant_id: string;
  parent_contact_id: string;
  channel: string;
  encrypted_value: string;
  masked_display: string;
  verification_status: string;
  verification_evidence_ref: string | null;
  status: string;
  version: number;
};

function normalizeContactValue(channel: ContactChannel, raw: string): string {
  if (channel === 'email') return raw.trim().toLowerCase();
  return raw.replace(/\D/g, '');
}

/**
 * TypeORM 0.3.30 postgres QueryRunner dönüş şeklini normalize eder:
 * UPDATE/DELETE sorguları `[rows, rowCount]` tuple'ı döner;
 * SELECT/INSERT ise `rows` dizisi (PostgresQueryRunner.query
 * `result.raw` ataması). Her iki durumda da affected satır
 * dizisini verir.
 */
function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as T[];
  }
  return (result ?? []) as T[];
}

function toMaskedProjection(row: ContactPointRow): MaskedContactPoint {
  return {
    id: row.id,
    parentContactId: row.parent_contact_id,
    channel: row.channel as ContactChannel,
    maskedDisplay: row.masked_display,
    verificationStatus: row.verification_status as ContactVerificationStatus,
    verificationEvidenceRef: row.verification_evidence_ref,
    status: row.status,
    version: row.version,
  };
}

@Injectable()
export class ParentContactRepository {
  constructor() {
    // Fail-closed konfigürasyon kontrolü (#266 review P2 örüntüsü):
    // eksik/zayıf contact anahtarı süreci ilk encrypted yazımında
    // değil BAŞLANGIÇTA durdurur. Production'da plaintext fallback
    // yoktur.
    resolveContactKeyRing();
  }

  /**
   * Parent contact + encrypted contact point'i tek transaction'da
   * oluşturur. Ham değer anında envelope'a dönüşür; hiçbir
   * plaintext sütuna yazılmaz.
   */
  async createParentContactWithPoint(
    entityManager: EntityManager,
    input: CreateParentContactInput,
  ): Promise<CreatedParentContact> {
    const parentContactId = randomUUID();
    const contactPointId = randomUUID();

    const envelope = encryptContactValue({
      plaintext: input.rawValue,
      tenantId: input.tenantId,
      recordId: contactPointId,
      purpose: CONTACT_CRYPTO_PURPOSE,
    });
    const maskedDisplay = maskContactValue(input.channel, input.rawValue);
    const blindIndex = contactBlindIndex({
      normalizedValue: normalizeContactValue(input.channel, input.rawValue),
      tenantId: input.tenantId,
      purpose: CONTACT_CRYPTO_PURPOSE,
    });

    await entityManager.query(
      `INSERT INTO parent_contacts (id, tenant_id, guardian_ref_id, status, version)
       VALUES ($1, $2, $3, 'active', 1)`,
      [parentContactId, input.tenantId, input.guardianRefId],
    );

    await entityManager.query(
      `INSERT INTO contact_points
         (id, tenant_id, parent_contact_id, channel, encrypted_value,
          masked_display, blind_index, verification_status, status, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'unverified', 'active', 1)`,
      [
        contactPointId,
        input.tenantId,
        parentContactId,
        input.channel,
        JSON.stringify(envelope),
        maskedDisplay,
        blindIndex,
      ],
    );

    return {
      parentContactId,
      contactPointId,
      maskedDisplay,
      blindIndex,
      channel: input.channel,
      verificationStatus: 'unverified',
    };
  }

  /**
   * Student ↔ parent contact same-tenant ilişkisi kurar.
   * Composite FK + tenant predicate başka tenant association'ını
   * DB seviyesinde engeller; depo aynı zamanda explicit same-tenant
   * doğrulaması yapar (defense-in-depth, net hata).
   */
  async linkParentContactToStudent(
    entityManager: EntityManager,
    input: LinkParentContactInput,
  ): Promise<{ linkId: string }> {
    const owned = (await entityManager.query(
      `SELECT id FROM parent_contacts
        WHERE tenant_id = $1 AND id = $2 AND status = 'active' AND deleted_at IS NULL`,
      [input.tenantId, input.parentContactId],
    )) as Array<{ id: string }>;
    if (owned.length === 0) {
      throw new Error('ParentContact not found or not active for this tenant');
    }

    const linkId = randomUUID();
    await entityManager.query(
      `INSERT INTO student_parent_contacts
         (id, tenant_id, student_id, parent_contact_id, branch_id,
          effective_from, effective_to, status, version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', 1)
       ON CONFLICT (tenant_id, student_id, parent_contact_id, branch_id) DO NOTHING`,
      [
        linkId,
        input.tenantId,
        input.studentId,
        input.parentContactId,
        input.branchId,
        input.effectiveFrom ?? new Date(),
        input.effectiveTo ?? null,
      ],
    );
    return { linkId };
  }

  /**
   * Masked/minimized projeksiyon: tenant + branch + student scope,
   * yalnız active/effective link ve active contact point.
   * **Hiç plaintext, envelope veya blind index döndürmez.**
   */
  async findMaskedContactPointsForStudent(
    entityManager: EntityManager,
    input: StudentContactReadInput,
  ): Promise<MaskedContactPoint[]> {
    const at = input.at ?? new Date();
    const rows = (await entityManager.query(
      `SELECT cp.id, cp.tenant_id, cp.parent_contact_id, cp.channel,
              cp.masked_display, cp.verification_status,
              cp.verification_evidence_ref, cp.status, cp.version
         FROM contact_points cp
         JOIN student_parent_contacts spc
           ON spc.tenant_id = cp.tenant_id
          AND spc.parent_contact_id = cp.parent_contact_id
        WHERE cp.tenant_id = $1
          AND spc.tenant_id = $1
          AND spc.student_id = $2
          AND spc.branch_id = $3
          AND spc.status = 'active'
          AND spc.effective_from <= $4
          AND (spc.effective_to IS NULL OR spc.effective_to > $4)
          AND cp.status = 'active'
        ORDER BY cp.created_at ASC`,
      [input.tenantId, input.studentId, input.branchId, at],
    )) as ContactPointRow[];
    return rows.map(toMaskedProjection);
  }

  /**
   * Raw contact değerini çözer. **Yalnızca yetkili actor** için
   * (caller `student:parent_contact:read` permission'ını ve
   * sensitive-read audit'ini uygular). Tenant-scoped; AAD binding
   * (tenant/record/purpose) eşleşmezse decrypt fail-closed olur.
   */
  async findRawContactPointForAuthorized(
    entityManager: EntityManager,
    input: AuthorizedRawReadInput,
  ): Promise<{ channel: ContactChannel; rawValue: string }> {
    const rows = (await entityManager.query(
      `SELECT id, tenant_id, channel, encrypted_value
         FROM contact_points
        WHERE tenant_id = $1 AND id = $2 AND status = 'active'`,
      [input.tenantId, input.contactPointId],
    )) as Array<{
      id: string;
      tenant_id: string;
      channel: string;
      encrypted_value: string;
    }>;
    if (rows.length === 0) {
      throw new Error('ContactPoint not found for this tenant');
    }
    const row = rows[0];
    const envelope = JSON.parse(row.encrypted_value) as EncryptedContactEnvelope;
    const rawValue = decryptContactValue({
      envelope,
      tenantId: input.tenantId,
      recordId: row.id,
      purpose: CONTACT_CRYPTO_PURPOSE,
    });
    return { channel: row.channel as ContactChannel, rawValue };
  }

  /**
   * Contact point lifecycle/verification geçişi (optimistic
   * concurrency). Stale `expectedVersion`'da 0 satır etkilenir →
   * çakışma. Başarılı geçiş ve durable audit caller'ın
   * transaction'ında atomiktir.
   */
  async transitionContactPoint(
    entityManager: EntityManager,
    input: TransitionInput,
  ): Promise<{ version: number }> {
    const updated = extractRows<{ version: number }>(
      await entityManager.query(
        `UPDATE contact_points
            SET status = $1,
                version = version + 1,
                verification_status = COALESCE($2, verification_status),
                verification_evidence_ref = COALESCE($3, verification_evidence_ref),
                updated_at = now()
          WHERE tenant_id = $4 AND id = $5 AND version = $6
          RETURNING version`,
        [
          input.status,
          input.verificationStatus ?? null,
          input.verificationEvidenceRef ?? null,
          input.tenantId,
          input.recordId,
          input.expectedVersion,
        ],
      ),
    );
    if (updated.length === 0) {
      throw new Error(
        'ContactPoint version conflict (stale expectedVersion) or not found',
      );
    }
    return { version: Number(updated[0].version) };
  }

  /**
   * Parent contact lifecycle geçişi (optimistic concurrency).
   */
  async transitionParentContact(
    entityManager: EntityManager,
    input: TransitionInput,
  ): Promise<{ version: number }> {
    const status = input.status as ParentContactStatus;
    const updated = extractRows<{ version: number }>(
      await entityManager.query(
        `UPDATE parent_contacts
            SET status = $1, version = version + 1, updated_at = now()
          WHERE tenant_id = $2 AND id = $3 AND version = $4
          RETURNING version`,
        [status, input.tenantId, input.recordId, input.expectedVersion],
      ),
    );
    if (updated.length === 0) {
      throw new Error(
        'ParentContact version conflict (stale expectedVersion) or not found',
      );
    }
    return { version: Number(updated[0].version) };
  }

  /**
   * Student link lifecycle geçişi (optimistic concurrency).
   * Revoked/inactive link uygun recipient sayılmaz.
   */
  async transitionStudentLink(
    entityManager: EntityManager,
    input: TransitionInput,
  ): Promise<{ version: number }> {
    const status = input.status as StudentParentContactStatus;
    const updated = extractRows<{ version: number }>(
      await entityManager.query(
        `UPDATE student_parent_contacts
            SET status = $1, version = version + 1, updated_at = now()
          WHERE tenant_id = $2 AND id = $3 AND version = $4
          RETURNING version`,
        [status, input.tenantId, input.recordId, input.expectedVersion],
      ),
    );
    if (updated.length === 0) {
      throw new Error(
        'StudentParentContact version conflict (stale expectedVersion) or not found',
      );
    }
    return { version: Number(updated[0].version) };
  }
}
