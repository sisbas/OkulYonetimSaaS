export type ParentContactVisibilityDecision =
  | { allowed: true; statusCode: 200; mask: false }
  | { allowed: false; statusCode: 403; mask: true; reason: 'PARENT_CONTACT_PERMISSION_REQUIRED' };

export interface ParentContactVisibilityInput {
  permissions?: readonly string[] | null;
}

export class ParentContactVisibilityGuard {
  private static readonly REQUIRED_PERMISSION = 'student:parent_contact:read';

  canView(input: ParentContactVisibilityInput): ParentContactVisibilityDecision {
    const permissions = input.permissions ?? [];
    if (permissions.includes(ParentContactVisibilityGuard.REQUIRED_PERMISSION)) {
      return { allowed: true, statusCode: 200, mask: false };
    }

    return {
      allowed: false,
      statusCode: 403,
      mask: true,
      reason: 'PARENT_CONTACT_PERMISSION_REQUIRED',
    };
  }
}
