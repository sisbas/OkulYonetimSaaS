import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { RequestContext } from '../common/context/request-context';
import { CreateCourseDto } from './dto/create-course.dto';
import { ListCoursesQueryDto } from './dto/list-courses-query.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { Course, CourseStatus } from './course.entity';
import { CourseAuditService } from './course-audit.service';
import { CourseRepository, PaginatedCourses } from './course.repository';

type CourseMutation = CreateCourseDto | UpdateCourseDto;

function normalizeCode(code: string | undefined): string | null {
  const trimmed = code?.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}

function normalizeDescription(description: string | undefined): string | null {
  const trimmed = description?.trim();
  return trimmed ? trimmed : null;
}

function normalizeRequiredName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 120) {
    throw new BadRequestException('Course name must be between 2 and 120 characters after trimming');
  }
  return trimmed;
}

function changedFieldsFrom(input: CourseMutation, defaults: string[] = []): string[] {
  const fields = new Set(defaults);
  for (const field of ['name', 'code', 'description'] as const) {
    if (Object.prototype.hasOwnProperty.call(input, field)) fields.add(field);
  }
  return [...fields];
}

export type CourseResponse = {
  id: string;
  tenantId: string;
  name: string;
  code: string | null;
  description: string | null;
  status: CourseStatus;
  createdAt: Date;
  updatedAt: Date;
  deactivatedAt: Date | null;
};

@Injectable()
export class CourseService {
  constructor(
    private readonly courses: CourseRepository,
    private readonly audit: CourseAuditService,
  ) {}

  async create(ctx: RequestContext, dto: CreateCourseDto): Promise<CourseResponse> {
    const name = normalizeRequiredName(dto.name);
    const code = normalizeCode(dto.code);
    if (code && (await this.courses.findByCode(ctx, code))) {
      throw new ConflictException('Course code already exists in this tenant');
    }
    const course = await this.courses.create(ctx, {
      name,
      code,
      description: normalizeDescription(dto.description),
    });
    this.audit.emit(ctx, 'course.created', { courseId: course.id, changedFields: changedFieldsFrom(dto, ['status']) });
    return this.toResponse(course);
  }

  async list(ctx: RequestContext, query: ListCoursesQueryDto): Promise<{ data: CourseResponse[]; meta: PaginatedCourses['meta'] }> {
    const result = await this.courses.list(ctx, query);
    return { data: result.data.map((course) => this.toResponse(course)), meta: result.meta };
  }

  async get(ctx: RequestContext, id: string): Promise<CourseResponse> {
    const course = await this.findTenantScopedCourseOrThrow(ctx, id);
    return this.toResponse(course);
  }

  async update(ctx: RequestContext, id: string, dto: UpdateCourseDto): Promise<CourseResponse> {
    const course = await this.findTenantScopedCourseOrThrow(ctx, id, true);
    const code = normalizeCode(dto.code);
    if (code && (await this.courses.findByCode(ctx, code, id))) {
      throw new ConflictException('Course code already exists in this tenant');
    }
    if (Object.prototype.hasOwnProperty.call(dto, 'name')) course.name = normalizeRequiredName(dto.name ?? '');
    if (Object.prototype.hasOwnProperty.call(dto, 'code')) course.code = code;
    if (Object.prototype.hasOwnProperty.call(dto, 'description')) course.description = normalizeDescription(dto.description);
    const updated = await this.courses.save(course);
    this.audit.emit(ctx, 'course.updated', { courseId: updated.id, changedFields: changedFieldsFrom(dto) });
    return this.toResponse(updated);
  }

  async deactivate(ctx: RequestContext, id: string): Promise<CourseResponse> {
    const course = await this.findTenantScopedCourseOrThrow(ctx, id, true);
    if (course.status === CourseStatus.INACTIVE) throw new BadRequestException('Course is already inactive');
    course.status = CourseStatus.INACTIVE;
    course.deactivatedAt = new Date();
    const updated = await this.courses.save(course);
    this.audit.emit(ctx, 'course.deactivated', { courseId: updated.id, changedFields: ['status', 'deactivatedAt'] });
    return this.toResponse(updated);
  }

  async reactivate(ctx: RequestContext, id: string): Promise<CourseResponse> {
    const course = await this.findTenantScopedCourseOrThrow(ctx, id, true);
    if (course.status === CourseStatus.ACTIVE) throw new BadRequestException('Course is already active');
    course.status = CourseStatus.ACTIVE;
    course.deactivatedAt = null;
    const updated = await this.courses.save(course);
    this.audit.emit(ctx, 'course.reactivated', { courseId: updated.id, changedFields: ['status', 'deactivatedAt'] });
    return this.toResponse(updated);
  }

  private async findTenantScopedCourseOrThrow(ctx: RequestContext, id: string, includeInactive = false): Promise<Course> {
    const course = await this.courses.findById(ctx, id, includeInactive);
    if (course) return course;
    if (!includeInactive && await this.courses.existsByIdInTenant(ctx, id)) {
      throw new NotFoundException('Course not found');
    }
    if (await this.courses.existsByIdAnyTenant(id)) {
      this.audit.emitTenantAccessDenied(ctx, { resourceId: id });
    }
    throw new NotFoundException('Course not found');
  }

  private toResponse(course: Course): CourseResponse {
    return {
      id: course.id,
      tenantId: course.tenantId,
      name: course.name,
      code: course.code,
      description: course.description,
      status: course.status,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      deactivatedAt: course.deactivatedAt,
    };
  }
}
