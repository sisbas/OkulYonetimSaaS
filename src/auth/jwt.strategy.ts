import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { decode } from 'jsonwebtoken';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RequestUser } from '../common/context/request-context';
import { AccessTokenPayload, AuthService } from './auth.service';
import { assertTokenKeyId, resolveJwtKey, resolveJwtTokenContract } from './jwt-keyring';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly auth: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      issuer: resolveJwtTokenContract().issuer,
      audience: resolveJwtTokenContract().accessAudience,
      // Algoritma sabitlenir: yalnız HS256 kabul edilir (algoritma karışıklığı
      // / `alg: none` yüzeyi kapatılır).
      algorithms: ['HS256'],
      // #259 P1B-02: anahtar kimliği (`kid`) doğrulaması. Token'ın taşıdığı
      // `kid` aktif anahtar kimliğiyle eşleşmezse token REDDEDİLİR; rotasyon
      // sonrası emekliye ayrılmış bir secret ile imzalanmış token sessizce
      // kabul edilmez. Bu kontrol imza/issuer/audience kontrollerinden ÖNCE
      // çalışır ve hata 401 olarak döner.
      secretOrKeyProvider: (_request: unknown, rawToken: string, done: (error: Error | null, secret?: string) => void) => {
        try {
          const header = decode(rawToken, { complete: true })?.header as
            | { kid?: string }
            | undefined;
          assertTokenKeyId('access', header?.kid);
          done(null, resolveJwtKey('access').secret);
        } catch (error) {
          done(error instanceof Error ? error : new Error('access token rejected'));
        }
      },
    });
    // Boot-time fail-closed: access secret'i uygulama ayağa kalkarken doğrulanır
    // (talep yolunda tembel kalmak, eksik yapılandırmayla kısmi servis verilmesine
    // yol açardı).
    resolveJwtKey('access');
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
