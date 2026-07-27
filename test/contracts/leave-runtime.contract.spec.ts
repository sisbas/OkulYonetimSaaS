import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const contract = readFileSync(join(process.cwd(), 'docs/leaves/leave-runtime-contract.md'), 'utf8');
const appModule = readFileSync(join(process.cwd(), 'src/app.module.ts'), 'utf8');
const controller = readFileSync(join(process.cwd(), 'src/leaves/leave.controller.ts'), 'utf8');
const repository = readFileSync(join(process.cwd(), 'src/leaves/leave.repository.ts'), 'utf8');
const service = readFileSync(join(process.cwd(), 'src/leaves/leave.service.ts'), 'utf8');
const leavesModule = readFileSync(join(process.cwd(), 'src/leaves/leaves.module.ts'), 'utf8');
const migration = readFileSync(
  join(process.cwd(), 'src/database/migrations/1802000000000-CreateLeaveRequestRuntime.ts'),
  'utf8',
);
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
    expect(service).toContain('parseExpectedVersion(ifMatch, id)');
    expect(service).toContain('match[1] !== leaveId');
    expect(service).toContain('throw new LeaveStaleVersionException()');
  });

  it('rejects stale concurrent decisions while holding the pessimistic lock', () => {
    expect(repository).toContain("lock: { mode: 'pessimistic_write' }");
    expect(repository).toContain('existing.version !== values.expectedVersion');
    expect(repository).toContain('throw new LeaveStaleVersionException()');
    expect(repository).toContain('throw new LeaveTerminalStateException()');
  });

  it('runs after the identity teacher foundation and enforces tenant-safe references', () => {
    expect(migration).toContain('CreateLeaveRequestRuntime1802000000000');
    expect(migration).toContain('WP07_LEAVE_REQUIRES_TEACHERS_TABLE');
    expect(migration).toContain('WP07_LEAVE_REQUIRES_TENANT_MEMBERSHIPS_TABLE');
    expect(migration).toContain('fk_leave_requests_branch_same_tenant');
    expect(migration).toContain('FOREIGN KEY (tenant_id, branch_id)');
    expect(migration).toContain('fk_leave_requests_teacher_same_tenant');
    expect(migration).toContain('FOREIGN KEY (tenant_id, teacher_id)');
    expect(migration).toContain('fk_leave_requests_requester_same_tenant');
    expect(migration).toContain('FOREIGN KEY (tenant_id, requester_user_id)');
  });

  it('validates tenant and branch ownership inside the create transaction', () => {
    expect(repository).toContain('assertBranchOwnership(manager, values.tenantId, values.branchId)');
    expect(repository).toContain('SELECT 1 FROM branches WHERE tenant_id = $1 AND id = $2');
  });

  it('writes canonical versioned leave audit events through the shared transaction manager', () => {
    expect(leavesModule).toContain('TransactionalLeaveAuditAdapter');
    expect(leavesModule).toContain('TRANSACTIONAL_AUDIT_WRITER');
    expect(repository).toContain("'leave.requested.v1'");
    expect(repository).toContain("'leave.approved.v1'");
    expect(repository).toContain("'leave.rejected.v1'");
    expect(repository).toContain('this.audit.write(manager');
    expect(repository).not.toContain('INSERT INTO leave_audit_events');
    expect(migration).not.toContain('leave_audit_events');
  });

  it('keeps the reject endpoint bodyless and server-selects the rejected decision', () => {
    const rejectHandler = controller.match(/@Patch\(':id\/reject'\)([\s\S]*?)\n  }\n}/)?.[1] ?? '';
    expect(rejectHandler).toContain('LeaveDecisionStatus.REJECTED');
    expect(rejectHandler).not.toContain('@Body()');
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
