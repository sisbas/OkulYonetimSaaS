import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { RequestWithContext } from '../common/context/request-context';
import { AttendanceSession } from './attendance-session.entity';
import { AttendanceSessionService } from './attendance-session.service';
import { AttendanceAccessService } from './attendance-access.service';
import {
  assertAttendanceSessionAccess,
  hasAttendanceOversight,
  isUuid,
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
 *  - `:id` parametresini guard içinde UUID olarak doğrular (guard'lar controller
 *    pipe'larından önce çalıştığı için malformed değer aksi hâlde 500 üretir),
 *  - gözetim rollerini (operations_manager / tenant_admin) geçirir,
 *  - aktörün `teachers.id` eşlemesini çözer ve oturumu **kendi yükler**
 *    (kiracı filtresi ile),
 *  - sahiplik tutmuyorsa veya oturumda bulunmuyorsa varlık sızdırmadan 403 döner.
 */
@Injectable()
export class TeacherOwnLessonGuard implements CanActivate {
  constructor(
    private readonly sessions: AttendanceSessionService,
    private readonly access: AttendanceAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AttendanceRequest>();
    const user = request.user;
    if (!user?.userId || !user.tenantId) {
      throw new ForbiddenException('Kimlik doğrulaması gerekli');
    }

    const rawSessionId = request.params?.id;
    const sessionId = typeof rawSessionId === 'string' ? rawSessionId : undefined;
    if (!sessionId) {
      throw new ForbiddenException('Yoklama oturumu kimliği gerekli');
    }
    // Guard pipe'lardan önce çalışır: malformed uuid sorguya gitmeden 400 döner.
    if (!isUuid(sessionId)) {
      throw new BadRequestException('Yoklama oturumu kimliği geçersiz');
    }

    // Gözetim rolleri kiracı genelinde çalışır; ek sorgu gerekmez.
    if (hasAttendanceOversight(user)) {
      return true;
    }

    const actor = await this.access.resolve(
      user,
      request.context?.requestId ?? 'unknown',
    );

    // Kiracı filtresi: başka kiracının oturumu asla yüklenmez.
    const session = await this.sessions.getById(actor.tenantId, sessionId);
    if (!session) {
      throw new ForbiddenException('Bu dersin yoklamasına erişim izniniz yok');
    }
    assertAttendanceSessionAccess(actor, session);
    request.attendanceSession = session;
    return true;
  }
}



