import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DataSource } from 'typeorm';
import { RequestWithContext } from '../common/context/request-context';
import { Permissions } from '../common/decorators/permissions.decorator';
import { TenantScopeGuard } from '../common/tenant/tenant-scope.guard';
import { ConsentSubjectType } from './consent-authority';
import {
  ConsentManagerService,
  ConsentRevokeResult,
  ConsentRowSnapshot,
} from './consent-manager.service';

const ALLOWED_SUBJECT_TYPES: readonly ConsentSubjectType[] = [
  'student',
  'parent',
  'teacher',
  'user',
  'other',
];

/**
 * Stage 5 — consent yönetim yüzeyi (P1B-FINAL).
 *
 * OKUL-08 konsept onaylarının salt-okuma listesi ve authority revoke
 * operasyonu. Yalnız `operations_manager`/`tenant_admin` erişir;
 * yanıtlar ham PII taşımaz (subject ref UUID + consent türü/statüsü).
 * Revoke, `dataprotection.consent.revoked` audit eventini üretir.
 */
@UseGuards(AuthGuard('jwt'), TenantScopeGuard)
@Controller('consents')
export class KvkkConsentController {
  constructor(
    private readonly consentManager: ConsentManagerService,
    @Inject(DataSource) private readonly dataSource: DataSource,
  ) {}

  /**
   * Consent listesi (tenant kapsamında, subject tipi filtresi opsiyonel).
   */
  @Get()
  @Permissions('consent:read')
  async list(
    @Req() req: RequestWithContext,
    @Query('subjectType') subjectType?: string,
  ): Promise<{ consents: ConsentRowSnapshot[] }> {
    const ctx = req.context;
    if (!ctx) throw new ForbiddenException('Request context required');
    let normalizedType: string | undefined;
    if (typeof subjectType === 'string' && subjectType.trim().length > 0) {
      if (!ALLOWED_SUBJECT_TYPES.includes(subjectType as ConsentSubjectType)) {
        throw new BadRequestException('CONSENT_SUBJECT_TYPE_INVALID');
      }
      normalizedType = subjectType;
    }
    const consents = await this.dataSource.transaction(async (em) =>
      this.consentManager.listConsents(em, ctx, normalizedType),
    );
    return { consents };
  }

  /**
   * Consent revoke (authority event). Yalnız güncel `approved` satırı
   * `revoked` yapar; zaten revoked/expired ise 409 döner.
   */
  @Post('revoke')
  @Permissions('consent:revoke')
  async revoke(
    @Req() req: RequestWithContext,
    @Body()
    body: {
      subjectRefId: string;
      subjectType: string;
      consentType: string;
    },
  ): Promise<ConsentRevokeResult> {
    const ctx = req.context;
    if (!ctx) throw new ForbiddenException('Request context required');
    if (
      typeof body.subjectRefId !== 'string' ||
      typeof body.subjectType !== 'string' ||
      typeof body.consentType !== 'string' ||
      !body.subjectRefId.trim() ||
      !body.consentType.trim()
    ) {
      throw new BadRequestException('CONSENT_REVOKE_BODY_REQUIRED');
    }
    if (!ALLOWED_SUBJECT_TYPES.includes(body.subjectType as ConsentSubjectType)) {
      throw new BadRequestException('CONSENT_SUBJECT_TYPE_INVALID');
    }
    return this.dataSource.transaction(async (em) =>
      this.consentManager.revokeConsent(em, ctx, {
        subjectRefId: body.subjectRefId,
        subjectType: body.subjectType as ConsentSubjectType,
        consentType: body.consentType,
      }),
    );
  }
}