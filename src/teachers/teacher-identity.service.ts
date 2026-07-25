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
}>;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

@Injectable()
export class TeacherIdentityService {
  constructor(
    private readonly teachers: TeacherRepository,
    private readonly audit: SecurityAuditService,
  ) {}

  async resolveForRequest(
    ctx: RequestContext,
    input: { branchId?: string; effectiveDate?: string } = {},
  ): Promise<ResolvedTeacherIdentity> {
    const userId = ctx.user?.userId;
    const tenantId = ctx.tenantId;
    if (!tenantId || !userId) return this.deny(ctx);

    const teacher = await this.teachers.findActiveTeacherForUser(ctx);
    if (!teacher) return this.deny(ctx);

    const memberships = await this.teachers.listActiveBranchMemberships(ctx, teacher.teacherId, {
      branchId: input.branchId,
      effectiveDate: input.effectiveDate ?? todayIso(),
    });
    if (memberships.length !== 1) return this.deny(ctx);

    return {
      tenantId,
      userId,
      teacherId: teacher.teacherId,
      teacherBranchId: memberships[0].teacherBranchId,
      branchId: memberships[0].branchId,
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
