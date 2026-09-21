import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequestWithContext } from '../common/context/request-context';
import { Permissions } from '../common/decorators/permissions.decorator';
import { TenantScopeGuard } from '../common/tenant/tenant-scope.guard';
import { AttendanceActor, hasAttendanceOversight } from './attendance-access';
import {
  AttendanceSessionService,
  CreateSessionInput,
  MarkSessionRecordInput,
} from './attendance-session.service';
import { AttendanceStatus } from './attendance.entity';
import { TeacherOwnLessonGuard } from './teacher-own-lesson.guard';

/**
 * Aktör bağlamı sunucu tarafında çözülür; istemciden gelen user/tenant/role
 * değerleri yetki kaynağı değildir.
 */
function getActor(request: RequestWithContext): AttendanceActor {
  const user = request.user;
  if (!user?.userId) throw new UnauthorizedException('Authentication required');
  if (!user.tenantId) throw new ForbiddenException('Tenant context required');
  return {
    userId: user.userId,
    tenantId: user.tenantId,
    roleIds: user.roleIds ?? [],
  };
}

// Kimlik doğrulama (JWT) + kiracı sınırı; yetki her route'ta @Permissions ile
// zorunlu kılınır. @Permissions metadata'sı olmadan global
// PermissionAuthenticationGuard ve PermissionGuard handler'ı atlar (fail-open);
// bu yüzden bu controller'daki her route bir izin anahtarı taşımak zorundadır.
@UseGuards(AuthGuard('jwt'), TenantScopeGuard)
@Controller('attendance/sessions')
export class AttendanceSessionController {
  constructor(private readonly sessionService: AttendanceSessionService) {}

  @Post()
  @Permissions('attendance:generate')
  async create(
    @Req() req: RequestWithContext,
    @Body() body: CreateSessionInput,
  ) {
    const actor = getActor(req);
    return this.sessionService.createFromPublishedOccurrence({
      ...body,
      actorId: actor.userId,
    });
  }

  @Post(':id/lock')
  @Permissions('attendance:lock')
  async lock(
    @Req() req: RequestWithContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { expectedVersion: number },
  ) {
    const actor = getActor(req);
    return this.sessionService.lock(actor, id, body.expectedVersion);
  }

  @Post(':id/records')
  @Permissions('attendance:record:update')
  @UseGuards(TeacherOwnLessonGuard)
  async markRecord(
    @Req() req: RequestWithContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      studentId: string;
      status: AttendanceStatus;
      notes?: string;
    },
  ) {
    const actor = getActor(req);
    const input: MarkSessionRecordInput = {
      sessionId: id,
      studentId: body.studentId,
      status: body.status,
      notes: body.notes ?? null,
    };
    return this.sessionService.markRecord(actor, input);
  }

  @Get(':id/records')
  @Permissions('attendance:own:read')
  @UseGuards(TeacherOwnLessonGuard)
  async getRecords(
    @Req() req: RequestWithContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const actor = getActor(req);
    const session = await this.sessionService.getById(actor.tenantId, id);
    if (!session) throw new ForbiddenException('Session bulunamadı');
    return session;
  }

  @Get()
  @Permissions('attendance:own:read')
  async list(@Req() req: RequestWithContext) {
    const actor = getActor(req);
    if (hasAttendanceOversight(actor)) {
      return this.sessionService.listByTenant(actor.tenantId);
    }
    return this.sessionService.listByTeacher(actor.tenantId, actor.userId);
  }
}
