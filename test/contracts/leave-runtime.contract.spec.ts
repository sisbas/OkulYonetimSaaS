import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const contract = readFileSync(join(process.cwd(), 'docs/leaves/leave-runtime-contract.md'), 'utf8');

describe('Leave runtime contract skeleton', () => {
  it.each(['hourly', 'full_day', 'multi_day'])('pins duration %s', (value) => {
    expect(contract).toContain(value);
  });

  it.each(['annual_leave', 'administrative', 'health', 'other'])('pins reason %s', (value) => {
    expect(contract).toContain(value);
  });

  it.each(['pending', 'approved', 'rejected'])('pins decision %s', (value) => {
    expect(contract).toContain(value);
  });

  it.each(['not_required', 'unresolved', 'partially_covered', 'covered'])('pins coverage %s', (value) => {
    expect(contract).toContain(value);
  });

  it('keeps decision and coverage separate', () => {
    expect(contract).toContain('Decision and coverage are separate state machines');
    expect(contract).toContain('approved');
    expect(contract).toContain('unresolved');
  });

  it('forbids client-controlled teacherId and sensitive audit payloads', () => {
    expect(contract).toContain('teacherId` is not accepted from client payload');
    expect(contract).toContain('raw DTO');
    expect(contract).toContain('health detail');
  });

  it('keeps runtime gated by upstream foundations', () => {
    expect(contract).toContain('Ready/merge depends on #140, #141 and #142 PASS');
    expect(contract).toContain('fail-closed until #141');
  });
});
