/**
 * S0-A1 (#269) — `pg` sürücüsü dar arayüzle sarmalanır.
 *
 * Neden: `pg` paketi tip tanımı taşımaz ve bu repoda `@types/pg` yoktur. Yeni
 * bir bağımlılık eklemek anayasa gereği ayrı onay ister; bu yüzden sürücü tek
 * noktadan, tipli dar bir arayüz üzerinden kullanılır.
 */

export type PgRow = Readonly<Record<string, unknown>>;

export type PgQueryResult = Readonly<{ rows: Array<PgRow> }>;

export type PgClient = {
  connect: () => Promise<void>;
  query: (text: string, params?: ReadonlyArray<unknown>) => Promise<PgQueryResult>;
  end: () => Promise<void>;
};

type PgModule = { Client: new (config: { connectionString: string }) => PgClient };

export function createPgClient(connectionString: string): PgClient {
  const driver = require('pg') as PgModule;
  return new driver.Client({ connectionString });
}

export async function withPgClient<T>(
  connectionString: string,
  run: (client: PgClient) => Promise<T>,
): Promise<T> {
  const client = createPgClient(connectionString);
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

export function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === '23505' || code === '23P01';
}

export function columnText(row: PgRow | undefined, column: string, context: string): string {
  const value = row?.[column];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Expected a text '${column}' in ${context}.`);
  }
  return value;
}

/** Sorgu hatalarını redakte ederek yeniden fırlatır; ham satır değeri loglanmaz. */
export function redactDatabaseError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/postgres(ql)?:\/\/[^\s]+/gi, 'postgres://<redacted>')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer <redacted>')
    .replace(/eyJ[A-Za-z0-9._-]+/g, '<jwt-redacted>')
    .replace(/(credential_hash|password|secret|token)\s*=\s*\S+/gi, '$1=<redacted>');
}
