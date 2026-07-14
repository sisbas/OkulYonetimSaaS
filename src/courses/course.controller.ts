import { Body, Controller, ForbiddenException, Get, Param, Patch, Post, Query, Req, UnauthorizedException } from '@nestjs/common';

import { RequestContext, RequestWithContext } from '../common/context/request-context';
import { Permissions } from '../common/decorators/permissions.decorator';
import { CourseService } from './course.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { ListCoursesQueryDto } from './dto/list-courses-query.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

function getRequestContext(request: RequestWithContext): RequestContext {
  if (!request.user && !request.context?.user) throw new UnauthorizedException('Authentication required');
  if (!request.context?.tenantId) throw new ForbiddenException('Tenant context required');
  return request.context;
}

@Controller('courses')
export class CourseController {
  constructor(private readonly courses: CourseService) {}

  @Post()
  @Permissions('course:create')
  create(@Req() request: RequestWithContext, @Body() dto: CreateCourseDto) {
    return this.courses.create(getRequestContext(request), dto);
  }

  @Get()
  @Permissions('course:read')
  list(@Req() request: RequestWithContext, @Query() query: ListCoursesQueryDto) {
    return this.courses.list(getRequestContext(request), query);
  }

  @Get(':id')
  @Permissions('course:read')
  get(@Req() request: RequestWithContext, @Param('id') id: string) {
    return this.courses.get(getRequestContext(request), id);
  }

  @Patch(':id')
  @Permissions('course:update')
  update(@Req() request: RequestWithContext, @Param('id') id: string, @Body() dto: UpdateCourseDto) {
    return this.courses.update(getRequestContext(request), id, dto);
  }

  @Post(':id/deactivate')
  @Permissions('course:archive')
  deactivate(@Req() request: RequestWithContext, @Param('id') id: string) {
    return this.courses.deactivate(getRequestContext(request), id);
  }

  @Post(':id/reactivate')
  @Permissions('course:archive')
  reactivate(@Req() request: RequestWithContext, @Param('id') id: string) {
    return this.courses.reactivate(getRequestContext(request), id);
  }
}
