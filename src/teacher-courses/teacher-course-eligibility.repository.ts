import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { RequestContext } from '../common/context/request-context';
import { assertTenantScope } from '../common/tenant/assert-tenant-scope';

export type TeacherCourseEligibilityReasonCode =
  | 'TC_ELIGIBLE'
  | 'TC_NOT_ELIGIBLE'
  | 'TC_DUPLICATE_ACTIVE_ELIGIBILITY';

export type TeacherCourseEligibility = Readonly<{
  eligible: boolean;
  reasonCode: TeacherCourseEligibilityReasonCode;
  teacherCourseId?: string;
  teacherId?: string;
  courseId?: string;
  effectiveFrom?: string;
  effectiveTo?: string | null;
}>;

type TeacherCourseEligibilityRow = Readonly<{
  teacherCourseId: string;
  teacherId: string;
  courseId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
}>;

@Injectable()
export class TeacherCourseEligibilityRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findActiveEligibility(
    ctx: RequestContext,
    input: { teacherId: string; courseId: string; effectiveDate: string },
  ): Promise<TeacherCourseEligibility> {
    assertTenantScope(ctx, 'teacher_courses');
    const rows = (await this.dataSource.query(
      `
        SELECT
          tc.id::text AS "teacherCourseId",
          tc.teacher_id::text AS "teacherId",
          tc.course_id::text AS "courseId",
          tc.effective_from::text AS "effectiveFrom",
          tc.effective_to::text AS "effectiveTo"
        FROM teacher_courses tc
        JOIN teachers t
          ON t.tenant_id = tc.tenant_id
         AND t.id = tc.teacher_id
         AND t.status = 'active'
         AND t.deleted_at IS NULL
        JOIN courses c
          ON c.tenant_id = tc.tenant_id
         AND c.id = tc.course_id
         AND c.status = 'active'
        WHERE tc.tenant_id = $1::uuid
          AND tc.teacher_id = $2::uuid
          AND tc.course_id = $3::uuid
          AND tc.status = 'active'
          AND tc.deleted_at IS NULL
          AND tc.effective_from <= $4::date
          AND (tc.effective_to IS NULL OR tc.effective_to >= $4::date)
        ORDER BY tc.id ASC
        LIMIT 2
      `,
      [ctx.tenantId, input.teacherId, input.courseId, input.effectiveDate],
    )) as TeacherCourseEligibilityRow[];

    if (rows.length > 1) {
      return { eligible: false, reasonCode: 'TC_DUPLICATE_ACTIVE_ELIGIBILITY' };
    }
    if (rows.length === 0) {
      return { eligible: false, reasonCode: 'TC_NOT_ELIGIBLE' };
    }

    const row = rows[0];
    return {
      eligible: true,
      reasonCode: 'TC_ELIGIBLE',
      teacherCourseId: row.teacherCourseId,
      teacherId: row.teacherId,
      courseId: row.courseId,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
    };
  }
}
