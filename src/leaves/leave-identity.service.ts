import { Injectable } from '@nestjs/common';
import { RequestContext } from '../common/context/request-context';
import { TeacherIdentityService } from '../teachers/teacher-identity.service';
import { TeacherRepository } from '../teachers/teacher.repository';

export type LeaveActorIdentity = {
  actorUserId: string;
  teacherId: string;
  branchId: string;
};

type ResolveLeaveTeacherIdentityInput = Readonly<{
  branchId?: string;
  businessDate?: string;
}>;

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function contextWithBusinessDate(
  ctx: RequestContext,
  input: ResolveLeaveTeacherIdentityInput,
): RequestContext {
  if (ctx.businessDate || !ctx.tenantId) return ctx;

  return {
    ...ctx,
    businessDate: {
      tenantId: ctx.tenantId,
      date: input.businessDate ?? isoDate(new Date()),
      source: 'tenant_local',
    },
  };
}

@Injectable()
export class LeaveIdentityService {
  constructor(
    private readonly teacherIdentity: TeacherIdentityService,
    private readonly teachers: TeacherRepository,
  ) {}

  async resolveDecisionActorTeacherId(ctx: RequestContext): Promise<string | null> {
    return this.teachers.findDecisionActorTeacherId(ctx);
  }

  async resolveTeacherIdentity(
    ctx: RequestContext,
    input: ResolveLeaveTeacherIdentityInput = {},
  ): Promise<LeaveActorIdentity> {
    const resolved = await this.teacherIdentity.resolveForRequest(contextWithBusinessDate(ctx, input), {
      branchId: input.branchId,
    });
    return {
      actorUserId: resolved.userId,
      teacherId: resolved.teacherId,
      branchId: resolved.branchId,
    };
  }

  /**
   * Own-scope SALT-OKUMA (izin geçmişi) için kimlik (#263 review P2).
   *
   * Tek şube seçimi gerektirmez: iki şubede çalışan öğretmen de kendi geçmişini
   * görebilir. Kapsam hâlâ sunucuda çözülen `teacherId` ile kilitlidir.
   */
  async resolveOwnHistoryScope(
    ctx: RequestContext,
    input: ResolveLeaveTeacherIdentityInput = {},
  ): Promise<{ actorUserId: string; teacherId: string; branchIds: readonly string[] }> {
    const resolved = await this.teacherIdentity.resolveForOwnHistory(
      contextWithBusinessDate(ctx, input),
      { branchId: input.branchId },
    );
    return {
      actorUserId: resolved.userId,
      teacherId: resolved.teacherId,
      branchIds: resolved.branchIds,
    };
  }
}
