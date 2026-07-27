import { Inject, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { RequestContext } from '../common/context/request-context';
import { assertTenantScope } from '../common/tenant/assert-tenant-scope';
import {
  TRANSACTIONAL_AUDIT_WRITER,
  TransactionalAuditWriter,
} from '../common/audit/transactional-audit-writer';
import { LeaveCoverageStatus, LeaveDecisionStatus } from '../leaves/leave-request.entity';
import {
  CandidateResponse,
  LeaveImpactEvent,
  LeaveImpactResponse,
  computeCoverageStatus,
  eventOccurrenceForRange,
  projectionKey,
} from './leave-impact.types';

type LeaveRow = {
  id: string;
  tenantId: string;
  branchId: string;
  teacherId: string;
  decisionStatus: LeaveDecisionStatus;
  coverageStatus: LeaveCoverageStatus;
  startsAt: Date;
  endsAt: Date;
  version: number;
};

type ScheduleEventRow = {
  scheduleEventId: string;
  scheduleId: string;
  scheduleVersionId: string;
  teacherId: string;
  teacherBranchId: string;
  studentGroupId: string;
  courseId: string;
  roomId: string;
  timeSlotId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

type AssignmentRow = {
  id: string;
  scheduleEventId: string;
  substituteTeacherId: string;
};

@Injectable()
export class DailyOperationsRepository {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(TRANSACTIONAL_AUDIT_WRITER)
    private readonly audit: TransactionalAuditWriter,
  ) {}

  async impact(ctx: RequestContext, leaveId: string): Promise<LeaveImpactResponse> {
    assertTenantScope(ctx, 'daily_operations_leave_impact');
    const leave = await this.findApprovedLeave(this.dataSource.manager, ctx.tenantId!, leaveId, false);
    if (!leave) throw new Error('LEAVE_NOT_APPROVED');
    const events = await this.loadImpactedEvents(this.dataSource.manager, leave);
    const assignments = await this.loadAssignments(this.dataSource.manager, leave.id);
    return this.toImpact(leave, events, assignments);
  }

  async candidates(ctx: RequestContext, leaveId: string, scheduleEventId: string): Promise<CandidateResponse> {
    assertTenantScope(ctx, 'daily_operations_leave_impact');
    const leave = await this.findApprovedLeave(this.dataSource.manager, ctx.tenantId!, leaveId, false);
    if (!leave) throw new Error('LEAVE_NOT_APPROVED');
    const event = (await this.loadImpactedEvents(this.dataSource.manager, leave))
      .find((item) => item.scheduleEventId === scheduleEventId);
    if (!event) throw new Error('NO_PUBLISHED_SCHEDULE_EVENT');
    if (!(await this.teacherCoursesReady(this.dataSource.manager))) {
      return {
        leaveRequestId: leave.id,
        scheduleEventId,
        courseId: event.courseId,
        eligibilityAuthority: 'teacher_courses',
        eligibilityFinalized: false,
        candidates: [],
      };
    }
    const occurrence = eventOccurrenceForRange({
      leaveStartsAt: leave.startsAt,
      leaveEndsAt: leave.endsAt,
      effectiveFrom: event.effectiveFrom,
      effectiveTo: event.effectiveTo,
      dayOfWeek: event.dayOfWeek,
      startTime: event.startTime,
      endTime: event.endTime,
    });
    const candidates = occurrence
      ? await this.findEligibleCandidates(this.dataSource.manager, leave, event, occurrence.startsAt, occurrence.endsAt)
      : [];
    return {
      leaveRequestId: leave.id,
      scheduleEventId,
      courseId: event.courseId,
      eligibilityAuthority: 'teacher_courses',
      eligibilityFinalized: true,
      candidates,
    };
  }

  async assign(ctx: RequestContext, input: {
    leaveId: string;
    scheduleEventId: string;
    substituteTeacherId: string;
    expectedVersion: number;
  }): Promise<LeaveImpactResponse> {
    assertTenantScope(ctx, 'daily_operations_leave_impact');
    return this.dataSource.transaction(async (manager) => {
      const leave = await this.findApprovedLeave(manager, ctx.tenantId!, input.leaveId, true);
      if (!leave) throw new Error('LEAVE_NOT_APPROVED');
      this.assertVersion(leave, input.expectedVersion);
      const events = await this.loadImpactedEvents(manager, leave);
      const event = events.find((item) => item.scheduleEventId === input.scheduleEventId);
      if (!event) throw new Error('NO_PUBLISHED_SCHEDULE_EVENT');
      const occurrence = eventOccurrenceForRange({
        leaveStartsAt: leave.startsAt,
        leaveEndsAt: leave.endsAt,
        effectiveFrom: event.effectiveFrom,
        effectiveTo: event.effectiveTo,
        dayOfWeek: event.dayOfWeek,
        startTime: event.startTime,
        endTime: event.endTime,
      });
      if (!occurrence) throw new Error('NO_PUBLISHED_SCHEDULE_EVENT');
      await this.assertEligibleCandidate(manager, leave, event, input.substituteTeacherId, occurrence.startsAt, occurrence.endsAt);
      const existing = await this.activeAssignment(manager, leave.id, event.scheduleEventId);
      if (existing) throw new Error('ASSIGNMENT_ALREADY_EXISTS');
      const rows = await manager.query(
        `INSERT INTO leave_substitution_assignments
          (tenant_id, branch_id, leave_request_id, schedule_version_id, schedule_event_id, substitute_teacher_id, course_id, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [leave.tenantId, leave.branchId, leave.id, event.scheduleVersionId, event.scheduleEventId, input.substituteTeacherId, event.courseId, this.actorUserId(ctx)],
      );
      const assignments = await this.loadAssignments(manager, leave.id);
      const coverage = computeCoverageStatus(events.length, assignments.length);
      await this.updateLeaveCoverage(manager, leave.id, coverage, leave.version + 1);
      leave.coverageStatus = coverage;
      leave.version += 1;
      await this.project(manager, leave, events, assignments);
      await this.auditLeave(manager, ctx, 'leave.substitution_assigned.v1', leave.id, ['coverageStatus', 'substitutionAssignment', 'dailyOperationsProjection', 'version']);
      await this.outbox(manager, leave, 'leave.substitution_assigned.v1', rows[0].id, event.scheduleEventId);
      return this.toImpact(leave, events, assignments);
    });
  }

  async clear(ctx: RequestContext, input: {
    leaveId: string;
    scheduleEventId: string;
    expectedVersion: number;
  }): Promise<LeaveImpactResponse> {
    assertTenantScope(ctx, 'daily_operations_leave_impact');
    return this.dataSource.transaction(async (manager) => {
      const leave = await this.findApprovedLeave(manager, ctx.tenantId!, input.leaveId, true);
      if (!leave) throw new Error('LEAVE_NOT_APPROVED');
      this.assertVersion(leave, input.expectedVersion);
      const events = await this.loadImpactedEvents(manager, leave);
      if (!events.some((item) => item.scheduleEventId === input.scheduleEventId)) throw new Error('NO_PUBLISHED_SCHEDULE_EVENT');
      const assignment = await this.activeAssignment(manager, leave.id, input.scheduleEventId);
      if (!assignment) throw new Error('ASSIGNMENT_NOT_FOUND');
      await manager.query(
        `UPDATE leave_substitution_assignments
         SET state = 'cleared', cleared_by_user_id = $1, cleared_at = now(), version = version + 1, updated_at = now()
         WHERE id = $2 AND tenant_id = $3`,
        [this.actorUserId(ctx), assignment.id, leave.tenantId],
      );
      const assignments = await this.loadAssignments(manager, leave.id);
      const coverage = computeCoverageStatus(events.length, assignments.length);
      await this.updateLeaveCoverage(manager, leave.id, coverage, leave.version + 1);
      leave.coverageStatus = coverage;
      leave.version += 1;
      await this.project(manager, leave, events, assignments);
      await this.auditLeave(manager, ctx, 'leave.substitution_cleared.v1', leave.id, ['coverageStatus', 'substitutionAssignment', 'dailyOperationsProjection', 'version']);
      await this.outbox(manager, leave, 'leave.substitution_cleared.v1', assignment.id, input.scheduleEventId);
      return this.toImpact(leave, events, assignments);
    });
  }

  async replayProjection(ctx: RequestContext, leaveId: string): Promise<LeaveImpactResponse> {
    assertTenantScope(ctx, 'daily_operations_leave_impact');
    return this.dataSource.transaction(async (manager) => {
      const leave = await this.findApprovedLeave(manager, ctx.tenantId!, leaveId, true);
      if (!leave) throw new Error('LEAVE_NOT_APPROVED');
      const events = await this.loadImpactedEvents(manager, leave);
      const assignments = await this.loadAssignments(manager, leave.id);
      const coverage = computeCoverageStatus(events.length, assignments.length);
      if (coverage !== leave.coverageStatus) {
        await this.updateLeaveCoverage(manager, leave.id, coverage, leave.version + 1);
        leave.coverageStatus = coverage;
        leave.version += 1;
      }
      await this.project(manager, leave, events, assignments);
      await this.auditLeave(manager, ctx, 'daily_operations.projected.v1', leave.id, ['coverageStatus', 'dailyOperationsProjection', 'version']);
      await this.outbox(manager, leave, 'daily_operations.projected.v1', null, null);
      return this.toImpact(leave, events, assignments);
    });
  }

  private async findApprovedLeave(manager: EntityManager, tenantId: string, leaveId: string, lock: boolean): Promise<LeaveRow | null> {
    const rows = await manager.query(
      `SELECT id, tenant_id AS "tenantId", branch_id AS "branchId", teacher_id AS "teacherId",
              decision_status AS "decisionStatus", coverage_status AS "coverageStatus",
              starts_at AS "startsAt", ends_at AS "endsAt", version
       FROM leave_requests
       WHERE tenant_id = $1 AND id = $2 AND decision_status = 'approved'
       ${lock ? 'FOR UPDATE' : ''}`,
      [tenantId, leaveId],
    );
    return rows[0] ?? null;
  }

  private async loadImpactedEvents(manager: EntityManager, leave: LeaveRow): Promise<ScheduleEventRow[]> {
    const rows = await manager.query(
      `SELECT event.id AS "scheduleEventId", event.schedule_id AS "scheduleId",
              event.version_id AS "scheduleVersionId", event.teacher_id AS "teacherId",
              event.teacher_branch_id AS "teacherBranchId", event.student_group_id AS "studentGroupId",
              event.course_id AS "courseId", event.room_id AS "roomId", event.time_slot_id AS "timeSlotId",
              event.day_of_week AS "dayOfWeek", event.start_time::text AS "startTime", event.end_time::text AS "endTime",
              schedule.effective_from::text AS "effectiveFrom", schedule.effective_to::text AS "effectiveTo"
       FROM schedule_events event
       JOIN schedule_versions version
         ON version.id = event.version_id
        AND version.tenant_id = event.tenant_id
        AND version.branch_id = event.branch_id
        AND version.schedule_id = event.schedule_id
        AND version.status = 'published'
       JOIN schedules schedule
         ON schedule.id = event.schedule_id
        AND schedule.tenant_id = event.tenant_id
        AND schedule.branch_id = event.branch_id
        AND schedule.active_version_id = version.id
        AND schedule.status = 'published'
       WHERE event.tenant_id = $1
         AND event.branch_id = $2
         AND event.teacher_id = $3
         AND schedule.effective_from <= $5::date
         AND COALESCE(schedule.effective_to, '9999-12-31'::date) >= $4::date`,
      [leave.tenantId, leave.branchId, leave.teacherId, leave.startsAt, leave.endsAt],
    );
    return rows.filter((row: ScheduleEventRow) => eventOccurrenceForRange({
      leaveStartsAt: leave.startsAt,
      leaveEndsAt: leave.endsAt,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      dayOfWeek: Number(row.dayOfWeek),
      startTime: row.startTime,
      endTime: row.endTime,
    }));
  }

  private async loadAssignments(manager: EntityManager, leaveId: string): Promise<AssignmentRow[]> {
    return manager.query(
      `SELECT id, schedule_event_id AS "scheduleEventId", substitute_teacher_id AS "substituteTeacherId"
       FROM leave_substitution_assignments
       WHERE leave_request_id = $1 AND state = 'assigned'`,
      [leaveId],
    );
  }

  private async activeAssignment(manager: EntityManager, leaveId: string, scheduleEventId: string): Promise<AssignmentRow | null> {
    const rows = await manager.query(
      `SELECT id, schedule_event_id AS "scheduleEventId", substitute_teacher_id AS "substituteTeacherId"
       FROM leave_substitution_assignments
       WHERE leave_request_id = $1 AND schedule_event_id = $2 AND state = 'assigned'
       FOR UPDATE`,
      [leaveId, scheduleEventId],
    );
    return rows[0] ?? null;
  }

  private async assertEligibleCandidate(manager: EntityManager, leave: LeaveRow, event: ScheduleEventRow, teacherId: string, startsAt: Date, endsAt: Date): Promise<void> {
    if (!(await this.teacherCoursesReady(manager))) throw new Error('TEACHER_COURSE_ELIGIBILITY_NOT_READY');
    const teacher = await manager.query(
      `SELECT 1 FROM teachers teacher
       JOIN teacher_branches branch
         ON branch.tenant_id = teacher.tenant_id AND branch.teacher_id = teacher.id
       WHERE teacher.tenant_id = $1 AND teacher.id = $2 AND teacher.status = 'active'
         AND branch.branch_id = $3 AND branch.status = 'active'
         AND branch.effective_from <= $4::date
         AND (branch.effective_to IS NULL OR branch.effective_to >= $4::date)
       LIMIT 1`,
      [leave.tenantId, teacherId, leave.branchId, startsAt],
    );
    if (teacher.length !== 1) throw new Error('SUBSTITUTE_BRANCH_ASSIGNMENT_MISSING');
    const eligible = await manager.query(
      `SELECT 1 FROM teacher_courses
       WHERE tenant_id = $1 AND teacher_id = $2 AND course_id = $3
         AND status = 'active'
         AND (branch_id IS NULL OR branch_id = $4)
         AND effective_from <= $5::date
         AND (effective_to IS NULL OR effective_to >= $5::date)
       LIMIT 1`,
      [leave.tenantId, teacherId, event.courseId, leave.branchId, startsAt],
    );
    if (eligible.length !== 1) throw new Error('TEACHER_COURSE_MISMATCH');
    const leaveOverlap = await manager.query(
      `SELECT 1 FROM leave_requests
       WHERE tenant_id = $1 AND teacher_id = $2 AND decision_status = 'approved'
         AND starts_at < $4 AND ends_at > $3
       LIMIT 1`,
      [leave.tenantId, teacherId, startsAt, endsAt],
    );
    if (leaveOverlap.length > 0) throw new Error('SUBSTITUTE_LEAVE_OVERLAP');
    const conflict = await manager.query(
      `SELECT 1 FROM schedule_events event
       JOIN schedule_versions version ON version.id = event.version_id AND version.status = 'published'
       JOIN schedules schedule ON schedule.id = event.schedule_id AND schedule.active_version_id = version.id AND schedule.status = 'published'
       WHERE event.tenant_id = $1 AND event.branch_id = $2 AND event.teacher_id = $3
         AND event.day_of_week = $4
         AND event.start_time < $6::time AND event.end_time > $5::time
         AND schedule.effective_from <= $7::date
         AND COALESCE(schedule.effective_to, '9999-12-31'::date) >= $7::date
       LIMIT 1`,
      [leave.tenantId, leave.branchId, teacherId, event.dayOfWeek, event.startTime, event.endTime, startsAt],
    );
    if (conflict.length > 0) throw new Error('SUBSTITUTE_TIME_CONFLICT');
  }

  private async findEligibleCandidates(manager: EntityManager, leave: LeaveRow, event: ScheduleEventRow, startsAt: Date, endsAt: Date): Promise<CandidateResponse['candidates']> {
    const rows = await manager.query(
      `SELECT teacher.id AS "teacherId", branch.id AS "teacherBranchId"
       FROM teachers teacher
       JOIN teacher_branches branch ON branch.tenant_id = teacher.tenant_id AND branch.teacher_id = teacher.id
       WHERE teacher.tenant_id = $1 AND teacher.status = 'active' AND teacher.id <> $2
         AND branch.branch_id = $3 AND branch.status = 'active'
         AND branch.effective_from <= $4::date
         AND (branch.effective_to IS NULL OR branch.effective_to >= $4::date)
       ORDER BY teacher.id ASC`,
      [leave.tenantId, leave.teacherId, leave.branchId, startsAt],
    );
    const candidates: CandidateResponse['candidates'] = [];
    for (const row of rows) {
      try {
        await this.assertEligibleCandidate(manager, leave, event, row.teacherId, startsAt, endsAt);
        candidates.push({ teacherId: row.teacherId, teacherBranchId: row.teacherBranchId, decisionSupportOnly: true, eligible: true });
      } catch {
        // Ineligible candidates are deliberately omitted to avoid exposing branch/tenant or PII details.
      }
    }
    return candidates;
  }

  private async teacherCoursesReady(manager: EntityManager): Promise<boolean> {
    const rows = await manager.query(`SELECT to_regclass(current_schema() || '.teacher_courses') AS table_name`);
    return rows[0]?.table_name === 'teacher_courses';
  }

  private async updateLeaveCoverage(manager: EntityManager, leaveId: string, coverage: LeaveCoverageStatus, version: number): Promise<void> {
    await manager.query(
      `UPDATE leave_requests SET coverage_status = $1, version = $2, updated_at = now() WHERE id = $3`,
      [coverage, version, leaveId],
    );
  }

  private async project(manager: EntityManager, leave: LeaveRow, events: ScheduleEventRow[], assignments: AssignmentRow[]): Promise<void> {
    const byEvent = new Map(assignments.map((item) => [item.scheduleEventId, item]));
    const coverage = computeCoverageStatus(events.length, assignments.length);
    for (const event of events) {
      const assignment = byEvent.get(event.scheduleEventId) ?? null;
      await manager.query(
        `INSERT INTO daily_operation_lessons
          (projection_key, tenant_id, branch_id, leave_request_id, schedule_version_id, schedule_event_id, state, coverage_status, substitute_assignment_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (projection_key) DO UPDATE SET
           state = EXCLUDED.state,
           coverage_status = EXCLUDED.coverage_status,
           substitute_assignment_id = EXCLUDED.substitute_assignment_id,
           version = daily_operation_lessons.version + 1,
           updated_at = now()`,
        [
          projectionKey({ leaveRequestId: leave.id, scheduleVersionId: event.scheduleVersionId, scheduleEventId: event.scheduleEventId }),
          leave.tenantId,
          leave.branchId,
          leave.id,
          event.scheduleVersionId,
          event.scheduleEventId,
          assignment ? 'resolved' : 'open',
          coverage,
          assignment?.id ?? null,
        ],
      );
    }
  }

  private toImpact(leave: LeaveRow, events: ScheduleEventRow[], assignments: AssignmentRow[]): LeaveImpactResponse {
    const byEvent = new Map(assignments.map((item) => [item.scheduleEventId, item]));
    const responseEvents: LeaveImpactEvent[] = events.map((event) => {
      const occurrence = eventOccurrenceForRange({
        leaveStartsAt: leave.startsAt,
        leaveEndsAt: leave.endsAt,
        effectiveFrom: event.effectiveFrom,
        effectiveTo: event.effectiveTo,
        dayOfWeek: event.dayOfWeek,
        startTime: event.startTime,
        endTime: event.endTime,
      })!;
      const assignment = byEvent.get(event.scheduleEventId) ?? null;
      return {
        scheduleEventId: event.scheduleEventId,
        scheduleId: event.scheduleId,
        scheduleVersionId: event.scheduleVersionId,
        teacherId: event.teacherId,
        teacherBranchId: event.teacherBranchId,
        studentGroupId: event.studentGroupId,
        courseId: event.courseId,
        roomId: event.roomId,
        timeSlotId: event.timeSlotId,
        occurrenceDate: occurrence.occurrenceDate,
        startsAt: occurrence.startsAt.toISOString(),
        endsAt: occurrence.endsAt.toISOString(),
        state: assignment ? 'resolved' : 'open',
        substituteAssignmentId: assignment?.id ?? null,
        substituteTeacherId: assignment?.substituteTeacherId ?? null,
      };
    });
    const resolved = responseEvents.filter((event) => event.state === 'resolved').length;
    return {
      leaveRequestId: leave.id,
      branchId: leave.branchId,
      coverageStatus: computeCoverageStatus(responseEvents.length, resolved),
      impactedLessonCount: responseEvents.length,
      resolvedLessonCount: resolved,
      openLessonCount: responseEvents.length - resolved,
      events: responseEvents,
    };
  }

  private assertVersion(leave: LeaveRow, expectedVersion: number): void {
    if (leave.version !== expectedVersion) throw new Error('LEAVE_VERSION_MISMATCH');
  }

  private actorUserId(ctx: RequestContext): string {
    const id = ctx.user?.userId ?? ctx.userId;
    if (!id) throw new TypeError('Authenticated actor is required');
    return id;
  }

  private async auditLeave(manager: EntityManager, ctx: RequestContext, eventName: 'leave.substitution_assigned.v1' | 'leave.substitution_cleared.v1' | 'daily_operations.projected.v1', leaveId: string, changedFields: string[]): Promise<void> {
    await this.audit.write(manager, eventName, {
      schemaVersion: 1,
      tenantId: ctx.tenantId!,
      actorUserId: this.actorUserId(ctx),
      actorSessionId: ctx.user?.sessionId ?? null,
      requestId: ctx.requestId,
      entityType: 'leave_request',
      entityId: leaveId,
      result: 'success',
      changedFields,
    } as never);
  }

  private async outbox(manager: EntityManager, leave: LeaveRow, eventName: string, assignmentId: string | null, scheduleEventId: string | null): Promise<void> {
    await manager.query(
      `INSERT INTO leave_outbox_events (event_key, tenant_id, leave_request_id, event_name, payload_json)
       VALUES ($1,$2,$3,$4,$5::jsonb)
       ON CONFLICT (event_key) DO NOTHING`,
      [
        `${eventName}:${leave.id}:v${leave.version}:${scheduleEventId ?? 'projection'}`,
        leave.tenantId,
        leave.id,
        eventName,
        JSON.stringify({
          schemaVersion: 1,
          leaveRequestId: leave.id,
          branchId: leave.branchId,
          assignmentId,
          scheduleEventId,
          coverageStatus: leave.coverageStatus,
          version: leave.version,
        }),
      ],
    );
  }
}
