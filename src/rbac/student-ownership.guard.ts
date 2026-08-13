import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { RequestUser, RequestWithContext } from '../common/context/request-context';

/**
 * Veli (parent) -> öğrenci sahiplik (ownership) guard'ı.
 *
 * Veli rolündeki bir aktör, yalnızca kendisine bağlı (linked) öğrencinin
 * kaydına erişebilir. Başka bir öğrencinin kaydına erişim denemesi
 * (cross-student leak) 403 ile engellenir. Bu kontrol tenant izolasyonundan
 * BAĞIMSIZDIR; aynı tenant içinde dahi başka öğrenci kaydı korunur.
 *
 * KVKK: guard yalnızca kimlik (ID) düzeyinde çalışır; hiçbir PII taşımaz.
 * linkedStudentIds güvenilir kaynaktan (JWT claim / req.user) gelmelidir.
 */
type RequestUserWithLinks = RequestUser & { linkedStudentIds?: readonly string[] | null };

/** Hangi izinlerin sahiplik kapsamında olduğu (rbac service ile aynı sözleşme). */
const OWNERSHIP_PERMISSIONS = [
  'student:parent_contact:read',
  'student:attendance:read',
  'student:enrollment:read',
];

@Injectable()
export class StudentOwnershipGuard implements CanActivate {
  /**
   * Route parametresinden öğrenci ID'sini okur (varsayılan ':studentId').
   * İsteğe bağlı `paramKey` ile farklı parametre adı verilebilir.
   */
  constructor(private readonly paramKey: string = 'studentId') {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithContext>();
    const user = request.user as RequestUserWithLinks | undefined;
    if (!user) {
      throw new ForbiddenException('Kimlik doğrulaması gerekli');
    }

    // Sahiplik kapsamındaki rollerden birine sahip mi?
    const isParent = Array.isArray(user.roleIds) && user.roleIds.includes('parent');
    if (!isParent) {
      // Veli değilse bu guard geçer (rol bazlı yetki başka guard/service'te).
      return true;
    }

    const rawParam = request.params?.[this.paramKey];
    const targetStudentId: string | undefined =
      typeof rawParam === 'string' ? rawParam : Array.isArray(rawParam) ? rawParam[0] : undefined;
    if (!targetStudentId) {
      // Hedef öğrenci belirtilmemişse sahiplik doğrulanamaz -> 403.
      throw new ForbiddenException('Öğrenci kaydı belirtilmedi');
    }

    const linkedStudentIds = Array.isArray(user.linkedStudentIds)
      ? user.linkedStudentIds!
      : [];

    if (linkedStudentIds.length === 0 || !linkedStudentIds.includes(targetStudentId)) {
      // Cross-student leak: veli yalnızca kendi çocuğunun kaydına erişebilir.
      throw new ForbiddenException('Bu öğrenci kaydına erişim izniniz yok');
    }

    return true;
  }
}

/** Belirli bir iznin sahiplik kapsamında olup olmadığı (yardımcı). */
export function isOwnershipScopedPermission(permission: string): boolean {
  return OWNERSHIP_PERMISSIONS.includes(permission);
}
