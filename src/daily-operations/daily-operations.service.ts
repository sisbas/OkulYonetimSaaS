import { ConflictException, HttpException, Injectable, NotFoundException, PreconditionFailedException } from '@nestjs/common';

import { RequestContext } from '../common/context/request-context';
import { CreateSubstitutionAssignmentDto } from './dto/create-substitution-assignment.dto';
import { DailyOperationsRepository } from './daily-operations.repository';
import { parseLeaveExpectedVersion } from './leave-impact.types';

@Injectable()
export class DailyOperationsService {
  constructor(private readonly repository: DailyOperationsRepository) {}

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
