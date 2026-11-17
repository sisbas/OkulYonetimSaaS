import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  branchResources,
  isBranchScopedController,
} from '../../src/common/context/branch-resource-scope';

/**
 * #447 — statik route/decorator pinleri.
 *
 * Frozen sözleşme (`docs/m3/schedule-contract-v2.md` §8) route sırasını ve
 * koşul başlığını sözleşmeye mühürler: `drafts` ve `published`
 * `:scheduleId`'den ÖNCE bildirilmelidir (aksi hâlde `ParseUUIDPipe`'a
 * yutulur), `:scheduleId` `ParseUUIDPipe` taşır, mutasyonlar `If-Match`
 * ister, draft create ise istemez.
 */
describe('#447 Schedule read routes (static contract)', () => {
  const root = process.cwd();
  const source = readFileSync(join(root, 'src/schedules/schedule.controller.ts'), 'utf8');

  function indexOf(marker: string): number {
    const index = source.indexOf(marker);
    expect(index).toBeGreaterThanOrEqual(0);
    return index;
  }

  it('declares drafts and published before :scheduleId', () => {
    const draftsAt = indexOf("@Get('drafts')");
    const publishedAt = indexOf("@Get('published')");
    const detailAt = indexOf("@Get(':scheduleId')");
    expect(publishedAt).toBeGreaterThan(draftsAt);
    expect(detailAt).toBeGreaterThan(publishedAt);
  });

  it('guards the management list with @Permissions(schedule:draft:read)', () => {
    const drafts = source.slice(indexOf("@Get('drafts')"), indexOf("@Get('published')"));
    expect(drafts).toContain("@Permissions('schedule:draft:read')");
    expect(drafts).not.toContain('@PermissionsAny');
  });

  it('guards the published list with the own-read/management OR pair', () => {
    const published = source.slice(indexOf("@Get('published')"), indexOf("@Get(':scheduleId')"));
    expect(published).toContain("@PermissionsAny('schedule:read', 'schedule:own:read')");
    expect(published).toContain("isoQuery(fromRaw)");
    expect(published).toContain("isoQuery(toRaw)");
  });

  it('guards the schedule detail with all three candidate keys and a UUID pipe', () => {
    const detail = source.slice(indexOf("@Get(':scheduleId')"));
    expect(detail).toContain(
      "@PermissionsAny('schedule:draft:read', 'schedule:read', 'schedule:own:read')",
    );
    expect(detail).toContain('new ParseUUIDPipe()');
  });

  it('requires an exact conditional revision header on mutations', () => {
    for (const marker of [
      "@Post(':scheduleId/draft')",
      "@Post(':scheduleId/validate')",
      "@Post(':scheduleId/publish')",
      "@Post(':scheduleId/unpublish')",
    ]) {
      const at = indexOf(marker);
      const next = ["@Post(", "@Get("].reduce((acc, token) => {
        const found = source.indexOf(token, at + marker.length);
        return found === -1 ? acc : Math.min(acc, found);
      }, source.length);
      const block = source.slice(at, next);
      expect(block).toContain('@Headers(IF_MATCH_HEADER)');
      expect(block).toContain('assertScheduleIfMatchResource');
      expect(block).toContain("response.setHeader('ETag'");
    }
  });

  it('excludes required If-Match from draft creation', () => {
    const createAt = indexOf("@Post('drafts')");
    const nextPost = source.indexOf("@Post(", createAt + "@Post('drafts')".length);
    const block = source.slice(createAt, nextPost === -1 ? source.length : nextPost);
    expect(block).not.toContain('@Headers(IF_MATCH_HEADER)');
    expect(block).toContain("@Permissions('schedule:draft:create')");
    expect(block).toContain("response.setHeader('ETag'");
  });

  it('emits an ETag on every route that participates in revision concurrency', () => {
    expect((source.match(/response\.setHeader\('ETag'/g) ?? []).length).toBe(8);
  });

  it('keeps validate behind the validation-plus-conflict-read pair', () => {
    const at = indexOf("@Post(':scheduleId/validate')");
    const next = source.indexOf("@Post(", at + "@Post(':scheduleId/validate')".length);
    const block = source.slice(at, next === -1 ? source.length : next);
    expect(block).toContain("@Permissions('schedule:validate', 'schedule:conflict:read')");
  });

  it('maps the :scheduleId parameter to the schedules table for branch-scoped checks', () => {
    expect(isBranchScopedController('ScheduleController')).toBe(true);
    const id = '00000000-0000-4000-8000-000000000001';
    expect(branchResources('ScheduleController', { scheduleId: id })).toEqual([
      { table: 'schedules', id },
    ]);
    expect(branchResources('ScheduleController', { id })).toEqual([
      { table: 'schedules', id },
    ]);
    expect(branchResources('ScheduleController', { scheduleId: 'not-a-uuid' })).toEqual([]);
    expect(() =>
      branchResources('ScheduleController', { unexpected: '00000000-0000-4000-8000-000000000001' }),
    ).toThrow();
  });
});
