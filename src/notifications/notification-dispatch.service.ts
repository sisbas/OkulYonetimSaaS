import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { RequestContext } from '../common/context/request-context';
import { ConsentAuthority } from '../kvkk/consent-authority';
import { NotificationOutboxStatus } from './notification-outbox.entity';
import { NotificationDispatchReceipt } from './notification-dispatch-receipt.entity';
import {
  claimConflict,
  NotificationDispatchRepository,
  NotificationOperationRow,
  MAX_ATTEMPTS,
} from './notification-dispatch.repository';
import { NotificationSimulatorService } from './notification-simulator.service';

export type ExecuteResult = Readonly<{
  id: string;
  status: NotificationOutboxStatus;
  version: number;
  attempt: number;
  reason: string | null;
  idempotent: boolean;
  receipt: NotificationDispatchReceipt | null;
}>;

export type OperationDetail = Readonly<{
  row: NotificationOperationRow;
  availableActions: readonly string[];
  receipts: readonly NotificationDispatchReceipt[];
}>;

/**
 * Sunucu tarafından hesaplanan eylem listesi — istemci asla durum makinesini
 * türetmez; UI yalnız buradaki eylemleri gösterir.
 */
export function availableActionsFor(status: NotificationOutboxStatus): readonly string[] {
  switch (status) {
    case 'pending':
      return ['approve', 'close'];
    case 'blocked_consent':
      return ['approve'];
    case 'approved':
    case 'failed':
      return ['execute', 'cancel'];
    case 'dead_lettered':
    case 'uncertain':
      return ['retry', 'cancel'];
    case 'dispatched':
    case 'cancelled':
    case 'closed':
      return [];
    default:
      return [];
  }
}

/**
 * #266 N2 — Gönderim servisi: sınırlı (bounded) manuel dispatch state machine.
 *
 * Akış (MASTER PROMPT §4):
 *   tx1 claim (lease+fencing+attempt) → tx2: consent yeniden doğrulama →
 *   simüle sağlayıcı → koşullu sonuç geçişi → dayanıcı receipt.
 *
 * Kurallar (fail-closed):
 * - Onay yalnız bu servisten yeniden doğrulanır; enqueue-time snapshot
 *   kararı DEĞİŞTİRMEZ (proof-of-chain: her adım kayıtlı).
 * - `blocked_consent` → receipt YOK, sağlayıcı etkisi SIFIR.
 * - `dispatched` yalnız `provider_accepted` ile yazılır; "teslim edildi"
 *   iddiası asla yapılmaz (simülasyonun ötesinde delivery sinyali yoktur).
 * - Idempotentlik: `dispatched` satıra ikinci execute → yeni etki üretmez,
 *   mevcut receipt'i döner (200).
 * - Cancel yarışı: koşullu UPDATE; tx2 0 satır görürse rollback → etki yok.
 */
@Injectable()
export class NotificationDispatchService {
  private readonly consentAuthority = new ConsentAuthority();

  constructor(
    private readonly dataSource: DataSource,
    private readonly outbox: NotificationDispatchRepository,
    private readonly simulator: NotificationSimulatorService,
  ) {}

  /** Operasyon listesi — tüm durumlar. */
  async list(
    context: RequestContext,
    input: Readonly<{ limit: number; offset: number; status?: string }>,
  ): Promise<NotificationOperationRow[]> {
    return this.dataSource.transaction((em) =>
      this.outbox.findAll(em, context, input),
    );
  }

  /** Detay + sunucu hesaplı eylemler + (varsa) receipt'ler. */
  async detail(
    context: RequestContext,
    id: string,
    includeReceipts: boolean,
  ): Promise<OperationDetail> {
    return this.dataSource.transaction(async (em) => {
      const row = await this.outbox.findById(em, context, id);
      if (!row) throw new NotFoundException(`NOTIFICATION_NOT_FOUND:${id}`);
      const receipts = includeReceipts
        ? await this.outbox.findReceipts(em, row.tenantId, row.id)
        : [];
      return { row, availableActions: availableActionsFor(row.status), receipts };
    });
  }

  /**
   * Gönderimi yürüt — tx1 claim, tx2 uygulama (ayrı transaction'lar;
   * claim'in commit'i tx2 guard'ının ön koşuludur).
   */
  async execute(context: RequestContext, id: string): Promise<ExecuteResult> {
    const tenantId = context.tenantId!;

    const claim = await this.dataSource.transaction((em) =>
      this.outbox.claim(em, { tenantId, id }),
    );

    if (!claim) {
      const basis = await this.dataSource.transaction((em) =>
        this.outbox.currentClaimBasis(em, tenantId, id),
      );
      if (basis?.status === 'dispatched') {
        const receipt = await this.dataSource.transaction((em) =>
          this.outbox.findLatestReceipt(em, tenantId, id),
        );
        return {
          id,
          status: 'dispatched',
          version: basis.version,
          attempt: basis.attempts,
          reason: null,
          idempotent: true,
          receipt,
        };
      }
      throw claimConflict(basis, id);
    }

    return this.dataSource.transaction(async (em) => {
      // 1) Dispatch-time onay yeniden doğrulaması (N1b ConsentAuthority).
      const decision = await this.consentAuthority.resolveNotificationConsent(em, {
        subject: {
          tenantId: claim.tenantId,
          subjectType: 'student',
          subjectRefId: claim.studentId,
        },
        channel: claim.channel,
      });

      if (!decision.approved) {
        const transitioned = await this.outbox.transitionToBlockedConsent(em, {
          tenantId: claim.tenantId,
          id: claim.id,
          claimToken: claim.claimToken,
          reason: decision.reason!,
          consentVersion: decision.consentVersion,
        });
        if (!transitioned) throw new ConflictException(`CLAIM_LOST:${claim.id}`);
        return {
          id: claim.id,
          status: 'blocked_consent' as const,
          version: transitioned.version,
          attempt: claim.attempt,
          reason: decision.reason,
          idempotent: false,
          receipt: null,
        };
      }

      // 2) Simüle sağlayıcı (yan etki yok; kanıt = receipt satırı).
      const sim = this.simulator.simulate({
        outboxId: claim.id,
        attempt: claim.attempt,
        eventType: claim.eventType,
        channel: claim.channel,
      });

      // 3) Koşullu sonuç geçişi (claim_token + durum koruması) — önce geçiş,
      //    sonra receipt: cancel yarışı kaybedilirse tx2 rollback eder ve
      //    sağlayıcı etkisi sıfır kalır.
      const next = await this.outbox.applyOutcome(em, {
        tenantId: claim.tenantId,
        id: claim.id,
        claimToken: claim.claimToken,
        outcome: sim.outcome,
        attempts: claim.attempt,
        errorCode: sim.errorCode,
      });
      if (!next) throw new ConflictException(`CLAIM_LOST:${claim.id}`);

      const receipt = await this.outbox.insertReceipt(em, {
        tenantId: claim.tenantId,
        outboxId: claim.id,
        attempt: claim.attempt,
        fencingToken: claim.fencingToken,
        outcome: sim.outcome,
        providerRef: sim.providerRef,
        errorCode: sim.errorCode,
        receipt: this.evidenceFor(claim.eventType, claim.channel, {
          attempt: claim.attempt,
          fencingToken: claim.fencingToken,
          mode: sim.mode,
          outcome: sim.outcome,
          consentVersion: decision.consentVersion,
          deadLettered: next.status === 'dead_lettered',
        }),
      });

      return {
        id: claim.id,
        status: next.status,
        version: next.version,
        attempt: claim.attempt,
        reason: null,
        idempotent: false,
        receipt,
      };
    });
  }

  /**
   * Retry — `dead_lettered` | `uncertain` → `approved` (yeniden uygunluk).
   * `attempts` korunur; yeni deneme yeni attempt numarasıyla kanıt üretir.
   */
  async retry(
    context: RequestContext,
    id: string,
  ): Promise<{ id: string; status: NotificationOutboxStatus; version: number }> {
    const tenantId = context.tenantId!;
    return this.dataSource.transaction(async (em) => {
      const next = await this.outbox.rearmForRetry(em, { tenantId, id });
      if (!next) {
        const basis = await this.outbox.currentClaimBasis(em, tenantId, id);
        throw claimConflict(basis, id);
      }
      return { id, status: next.status, version: next.version };
    });
  }

  /**
   * Cancel — koşullu geçiş; `dispatched`/`cancelled`/`closed` korunur
   * (race-safe: execute ile yarışta tek kazanan olur).
   */
  async cancel(
    context: RequestContext,
    id: string,
  ): Promise<{ id: string; status: NotificationOutboxStatus; version: number }> {
    const tenantId = context.tenantId!;
    return this.dataSource.transaction(async (em) => {
      const next = await this.outbox.cancel(em, { tenantId, id });
      if (!next) {
        const basis = await this.outbox.currentClaimBasis(em, tenantId, id);
        throw claimConflict(basis, id);
      }
      return { id, status: next.status, version: next.version };
    });
  }

  private evidenceFor(
    eventType: string,
    channel: string,
    extra: Readonly<{
      attempt: number;
      fencingToken: number;
      mode: string;
      outcome: string;
      consentVersion: number | null;
      deadLettered: boolean;
    }>,
  ): Record<string, unknown> {
    return {
      eventType,
      channel,
      simulated: true,
      simulatedMode: extra.mode,
      outcome: extra.outcome,
      attempt: extra.attempt,
      fencingToken: extra.fencingToken,
      consent: { versionAtDispatch: extra.consentVersion },
      maxAttempts: MAX_ATTEMPTS,
      deadLettered: extra.deadLettered,
      at: new Date().toISOString(),
    };
  }
}
