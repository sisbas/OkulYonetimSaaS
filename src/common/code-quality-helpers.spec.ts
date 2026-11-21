import { extractRows } from './db/extract-rows';
import { requestFailureCategory, REQUEST_FAILURE_CATEGORIES } from './http-failure-categories';

describe('#416 ortak yardımcılar (davranış değiştirmeyen refactor)', () => {
  it('extractRows hem rows dizisini hem UPDATE/DELETE tupleunu aynı şekilde indirger', () => {
    expect(extractRows([{ id: 'a' }])).toEqual([{ id: 'a' }]);
    expect(extractRows([[{ id: 'a' }], 1])).toEqual([{ id: 'a' }]);
    expect(extractRows(null)).toEqual([]);
  });

  it("hata kategorisi allowlist'i tek kaynaktan ve 7 kategoriyle gelir", () => {
    expect(REQUEST_FAILURE_CATEGORIES).toHaveLength(7);
    expect(requestFailureCategory('ConflictException')).toBe('ConflictException');
    expect(requestFailureCategory('BadRequestException')).toBe('BadRequestException');
    expect(requestFailureCategory('QueryFailedError')).toBe('Error');
  });
});
