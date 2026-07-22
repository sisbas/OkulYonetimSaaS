import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RequestUser } from '../common/context/request-context';
import {
  AccessTokenPayload,
  AUTH_ACCESS_TOKEN_AUDIENCE,
  AUTH_TOKEN_ISSUER,
  AuthService,
} from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly auth: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret',
      issuer: AUTH_TOKEN_ISSUER,
      audience: AUTH_ACCESS_TOKEN_AUDIENCE,
    });
  }

  async validate(payload: Partial<AccessTokenPayload> & { roles?: string[]; permissions?: string[] }): Promise<RequestUser> {
    if (!payload.sub || !payload.tenant_id || !payload.session_id || !payload.authorization_version) {
      throw new UnauthorizedException('Invalid access token');
    }
    return this.auth.validateAccessTokenSession({
      sub: payload.sub,
      tenant_id: payload.tenant_id,
      session_id: payload.session_id,
      jti: payload.jti ?? payload.session_id,
      authorization_version: Number(payload.authorization_version),
    });
  }
}
