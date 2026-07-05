import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { PERMISSION_SEED } from '../../src/database/seeds/permissions.seed';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((entry) => {
      const path = join(dir, entry);
      if (entry === 'node_modules' || entry === 'dist') return [];
      if (statSync(path).isDirectory()) return sourceFiles(path);
      return /\.(ts|js)$/.test(entry) ? [path] : [];
    });
}

describe('permission decorator consistency', () => {
  const seeded = new Set<string>(PERMISSION_SEED.map((permission) => permission.code));

  it('keeps route permission keys within the seeded permission keys', () => {
    const used = sourceFiles(join(process.cwd(), 'src')).flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return [...source.matchAll(/@(Permissions|RequirePermission)\(([^)]*)\)/g)].flatMap((match) =>
        [...match[2].matchAll(/['"]([^'"]+)['"]/g)].map((permission) => ({
          permission: permission[1],
          file: relative(process.cwd(), file),
        })),
      );
    });

    expect(used.length).toBeGreaterThan(0);
    for (const { permission, file } of used) {
      expect(permission).not.toContain('.');
      if (!seeded.has(permission)) {
        throw new Error(`${permission} in ${file} is not seeded`);
      }
    }
  });
});
