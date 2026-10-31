import { resolveJwtKey, resolveJwtTokenContract } from '../../auth/jwt-keyring';
import { resolveAuditHmacKeyRing } from '../audit/audit-chain';
import { CONTACT_KEY_ENV, resolveContactKeyRing } from '../../kvkk/contact-crypto';
import { PSEUDONYM_KEY_ENV, resolvePseudonymKey } from '../../kvkk/pseudonym';
import { resolveRuntimeProfile, type RuntimeProfile } from './environment-profile';

/**
 * Fail-closed güvenlik duruşu doğrulaması (#259 P1B-02 AC-1 / AC-2 / AC-3).
 *
 * Amaç: gizli anahtar sözleşmesinin TAMAMINI süreç ayağa kalkmadan tek noktada
 * doğrulamak. Anahtar çözücüleri talep yolunda tembel çağrıldığı için, eksik bir
 * env değişkeni eskiden ancak ilk ilgili istekte (bazen saatler sonra, kısmi
 * servis verirken) ortaya çıkıyordu. `bootstrap()` bu fonksiyonu Nest
 * uygulamasını oluşturmadan ÖNCE çağırır.
 *
 * Kurallar:
 * - `NODE_ENV` açıkça set edilmiş olmalı (bkz. environment-profile.ts).
 * - JWT access/refresh secret'ları ≥ 32 karakter, birbirinden farklı ve
 *   production'da `JWT_KEY_ID`, issuer/audience değerleri zorunlu.
 * - Audit HMAC anahtarı + key-id + (varsa) emekli anahtar halkası geçerli.
 * - KVKK pseudonym anahtarı + sürüm etiketi geçerli.
 * - Parent-contact anahtarı varsa biçimi geçerli (eksikse production'da uyarı;
 *   çünkü bu yüzey açılmadan önce devreye alınması gerekir).
 *
 * Rapor ASLA gizli değer taşımaz: yalnız anahtar kimlikleri, sürüm etiketleri ve
 * karakter uzunlukları (loglanabilir kanıt).
 */
export type SecurityPostureReport = Readonly<{
  profile: RuntimeProfile;
  jwt: Readonly<{
    keyId: string;
    accessSecretChars: number;
    refreshSecretChars: number;
    issuer: string;
    accessAudience: string;
    refreshAudience: string;
  }>;
  audit: Readonly<{
    keyId: string;
    retiredKeyIds: readonly string[];
    usingLocalFallback: boolean;
  }>;
  kvkk: Readonly<{
    pseudonymKeyVersion: string;
    usingLocalFallback: boolean;
    contactKeyId: string | null;
  }>;
  /** Local fallback kullanılan env adları — açıkça raporlanır, sessiz değildir. */
  localFallbacks: readonly string[];
  /** Fail-closed olmayan ama operasyonel olarak bilinmesi gereken durumlar. */
  warnings: readonly string[];
}>;

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * Güvenlik duruşunu doğrular. Herhangi bir ihlal varsa TÜM ihlalleri tek bir
 * fail-closed hatada toplar (operatör tek seferde hepsini düzeltebilsin).
 */
export function assertSecurityPostureAtStartup(
  env: NodeJS.ProcessEnv = process.env,
): SecurityPostureReport {
  const failures: string[] = [];
  const warnings: string[] = [];
  const localFallbacks: string[] = [];

  /**
   * Her doğrulama bağımsız çalışır: bir anahtar ailesindeki hata diğerlerinin
   * raporlanmasını engellemez. Operatör tek seferde tüm eksikleri görür.
   */
  const attempt = <T>(run: () => T): T | null => {
    try {
      return run();
    } catch (error) {
      failures.push(describeError(error));
      return null;
    }
  };

  /**
   * `NODE_ENV` çözülemiyorsa bu tek başına kök nedendir: diğer tüm anahtar
   * çözücüleri de aynı sebeple düşeceği için tekrar tekrar aynı mesajı üretmek
   * yerine hemen fail-closed durulur.
   */
  const profile = attempt(() => resolveRuntimeProfile(env, 'the security posture bootstrap'));
  if (profile === null) {
    throw new Error(
      `FATAL: security posture validation failed (fail-closed, 1 problem(s)):\n - ${failures[0]}`,
    );
  }

  const accessKey = attempt(() => resolveJwtKey('access', env));
  const refreshKey = attempt(() => resolveJwtKey('refresh', env));
  const contract = attempt(() => resolveJwtTokenContract(env));
  const jwt =
    accessKey && refreshKey && contract
      ? {
          keyId: accessKey.keyId,
          accessSecretChars: accessKey.secret.length,
          refreshSecretChars: refreshKey.secret.length,
          issuer: contract.issuer,
          accessAudience: contract.accessAudience,
          refreshAudience: contract.refreshAudience,
        }
      : null;

  const ring = attempt(() => resolveAuditHmacKeyRing(env));
  const auditFallback = (env['AUDIT_HMAC_KEY'] ?? '') === '';
  if (auditFallback) localFallbacks.push('AUDIT_HMAC_KEY');
  const audit = ring
    ? {
        keyId: ring.current.keyId,
        retiredKeyIds: [...ring.previous.keys()].sort(),
        usingLocalFallback: auditFallback,
      }
    : null;

  const pseudonym = attempt(() => resolvePseudonymKey(env));
  const pseudonymFallback = (env[PSEUDONYM_KEY_ENV] ?? '') === '';
  if (pseudonymFallback) localFallbacks.push(PSEUDONYM_KEY_ENV);

  const contactConfigured = (env[CONTACT_KEY_ENV] ?? '') !== '';
  const contactRing = contactConfigured ? attempt(() => resolveContactKeyRing(env)) : null;
  if (!contactConfigured && profile === 'production') {
    warnings.push(
      `${CONTACT_KEY_ENV} is not configured: the parent-contact surface will fail closed ` +
        'on first use. Configure it before enabling parent notifications.',
    );
  }

  const kvkk = pseudonym
    ? {
        pseudonymKeyVersion: pseudonym.keyVersion,
        usingLocalFallback: pseudonymFallback,
        contactKeyId: contactRing?.current.keyId ?? null,
      }
    : null;

  const uniqueFailures = [...new Set(failures)];
  if (uniqueFailures.length > 0) {
    throw new Error(
      `FATAL: security posture validation failed (fail-closed, ${uniqueFailures.length} problem(s)):\n` +
        uniqueFailures.map((message) => ` - ${message}`).join('\n'),
    );
  }

  return {
    profile,
    jwt: jwt!,
    audit: audit!,
    kvkk: kvkk!,
    localFallbacks,
    warnings,
  };
}
