import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RequestWithContext } from '../common/context/request-context';
import { Permissions } from '../common/decorators/permissions.decorator';
import { TenantScopeGuard } from '../common/tenant/tenant-scope.guard';
import { AttendanceActor, hasAttendanceOversight } from './attendance-access';
import { AttendanceAccessService } from './attendance-access.service';
import {
  AttendanceSessionService,
  CreateSessionInput,
  MarkSessionRecordInput,
} from './attendance-session.service';
import { AttendanceStatus } from './attendance.entity';
import { AttendanceRequest, TeacherOwnLessonGuard } from './teacher-own-lesson.guard';

// Kimlik doğrulama (JWT) + kiracı sınırı; yetki her route'ta @Permissions ile
// zorunlu kılınır. @Permissions metadata'sı olmadan global
// PermissionAuthenticationGuard ve PermissionGuard handler'ı atlar (fail-open);
// bu yüzden bu controller'daki her route bir izin anahtarı taşımak zorundadır.
@UseGuards(AuthGuard('jwt'), TenantScopeGuard)
@Controller('attendance/sessions')
export class AttendanceSessionController {
  constructor(
    private readonly sessionService: AttendanceSessionService,
    private readonly access: AttendanceAccessService,
  ) {}

  /**
   * Aktör bağlamı sunucu tarafında çözülür. JWT'deki kimlik `users.id`
   * olduğu için `AttendanceSession.teacherId` (`teachers.id`) ile
   * karşılaştırma/sorgulama ÖNCE `AttendanceAccessService` üzerinden
   * `teachers.id`'ye çözümlenir; aksi hâlde gerçek sahibi öğretmen reddedilir
   * ve `listByTeacher` sorgusu boş döner.
   */
  private async resolveActor(req: RequestWithContext): Promise<AttendanceActor> {
    return this.access.resolve(req.user, req.context?.requestId ?? 'unknown');
  }

  @Post()
  @Permissions('attendance:generate')
  async create(
    @Req() req: RequestWithContext,
    @Body() body: CreateSessionInput,
  ) {
    const actor = await this.resolveActor(req);
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
    const actor = await this.resolveActor(req);
    return this.sessionService.lock(actor, id, body.expectedVersion);
  }

  @Post(':id/records')
  @Permissions('attendance:record:update')
  @UseGuards(TeacherOwnLessonGuard)
  // Not: notes alanı yazma yolunda KVKK maskesinden geçer
  // (AttendanceSessionService.markRecord -> redactAttendanceNotes).
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
    const actor = await this.resolveActor(req);
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
    @Req() req: AttendanceRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const actor = await this.resolveActor(req);
    // Guard, sahibi öğretmen için oturumu zaten yükledi; gözetim rollerinde
    // tekrar yüklenir (kiracı filtresi ile).
    const session =
      req.attendanceSession ??
      (await this.sessionService.getById(actor.tenantId, id));
    if (!session) throw new ForbiddenException('Session bulunamadı');
    return session;
  }

  @Get()
  @Permissions('attendance:own:read')
  async list(@Req() req: RequestWithContext) {
    const actor = await this.resolveActor(req);
    if (hasAttendanceOversight(actor)) {
      return this.sessionService.listByTenant(actor.tenantId);
    }
    // Öğretmen listesi teachers.id ile sorgulanır (users.id DEĞİL); öğretmen
    // kimliği çözümlenemeyen kullanıcı için bilgi sızdırmayan boş liste.
    if (!actor.teacherId) {
      return [];
    }
    return this.sessionService.listByTeacher(actor.tenantId, actor.teacherId);
  }
}
