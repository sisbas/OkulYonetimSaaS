import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';

import { RequestContext } from '../common/context/request-context';
import { assertTenantScope } from '../common/tenant/assert-tenant-scope';
import {
  StudentGroupMembershipStatus,
  StudentGroupMember,
} from './student-group-member.entity';
import { StudentGroup } from './student-group.entity';
import { Student, StudentEnrollmentStatus } from './student.entity';
import type { PaginationMeta } from './dto/student-response.dto';

export type StudentListQuery = {
  branchId: string;
  studentGroupId?: string;
  search?: string;
  page?: string | number;
  limit?: string | number;
};

export type StudentRosterQuery = {
  page?: string | number;
  limit?: string | number;
};

export type PaginatedStudents = {
  data: Student[];
  meta: PaginationMeta;
};

function positiveInt(
  value: string | number | undefined,
  fallback: number,
  max: number,
): number {
  const parsed =
    typeof value === 'number' ? value : Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

@Injectable()
export class StudentRepository {
  constructor(
    @InjectRepository(Student)
    private readonly students: Repository<Student>,
    @InjectRepository(StudentGroup)
    private readonly groups: Repository<StudentGroup>,
    @InjectRepository(StudentGroupMember)
    private readonly members: Repository<StudentGroupMember>,
  ) {}

  async list(
    ctx: RequestContext,
    query: StudentListQuery,
  ): Promise<PaginatedStudents> {
    assertTenantScope(ctx, 'students');
    const page = positiveInt(query.page, 1, 10_000);
    const limit = positiveInt(query.limit, 20, 100);

    const qb = this.students
      .createQueryBuilder('student')
      .where('student.tenant_id = :tenantId', { tenantId: ctx.tenantId })
      .andWhere('student.branch_id = :branchId', { branchId: query.branchId })
      .andWhere('student.deleted_at IS NULL')
      .andWhere('student.enrollment_status = :enrollmentStatus', {
        enrollmentStatus: StudentEnrollmentStatus.ACTIVE,
      });

    if (query.studentGroupId) {
      this.joinActiveMembership(qb)
        .andWhere('member.student_group_id = :studentGroupId', {
          studentGroupId: query.studentGroupId,
        });
    }

    const search = query.search?.trim();
    if (search) {
      qb.andWhere(
        "(student.first_name ILIKE :search ESCAPE '\\' OR student.last_name ILIKE :search ESCAPE '\\' OR student.student_code ILIKE :search ESCAPE '\\')",
        { search: `%${escapeLikePattern(search)}%` },
      );
    }

    const [data, total] = await qb
      .orderBy('student.last_name', 'ASC')
      .addOrderBy('student.first_name', 'ASC')
      .addOrderBy('student.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findById(ctx: RequestContext, id: string): Promise<Student | null> {
    assertTenantScope(ctx, 'students');
    const qb = this.students
      .createQueryBuilder('student')
      .where('student.id = :id AND student.tenant_id = :tenantId', {
        id,
        tenantId: ctx.tenantId,
      })
      .andWhere('student.deleted_at IS NULL');
    if (ctx.branchId) {
      qb.andWhere('student.branch_id = :branchId', { branchId: ctx.branchId });
    }
    return qb.getOne();
  }

  async findGroupById(
    ctx: RequestContext,
    groupId: string,
    branchId?: string,
  ): Promise<StudentGroup | null> {
    assertTenantScope(ctx, 'student_groups');
    const qb = this.groups
      .createQueryBuilder('group')
      .where('group.id = :groupId AND group.tenant_id = :tenantId', {
        groupId,
        tenantId: ctx.tenantId,
      })
      .andWhere('group.deleted_at IS NULL');
    if (branchId) {
      qb.andWhere('group.branch_id = :branchId', { branchId });
    }
    return qb.getOne();
  }

  async roster(
    ctx: RequestContext,
    group: StudentGroup,
    query: StudentRosterQuery,
  ): Promise<PaginatedStudents> {
    assertTenantScope(ctx, 'student_group_members');
    const page = positiveInt(query.page, 1, 10_000);
    const limit = positiveInt(query.limit, 50, 100);

    const qb = this.students
      .createQueryBuilder('student')
      .innerJoin(
        StudentGroupMember,
        'member',
        [
          'member.student_id = student.id',
          'member.tenant_id = student.tenant_id',
          'member.branch_id = student.branch_id',
          'member.deleted_at IS NULL',
          'member.status = :membershipStatus',
        ].join(' AND '),
        {
          membershipStatus: StudentGroupMembershipStatus.ACTIVE,
        },
      )
      .where('student.tenant_id = :tenantId', { tenantId: ctx.tenantId })
      .andWhere('student.branch_id = :branchId', { branchId: group.branchId })
      .andWhere('student.deleted_at IS NULL')
      .andWhere('student.enrollment_status = :enrollmentStatus', {
        enrollmentStatus: StudentEnrollmentStatus.ACTIVE,
      })
      .andWhere('member.student_group_id = :studentGroupId', {
        studentGroupId: group.id,
      });

    const [data, total] = await qb
      .orderBy('student.last_name', 'ASC')
      .addOrderBy('student.first_name', 'ASC')
      .addOrderBy('student.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return {
      data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  /**
   * F3 için sunucu-türetimli roster: yalnız aktif üyelik + aktif öğrenci.
   * Sıra deterministiktir; yoklama snapshot'ı bu listeden üretilir.
   */
  async listRosterStudentIds(
    ctx: RequestContext,
    branchId: string,
    studentGroupId: string,
  ): Promise<string[]> {
    assertTenantScope(ctx, 'student_group_members');
    const rows = await this.members
      .createQueryBuilder('member')
      .innerJoin(
        Student,
        'student',
        [
          'student.id = member.student_id',
          'student.tenant_id = member.tenant_id',
          'student.branch_id = member.branch_id',
          'student.deleted_at IS NULL',
          'student.enrollment_status = :enrollmentStatus',
        ].join(' AND '),
        { enrollmentStatus: StudentEnrollmentStatus.ACTIVE },
      )
      .where('member.tenant_id = :tenantId', { tenantId: ctx.tenantId })
      .andWhere('member.branch_id = :branchId', { branchId })
      .andWhere('member.student_group_id = :studentGroupId', {
        studentGroupId,
      })
      .andWhere('member.deleted_at IS NULL')
      .andWhere('member.status = :membershipStatus', {
        membershipStatus: StudentGroupMembershipStatus.ACTIVE,
      })
      .orderBy('student.last_name', 'ASC')
      .addOrderBy('student.first_name', 'ASC')
      .addOrderBy('student.id', 'ASC')
      .getMany();
    return rows.map((member) => member.studentId);
  }

  async branchExistsInTenant(
    ctx: RequestContext,
    branchId: string,
  ): Promise<boolean> {
    assertTenantScope(ctx, 'branches');
    const branch = await this.students.manager
      .createQueryBuilder()
      .select('1', 'exists')
      .from('branches', 'branch')
      .where(
        'branch.id = :branchId AND branch.tenant_id = :tenantId',
        { branchId, tenantId: ctx.tenantId },
      )
      .andWhere('branch.status = :status', { status: 'active' })
      .andWhere('branch.deleted_at IS NULL')
      .getRawOne<{ exists: string }>();
    return Boolean(branch);
  }

  /**
   * Aktif grup üyeliği join'i. `list()` içinde çoklu grup filtresi için
   * kullanılır; roster sorgusu kendi join'ini kurar.
   */
  private joinActiveMembership(
    qb: SelectQueryBuilder<Student>,
  ): SelectQueryBuilder<Student> {
    return qb.innerJoin(
      StudentGroupMember,
      'member',
      [
        'member.student_id = student.id',
        'member.tenant_id = student.tenant_id',
        'member.branch_id = student.branch_id',
        'member.deleted_at IS NULL',
        'member.status = :membershipStatus',
      ].join(' AND '),
      { membershipStatus: StudentGroupMembershipStatus.ACTIVE },
    );
  }
}

