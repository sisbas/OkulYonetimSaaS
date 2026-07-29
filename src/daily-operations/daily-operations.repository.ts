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
  DailyOperationsQueueResponse,
  EventOccurrence,
  LeaveImpactEvent,
  LeaveImpactResponse,
  computeCoverageStatus,
  eventOccurrencesForRange,
  leaveEtag,
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

type PublishedScheduleEventRow = {
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

type ImpactedScheduleEventRow = PublishedScheduleEventRow & EventOccurrence;

type AssignmentRow = {
  id: string;
  scheduleEventId: string;
  scheduleVersionId: string;
  substituteTeacherId: string;
};

type QueueLessonRow = {
  dailyOperationLessonId: string;
  leaveRequestId: string;
  leaveVersion: number;
  branchId: string;
  scheduleVersionId: string;
  scheduleEventId: string;
  occurrenceDate: string;
  state: 'open' | 'resolved';
  coverageStatus: LeaveCoverageStatus;
  originalTeacherId: string;
  substituteAssignmentId: string | null;
  substituteTeacherId: string | null;
  studentGroupId: string;
  courseId: string;
  roomId: string;
  timeSlotId: string;
  startTime: string;
  endTime: string;
};

function assignmentKey(input: { scheduleEventId: string; scheduleVersionId: string }): string {
  return `${input.scheduleVersionId}:${input.scheduleEventId}`;
}

@Injectable()
export class DailyOperationsRepository {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(TRANSACTIONAL_AUDIT_WRITER)
    private readonly audit: TransactionalAuditWriter,
  ) {}

  async today(ctx: RequestContext, input: { branchId: string; date: string }): Promise<DailyOperationsQueueResponse> {
    assertTenantScope(ctx, 'daily_operation_lessons');
    await this.assertBranchOwnership(this.dataSource.manager, ctx.tenantId!, input.branchId);
    const rows = (await this.dataSource.manager.query(
      `SELECT
          lesson.id::text AS "dailyOperationLessonId",
          lesson.leave_request_id::text AS "leaveRequestId",
          leave_request.version AS "leaveVersion",
          lesson.branch_id::text AS "branchId",
          lesson.schedule_version_id::text AS "scheduleVersionId",
          lesson.schedule_event_id::text AS "scheduleEventId",
          lesson.occurrence_date::text AS "occurrenceDate",
          lesson.state AS "state",
          lesson.coverage_status AS "coverageStatus",
          event.teacher_id::text AS "originalTeacherId",
          lesson.substitute_assignment_id::text AS "substituteAssignmentId",
          assignment.substitute_teacher_id::text AS "substituteTeacherId",
          event.student_group_id::text AS "studentGroupId",
          event.course_id::text AS "courseId",
          event.room_id::text AS "roomId",
          event.time_slot_id::text AS "timeSlotId",
          event.start_time::text AS "startTime",
          event.end_time::text AS "endTime"
       FROM daily_operation_lessons lesson
       JOIN leave_requests leave_request
         ON leave_request.id = lesson.leave_request_id
        AND leave_request.tenant_id = lesson.tenant_id
        AND leave_request.branch_id = lesson.branch_id
       JOIN schedule_events event
         ON event.id = lesson.schedule_event_id
        AND event.tenant_id = lesson.tenant_id
        AND event.branch_id = lesson.branch_id
        AND event.version_id = lesson.schedule_version_id
       LEFT JOIN leave_substitution_assignments assignment
         ON assignment.id = lesson.substitute_assignment_id
        AND assignment.tenant_id = lesson.tenant_id
        AND assignment.branch_id = lesson.branch_id
        AND assignment.state = 'assigned'
       WHERE lesson.tenant_id = $1
         AND lesson.branch_id = $2
         AND lesson.occurrence_date = $3::date
       ORDER BY lesson.state ASC, event.start_time ASC, lesson.updated_at ASC, lesson.id ASC`,
      [ctx.tenantId, input.branchId, input.date],
    )) as QueueLessonRow[];

    return {
      tenantScoped: true,
      branchId: input.branchId,
      date: input.date,
      permission: 'daily_operations:read',
      lessons: rows.map((row) => ({
        dailyOperationLessonId: row.dailyOperationLessonId,
        leaveRequestId: row.leaveRequestId,
        leaveVersion: Number(row.leaveVersion),
        leaveEtag: leaveEtag(row.leaveRequestId, Number(row.leaveVersion)),
        branchId: row.branchId,
        scheduleVersionId: row.scheduleVersionId,
        scheduleEventId: row.scheduleEventId,
        occurrenceDate: row.occurrenceDate,
        startsAt: `${row.occurrenceDate}T${row.startTime}`,
        endsAt: `${row.occurrenceDate}T${row.endTime}`,
        state: row.state,
        coverageStatus: row.coverageStatus,
        originalTeacherId: row.originalTeacherId,
        substituteAssignmentId: row.substituteAssignmentId,
        substituteTeacherId: row.substituteTeacherId,
        studentGroupId: row.studentGroupId,
        courseId: row.courseId,
        roomId: row.roomId,
        timeSlotId: row.timeSlotId,
      })),
    };
  }

  async impact(ctx: RequestContext, leaveId: string): Promise<LeaveImpactResponse> {
    assertTenantScope(ctx, 'daily_operations_leave_impact');
    const leave = await this.findApprovedLeave(this.dataSource.manager, ctx.tenantId!, leaveId, false);
    if (!leave) throw new Error('LEAVE_NOT_APPROVED');
    const events = await this.loadImpactedEvents(this.dataSource.manager, leave);
    const assignments = this.currentAssignments(events, await this.loadAssignments(this.dataSource.manager, leave));
    return this.toImpact(leave, events, assignments);
  }

  async candidates(ctx: RequestContext, leaveId: string, scheduleEventId: string): Promise<CandidateResponse> {
    assertTenantScope(ctx, 'daily_operations_leave_impact');
    const leave = await this.findApprovedLeave(this.dataSource.manager, ctx.tenantId!, leaveId, false);
    if (!leave) throw new Error('LEAVE_NOT_APPROVED');
    const matchingEvents = (await this.loadImpactedEvents(this.dataSource.manager, leave))
      .filter((item) => item.scheduleEventId === scheduleEventId);
    if (matchingEvents.length === 0) throw new Error('NO_PUBLISHED_SCHEDULE_EVENT');
    const event = matchingEvents[0];
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
    const candidates = await this.findEligibleCandidates(this.dataSource.manager, leave, matchingEvents);
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
      const matchingEvents = events.filter((item) => item.scheduleEventId === input.scheduleEventId);
      if (matchingEvents.length === 0) throw new Error('NO_PUBLISHED_SCHEDULE_EVENT');
      await this.lockSubstituteTeacherForMutation(manager, leave.tenantId, input.substituteTeacherId);
      for (const event of matchingEvents) {
        await this.assertEligibleCandidate(manager, leave, event, input.substituteTeacherId, event.startsAt, event.endsAt);
      }
      const existing = await this.activeAssignment(manager, leave.id, input.scheduleEventId);
      if (existing) throw new Error('ASSIGNMENT_ALREADY_EXISTS');
      const event = matchingEvents[0];
      const rows = await manager.query(
        `INSERT INTO leave_substitution_assignments
          (tenant_id, branch_id, leave_request_id, schedule_version_id, schedule_event_id, substitute_teacher_id, course_id, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id`,
        [leave.tenantId, leave.branchId, leave.id, event.scheduleVersionId, event.scheduleEventId, input.substituteTeacherId, event.courseId, this.actorUserId(ctx)],
      );
      const assignments = this.currentAssignments(events, await this.loadAssignments(manager, leave));
      const coverage = this.coverageFor(events, assignments);
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
      const assignments = this.currentAssignments(events, await this.loadAssignments(manager, leave));
      const coverage = this.coverageFor(events, assignments);
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
      const assignments = this.currentAssignments(events, await this.loadAssignments(manager, leave));
      const coverage = this.coverageFor(events, assignments);
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

  private async assertBranchOwnership(manager: EntityManager, tenantId: string, branchId: string): Promise<void> {
    const rows = await manager.query(
      `SELECT 1 FROM branches WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, branchId],
    );
    if (rows.length !== 1) throw new Error('BRANCH_NOT_VISIBLE');
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

  private async loadImpactedEvents(manager: EntityManager, leave: LeaveRow): Promise<ImpactedScheduleEventRow[]> {
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

    const impacted: ImpactedScheduleEventRow[] = [];
    for (const row of rows as PublishedScheduleEventRow[]) {
      for (const occurrence of eventOccurrencesForRange({
        leaveStartsAt: leave.startsAt,
        leaveEndsAt: leave.endsAt,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
        dayOfWeek: Number(row.dayOfWeek),
        startTime: row.startTime,
        endTime: row.endTime,
      })) {
        impacted.push({ ...row, dayOfWeek: Number(row.dayOfWeek), ...occurrence });
      }
    }
    return impacted;
  }

  private async loadAssignments(manager: EntityManager, leave: LeaveRow): Promise<AssignmentRow[]> {
    return manager.query(
      `SELECT id, schedule_version_id AS "scheduleVersionId", schedule_event_id AS "scheduleEventId", substitute_teacher_id AS "substituteTeacherId"
       FROM leave_substitution_assignments
       WHERE tenant_id = $1 AND leave_request_id = $2 AND state = 'assigned'`,
      [leave.tenantId, leave.id],
    );
  }

  private async activeAssignment(manager: EntityManager, leaveId: string, scheduleEventId: string): Promise<AssignmentRow | null> {
    const rows = await manager.query(
      `SELECT id, schedule_version_id AS "scheduleVersionId", schedule_event_id AS "scheduleEventId", substitute_teacher_id AS "substituteTeacherId"
       FROM leave_substitution_assignments
       WHERE leave_request_id = $1 AND schedule_event_id = $2 AND state = 'assigned'
       FOR UPDATE`,
      [leaveId, scheduleEventId],
    );
    return rows[0] ?? null;
  }

  private async lockSubstituteTeacherForMutation(manager: EntityManager, tenantId: string, teacherId: string): Promise<void> {
    await manager.query(
      `SELECT id
       FROM teachers
       WHERE tenant_id = $1 AND id = $2
       FOR UPDATE`,
      [tenantId, teacherId],
    );
  }

  private async assertEligibleCandidate(manager: EntityManager, leave: LeaveRow, event: ImpactedScheduleEventRow, teacherId: string, startsAt: Date, endsAt: Date): Promise<void> {
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
      [leave.tenantId, teacherId, leave.branchId, event.occurrenceDate],
    );
    if (teacher.length !== 1) throw new Error('SUBSTITUTE_BRANCH_ASSIGNMENT_MISSING');
    const eligible = await manager.query(
      `SELECT 1 FROM teacher_courses
       WHERE tenant_id = $1 AND teacher_id = $2 AND course_id = $3
         AND status = 'active'
         AND effective_from <= $4::date
         AND (effective_to IS NULL OR effective_to >= $4::date)
       LIMIT 1`,
      [leave.tenantId, teacherId, event.courseId, event.occurrenceDate],
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
      [leave.tenantId, leave.branchId, teacherId, event.dayOfWeek, event.startTime, event.endTime, event.occurrenceDate],
    );
    if (conflict.length > 0) throw new Error('SUBSTITUTE_TIME_CONFLICT');
    const substitutionConflict = await manager.query(
      `SELECT 1 FROM leave_substitution_assignments assignment
       JOIN leave_requests assigned_leave
         ON assigned_leave.id = assignment.leave_request_id
        AND assigned_leave.tenant_id = assignment.tenant_id
        AND assigned_leave.decision_status = 'approved'
       JOIN schedule_events event
         ON event.id = assignment.schedule_event_id
        AND event.tenant_id = assignment.tenant_id
        AND event.branch_id = assignment.branch_id
       JOIN schedule_versions version
         ON version.id = event.version_id
        AND version.tenant_id = event.tenant_id
        AND version.branch_id = event.branch_id
        AND version.status = 'published'
       JOIN schedules schedule
         ON schedule.id = event.schedule_id
        AND schedule.tenant_id = event.tenant_id
        AND schedule.branch_id = event.branch_id
        AND schedule.active_version_id = version.id
        AND schedule.status = 'published'
       WHERE assignment.tenant_id = $1
         AND assignment.branch_id = $2
         AND assignment.substitute_teacher_id = $3
         AND assignment.state = 'assigned'
         AND event.day_of_week = $4
         AND event.start_time < $6::time AND event.end_time > $5::time
         AND schedule.effective_from <= $7::date
         AND COALESCE(schedule.effective_to, '9999-12-31'::date) >= $7::date
         AND assigned_leave.starts_at < $9
         AND assigned_leave.ends_at > $8
         AND NOT (assignment.leave_request_id = $10 AND assignment.schedule_event_id = $11)
       LIMIT 1`,
      [leave.tenantId, leave.branchId, teacherId, event.dayOfWeek, event.startTime, event.endTime, event.occurrenceDate, startsAt, endsAt, leave.id, event.scheduleEventId],
    );
    if (substitutionConflict.length > 0) throw new Error('SUBSTITUTE_TIME_CONFLICT');
  }

  private async findEligibleCandidates(manager: EntityManager, leave: LeaveRow, events: ImpactedScheduleEventRow[]): Promise<CandidateResponse['candidates']> {
    const firstEvent = events[0];
    const rows = await manager.query(
      `SELECT teacher.id AS "teacherId", branch.id AS "teacherBranchId"
       FROM teachers teacher
       JOIN teacher_branches branch ON branch.tenant_id = teacher.tenant_id AND branch.teacher_id = teacher.id
       WHERE teacher.tenant_id = $1 AND teacher.status = 'active' AND teacher.id <> $2
         AND branch.branch_id = $3 AND branch.status = 'active'
         AND branch.effective_from <= $4::date
         AND (branch.effective_to IS NULL OR branch.effective_to >= $4::date)
       ORDER BY teacher.id ASC`,
      [leave.tenantId, leave.teacherId, leave.branchId, firstEvent.occurrenceDate],
    );
    const candidates: CandidateResponse['candidates'] = [];
    for (const row of rows) {
      try {
        for (const event of events) {
          await this.assertEligibleCandidate(manager, leave, event, row.teacherId, event.startsAt, event.endsAt);
        }
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

  private currentAssignments(events: ImpactedScheduleEventRow[], assignments: AssignmentRow[]): AssignmentRow[] {
    const current = new Set(events.map((event) => assignmentKey(event)));
    return assignments.filter((assignment) => current.has(assignmentKey(assignment)));
  }

  private resolvedLessonCount(events: ImpactedScheduleEventRow[], assignments: AssignmentRow[]): number {
    const byEvent = new Map(assignments.map((item) => [assignmentKey(item), item]));
    return events.filter((event) => byEvent.has(assignmentKey(event))).length;
  }

  private coverageFor(events: ImpactedScheduleEventRow[], assignments: AssignmentRow[]): LeaveCoverageStatus {
    return computeCoverageStatus(events.length, this.resolvedLessonCount(events, assignments));
  }

  private async project(manager: EntityManager, leave: LeaveRow, events: ImpactedScheduleEventRow[], assignments: AssignmentRow[]): Promise<void> {
    const byEvent = new Map(assignments.map((item) => [assignmentKey(item), item]));
    const coverage = this.coverageFor(events, assignments);
    const activeProjectionKeys: string[] = [];
    for (const event of events) {
      const assignment = byEvent.get(assignmentKey(event)) ?? null;
      const key = projectionKey({
        leaveRequestId: leave.id,
        scheduleVersionId: event.scheduleVersionId,
        scheduleEventId: event.scheduleEventId,
        occurrenceDate: event.occurrenceDate,
      });
      activeProjectionKeys.push(key);
      await manager.query(
        `INSERT INTO daily_operation_lessons
          (projection_key, tenant_id, branch_id, leave_request_id, schedule_version_id, schedule_event_id, occurrence_date, state, coverage_status, substitute_assignment_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (projection_key) DO UPDATE SET
           state = EXCLUDED.state,
           coverage_status = EXCLUDED.coverage_status,
           substitute_assignment_id = EXCLUDED.substitute_assignment_id,
           version = daily_operation_lessons.version + 1,
           updated_at = now()`,
        [
          key,
          leave.tenantId,
          leave.branchId,
          leave.id,
          event.scheduleVersionId,
          event.scheduleEventId,
          event.occurrenceDate,
          assignment ? 'resolved' : 'open',
          coverage,
          assignment?.id ?? null,
        ],
      );
    }
    await this.retireStaleProjections(manager, leave, activeProjectionKeys);
  }

  private async retireStaleProjections(manager: EntityManager, leave: LeaveRow, activeProjectionKeys: string[]): Promise<void> {
    await manager.query(
      `DELETE FROM daily_operation_lessons
       WHERE tenant_id = $1
         AND leave_request_id = $2
         AND NOT (projection_key = ANY($3::text[]))`,
      [leave.tenantId, leave.id, activeProjectionKeys],
    );
  }

  private toImpact(leave: LeaveRow, events: ImpactedScheduleEventRow[], assignments: AssignmentRow[]): LeaveImpactResponse {
    const byEvent = new Map(assignments.map((item) => [assignmentKey(item), item]));
    const responseEvents: LeaveImpactEvent[] = events.map((event) => {
      const assignment = byEvent.get(assignmentKey(event)) ?? null;
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
        occurrenceDate: event.occurrenceDate,
        startsAt: event.startsAt.toISOString(),
        endsAt: event.endsAt.toISOString(),
        state: assignment ? 'resolved' : 'open',
        substituteAssignmentId: assignment?.id ?? null,
        substituteTeacherId: assignment?.substituteTeacherId ?? null,
      };
    });
    const resolved = responseEvents.filter((event) => event.state === 'resolved').length;
    return {
      leaveRequestId: leave.id,
      branchId: leave.branchId,
      leaveVersion: leave.version,
      leaveEtag: leaveEtag(leave.id, leave.version),
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
