import { RequestContext } from '../common/context/request-context';
import { TeacherCourseEligibilityRepository } from './teacher-course-eligibility.repository';

function ctx(): RequestContext {
  return {
    requestId: 'req-teacher-course',
    tenantId: 'tenant-authority',
  };
}

describe('TeacherCourseEligibilityRepository', () => {
  it('uses tenant context, active Teacher/Course joins and effective-period filtering', async () => {
    const dataSource = {
      query: jest.fn(async () => [
        {
          teacherCourseId: 'tc-ref',
          teacherId: 'teacher-ref',
          courseId: 'course-ref',
          effectiveFrom: '2026-09-01',
          effectiveTo: null,
        },
      ]),
    };

    const result = await new TeacherCourseEligibilityRepository(dataSource as any).findActiveEligibility(ctx(), {
      teacherId: 'teacher-ref',
      courseId: 'course-ref',
      effectiveDate: '2026-09-15',
    });

    const [sql, params] = dataSource.query.mock.calls[0];
    expect(result).toEqual({
      eligible: true,
      reasonCode: 'TC_ELIGIBLE',
      teacherCourseId: 'tc-ref',
      teacherId: 'teacher-ref',
      courseId: 'course-ref',
      effectiveFrom: '2026-09-01',
      effectiveTo: null,
    });
    expect(params).toEqual(['tenant-authority', 'teacher-ref', 'course-ref', '2026-09-15']);
    expect(sql).toContain("t.status = 'active'");
    expect(sql).toContain("c.status = 'active'");
    expect(sql).toContain("tc.status = 'active'");
    expect(sql).toContain('tc.effective_from <= $4::date');
    expect(sql).toContain('tc.tenant_id = $1::uuid');
  });

  it('does not accept client supplied tenant as eligibility authority', async () => {
    const dataSource = { query: jest.fn(async () => []) };
    await new TeacherCourseEligibilityRepository(dataSource as any).findActiveEligibility(ctx(), {
      teacherId: 'teacher-ref',
      courseId: 'course-ref',
      effectiveDate: '2026-09-15',
    });
    expect(dataSource.query.mock.calls[0][1][0]).toBe('tenant-authority');
  });

  it('fails closed for inactive, expired, cross-tenant or missing references', async () => {
    const dataSource = { query: jest.fn(async () => []) };
    const result = await new TeacherCourseEligibilityRepository(dataSource as any).findActiveEligibility(ctx(), {
      teacherId: 'teacher-ref',
      courseId: 'course-ref',
      effectiveDate: '2026-09-15',
    });
    expect(result).toEqual({ eligible: false, reasonCode: 'TC_NOT_ELIGIBLE' });
  });

  it('fails closed when duplicate active eligibility rows are observed', async () => {
    const dataSource = {
      query: jest.fn(async () => [
        { teacherCourseId: 'tc-a', teacherId: 'teacher-ref', courseId: 'course-ref', effectiveFrom: '2026-09-01', effectiveTo: null },
        { teacherCourseId: 'tc-b', teacherId: 'teacher-ref', courseId: 'course-ref', effectiveFrom: '2026-09-10', effectiveTo: null },
      ]),
    };
    const result = await new TeacherCourseEligibilityRepository(dataSource as any).findActiveEligibility(ctx(), {
      teacherId: 'teacher-ref',
      courseId: 'course-ref',
      effectiveDate: '2026-09-15',
    });
    expect(result).toEqual({ eligible: false, reasonCode: 'TC_DUPLICATE_ACTIVE_ELIGIBILITY' });
  });

  it('returns only opaque IDs, controlled dates and reason code fields', async () => {
    const dataSource = {
      query: jest.fn(async () => [
        {
          teacherCourseId: 'tc-ref',
          teacherId: 'teacher-ref',
          courseId: 'course-ref',
          effectiveFrom: '2026-09-01',
          effectiveTo: '2026-12-31',
        },
      ]),
    };
    const result = await new TeacherCourseEligibilityRepository(dataSource as any).findActiveEligibility(ctx(), {
      teacherId: 'teacher-ref',
      courseId: 'course-ref',
      effectiveDate: '2026-09-15',
    });
    expect(Object.keys(result).sort()).toEqual([
      'courseId',
      'effectiveFrom',
      'effectiveTo',
      'eligible',
      'reasonCode',
      'teacherCourseId',
      'teacherId',
    ]);
  });
});
