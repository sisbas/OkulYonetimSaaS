import { Injectable } from '@nestjs/common';
import { RequestContext } from '../common/context/request-context';
import { LeaveIdentityFoundationRequiredException } from './leave-errors';

export type LeaveActorIdentity = {
  actorUserId: string;
  teacherId: string;
};

/**
 * Runtime identity is intentionally fail-closed until #141 provides the
 * tenant-safe User -> Teacher link. This prevents client-controlled teacherId
 * from becoming the trust source for own-scope leave creation or reads.
 */
@Injectable()
export class LeaveIdentityService {
  async resolveTeacherIdentity(_ctx: RequestContext): Promise<LeaveActorIdentity> {
    throw new LeaveIdentityFoundationRequiredException();
  }
}
