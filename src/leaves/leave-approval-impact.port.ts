import { EntityManager } from 'typeorm';

import { RequestContext } from '../common/context/request-context';
import {
  LeaveApprovalImpactRequest,
  LeaveApprovalImpactResult,
  LeaveApprovalSubstitution,
} from '../daily-operations/leave-approval-impact';

/**
 * R1 (#263) — onay kararının etki hesabı bağlantı noktası.
 *
 * Uygulama `DailyOperationsRepository` tarafından sağlanır; `EntityManager`
 * ÇAĞIRANDAN gelir. Bu sayede karar, etki hesabı, açık projeksiyonlar, audit ve
 * outbox AYNI PostgreSQL transaction'ında yazılır (constitution Madde III).
 * Port kendi transaction'ını AÇMAZ.
 */
export const LEAVE_APPROVAL_IMPACT_PORT = Symbol('LEAVE_APPROVAL_IMPACT_PORT');

export interface LeaveApprovalImpactPort {
  prepareApprovalImpact(
    manager: EntityManager,
    ctx: RequestContext,
    leave: LeaveApprovalImpactRequest,
  ): Promise<LeaveApprovalImpactResult>;

  /**
   * #461 F4 — yedeksiz onay yok.
   *
   * Onay transaction'ı içinde çağrılır; her açık ders için seçilen yedeği
   * doğrular, atamayı yazar ve güncellenmiş kapsama/etkiyi döner. Eksik
   * kapsama `LEAVE_COVERAGE_REQUIRED`, geçersiz seçim
   * `LEAVE_SUBSTITUTION_INVALID` fırlatır.
   */
  applyApprovalCoverage(
    manager: EntityManager,
    ctx: RequestContext,
    leave: LeaveApprovalImpactRequest,
    substitutions: readonly LeaveApprovalSubstitution[],
  ): Promise<LeaveApprovalImpactResult>;
}
