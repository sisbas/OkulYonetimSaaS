import { Request } from 'express';

export type RequestUser = {
  userId: string;
  tenantId: string;
  roleIds: string[];
  permissions: string[];
  sessionId?: string;
  authorizationVersion?: number;
};

export type TenantLocalBusinessDate = {
  tenantId: string;
  date: string;
  source: 'tenant_local';
};

export type RequestContext = {
  requestId: string;
  userId?: string;
  tenantId?: string;
  roles?: string[];
  permissions?: string[];
  businessDate?: TenantLocalBusinessDate;
  user?: RequestUser;
};

export type RequestWithContext = Request & { context?: RequestContext; user?: RequestUser };
