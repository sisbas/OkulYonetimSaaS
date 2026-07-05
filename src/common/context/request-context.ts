import { Request } from 'express';

export type RequestUser = {
  userId: string;
  tenantId: string;
  roleIds: string[];
  permissions: string[];
};

export type RequestContext = {
  requestId: string;
  tenantId?: string;
  user?: RequestUser;
};

export type RequestWithContext = Request & { context?: RequestContext; user?: RequestUser };
