/**
 * TypeORM postgres sürücüsü UPDATE/DELETE sorgularında `[rows, rowCount]`
 * tuple'ı döner; SELECT/INSERT ise doğrudan `rows` dizisi (#416 / K-26).
 * Ham sonucu satır dizisine indirger. Yalnızca şekil normalizasyonu yapar;
 * satırları filtrelemez veya dönüştürmez.
 */
export function extractRows<T>(result: unknown): T[] {
  if (Array.isArray(result) && Array.isArray(result[0])) {
    return result[0] as T[];
  }
  return (result ?? []) as T[];
}
