import type { AccessDeniedReason } from '../core-definitions/access-state';
import type { FrontendRole } from '../core-definitions/core-definitions.routes';
import type { OperationsModule, OperationsRouteScope, ScheduleContractSurface } from './operations.routes';

export type OperationsUiState = 'loading' | 'empty' | 'error' | 'forbidden' | 'contract_pending';

export type ScheduleContractUiState =
  | 'draft_list_ready'
  | 'weekly_grid_ready'
  | 'validation_not_validated'
  | 'validation_valid'
  | 'validation_invalid'
  | 'validation_stale'
  | 'version_mismatch'
  | 'version_required'
  | 'publish_confirmation'
  | 'publish_blocked_empty'
  | 'publish_blocked_validation_stale'
  | 'publish_blocked_hard_conflicts'
  | 'publish_blocked_period_conflict'
  | 'published_read_only';

export type SchedulePublishBlockReasonCode =
  | 'SCHEDULE_EMPTY'
  | 'SCHEDULE_VALIDATION_STALE'
  | 'SCHEDULE_HARD_CONFLICTS_PRESENT'
  | 'PUBLISHED_SCHEDULE_PERIOD_CONFLICT'
  | 'SCHEDULE_VERSION_MISMATCH';

export type ScheduleRoleProjection =
  | 'management_draft'
  | 'management_published_branch'
  | 'teacher_own_published_events'
  | 'viewer_published_read_only'
  | 'hidden';

export type OperationsStateDescriptor = {
  state: OperationsUiState;
  module: OperationsModule | 'shared';
  title: string;
  description: string;
  showsSensitiveData: false;
  allowsMutation: false;
  apiBinding: 'not_connected';
};

export const OPERATIONS_STATE_DESCRIPTORS: readonly OperationsStateDescriptor[] = [
  {
    state: 'loading',
    module: 'shared',
    title: 'İçerik hazırlanıyor',
    description: 'Gerçek veri çağrısı yapılmadan yalnız yerleşim skeleton’u gösterilir.',
    showsSensitiveData: false,
    allowsMutation: false,
    apiBinding: 'not_connected',
  },
  {
    state: 'empty',
    module: 'shared',
    title: 'Gösterilecek kayıt yok',
    description: 'Öğrenci, veli veya yoklama kaydı göstermeyen güvenli boş durum.',
    showsSensitiveData: false,
    allowsMutation: false,
    apiBinding: 'not_connected',
  },
  {
    state: 'error',
    module: 'shared',
    title: 'İçerik görüntülenemedi',
    description: 'Teknik ayrıntı, endpoint, token veya kullanıcı verisi gösterilmez.',
    showsSensitiveData: false,
    allowsMutation: false,
    apiBinding: 'not_connected',
  },
  {
    state: 'forbidden',
    module: 'shared',
    title: 'Erişim sınırı',
    description: '403 nedeni descriptor seviyesinde gösterilir; runtime guard değişmez.',
    showsSensitiveData: false,
    allowsMutation: false,
    apiBinding: 'not_connected',
  },
  {
    state: 'contract_pending',
    module: 'shared',
    title: 'API sözleşmesi bekleniyor',
    description: 'Onaylı runtime API contract ve Permission Catalog binding olmadan veri bağlantısı açılmaz.',
    showsSensitiveData: false,
    allowsMutation: false,
    apiBinding: 'not_connected',
  },
] as const;

export type ScheduleStateDescriptor = {
  state: ScheduleContractUiState;
  surface: ScheduleContractSurface;
  scheduleStatus: 'draft' | 'published' | 'unpublished' | null;
  validationStatus: 'not_validated' | 'valid' | 'invalid' | 'stale' | null;
  title: string;
  description: string;
  expectedHttpStatus: 200 | 403 | 409 | 412 | 422 | 428 | null;
  expectedErrorCode:
    | 'PERMISSION_DENIED'
    | 'OWN_SCOPE_VIOLATION'
    | 'INVALID_SCHEDULE_STATE'
    | 'SCHEDULE_VERSION_MISMATCH'
    | 'SCHEDULE_HARD_CONFLICTS_PRESENT'
    | 'SCHEDULE_VALIDATION_STALE'
    | 'SCHEDULE_EMPTY'
    | 'PUBLISHED_SCHEDULE_PERIOD_CONFLICT'
    | 'SCHEDULE_VERSION_REQUIRED'
    | null;
  roleVisibility: Readonly<Record<FrontendRole, OperationsRouteScope>>;
  roleProjection: Readonly<Record<FrontendRole, ScheduleRoleProjection>>;
  allowsMutation: false;
  apiBinding: 'not_connected';
  permissionBinding: 'pending_catalog';
  runtimeGuardChanged: false;
};

const MANAGEMENT_AND_READ_VISIBILITY: Readonly<Record<FrontendRole, OperationsRouteScope>> = {
  tenant_admin: 'management_placeholder',
  operations_manager: 'management_placeholder',
  teacher: 'own_read_only_placeholder',
  viewer: 'read_only_placeholder',
};

const MANAGEMENT_ONLY_VISIBILITY: Readonly<Record<FrontendRole, OperationsRouteScope>> = {
  tenant_admin: 'management_placeholder',
  operations_manager: 'management_placeholder',
  teacher: 'hidden',
  viewer: 'hidden',
};

const MANAGEMENT_DRAFT_PROJECTION: Readonly<Record<FrontendRole, ScheduleRoleProjection>> = {
  tenant_admin: 'management_draft',
  operations_manager: 'management_draft',
  teacher: 'hidden',
  viewer: 'hidden',
};

const PUBLISHED_READ_PROJECTION: Readonly<Record<FrontendRole, ScheduleRoleProjection>> = {
  tenant_admin: 'management_published_branch',
  operations_manager: 'management_published_branch',
  teacher: 'teacher_own_published_events',
  viewer: 'viewer_published_read_only',
};

export const SCHEDULE_REASON_CODE_TO_UI_STATE: Readonly<
  Record<SchedulePublishBlockReasonCode, ScheduleContractUiState>
> = {
  SCHEDULE_EMPTY: 'publish_blocked_empty',
  SCHEDULE_VALIDATION_STALE: 'publish_blocked_validation_stale',
  SCHEDULE_HARD_CONFLICTS_PRESENT: 'publish_blocked_hard_conflicts',
  PUBLISHED_SCHEDULE_PERIOD_CONFLICT: 'publish_blocked_period_conflict',
  SCHEDULE_VERSION_MISMATCH: 'version_mismatch',
};

export const SCHEDULE_STATE_MATRIX: readonly ScheduleStateDescriptor[] = [
  {
    state: 'draft_list_ready',
    surface: 'draft_list',
    scheduleStatus: 'draft',
    validationStatus: null,
    title: 'Taslak programlar',
    description: 'Taslak liste metadata alanları için bağlanmamış görünüm; gerçek kayıt veya aksiyon içermez.',
    expectedHttpStatus: 200,
    expectedErrorCode: null,
    roleVisibility: MANAGEMENT_ONLY_VISIBILITY,
    roleProjection: MANAGEMENT_DRAFT_PROJECTION,
    allowsMutation: false,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    runtimeGuardChanged: false,
  },
  {
    state: 'weekly_grid_ready',
    surface: 'weekly_grid',
    scheduleStatus: 'draft',
    validationStatus: null,
    title: 'Taslak haftalık program görünümü',
    description: 'Yönetim rollerine özel draft grid placeholder’ıdır; Teacher ve Viewer için görünmez.',
    expectedHttpStatus: 200,
    expectedErrorCode: null,
    roleVisibility: MANAGEMENT_ONLY_VISIBILITY,
    roleProjection: MANAGEMENT_DRAFT_PROJECTION,
    allowsMutation: false,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    runtimeGuardChanged: false,
  },
  {
    state: 'validation_not_validated',
    surface: 'validation_result',
    scheduleStatus: 'draft',
    validationStatus: 'not_validated',
    title: 'Doğrulama yapılmadı',
    description: 'Publish aksiyonu kapalıdır; yalnız full validation sözleşmesi açıklanır.',
    expectedHttpStatus: 422,
    expectedErrorCode: 'SCHEDULE_VALIDATION_STALE',
    roleVisibility: MANAGEMENT_ONLY_VISIBILITY,
    roleProjection: MANAGEMENT_DRAFT_PROJECTION,
    allowsMutation: false,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    runtimeGuardChanged: false,
  },
  {
    state: 'validation_valid',
    surface: 'validation_result',
    scheduleStatus: 'draft',
    validationStatus: 'valid',
    title: 'Hard conflict bulunmadı',
    description: 'Current version üzerinde full validation ve hardConflictCount=0 koşulu için güvenli sonuç placeholder’ı.',
    expectedHttpStatus: 200,
    expectedErrorCode: null,
    roleVisibility: MANAGEMENT_ONLY_VISIBILITY,
    roleProjection: MANAGEMENT_DRAFT_PROJECTION,
    allowsMutation: false,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    runtimeGuardChanged: false,
  },
  {
    state: 'validation_invalid',
    surface: 'conflict_panel',
    scheduleStatus: 'draft',
    validationStatus: 'invalid',
    title: 'Hard conflict bulundu',
    description: 'Teacher, StudentGroup ve Room overlap türleri role-safe metadata ile gruplanır; raw payload gösterilmez.',
    expectedHttpStatus: 422,
    expectedErrorCode: 'SCHEDULE_HARD_CONFLICTS_PRESENT',
    roleVisibility: MANAGEMENT_ONLY_VISIBILITY,
    roleProjection: MANAGEMENT_DRAFT_PROJECTION,
    allowsMutation: false,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    runtimeGuardChanged: false,
  },
  {
    state: 'validation_stale',
    surface: 'stale_version_warning',
    scheduleStatus: 'draft',
    validationStatus: 'stale',
    title: 'Doğrulama güncel değil',
    description: 'Event değişikliği sonrası önceki validation sonucu publish kanıtı olarak kullanılamaz.',
    expectedHttpStatus: 422,
    expectedErrorCode: 'SCHEDULE_VALIDATION_STALE',
    roleVisibility: MANAGEMENT_ONLY_VISIBILITY,
    roleProjection: MANAGEMENT_DRAFT_PROJECTION,
    allowsMutation: false,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    runtimeGuardChanged: false,
  },
  {
    state: 'version_mismatch',
    surface: 'stale_version_warning',
    scheduleStatus: 'draft',
    validationStatus: null,
    title: 'Program sürümü değişti',
    description: '412 sonucu için yeniden yükleme ve yerel düzenlemeyi kaydetmeme uyarısı descriptor seviyesinde tanımlanır.',
    expectedHttpStatus: 412,
    expectedErrorCode: 'SCHEDULE_VERSION_MISMATCH',
    roleVisibility: MANAGEMENT_ONLY_VISIBILITY,
    roleProjection: MANAGEMENT_DRAFT_PROJECTION,
    allowsMutation: false,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    runtimeGuardChanged: false,
  },
  {
    state: 'version_required',
    surface: 'stale_version_warning',
    scheduleStatus: 'draft',
    validationStatus: null,
    title: 'Sürüm kanıtı gerekli',
    description: '428 sonucu için If-Match zorunluluğu açıklanır; otomatik retry veya mutation yapılmaz.',
    expectedHttpStatus: 428,
    expectedErrorCode: 'SCHEDULE_VERSION_REQUIRED',
    roleVisibility: MANAGEMENT_ONLY_VISIBILITY,
    roleProjection: MANAGEMENT_DRAFT_PROJECTION,
    allowsMutation: false,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    runtimeGuardChanged: false,
  },
  {
    state: 'publish_confirmation',
    surface: 'publish_confirmation',
    scheduleStatus: 'draft',
    validationStatus: 'valid',
    title: 'Programı yayınlama onayı',
    description: 'Draft, eventCount>0, current full validation ve hardConflictCount=0 koşulları gösterilir; onay butonu disabled kalır.',
    expectedHttpStatus: 200,
    expectedErrorCode: null,
    roleVisibility: MANAGEMENT_ONLY_VISIBILITY,
    roleProjection: MANAGEMENT_DRAFT_PROJECTION,
    allowsMutation: false,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    runtimeGuardChanged: false,
  },
  {
    state: 'publish_blocked_empty',
    surface: 'publish_confirmation',
    scheduleStatus: 'draft',
    validationStatus: null,
    title: 'Taslak program boş',
    description: 'Event içermeyen draft için yalnız SCHEDULE_EMPTY reason-code görünümü gösterilir.',
    expectedHttpStatus: 422,
    expectedErrorCode: 'SCHEDULE_EMPTY',
    roleVisibility: MANAGEMENT_ONLY_VISIBILITY,
    roleProjection: MANAGEMENT_DRAFT_PROJECTION,
    allowsMutation: false,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    runtimeGuardChanged: false,
  },
  {
    state: 'publish_blocked_validation_stale',
    surface: 'publish_confirmation',
    scheduleStatus: 'draft',
    validationStatus: 'stale',
    title: 'Doğrulama yeniden yapılmalı',
    description: 'Current version üzerinde full validation bulunmadığında SCHEDULE_VALIDATION_STALE gösterilir.',
    expectedHttpStatus: 422,
    expectedErrorCode: 'SCHEDULE_VALIDATION_STALE',
    roleVisibility: MANAGEMENT_ONLY_VISIBILITY,
    roleProjection: MANAGEMENT_DRAFT_PROJECTION,
    allowsMutation: false,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    runtimeGuardChanged: false,
  },
  {
    state: 'publish_blocked_hard_conflicts',
    surface: 'publish_confirmation',
    scheduleStatus: 'draft',
    validationStatus: 'invalid',
    title: 'Hard conflict çözülmeli',
    description: 'Hard conflict mevcutsa SCHEDULE_HARD_CONFLICTS_PRESENT reason-code görünümü gösterilir.',
    expectedHttpStatus: 422,
    expectedErrorCode: 'SCHEDULE_HARD_CONFLICTS_PRESENT',
    roleVisibility: MANAGEMENT_ONLY_VISIBILITY,
    roleProjection: MANAGEMENT_DRAFT_PROJECTION,
    allowsMutation: false,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    runtimeGuardChanged: false,
  },
  {
    state: 'publish_blocked_period_conflict',
    surface: 'publish_confirmation',
    scheduleStatus: 'draft',
    validationStatus: 'valid',
    title: 'Yayın dönemi çakışıyor',
    description: 'Aynı branch ve effective period için başka published Schedule varsa PUBLISHED_SCHEDULE_PERIOD_CONFLICT gösterilir.',
    expectedHttpStatus: 409,
    expectedErrorCode: 'PUBLISHED_SCHEDULE_PERIOD_CONFLICT',
    roleVisibility: MANAGEMENT_ONLY_VISIBILITY,
    roleProjection: MANAGEMENT_DRAFT_PROJECTION,
    allowsMutation: false,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    runtimeGuardChanged: false,
  },
  {
    state: 'published_read_only',
    surface: 'weekly_grid',
    scheduleStatus: 'published',
    validationStatus: 'valid',
    title: 'Yayınlanmış program',
    description: 'Management full branch, Teacher own published events ve Viewer contract read-only projection ayrı tutulur.',
    expectedHttpStatus: 200,
    expectedErrorCode: null,
    roleVisibility: MANAGEMENT_AND_READ_VISIBILITY,
    roleProjection: PUBLISHED_READ_PROJECTION,
    allowsMutation: false,
    apiBinding: 'not_connected',
    permissionBinding: 'pending_catalog',
    runtimeGuardChanged: false,
  },
] as const;

export type OperationsForbiddenPreview = {
  reason: AccessDeniedReason;
  route: string;
  module: OperationsModule;
  showsSensitiveData: false;
  runtimeGuardChanged: false;
};

export function buildOperationsForbiddenPreview(
  reason: AccessDeniedReason,
  route: string,
  module: OperationsModule,
): OperationsForbiddenPreview {
  return {
    reason,
    route,
    module,
    showsSensitiveData: false,
    runtimeGuardChanged: false,
  };
}
