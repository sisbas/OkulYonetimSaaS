import { PhoneInput } from './types';

export class PhoneGuard {
  canUsePhone(phone: PhoneInput): boolean {
    return phone.exists && phone.verified;
  }

  hasPhone(phone: PhoneInput): boolean {
    return phone.exists;
  }

  isVerified(phone: PhoneInput): boolean {
    return phone.verified;
  }
}
