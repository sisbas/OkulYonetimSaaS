import { ROLE_PERMISSION_SEED } from './permissions.seed';

export const ROLE_SEED = Object.entries(ROLE_PERMISSION_SEED).map(([code, permissions]) => ({
  code,
  permissions: [...permissions],
}));
