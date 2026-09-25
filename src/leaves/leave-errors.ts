import { ConflictException, HttpException, NotFoundException, PreconditionFailedException } from '@nestjs/common';

export const LEAVE_NOT_FOUND_MESSAGE = 'Leave request not found';

export class LeaveNotFoundException extends NotFoundException {
  constructor() {
    super(LEAVE_NOT_FOUND_MESSAGE);
  }
}

export class LeaveExpectedVersionRequiredException extends HttpException {
  constructor() {
    super('Expected leave request version is required', 428);
  }
}

export class LeaveStaleVersionException extends PreconditionFailedException {
  constructor() {
    super('Leave request version mismatch');
  }
}

export class LeaveTerminalStateException extends ConflictException {
  constructor() {
    super('Only pending leave requests can be decided');
  }
}

export class LeaveSelfDecisionException extends ConflictException {
  constructor() {
    super('Leave request owner cannot approve or reject their own request');
  }
}

export class LeaveIdentityFoundationRequiredException extends HttpException {
  constructor() {
    super('Teacher identity foundation is required before leave own-scope runtime can be enabled', 424);
  }
}
