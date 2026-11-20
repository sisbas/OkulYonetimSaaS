import { ScheduleStatus } from './schedule.entity';
import { ScheduleValidationMode } from './schedule-version.entity';
import { ScheduleVersionStatus } from './schedule-version.entity';
import { versionMeta } from './schedule-read.view';

describe('#453 okuma yüzeyi yayın kanıtı', () => {
  it('version meta alanlarını doğrudan versiyon satırından taşır', () => {
    const meta = versionMeta({
      id: 'v-1',
      versionNo: 3,
      status: ScheduleVersionStatus.PUBLISHED,
      publishedAt: new Date('2026-10-01T00:00:00.000Z'),
      validationMode: ScheduleValidationMode.FULL,
      validationFingerprint: 'fp-abc',
      validatedRevision: 2,
    } as never);

    expect(meta).toMatchObject({
      scheduleVersionId: 'v-1',
      versionNo: 3,
      status: 'published',
      validationMode: 'FULL',
      validationFingerprint: 'fp-abc',
      validatedRevision: 2,
    });
  });

  it('kanıt olmayan versiyonlarda alanları null bırakır, uydurmaz', () => {
    const meta = versionMeta({
      id: 'v-2',
      versionNo: 1,
      status: ScheduleVersionStatus.DRAFT,
      publishedAt: null,
      validationMode: null,
      validationFingerprint: null,
      validatedRevision: null,
    } as never);
    expect(meta).toMatchObject({
      validationMode: null,
      validationFingerprint: null,
      validatedRevision: null,
    });
    expect(versionMeta(null)).toBeNull();
    expect(ScheduleStatus.DRAFT).toBe('draft');
  });
});
