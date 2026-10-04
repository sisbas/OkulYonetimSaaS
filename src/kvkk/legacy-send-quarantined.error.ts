import { ForbiddenException } from '@nestjs/common';

export const NOTIFICATION_LEGACY_SEND_QUARANTINED = 'NOTIFICATION_LEGACY_SEND_QUARANTINED';

/** Static denial: never attach caller input, contact or provider payload. */
export class LegacySendQuarantinedError extends ForbiddenException {
  constructor() {
    super(NOTIFICATION_LEGACY_SEND_QUARANTINED);
  }
}
