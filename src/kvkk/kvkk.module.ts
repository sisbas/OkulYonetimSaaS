import { Module } from '@nestjs/common';
import { SecurityAuditService } from '../common/audit/security-audit.service';
import { ConsentManagerService } from './consent-manager.service';
import { KvkkConsentController } from './kvkk-consent.controller';

/**
 * Stage 5 — KVKK consent yönetim modülü.
 *
 * Guard/service katmanlarının aksine bu modül HTTP yüzeyini taşır:
 * `GET /consents` (list) ve `POST /consents/revoke` (authority event).
 */
@Module({
  controllers: [KvkkConsentController],
  providers: [ConsentManagerService, SecurityAuditService],
  exports: [ConsentManagerService],
})
export class KvkkModule {}