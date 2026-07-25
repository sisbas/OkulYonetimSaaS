import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { RequestContext } from '../common/context/request-context';
import { assertTenantScope } from '../common/tenant/assert-tenant-scope';

export type TeacherIdentityRow = Readonly<{ teacherId: string }>;
export type TeacherBranchIdentityRow = Readonly<{ teacherBranchId: string; branchId: string }>;

@Injectable()
export class TeacherRepository {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async findActiveTeacherForUser(ctx: RequestContext): Promise<TeacherIdentityRow | null> {
    assertTenantScope(ctx, 'teachers');
    const userId = ctx.user?.userId;
    if (!userId) return null;
    const rows = await this.dataSource.query(
      `
        SELECT t.id::text AS "teacherId"
        FROM teachers t
        JOIN users u
          ON u.id = t.user_id
         AND u.status = 'active'
         AND u.deleted_at IS NULL
        JOIN tenant_memberships tm
          ON tm.user_id = u.id
         AND tm.tenant_id = t.tenant_id
         AND tm.status = 'active'
         AND tm.deleted_at IS NULL
        WHERE t.tenant_id = $1::uuid
          AND t.user_id = $2::uuid
          AND t.status = 'active'
          AND t.deleted_at IS NULL
        LIMIT 2
      `,
      [ctx.tenantId, userId],
    );
    return (rows[0] as TeacherIdentityRow | undefined) ?? null;
  }

  async listActiveBranchMemberships(
    ctx: RequestContext,
    teacherId: string,
    input: { branchId?: string; effectiveDate: string },
  ): Promise<TeacherBranchIdentityRow[]> {
    assertTenantScope(ctx, 'teacher_branches');
    return this.dataSource.query(
      `
        SELECT tb.id::text AS "teacherBranchId", tb.branch_id::text AS "branchId"
        FROM teacher_branches tb
        JOIN branches b
          ON b.id = tb.branch_id
         AND b.tenant_id = tb.tenant_id
         AND b.status = 'active'
         AND b.deleted_at IS NULL
        WHERE tb.tenant_id = $1::uuid
          AND tb.teacher_id = $2::uuid
          AND tb.status = 'active'
          AND tb.deleted_at IS NULL
          AND tb.effective_from <= $3::date
          AND (tb.effective_to IS NULL OR tb.effective_to >= $3::date)
          AND ($4::uuid IS NULL OR tb.branch_id = $4::uuid)
        ORDER BY tb.branch_id ASC
        LIMIT 2
      `,
      [ctx.tenantId, teacherId, input.effectiveDate, input.branchId ?? null],
    );
  }
}
