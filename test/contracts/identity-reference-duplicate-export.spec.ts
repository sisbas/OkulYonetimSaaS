import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const IDENTITY_REFERENCE_FILES = [
  'src/common/context/request-context.ts',
  'src/teachers/teacher-identity.service.ts',
  'src/teachers/teacher.repository.ts',
  'src/teachers/teacher-branch-preflight.ts',
  'src/teachers/teacher.entity.ts',
  'src/teachers/teacher-branch.entity.ts',
];

function exportedNames(source: string): string[] {
  const names: string[] = [];
  const pattern = /export\s+(?:type|interface|class|enum|function|const)\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) names.push(match[1]);
  return names;
}

describe('Identity reference duplicate export scanner', () => {
  it('does not define duplicate exported type, interface, function, class, enum or const names', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];

    for (const file of IDENTITY_REFERENCE_FILES) {
      const source = readFileSync(join(process.cwd(), file), 'utf8');
      for (const name of exportedNames(source)) {
        const previous = seen.get(name);
        if (previous) duplicates.push(`${name}: ${previous}, ${file}`);
        else seen.set(name, file);
      }
    }

    expect(duplicates).toEqual([]);
  });
});
