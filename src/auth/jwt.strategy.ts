import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RequestUser } from '../common/context/request-context';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), ignoreExpiration: false, secretOrKey: process.env.JWT_ACCESS_SECRET ?? 'dev-access-secret' });
  }
  validate(payload: { sub: string; tenant_id: string; roles?: string[]; permissions?: string[] }): RequestUser {
    return { userId: payload.sub, tenantId: payload.tenant_id, roleIds: payload.roles ?? [], permissions: payload.permissions ?? [] };
  }
}
