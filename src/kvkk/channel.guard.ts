import { ChannelInput } from './types';

export class ChannelGuard {
  canUseChannel(channel: ChannelInput): boolean {
    return channel.allowed;
  }
}
