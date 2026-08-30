import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { RequestContext, RequestUser } from '../common/context/request-context';

/**
 * Teacher-own-lesson guard (OKUL-06, M5).
 *
 * Bir öğretmen yalnızca kendi teacherId'sine ait AttendanceSession üzerinde
 * işlem yapabilir. Müdür (role manager) tüm branch'i görür.
 * BOLA negative: başka öğretmenin session'ı -> 403.
 */
@Injectable()
export class TeacherOwnLessonGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user as RequestUser | undefined;
    if (!user) {
      throw new ForbiddenException('Kimlik doğrulaması gerekli');
    }
    const session = (request as Record<string, unknown>)
      .attendanceSession as
      | { teacherId?: string; tenantId?: string }
      | undefined;
    if (!session) {
      return true;
    }
    const isManager = Array.isArray(user.roleIds)
      ? user.roleIds.includes('manager')
      : false;
    if (isManager) {
      return true;
    }
    if (user.userId !== session.teacherId) {
      throw new ForbiddenException('Bu dersin yoklamasına erişim izniniz yok');
    }
    return true;
  }
}

