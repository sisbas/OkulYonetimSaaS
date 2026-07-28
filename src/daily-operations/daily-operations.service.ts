import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException, PreconditionFailedException } from '@nestjs/common';

import { RequestContext } from '../common/context/request-context';
import { CreateSubstitutionAssignmentDto } from './dto/create-substitution-assignment.dto';
import { DailyOperationsRepository } from './daily-operations.repository';
import { DEFAULT_TENANT_TIME_ZONE, parseLeaveExpectedVersion } from './leave-impact.types';

type TodayQuery = Readonly<{
  branchId: string;
  date?: string;
}>;

function parseQueueDate(date: string | undefined, fallback?: string): string {
  const value = date ?? fallback ?? new Intl.DateTimeFormat('en-CA', {
    timeZone: DEFAULT_TENANT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException('Daily Operations date must use YYYY-MM-DD');
  }

  return value;
}

@Injectable()
export class DailyOperationsService {
  constructor(private readonly repository: DailyOperationsRepository) {}

  async today(ctx: RequestContext, query: TodayQuery) {
    const date = parseQueueDate(query.date, ctx.businessDate?.date);
    return this.mapErrors(() => this.repository.today(ctx, { branchId: query.branchId, date }));
  }

  async impact(ctx: RequestContext, leaveId: string) {
    return this.mapErrors(() => this.repository.impact(ctx, leaveId));
  }

  async candidates(ctx: RequestContext, leaveId: string, scheduleEventId: string) {
    return this.mapErrors(() => this.repository.candidates(ctx, leaveId, scheduleEventId));
  }

  async assign(ctx: RequestContext, leaveId: string, scheduleEventId: string, dto: CreateSubstitutionAssignmentDto, ifMatch: string | undefined) {
    const expectedVersion = this.expectedVersion(ifMatch, leaveId);
    return this.mapErrors(() => this.repository.assign(ctx, {
      leaveId,
      scheduleEventId,
      substituteTeacherId: dto.substituteTeacherId,
      expectedVersion,
    }));
  }

  async clear(ctx: RequestContext, leaveId: string, scheduleEventId: string, ifMatch: string | undefined) {
    const expectedVersion = this.expectedVersion(ifMatch, leaveId);
    return this.mapErrors(() => this.repository.clear(ctx, { leaveId, scheduleEventId, expectedVersion }));
  }

  async replayProjection(ctx: RequestContext, leaveId: string) {
    return this.mapErrors(() => this.repository.replayProjection(ctx, leaveId));
  }

  private expectedVersion(ifMatch: string | undefined, leaveId: string): number {
    try {
      return parseLeaveExpectedVersion(ifMatch, leaveId);
    } catch (error) {
      if ((error as Error).message === 'LEAVE_VERSION_REQUIRED') {
        throw new HttpException('Leave version is required', 428);
      }
      throw new PreconditionFailedException('Leave version mismatch');
    }
  }

  private async mapErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      const code = (error as Error).message;
      if (code === 'BRANCH_NOT_VISIBLE') throw new NotFoundException('Daily Operations queue not found');
      if (code === 'LEAVE_NOT_APPROVED' || code === 'NO_PUBLISHED_SCHEDULE_EVENT') {
        throw new NotFoundException('Leave impact not found');
      }
      if (code === 'LEAVE_VERSION_MISMATCH') throw new PreconditionFailedException('Leave version mismatch');
      if (code === 'TEACHER_COURSE_ELIGIBILITY_NOT_READY') {
        throw new HttpException('TeacherCourse eligibility authority is not ready', 424);
      }
      if (
        code === 'TEACHER_COURSE_MISMATCH' ||
        code === 'SUBSTITUTE_BRANCH_ASSIGNMENT_MISSING' ||
        code === 'SUBSTITUTE_LEAVE_OVERLAP' ||
        code === 'SUBSTITUTE_TIME_CONFLICT' ||
        code === 'ASSIGNMENT_ALREADY_EXISTS' ||
        code === 'ASSIGNMENT_NOT_FOUND'
      ) {
        throw new ConflictException(code);
      }
      throw error;
    }
  }
}
