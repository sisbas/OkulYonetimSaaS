import { Request } from 'express';

export type RequestUser = {
  userId: string;
  tenantId: string;
  roleIds: string[];
  permissions: string[];
};

export type RequestContext = {
  requestId: string;
  userId?: string;
  tenantId?: string;
  roles?: string[];
  permissions?: string[];
  user?: RequestUser;
};

export type RequestWithContext = Request & { context?: RequestContext; user?: RequestUser };
