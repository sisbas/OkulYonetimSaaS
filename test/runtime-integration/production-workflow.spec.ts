import * as fs from 'node:fs';
import * as path from 'node:path';

describe('production observation workflow prerequisites', () => {
  const root = process.cwd();
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/wp07f-production-observation.yml'), 'utf8');
  const { scripts } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  it('resolves every npm script invoked by the production workflow', () => {
    const commands = [...workflow.matchAll(/\bnpm\s+(?:run\s+([\w:.-]+)|(ci|test))\b/g)];
    expect(commands.length).toBeGreaterThan(0);
    const invokedScripts = commands.flatMap((match) => match[1] ? [match[1]] : match[2] === 'test' ? ['test'] : []);
    expect(invokedScripts).toContain('observe:production-runtime');
    expect(invokedScripts.filter((name) => typeof scripts[name] !== 'string' || !scripts[name].trim())).toEqual([]);
  });

  it('requires canonical frontend contracts after build and before production observation', () => {
    const build = workflow.indexOf('run: npm run build');
    const contracts = workflow.indexOf('run: npm test -- --runInBand test/frontend-runtime/runtime-boundary.spec.ts test/runtime-integration/production-workflow.spec.ts');
    const observe = workflow.indexOf('run: npm run observe:production-runtime');
    expect(build).toBeGreaterThan(-1);
    expect(contracts).toBeGreaterThan(build);
    expect(observe).toBeGreaterThan(contracts);
  });
});
