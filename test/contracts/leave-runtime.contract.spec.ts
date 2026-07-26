import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const contract = readFileSync(join(process.cwd(), 'docs/leaves/leave-runtime-contract.md'), 'utf8');
const appModule = readFileSync(join(process.cwd(), 'src/app.module.ts'), 'utf8');
const controller = readFileSync(join(process.cwd(), 'src/leaves/leave.controller.ts'), 'utf8');
const service = readFileSync(join(process.cwd(), 'src/leaves/leave.service.ts'), 'utf8');
const permissionAuthenticationGuard = readFileSync(
  join(process.cwd(), 'src/common/guards/permission-authentication.guard.ts'),
  'utf8',
);

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

  it('keeps decision and coverage separate and quarantines approval until impact persistence exists', () => {
    expect(contract).toContain('Decision and coverage are separate state machines');
    expect(contract).toContain('IMPACT_ANALYSIS_NOT_READY');
    expect(service).toContain('LeaveImpactAnalysisNotReadyException');
    expect(service).toContain('dto.decision === LeaveDecisionStatus.APPROVED');
  });

  it('authenticates permission-bearing routes before the global permission guard', () => {
    const authenticationGuardIndex = appModule.indexOf('useClass: PermissionAuthenticationGuard');
    const permissionGuardIndex = appModule.indexOf('useClass: PermissionGuard');

    expect(authenticationGuardIndex).toBeGreaterThan(-1);
    expect(permissionGuardIndex).toBeGreaterThan(authenticationGuardIndex);
    expect(permissionAuthenticationGuard).toContain("extends AuthGuard('jwt')");
    expect(permissionAuthenticationGuard).toContain('PERMISSIONS_KEY');
    expect(controller).not.toContain("@UseGuards(AuthGuard('jwt'))");
  });

  it('requires an exact resource-bound If-Match tag', () => {
    expect(contract).toContain('exact resource-bound');
    expect(service).toContain('match[1] !== leaveId');
    expect(service).toContain('/^(?:W\\/)?"leave:([^:\"]+):v(\\d+)"$/i');
  });

  it('forbids client-controlled teacherId and sensitive audit payloads', () => {
    expect(contract).toContain('teacherId` is not accepted from client payload');
    expect(contract).toContain('raw DTO');
    expect(contract).toContain('health detail');
  });

  it('keeps runtime gated by upstream foundations', () => {
    expect(contract).toContain('Ready/merge depends on #140, #141, #160 and #162 PASS');
    expect(contract).toContain('fail-closed until #141');
    expect(contract).toContain('Approval is fail-closed until #160');
  });
});
