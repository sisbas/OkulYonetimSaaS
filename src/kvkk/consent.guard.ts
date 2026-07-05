import { ConsentInput } from './types';

export class ConsentGuard {
  canProcess(consent?: ConsentInput | null): boolean {
    return consent?.status === 'approved';
  }
}
