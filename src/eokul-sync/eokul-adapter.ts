/**
 * MEB e-okul mock adapter (OKUL-05).
 *
 * Gerçek MEB API'si olmadığı için mock bir adapter kullanılır. Adapter sözleşmesi
 * (EokulAdapter interface) gerçeğe geçişte sadece implementasyon değiştirerek
 * kullanılabilir. Rate-limit ve retry mock katmanında simüle edilir.
 *
 * KVKK: MEB'ten gelen ham kayıtlar (öğrenci/öğretmen PII) işleme sırasında
 * redaction-registry üzerinden maskelenir — audit/export katmanlarıyla aynı
 * tek kaynak set'i kullanılır.
 */

export interface EokulRecord {
  externalId: string;
  entityType: 'student' | 'teacher' | 'course_enrollment' | 'score';
  payload: Record<string, unknown>;
}

export interface EokulAdapter {
  readonly name: string;
  fetchBatch(opts: {
    tenantId: string;
    entityType: string;
    cursor?: string | null;
    limit?: number;
  }): Promise<{ records: EokulRecord[]; nextCursor: string | null }>;
}

// Basit in-process rate limiter (token bucket benzeri).
class RateLimiter {
  private tokens: number;
  constructor(
    private readonly capacity: number,
    private readonly refillMs: number,
  ) {
    this.tokens = capacity;
  }

  async acquire(): Promise<void> {
    while (this.tokens <= 0) {
      await new Promise((r) => setTimeout(r, this.refillMs));
    }
    this.tokens -= 1;
  }
}

// Exponential backoff ile retry wrapper.
async function withRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) break;
      const delay = Math.min(2 ** attempt * 50, 1000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Mock MEB adapter — rastgele PII içeren sahte kayıtlar üretir.
 * Rate-limit + retry simülasyonu içerir.
 */
export class MockEokulAdapter implements EokulAdapter {
  readonly name = 'mock-eokul';
  private limiter = new RateLimiter(5, 200);

  constructor(private readonly failRate = 0) {}

  async fetchBatch(opts: {
    tenantId: string;
    entityType: string;
    cursor?: string | null;
    limit?: number;
  }): Promise<{ records: EokulRecord[]; nextCursor: string | null }> {
    const limit = opts.limit ?? 10;
    const cursorNum = opts.cursor ? Number.parseInt(opts.cursor, 10) : 0;

    return withRetry(async () => {
      await this.limiter.acquire();
      if (this.failRate > 0 && Math.random() < this.failRate) {
        throw new Error('MEB mock transient error');
      }
      const records: EokulRecord[] = [];
      for (let i = 0; i < limit; i += 1) {
        const idx = cursorNum + i;
        records.push({
          externalId: `MEB-${opts.entityType}-${idx}`,
          entityType: opts.entityType as EokulRecord['entityType'],
          payload: {
            studentName: `Öğrenci ${idx}`,
            studentTcKimlikNo: `111111111${String(idx % 10)}`,
            parentPhone: `05${String(300000000 + idx).slice(0, 9)}`,
            email: `ogrenci${idx}@okul.edu.tr`,
            grade: (idx % 12) + 1,
          },
        });
      }
      const nextCursor = cursorNum + limit < 50 ? String(cursorNum + limit) : null;
      return { records, nextCursor };
    });
  }
}
