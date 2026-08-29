import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { RequestContext } from '../common/context/request-context';
import {
  AttendanceSessionService,
  CreateSessionInput,
  MarkSessionRecordInput,
} from './attendance-session.service';
import { AttendanceStatus } from './attendance.entity';
import { TeacherOwnLessonGuard } from './teacher-own-lesson.guard';
import { UseGuards } from '@nestjs/common';
import { AttendanceSession } from './attendance-session.entity';

interface AuthedRequest extends Request {
  user?: RequestContext & { userId?: string; roleIds?: string[] };
  attendanceSession?: AttendanceSession;
}

@Controller('attendance/sessions')
export class AttendanceSessionController {
  constructor(private readonly sessionService: AttendanceSessionService) {}

  @Post()
  async create(@Req() req: AuthedRequest, @Body() body: CreateSessionInput) {
    const user = req.user;
    if (!user) throw new ForbiddenException('Kimlik gerekli');
    return this.sessionService.createFromPublishedOccurrence({
      ...body,
      actorId: user.userId ?? null,
    });
  }

  @Post(':id/lock')
  async lock(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: { expectedVersion: number },
  ) {
    const user = req.user;
    if (!user) throw new ForbiddenException('Kimlik gerekli');
    return this.sessionService.lock(
      user.tenantId ?? '',
      id,
      user.userId ?? '',
      body.expectedVersion,
    );
  }

  @Post(':id/records')
  @UseGuards(TeacherOwnLessonGuard)
  async markRecord(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body()
    body: {
      studentId: string;
      status: AttendanceStatus;
      markedById?: string;
      notes?: string;
    },
  ) {
    const user = req.user;
    if (!user) throw new ForbiddenException('Kimlik gerekli');
    const input: MarkSessionRecordInput = {
      tenantId: user.tenantId ?? '',
      sessionId: id,
      studentId: body.studentId,
      status: body.status,
      markedById: body.markedById ?? user.userId ?? null,
      notes: body.notes ?? null,
    };
    return this.sessionService.markRecord(input);
  }

  @Get(':id/records')
  @UseGuards(TeacherOwnLessonGuard)
  async getRecords(@Req() req: AuthedRequest, @Param('id') id: string) {
    const user = req.user;
    if (!user) throw new ForbiddenException('Kimlik gerekli');
    const session = await this.sessionService.getById(user.tenantId ?? '', id);
    if (!session) throw new ForbiddenException('Session bulunamadı');
    return session;
  }

  @Get()
  async list(@Req() req: AuthedRequest) {
    const user = req.user;
    if (!user) throw new ForbiddenException('Kimlik gerekli');
    const isManager = Array.isArray(user.roleIds)
      ? user.roleIds.includes('manager')
      : false;
    if (isManager) {
      return this.sessionService.listByTeacher(user.tenantId ?? '', '*');
    }
    return this.sessionService.listByTeacher(
      user.tenantId ?? '',
      user.userId ?? '',
    );
  }
}
