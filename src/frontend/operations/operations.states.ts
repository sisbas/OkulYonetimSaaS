import type { AccessDeniedReason } from '../core-definitions/access-state';
import type { OperationsModule } from './operations.routes';

export type OperationsUiState = 'loading' | 'empty' | 'error' | 'forbidden' | 'contract_pending';

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
    description: 'Onaylı API contract ve Permission Catalog binding olmadan veri bağlantısı açılmaz.',
    showsSensitiveData: false,
    allowsMutation: false,
    apiBinding: 'not_connected',
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
