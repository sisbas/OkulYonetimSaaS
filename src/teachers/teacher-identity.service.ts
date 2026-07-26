import { ForbiddenException, Injectable } from '@nestjs/common';

import { SecurityAuditService } from '../common/audit/security-audit.service';
import { RequestContext } from '../common/context/request-context';
import { TeacherRepository } from './teacher.repository';

export type ResolvedTeacherIdentity = Readonly<{
  tenantId: string;
  userId: string;
  teacherId: string;
  branchId: string;
  teacherBranchId: string;
  businessDate: string;
}>;

export type TeacherIdentityResolutionInput = Readonly<{
  branchId?: string;
}>;

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function tenantLocalBusinessDate(ctx: RequestContext, tenantId: string): string | null {
  const businessDate = ctx.businessDate;
  if (!businessDate) return null;
  if (businessDate.source !== 'tenant_local') return null;
  if (businessDate.tenantId !== tenantId) return null;
  if (!isIsoDate(businessDate.date)) return null;
  return businessDate.date;
}

function authorityContext(ctx: RequestContext, tenantId: string, userId: string): RequestContext {
  return {
    requestId: ctx.requestId,
    tenantId,
    businessDate: ctx.businessDate,
    user: {
      userId,
      tenantId,
      roleIds: ctx.user?.roleIds ?? [],
      permissions: ctx.user?.permissions ?? [],
      sessionId: ctx.user?.sessionId,
      authorizationVersion: ctx.user?.authorizationVersion,
    },
  };
}

@Injectable()
export class TeacherIdentityService {
  constructor(
    private readonly teachers: TeacherRepository,
    private readonly audit: SecurityAuditService,
  ) {}

  async resolveForRequest(
    ctx: RequestContext,
    input: TeacherIdentityResolutionInput = {},
  ): Promise<ResolvedTeacherIdentity> {
    const userId = ctx.user?.userId;
    const tenantId = ctx.tenantId;
    if (!tenantId || !userId) return this.deny(ctx);

    const businessDate = tenantLocalBusinessDate(ctx, tenantId);
    if (!businessDate) return this.deny(ctx);

    const safeCtx = authorityContext(ctx, tenantId, userId);
    const teacher = await this.teachers.findActiveTeacherForUser(safeCtx);
    if (!teacher) return this.deny(safeCtx);

    const memberships = await this.teachers.listActiveBranchMemberships(safeCtx, teacher.teacherId, {
      branchId: input.branchId,
      effectiveDate: businessDate,
    });
    if (memberships.length !== 1) return this.deny(safeCtx);

    return {
      tenantId,
      userId,
      teacherId: teacher.teacherId,
      teacherBranchId: memberships[0].teacherBranchId,
      branchId: memberships[0].branchId,
      businessDate,
    };
  }

  private deny(ctx: RequestContext): never {
    this.audit.emitAuthorizationDenied(ctx, {
      requiredPermission: ['teacher:own:read'],
      resource: 'teacher',
      reasonCode: 'teacher_identity_unresolved',
    });
    throw new ForbiddenException('Teacher identity unavailable');
  }
}
