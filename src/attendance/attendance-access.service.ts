import { ForbiddenException, Injectable } from '@nestjs/common';

import { RequestContext, RequestUser } from '../common/context/request-context';
import { TeacherRepository } from '../teachers/teacher.repository';
import { AttendanceActor, hasAttendanceOversight } from './attendance-access';

/**
 * Attendance için sunucu tarafı aktör çözümleme (BOLA'nın ön koşulu).
 *
 * `AttendanceSession.teacherId` -> `teachers.id`; JWT'deki kimlik ise `users.id`.
 * Bu iki değer ayrı UUID'ler olduğu için sahiplik karşılaştırması yapılmadan
 * önce `users.id -> teachers.id` eşlemesi çözülmek zorundadır. Aksi hâlde
 * gerçek sahibi öğretmen de reddedilir ve `listByTeacher` sorgusu boş döner.
 */
@Injectable()
export class AttendanceAccessService {
  constructor(private readonly teachers: TeacherRepository) {}

  async resolve(
    user: RequestUser | undefined,
    requestId: string,
  ): Promise<AttendanceActor> {
    if (!user?.userId) {
      throw new ForbiddenException('Kimlik doğrulaması gerekli');
    }
    if (!user.tenantId) {
      throw new ForbiddenException('Tenant context required');
    }

    const actor: AttendanceActor = {
      userId: user.userId,
      tenantId: user.tenantId,
      roleIds: user.roleIds ?? [],
      teacherId: null,
    };

    // Gözetim rolleri kiracı genelinde çalışır; öğretmen eşlemesine ihtiyaç yok.
    if (hasAttendanceOversight(actor)) {
      return actor;
    }

    const ctx: RequestContext = {
      requestId,
      tenantId: user.tenantId,
      user,
    };
    const teacher = await this.teachers.findActiveTeacherForUser(ctx);
    return { ...actor, teacherId: teacher?.teacherId ?? null };
  }
}
