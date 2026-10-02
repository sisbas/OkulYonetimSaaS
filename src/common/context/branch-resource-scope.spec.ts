import { branchResources, isBranchScopedController, isBranchScopedPermission } from './branch-resource-scope';
import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

describe('ID-addressed branch resource scope', () => {
  it.each([
    '11111111-1111-4111-8111-111111111111',
    '11111111-1111-7111-8111-111111111111',
  ])('does not skip a PostgreSQL UUID because of its version: %s', (id) => {
    expect(branchResources('DailyOperationsController', { leaveId: id, scheduleEventId: id })).toEqual([
      { table: 'leave_requests', id }, { table: 'schedule_events', id },
    ]);
  });

  it('checks the schedule event supplied when creating an attendance session', () => {
    const scheduleEventId = '11111111-1111-4111-8111-111111111111';
    expect(branchResources('AttendanceSessionController', {}, { scheduleEventId })).toEqual([
      { table: 'schedule_events', id: scheduleEventId },
    ]);
  });

  it('leaves malformed IDs to existing request validation', () => {
    expect(branchResources('LeaveController', { id: 'not-a-uuid' })).toEqual([]);
  });

  it('fails closed when a mapped controller introduces an unmapped resource parameter', () => {
    expect(() => branchResources('RoomController', { roomId: '11111111-1111-4111-8111-111111111111' }))
      .toThrow('unresolved_authority');
  });

  it('covers every controller declaring branch-owned permissions, including multiple classes in one file', () => {
    function controllers(directory: string): string[] {
      return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(directory, entry.name);
        return entry.isDirectory() ? controllers(file) : entry.name.endsWith('.controller.ts') ? [file] : [];
      });
    }
    const scoped: string[] = [];
    for (const file of controllers(path.resolve(process.cwd(), 'src'))) {
      const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
      source.forEachChild((node) => {
        if (!ts.isClassDeclaration(node) || !node.name) return;
        const permissions = [...node.getText(source).matchAll(/@Permissions\(([^)]*)\)/g)]
          .flatMap((match) => [...match[1].matchAll(/['"]([^'"]+)['"]/g)].map((value) => value[1]));
        if (permissions.some(isBranchScopedPermission)) {
          scoped.push(node.name.text);
          expect({ controller: node.name.text, mapped: isBranchScopedController(node.name.text) })
            .toEqual({ controller: node.name.text, mapped: true });
        }
      });
    }
    expect(scoped).toEqual(expect.arrayContaining(['RoomController', 'TimeSlotController', 'DailyOperationsQueueController']));
    expect(isBranchScopedPermission('user:read')).toBe(false);
    expect(isBranchScopedPermission('tenant:branch:read')).toBe(false);
  });
});
