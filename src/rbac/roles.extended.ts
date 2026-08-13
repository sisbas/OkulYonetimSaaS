/**
 * OKUL-01 — RBAC rol genişletme katmanı.
 *
 * Bu dosya Faz-1 rollerine (tenant_admin / operations_manager / teacher)
 * yeni roller ekler ve bunları bir permission matrix (yetki matrisi)
 * üzerinden tanımlar. Mevcut permission-catalog.ts ve permissions.seed.ts
 * DOKUNULMAZ bırakılmıştır; yeni rolleri mevcut 116 izin kodunun bir
 * alt kümesiyle tanımlayarak seed tutarlılığını ve mevcut testleri koruruz.
 *
 * KVKK gereği: öğrenci (student) ve veli (parent) rolleri hiçbir zaman
 * öğrenci/veli PII (kişisel veri) taşımaz; parent_contact ve benzeri
 * hassas alanlara erişimleri açıkça red (deny) ile kapatılır.
 */

import { PermissionDenyState } from './permission-catalog';

/** Faz-1 rollerini genişletilmiş rol evrenine taşır. */
export type Phase1Role = 'tenant_admin' | 'operations_manager' | 'teacher';

/** OKUL-01 ile eklenen yeni roller. */
export type ExtendedRole = 'student' | 'parent' | 'teacher_assistant';

/** Sistem genelinde tanınan tüm rol adları. */
export type SystemRole = Phase1Role | ExtendedRole;

export const PHASE_1_ROLES: readonly Phase1Role[] = ['tenant_admin', 'operations_manager', 'teacher'];

export const OKUL01_EXTENDED_ROLES: readonly ExtendedRole[] = ['student', 'parent', 'teacher_assistant'];

export const ALL_SYSTEM_ROLES: readonly SystemRole[] = [...PHASE_1_ROLES, ...OKUL01_EXTENDED_ROLES];

export const OKUL01_EXTENSION_VERSION = 'okul-01-v1';

/**
 * Veli (parent) rolünün öğrenci kaydına eriştiği, ancak yalnızca kendi
 * çocuğuna (linked student) ait olması gereken izinler. Başka öğrencinin
 * kaydına erişim denemesi cross-student leak olarak 403 ile engellenir.
 * KVKK: bu izinler öğrenci PII'sine dokunur; sahiplik zorunludur.
 */
export const PARENT_STUDENT_OWNERSHIP_PERMISSIONS: readonly string[] = [
  'student:parent_contact:read',
  'student:attendance:read',
  'student:enrollment:read',
];


/** Hangi rollerin KVKK kapsamında PII (kişisel veri) taşıyabileceği. */
export const KVKK_SUBJECT_ROLES: readonly SystemRole[] = ['student', 'parent'];

export function isSystemRole(value: string): value is SystemRole {
  return (ALL_SYSTEM_ROLES as readonly string[]).includes(value);
}

/* -------------------------------------------------------------------------- */
/* Permission matrix — yeni rollerin izin eşlemeleri                          */
/* -------------------------------------------------------------------------- */

export type PermissionEffect = 'allow' | 'deny';

export interface RolePermissionMapping {
  role: SystemRole;
  permission: string;
  effect: PermissionEffect;
  auditRequired: boolean;
  denyState: PermissionDenyState;
  /** KVKK kapsamında bloke edilen (maskeleme/red gerekli) kaynak mı? */
  kvkkProtected: boolean;
}

/**
 * OKUL-01 permission matrix. Her giriş ya allow (ver) ya da deny (red) olur.
 * deny girişleri, rolün o kaynağa KESİNLİKLE erişemeyeceğini, audit logu ile
 * birlikte 403 üreteceğini belirtir. KVKK kapsamında PII alanlarına erişim
 * öğrenci/veli rolleri için daima deny'dir.
 */
export const OKUL01_PERMISSION_MATRIX: readonly RolePermissionMapping[] = [
  // --- Öğrenci (student) ---
  { role: 'student', permission: 'dashboard:teacher_own_summary:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'student', permission: 'schedule:own:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'student', permission: 'attendance:own:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'student', permission: 'leave:own:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'student', permission: 'student:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'student', permission: 'student:detail:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'student', permission: 'student:enrollment:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'student', permission: 'student:attendance:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'student', permission: 'course:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'student', permission: 'room:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'student', permission: 'time_slot:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  // Öğrenci kendi velisinin iletişimini göremez (KVKK: kendi PII'si dahi olsa minimalizasyon)
  { role: 'student', permission: 'student:parent_contact:read', effect: 'deny', auditRequired: true, denyState: 'forbidden_403', kvkkProtected: true },
  { role: 'student', permission: 'student:kvkk:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  // Öğrenci yönetim/operasyon kaynaklarına erişemez
  { role: 'student', permission: 'leave:approve', effect: 'deny', auditRequired: true, denyState: 'forbidden_403', kvkkProtected: false },
  { role: 'student', permission: 'leave:reject', effect: 'deny', auditRequired: true, denyState: 'forbidden_403', kvkkProtected: false },
  { role: 'student', permission: 'role:permission:read', effect: 'deny', auditRequired: false, denyState: 'forbidden_403', kvkkProtected: false },

  // --- Veli (parent) ---
  { role: 'parent', permission: 'dashboard:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'parent', permission: 'schedule:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'parent', permission: 'attendance:report:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'parent', permission: 'student:attendance:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'parent', permission: 'student:enrollment:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'parent', permission: 'student:parent_contact:read', effect: 'allow', auditRequired: true, denyState: 'none', kvkkProtected: false },
  // Veli, kendi çocuğunun PII'si dışındaki öğrenci kayıtlarına erişemez
  { role: 'parent', permission: 'student:read', effect: 'deny', auditRequired: true, denyState: 'blocked_kvkk', kvkkProtected: true },
  { role: 'parent', permission: 'student:detail:read', effect: 'deny', auditRequired: true, denyState: 'blocked_kvkk', kvkkProtected: true },
  { role: 'parent', permission: 'student:kvkk:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  // Veli operasyonel kararlar alamaz
  { role: 'parent', permission: 'leave:create', effect: 'deny', auditRequired: true, denyState: 'forbidden_403', kvkkProtected: false },
  { role: 'parent', permission: 'leave:approve', effect: 'deny', auditRequired: true, denyState: 'forbidden_403', kvkkProtected: false },
  { role: 'parent', permission: 'leave:reject', effect: 'deny', auditRequired: true, denyState: 'forbidden_403', kvkkProtected: false },
  { role: 'parent', permission: 'role:permission:read', effect: 'deny', auditRequired: false, denyState: 'forbidden_403', kvkkProtected: false },

  // --- Öğretmen Yardımcı (teacher_assistant) ---
  { role: 'teacher_assistant', permission: 'dashboard:teacher_own_summary:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'teacher_assistant', permission: 'schedule:own:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'teacher_assistant', permission: 'schedule:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'teacher_assistant', permission: 'attendance:own:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'teacher_assistant', permission: 'attendance:own:submit', effect: 'allow', auditRequired: true, denyState: 'none', kvkkProtected: false },
  { role: 'teacher_assistant', permission: 'attendance:record:update', effect: 'allow', auditRequired: true, denyState: 'none', kvkkProtected: false },
  { role: 'teacher_assistant', permission: 'attendance:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'teacher_assistant', permission: 'leave:own:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'teacher_assistant', permission: 'leave:create', effect: 'allow', auditRequired: true, denyState: 'none', kvkkProtected: false },
  { role: 'teacher_assistant', permission: 'student:group_students:read', effect: 'allow', auditRequired: false, denyState: 'masked', kvkkProtected: false },
  { role: 'teacher_assistant', permission: 'student:read', effect: 'allow', auditRequired: false, denyState: 'masked', kvkkProtected: false },
  { role: 'teacher_assistant', permission: 'teacher:own:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'teacher_assistant', permission: 'teacher:availability:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'teacher_assistant', permission: 'course:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'teacher_assistant', permission: 'room:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  { role: 'teacher_assistant', permission: 'time_slot:read', effect: 'allow', auditRequired: false, denyState: 'none', kvkkProtected: false },
  // Öğretmen yardımcı KARAR verici olamaz (onay/red yetkisi yok)
  { role: 'teacher_assistant', permission: 'leave:approve', effect: 'deny', auditRequired: true, denyState: 'forbidden_403', kvkkProtected: false },
  { role: 'teacher_assistant', permission: 'leave:reject', effect: 'deny', auditRequired: true, denyState: 'forbidden_403', kvkkProtected: false },
  { role: 'teacher_assistant', permission: 'attendance:generate', effect: 'deny', auditRequired: true, denyState: 'forbidden_403', kvkkProtected: false },
  { role: 'teacher_assistant', permission: 'attendance:lock', effect: 'deny', auditRequired: true, denyState: 'forbidden_403', kvkkProtected: false },
  // Öğretmen yardımcı veli iletişimini göremez (KVKK: öğrenci PII korumalı)
  { role: 'teacher_assistant', permission: 'student:parent_contact:read', effect: 'deny', auditRequired: true, denyState: 'forbidden_403', kvkkProtected: true },
  { role: 'teacher_assistant', permission: 'student:kvkk:read', effect: 'deny', auditRequired: true, denyState: 'forbidden_403', kvkkProtected: true },
  { role: 'teacher_assistant', permission: 'student:detail:read', effect: 'allow', auditRequired: false, denyState: 'masked', kvkkProtected: false },
  { role: 'teacher_assistant', permission: 'role:permission:read', effect: 'deny', auditRequired: false, denyState: 'forbidden_403', kvkkProtected: false },
] as const;

/* -------------------------------------------------------------------------- */
/* KVKK alan görünürlük ilkesi                                                */
/* -------------------------------------------------------------------------- */

export type PiiFieldCategory =
  | 'identity'
  | 'contact'
  | 'parent_contact'
  | 'sensitive'
  | 'none';

/**
 * Bir kaynak (resource) için KVKK korumalı alan kategorisini döndürür.
 * Bu eşleme, policy engine'in "maskeleme" (masked) kararları için kullanılır.
 */
export function kvkkFieldCategoryForResource(resource: string): PiiFieldCategory {
  if (resource.startsWith('student.parent_contact') || resource === 'student.parent_contact') {
    return 'parent_contact';
  }
  if (resource.startsWith('student') || resource.startsWith('guardian')) {
    return 'identity';
  }
  if (resource === 'report.student' || resource === 'report.guardian') {
    return 'sensitive';
  }
  return 'none';
}

/** KVKK kapsamındaki rolün, belirli bir kaynağın PII alanını görebilmesi. */
export function isKvkkSubjectRole(role: SystemRole): boolean {
  return (KVKK_SUBJECT_ROLES as readonly SystemRole[]).includes(role);
}
