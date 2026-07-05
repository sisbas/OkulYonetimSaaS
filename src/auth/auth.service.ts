import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

export type TokenSubject = { userId: string; tenantId: string; roles: string[]; permissions: string[] };

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  async issueTokenPair(subject: TokenSubject) {
    const refreshTokenId = randomUUID();
    const accessToken = await this.jwt.signAsync({ sub: subject.userId, tenant_id: subject.tenantId, roles: subject.roles, permissions: subject.permissions }, { secret: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret', expiresIn: '15m' });
    const refreshToken = await this.jwt.signAsync({ sub: subject.userId, tenant_id: subject.tenantId, jti: refreshTokenId }, { secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret', expiresIn: '30d' });
    return { accessToken, refreshToken, refreshTokenHash: await bcrypt.hash(refreshToken, 12), refreshTokenId };
  }

  async assertRefreshToken(refreshToken: string, storedHash: string) {
    const ok = await bcrypt.compare(refreshToken, storedHash);
    if (!ok) throw new UnauthorizedException('Invalid refresh token');
    return this.jwt.verifyAsync(refreshToken, { secret: process.env.JWT_REFRESH_SECRET ?? 'dev-refresh-secret' });
  }
}
