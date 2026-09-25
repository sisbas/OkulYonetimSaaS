import { BadRequestException, Injectable } from '@nestjs/common';
import { RequestContext } from '../common/context/request-context';
import {
  LeaveApprovalImpact,
  coverageLabel,
} from '../daily-operations/leave-approval-impact';
import { leaveEtag } from '../daily-operations/leave-impact.types';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { ListLeaveRequestsQueryDto } from './dto/list-leave-requests-query.dto';
import {
  APPROVED_IMPACT_DETAIL,
  REJECTED_IMPACT_DETAIL,
  decisionStatusLabel,
  decisionSummary,
  durationLabel,
  instantLabel,
  periodLabel,
  reasonLabel,
} from './leave-decision-labels';
import { LeaveIdentityService } from './leave-identity.service';
import {
  LeaveExpectedVersionRequiredException,
  LeaveNotFoundException,
  LeaveSelfDecisionException,
  LeaveStaleVersionException,
  LeaveTerminalStateException,
} from './leave-errors';
import { LeaveCoverageStatus, LeaveDecisionStatus, LeaveRequest } from './leave-request.entity';
import { LeaveDecisionOutcome, LeaveRepository } from './leave.repository';

export type LeaveResponse = {
  id: string;
  branchId: string;
  teacherId: string;
  durationType: string;
  reasonCode: string;
  decisionStatus: LeaveDecisionStatus;
  coverageStatus: LeaveCoverageStatus;
  startsAt: Date;
  endsAt: Date;
  decidedAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * R1 (#263) — karar (onay/ret) yanıtı.
 *
 * Ham UUID taşımaz: operatör dönem/süre/gerekçe ve etkilenen dersleri okunabilir
 * adlarla görür. `etag` If-Match için sunucu üretimi opak sürüm jetonudur;
 * kullanıcıya gösterilecek bir metin değildir. Sıfır etki sessiz geçilmez:
 * `summary` + `impact.zeroImpactDetail` gerekçeyi açıkça yazar.
 */
export type LeaveDecisionResponse = Readonly<{
  decisionStatus: LeaveDecisionStatus.APPROVED | LeaveDecisionStatus.REJECTED;
  decisionLabel: string;
  coverageStatus: LeaveCoverageStatus;
  coverageLabel: string;
  version: number;
  etag: string;
  summary: string;
  impactDetail: string;
  periodLabel: string;
  durationLabel: string;
  reasonLabel: string;
  decidedAtLabel: string | null;
  impact: LeaveApprovalImpact | null;
}>;

type LeaveDecisionInput = Readonly<{
  decision: LeaveDecisionStatus.APPROVED | LeaveDecisionStatus.REJECTED;
}>;

function actorUserId(ctx: RequestContext): string {
  const id = ctx.user?.userId ?? ctx.userId;
  if (!id) throw new BadRequestException('Actor user is required');
  return id;
}

function parseExpectedVersion(ifMatch: string | undefined, leaveId: string): number {
  if (!ifMatch?.trim()) throw new LeaveExpectedVersionRequiredException();

  const match = /^(?:W\/)?"leave:([^:"]+):v(\d+)"$/i.exec(ifMatch.trim());
  if (!match) throw new LeaveExpectedVersionRequiredException();
  if (match[1] !== leaveId) throw new LeaveStaleVersionException();

  const parsed = Number.parseInt(match[2], 10);
  if (!Number.isInteger(parsed) || parsed < 1) throw new LeaveExpectedVersionRequiredException();
  return parsed;
}

function parseDateRange(startsAt: string, endsAt: string): { startsAt: Date; endsAt: Date } {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start >= end) {
    throw new BadRequestException('Leave request date range is invalid');
  }
  return { startsAt: start, endsAt: end };
}

@Injectable()
export class LeaveService {
  constructor(
    private readonly leaves: LeaveRepository,
    private readonly identity: LeaveIdentityService,
  ) {}

  async createOwn(ctx: RequestContext, dto: CreateLeaveRequestDto): Promise<LeaveResponse> {
    const range = parseDateRange(dto.startsAt, dto.endsAt);
    const identity = await this.identity.resolveTeacherIdentity(ctx, {
      branchId: dto.branchId,
      businessDate: range.startsAt.toISOString().slice(0, 10),
    });
    const saved = await this.leaves.create(ctx, {
      tenantId: ctx.tenantId!,
      branchId: dto.branchId,
      teacherId: identity.teacherId,
      requesterUserId: identity.actorUserId,
      durationType: dto.durationType,
      reasonCode: dto.reasonCode,
      coverageStatus: LeaveCoverageStatus.NOT_REQUIRED,
      ...range,
    });
    return this.toResponse(saved);
  }

  async listForOperations(ctx: RequestContext, query: ListLeaveRequestsQueryDto): Promise<LeaveResponse[]> {
    return (await this.leaves.list(ctx, query)).map((leave) => this.toResponse(leave));
  }

  async getForOperations(ctx: RequestContext, id: string): Promise<LeaveResponse> {
    const leave = await this.leaves.findTenantScoped(ctx, id);
    if (!leave) throw new LeaveNotFoundException();
    return this.toResponse(leave);
  }

  async getOwn(ctx: RequestContext, id: string): Promise<LeaveResponse> {
    const identity = await this.identity.resolveTeacherIdentity(ctx);
    const leave = await this.leaves.findOwn(ctx, id, identity.teacherId, identity.branchId);
    if (!leave) throw new LeaveNotFoundException();
    return this.toResponse(leave);
  }

  async decide(
    ctx: RequestContext,
    id: string,
    dto: LeaveDecisionInput,
    ifMatch: string | undefined,
  ): Promise<LeaveDecisionResponse> {
    const expectedVersion = parseExpectedVersion(ifMatch, id);
    const current = await this.leaves.findTenantScoped(ctx, id);
    if (!current) throw new LeaveNotFoundException();
    if (current.decisionStatus !== LeaveDecisionStatus.PENDING) throw new LeaveTerminalStateException();

    // Deny-safe kapı: kendi talebini karara bağlayan aktör ve kimliği çözülemeyen
    // aktör, hiçbir mutasyondan veya etki hesabından ÖNCE reddedilir (#340/#277).
    const decisionActorUserId = actorUserId(ctx);
    if (decisionActorUserId === current.requesterUserId) throw new LeaveSelfDecisionException();

    const actorTeacher = await this.safeActorTeacherId(ctx);
    if (actorTeacher && actorTeacher === current.teacherId) throw new LeaveSelfDecisionException();

    // Onay/ret + etki + açık projeksiyonlar + durable audit + outbox tek
    // PostgreSQL transaction'ında yazılır; hata hâlinde kısmi kayıt kalmaz.
    const outcome = await this.leaves.decide(ctx, id, {
      decision: dto.decision,
      decidedByUserId: decisionActorUserId,
      expectedVersion,
    });
    if (!outcome) throw new LeaveNotFoundException();
    return this.toDecisionResponse(outcome);
  }

  private toDecisionResponse(outcome: LeaveDecisionOutcome): LeaveDecisionResponse {
    const { leave, impact } = outcome;
    const decision = leave.decisionStatus === LeaveDecisionStatus.APPROVED ? 'approved' : 'rejected';
    return {
      decisionStatus:
        decision === 'approved' ? LeaveDecisionStatus.APPROVED : LeaveDecisionStatus.REJECTED,
      decisionLabel: decisionStatusLabel(decision),
      coverageStatus: leave.coverageStatus,
      coverageLabel: coverageLabel(leave.coverageStatus),
      version: leave.version,
      etag: leaveEtag(leave.id, leave.version),
      summary: decisionSummary({
        decision,
        impactedLessonCount: impact?.impactedLessonCount ?? 0,
        openLessonCount: impact?.openLessonCount ?? 0,
        zeroImpactDetail: impact?.zeroImpactDetail ?? null,
      }),
      impactDetail: impact
        ? impact.zeroImpactDetail ?? APPROVED_IMPACT_DETAIL
        : REJECTED_IMPACT_DETAIL,
      periodLabel: periodLabel(leave.startsAt, leave.endsAt),
      durationLabel: durationLabel(leave.durationType),
      reasonLabel: reasonLabel(leave.reasonCode),
      decidedAtLabel: instantLabel(leave.decidedAt),
      impact,
    };
  }

  private async safeActorTeacherId(ctx: RequestContext): Promise<string | null> {
    try {
      return await this.identity.resolveDecisionActorTeacherId(ctx);
    } catch {
      // Absence is an explicit directory result, never an exception category.
      throw new LeaveSelfDecisionException();
    }
  }

  private toResponse(leave: LeaveRequest): LeaveResponse {
    return {
      id: leave.id,
      branchId: leave.branchId,
      teacherId: leave.teacherId,
      durationType: leave.durationType,
      reasonCode: leave.reasonCode,
      decisionStatus: leave.decisionStatus,
      coverageStatus: leave.coverageStatus,
      startsAt: leave.startsAt,
      endsAt: leave.endsAt,
      decidedAt: leave.decidedAt,
      version: leave.version,
      createdAt: leave.createdAt,
      updatedAt: leave.updatedAt,
    };
  }
}
