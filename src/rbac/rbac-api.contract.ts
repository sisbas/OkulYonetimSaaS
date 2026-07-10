import { PermissionCatalogEntry, Phase1Role } from './permission-catalog';

export interface PermissionCatalogResponse {
  version: 'phase-1-v1';
  items: PermissionCatalogEntry[];
}

export interface RolePermissionMapping {
  role: Phase1Role;
  route: string;
  action: string;
  resource: string;
  permission: string;
  audit_required: boolean;
  deny_state: PermissionCatalogEntry['deny_state'];
}

export interface RolePermissionMappingResponse {
  version: 'phase-1-v1';
  role: Phase1Role;
  mappings: RolePermissionMapping[];
}

export interface RbacDecisionResponse {
  allowed: boolean;
  statusCode: 200 | 403;
  permission: string;
  route: string;
  action: string;
  resource: string;
  audit_required: boolean;
  deny_state: PermissionCatalogEntry['deny_state'];
}

export interface ForbiddenRbacResponse {
  statusCode: 403;
  error: 'Forbidden';
  message: 'Permission denied';
  permission: string;
  resource: string;
}
