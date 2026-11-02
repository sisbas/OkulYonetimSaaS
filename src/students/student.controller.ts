import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

import {
  RequestContext,
  RequestWithContext,
} from '../common/context/request-context';
import { Permissions } from '../common/decorators/permissions.decorator';
import { TenantScopeGuard } from '../common/tenant/tenant-scope.guard';
import { ListRosterQueryDto } from './dto/list-roster-query.dto';
import { ListStudentsQueryDto } from './dto/list-students-query.dto';
import { StudentService } from './student.service';

function requestContext(request: RequestWithContext): RequestContext {
  if (!request.user && !request.context?.user) {
    throw new UnauthorizedException('Authentication required');
  }
  if (!request.context?.tenantId) {
    throw new ForbiddenException('Tenant context required');
  }
  return request.context;
}

// Kiracı kapsamı zorunlu: isteğin sınırında kiracı izolasyonunu doğrular.
@UseGuards(AuthGuard('jwt'), TenantScopeGuard)
@Controller('students')
export class StudentController {
  constructor(private readonly students: StudentService) {}

  @Get()
  @Permissions('student:read')
  list(
    @Req() request: RequestWithContext,
    @Query() query: ListStudentsQueryDto,
  ) {
    return this.students.list(requestContext(request), query);
  }

  @Get(':id')
  @Permissions('student:read')
  get(
    @Req() request: RequestWithContext,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    return this.students.get(requestContext(request), id);
  }
}

/**
 * Sınıf roster'ı. `/students/:id` aksine `student:read` değil,
 * `student:group_students:read` ister; öğretmen yalnız kendi grubunun
 * öğrenci listesini görebilir.
 */
@UseGuards(AuthGuard('jwt'), TenantScopeGuard)
@Controller('student-groups')
export class StudentGroupController {
  constructor(private readonly students: StudentService) {}

  @Get(':groupId/students')
  @Permissions('student:group_students:read')
  roster(
    @Req() request: RequestWithContext,
    @Param('groupId', new ParseUUIDPipe({ version: '4' })) groupId: string,
    @Query() query: ListRosterQueryDto,
  ) {
    return this.students.roster(requestContext(request), groupId, query);
  }
}
