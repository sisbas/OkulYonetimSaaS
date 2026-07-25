import { BadRequestException, Injectable } from '@nestjs/common';
import { RequestContext } from '../common/context/request-context';
import { CreateLeaveRequestDto } from './dto/create-leave-request.dto';
import { DecideLeaveRequestDto } from './dto/decide-leave-request.dto';
import { ListLeaveRequestsQueryDto } from './dto/list-leave-requests-query.dto';
import { LeaveIdentityService } from './leave-identity.service';
import {
  LeaveExpectedVersionRequiredException,
  LeaveNotFoundException,
  LeaveSelfDecisionException,
  LeaveStaleVersionException,
  LeaveTerminalStateException,
} from './leave-errors';
import { LeaveCoverageStatus, LeaveDecisionStatus, LeaveRequest } from './leave-request.entity';
import { LeaveRepository } from './leave.repository';

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

function actorUserId(ctx: RequestContext): string {
  const id = ctx.user?.userId ?? ctx.userId;
  if (!id) throw new BadRequestException('Actor user is required');
  return id;
}

function parseExpectedVersion(ifMatch: string | undefined): number {
  if (!ifMatch?.trim()) throw new LeaveExpectedVersionRequiredException();
  const match = ifMatch.match(/(?:W\/)?"?leave:[^:]+:v(\d+)"?/i) ?? ifMatch.match(/^\d+$/);
  const parsed = Number.parseInt(match?.[1] ?? ifMatch, 10);
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
    const identity = await this.identity.resolveTeacherIdentity(ctx);
    const range = parseDateRange(dto.startsAt, dto.endsAt);
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
    const leave = await this.leaves.findOwn(ctx, id, identity.teacherId);
    if (!leave) throw new LeaveNotFoundException();
    return this.toResponse(leave);
  }

  async decide(ctx: RequestContext, id: string, dto: DecideLeaveRequestDto, ifMatch: string | undefined): Promise<LeaveResponse> {
    const expectedVersion = parseExpectedVersion(ifMatch);
    const current = await this.leaves.findTenantScoped(ctx, id);
    if (!current) throw new LeaveNotFoundException();
    if (current.decisionStatus !== LeaveDecisionStatus.PENDING) throw new LeaveTerminalStateException();

    const actorTeacher = await this.safeActorTeacherId(ctx);
    if (actorTeacher && actorTeacher === current.teacherId) throw new LeaveSelfDecisionException();

    const decided = await this.leaves.decide(ctx, id, {
      decision: dto.decision,
      decidedByUserId: actorUserId(ctx),
      expectedVersion,
    });
    if (!decided) throw new LeaveNotFoundException();
    if (decided.version === expectedVersion && decided.decisionStatus === LeaveDecisionStatus.PENDING) {
      throw new LeaveStaleVersionException();
    }
    if (decided.version !== expectedVersion + 1) throw new LeaveStaleVersionException();
    return this.toResponse(decided);
  }

  private async safeActorTeacherId(ctx: RequestContext): Promise<string | null> {
    try {
      return (await this.identity.resolveTeacherIdentity(ctx)).teacherId;
    } catch {
      return null;
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
