import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { RequestWithContext } from '../common/context/request-context';
import { AttendanceSession } from './attendance-session.entity';
import { AttendanceSessionService } from './attendance-session.service';
import {
  assertAttendanceSessionAccess,
  hasAttendanceOversight,
} from './attendance-access';

export type AttendanceRequest = RequestWithContext & {
  attendanceSession?: AttendanceSession;
};

/**
 * Teacher-own-lesson guard (OKUL-06 / #265 AC-3).
 *
 * Önceki sürüm `request.attendanceSession` alanının başka bir katman
 * (interceptor) tarafından doldurulmasını bekliyordu. NestJS yürütme sırası
 * guard → interceptor olduğu için bu alan hiçbir zaman doldurulamıyordu ve
 * guard `if (!session) return true` ile **her isteği geçiriyordu (fail-open)**.
 *
 * Bu sürüm:
 *  - kimlik yoksa reddeder (fail-closed),
 *  - gözetim rollerini (operations_manager / tenant_admin) geçirir,
 *  - oturumu **kendi yükler** (kiracı filtresi ile),
 *  - sahiplik tutmuyorsa 403 döner,
 *  - bulunamayan/başka kiracıdaki oturumda varlık sızdırmadan 403 döner.
 */
@Injectable()
export class TeacherOwnLessonGuard implements CanActivate {
  constructor(private readonly sessions: AttendanceSessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AttendanceRequest>();
    const user = request.user;
    if (!user?.userId || !user.tenantId) {
      throw new ForbiddenException('Kimlik doğrulaması gerekli');
    }
    if (hasAttendanceOversight(user)) {
      return true;
    }

    const rawSessionId = request.params?.id;
    const sessionId = typeof rawSessionId === 'string' ? rawSessionId : undefined;
    if (!sessionId) {
      throw new ForbiddenException('Yoklama oturumu kimliği gerekli');
    }

    // Kiracı filtresi: başka kiracının oturumu asla yüklenmez.
    const session = await this.sessions.getById(user.tenantId, sessionId);
    if (!session) {
      throw new ForbiddenException('Bu dersin yoklamasına erişim izniniz yok');
    }
    assertAttendanceSessionAccess(
      { userId: user.userId, tenantId: user.tenantId, roleIds: user.roleIds ?? [] },
      session,
    );
    request.attendanceSession = session;
    return true;
  }
}


