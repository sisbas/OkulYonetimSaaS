export type AccessDeniedReason =
  | 'no_permission'
  | 'missing_role'
  | 'tenant_denied'
  | 'consent_required'
  | 'audit_required';

export type AccessDeniedState = {
  reason: AccessDeniedReason;
  statusCode: 403;
  title: string;
  description: string;
  primaryActionLabel: string;
  showsSensitiveData: false;
};

export const ACCESS_DENIED_STATES: Record<AccessDeniedReason, AccessDeniedState> = {
  no_permission: {
    reason: 'no_permission',
    statusCode: 403,
    title: 'Yetkiniz yok',
    description: 'Bu ekranı görüntülemek için gerekli yetki bulunmuyor.',
    primaryActionLabel: 'Günlük operasyona dön',
    showsSensitiveData: false,
  },
  missing_role: {
    reason: 'missing_role',
    statusCode: 403,
    title: 'Rol ataması eksik',
    description: 'Hesaba atanmış geçerli bir rol bulunamadı.',
    primaryActionLabel: 'Yöneticiye başvur',
    showsSensitiveData: false,
  },
  tenant_denied: {
    reason: 'tenant_denied',
    statusCode: 403,
    title: 'Kurum erişimi reddedildi',
    description: 'Bu kurum kapsamındaki verilere erişim izni bulunmuyor.',
    primaryActionLabel: 'Kurum seçimine dön',
    showsSensitiveData: false,
  },
  consent_required: {
    reason: 'consent_required',
    statusCode: 403,
    title: 'Onay gerekli',
    description: 'Bu ekran için gerekli onay durumu tamamlanmadan veri gösterilemez.',
    primaryActionLabel: 'Günlük operasyona dön',
    showsSensitiveData: false,
  },
  audit_required: {
    reason: 'audit_required',
    statusCode: 403,
    title: 'Denetim kaydı gerekli',
    description: 'Bu işlem denetim kaydı şartı doğrulanmadan açılamaz.',
    primaryActionLabel: 'Günlük operasyona dön',
    showsSensitiveData: false,
  },
};

export function getAccessDeniedState(reason: AccessDeniedReason): AccessDeniedState {
  return ACCESS_DENIED_STATES[reason];
}
