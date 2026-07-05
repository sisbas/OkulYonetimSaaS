import { SetMetadata } from '@nestjs/common';
export const AUDIT_ACTION_KEY = 'audit_action';
export type AuditActionOptions = { action: string; resource: string };
export const AuditAction = (options: AuditActionOptions) => SetMetadata(AUDIT_ACTION_KEY, options);
