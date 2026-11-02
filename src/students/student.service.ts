import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { RequestContext } from '../common/context/request-context';
import { assertTenantScope } from '../common/tenant/assert-tenant-scope';
import { ListRosterQueryDto } from './dto/list-roster-query.dto';
import { ListStudentsQueryDto } from './dto/list-students-query.dto';
import {
  StudentGroupSummaryDto,
  StudentListResponseDto,
  StudentRosterResponseDto,
  StudentSummaryDto,
} from './dto/student-response.dto';
import { StudentGroup } from './student-group.entity';
import { Student } from './student.entity';
import { StudentRepository } from './student.repository';

/**
 * #461 F1: salt-okunur öğrenci/roster yüzeyi.
 *
 * Sunucu otoritesi: branch kapsamı istemciden gelse bile tenant içinde
 * doğrulanır; öğrenci ve grup sorguları her zaman tenant filtresi taşır.
 * Veli iletişimi, doğum tarihi ve cinsiyet yanıta çıkarılmaz.
 */
@Injectable()
export class StudentService {
  constructor(private readonly students: StudentRepository) {}

  async list(
    ctx: RequestContext,
    query: ListStudentsQueryDto,
  ): Promise<StudentListResponseDto> {
    assertTenantScope(ctx, 'students');
    const branchId = this.resolveBranchId(ctx, query.branchId);
    await this.assertBranch(ctx, branchId);

    if (query.studentGroupId) {
      await this.findGroupOrThrow(ctx, query.studentGroupId, branchId);
    }

    const result = await this.students.list(ctx, {
      branchId,
      studentGroupId: query.studentGroupId,
      search: query.search,
      page: query.page,
      limit: query.limit,
    });
    return { data: result.data.map((student) => this.toSummary(student)), meta: result.meta };
  }

  async get(ctx: RequestContext, id: string): Promise<StudentSummaryDto> {
    assertTenantScope(ctx, 'students');
    const student = await this.students.findById(ctx, id);
    if (!student) throw new NotFoundException('Student not found');
    return this.toSummary(student);
  }

  async roster(
    ctx: RequestContext,
    groupId: string,
    query: ListRosterQueryDto,
  ): Promise<StudentRosterResponseDto> {
    assertTenantScope(ctx, 'student_group_members');
    const branchId = query.branchId ?? ctx.branchId;
    const group = await this.findGroupOrThrow(ctx, groupId, branchId);
    const result = await this.students.roster(ctx, group, {
      page: query.page,
      limit: query.limit,
    });
    return {
      studentGroup: this.toGroupSummary(group),
      data: result.data.map((student) => this.toSummary(student)),
      meta: result.meta,
    };
  }

  private resolveBranchId(
    ctx: RequestContext,
    requestedBranchId?: string,
  ): string {
    const branchId = requestedBranchId ?? ctx.branchId;
    if (!branchId) {
      throw new BadRequestException('branchId is required');
    }
    return branchId;
  }

  private async assertBranch(
    ctx: RequestContext,
    branchId: string,
  ): Promise<void> {
    if (await this.students.branchExistsInTenant(ctx, branchId)) return;
    // Cross-tenant/cross-branch varlık sızdırmayan 404.
    throw new NotFoundException('Branch not found');
  }

  private async findGroupOrThrow(
    ctx: RequestContext,
    groupId: string,
    branchId?: string,
  ): Promise<StudentGroup> {
    if (branchId) await this.assertBranch(ctx, branchId);
    const group = await this.students.findGroupById(ctx, groupId, branchId);
    if (!group) throw new NotFoundException('StudentGroup not found');
    return group;
  }

  private toSummary(student: Student): StudentSummaryDto {
    return {
      id: student.id,
      branchId: student.branchId,
      studentCode: student.studentCode,
      firstName: student.firstName,
      lastName: student.lastName,
      enrollmentStatus: student.enrollmentStatus,
    };
  }

  private toGroupSummary(group: StudentGroup): StudentGroupSummaryDto {
    return {
      id: group.id,
      branchId: group.branchId,
      name: group.name,
      code: group.code,
    };
  }
}
