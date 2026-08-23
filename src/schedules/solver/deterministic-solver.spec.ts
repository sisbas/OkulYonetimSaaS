import { DeterministicSolver } from './deterministic-solver';
import type { SolveRequest, ScheduleDemand } from './solver-port';
import type { ScheduleReferenceSet } from '../m3-schedule-contract';

function refs(ids: string[]): ReadonlySet<string> {
  return new Set(ids);
}

function makeReferenceSet(): ScheduleReferenceSet {
  return {
    activeTeacherIds: refs(['t1', 't2']),
    activeStudentGroupIds: refs(['g1', 'g2']),
    activeRoomIds: refs(['r1', 'r2']),
    activeTimeSlotIds: refs(['s1', 's2', 's3']),
    activeTeacherBranchIds: refs(['tb1']),
    activeTeacherCourseKeys: refs(['t1:c1', 't2:c2']),
  };
}

function makeDemands(n: number): ScheduleDemand[] {
  const demands: ScheduleDemand[] = [];
  for (let i = 0; i < n; i++) {
    const t = i % 2 === 0 ? 't1' : 't2';
    const g = i % 2 === 0 ? 'g1' : 'g2';
    const c = i % 2 === 0 ? 'c1' : 'c2';
    const day = 1 + (i % 5);
    demands.push({
      demandId: `d${i}`,
      studentGroupId: g,
      courseId: c,
      teacherId: t,
      teacherBranchId: 'tb1',
      timeSlots: [
        { id: 's1', dayOfWeek: day, startTime: '09:00', endTime: '10:00' },
        { id: 's2', dayOfWeek: day, startTime: '10:00', endTime: '11:00' },
        { id: 's3', dayOfWeek: day, startTime: '11:00', endTime: '12:00' },
      ],
      roomIds: ['r1', 'r2'],
      preferredDayOfWeek: day,
    });
  }
  return demands;
}

function makeRequest(demands: ScheduleDemand[], seed: number): SolveRequest {
  return {
    tenantId: 'a0000000-0000-4000-8000-0000000000a1',
    branchId: 'a1000000-0000-4000-8000-0000000000a1',
    referenceSet: makeReferenceSet(),
    demands,
    seed,
    bounds: { maxDepth: 1000, maxNodes: 100_000, maxDurationMs: 10_000 },
    correlationId: 'test',
  };
}

describe('DeterministicSolver (P1B-06 #262)', () => {
  const solver = new DeterministicSolver();

  it('is deterministic: same seed + input -> identical output', async () => {
    const demands = makeDemands(12);
    const a = await solver.solve(makeRequest(demands, 42));
    const b = await solver.solve(makeRequest(demands, 42));
    expect(a.events.map((e) => e.eventId)).toEqual(b.events.map((e) => e.eventId));
    expect(a.placementRatio).toBe(b.placementRatio);
    expect(a.seed).toBe(42);
  });

  it('different seed yields a reproducible but potentially different ordering', async () => {
    const demands = makeDemands(12);
    const a = await solver.solve(makeRequest(demands, 1));
    const b = await solver.solve(makeRequest(demands, 2));
    // Both must be valid placements (full placement for non-conflicting demands).
    expect(a.placementRatio).toBeGreaterThan(0);
    expect(b.placementRatio).toBeGreaterThan(0);
    expect(a.seed).toBe(1);
    expect(b.seed).toBe(2);
  });

  it('PROPERTY: generated output never contains a hard conflict (re-validate)', async () => {
    const { validateSchedule } = await import('../schedule-validator');
    const demands = makeDemands(20);
    const result = await solver.solve(makeRequest(demands, 7));
    const evidence = validateSchedule({
      mode: 'FULL',
      tenantId: 'a0000000-0000-4000-8000-0000000000a1',
      branchId: 'a1000000-0000-4000-8000-0000000000a1',
      scheduleId: 'prop',
      scheduleRevision: 1,
      currentScheduleRevision: 1,
      inputFingerprint: 'prop',
      status: 'draft',
      effectiveFrom: '2026-09-01',
      events: result.events,
      references: makeReferenceSet(),
    });
    expect(evidence.hardConflictCount).toBe(0);
  });

  it('places all non-conflicting demands (placementRatio = 1 for disjoint demands)', async () => {
    const demands = makeDemands(10);
    const result = await solver.solve(makeRequest(demands, 99));
    // 10 disjoint demands, 3 slots * 2 rooms = 6 same-day slots but different days
    // (preferredDayOfWeek 1..5) -> no overlap -> full placement.
    expect(result.placementRatio).toBe(1);
    expect(result.unplaced).toHaveLength(0);
    expect(result.status).toBe('SOLVED');
  });

  it('respects bounds: maxDepth caps processed demands', async () => {
    const demands = makeDemands(50);
    const result = await solver.solve({
      ...makeRequest(demands, 5),
      bounds: { maxDepth: 5, maxNodes: 100_000, maxDurationMs: 10_000 },
    });
    expect(result.placementRatio).toBeLessThan(1);
    expect(result.unplaced.length).toBeGreaterThan(0);
  });

  it('emergency tier activates only when allowed AND ratio < threshold', async () => {
    // Force a low ratio by capping maxDepth hard.
    const demands = makeDemands(50);
    const result = await solver.solve({
      ...makeRequest(demands, 3),
      allowEmergency: true,
      bounds: { maxDepth: 3, maxNodes: 100_000, maxDurationMs: 10_000 },
    });
    expect(result.status).toBe('EMERGENCY');
    expect(result.relaxations.some((r) => r.tier === 'EMERGENCY')).toBe(true);
  });

  it('EMERGENCY is draft-only: solver never publishes (no status flip)', async () => {
    const demands = makeDemands(50);
    const result = await solver.solve({
      ...makeRequest(demands, 3),
      allowEmergency: true,
      bounds: { maxDepth: 3, maxNodes: 100_000, maxDurationMs: 10_000 },
    });
    // Solver output is just events; it never auto-publishes. Status stays EMERGENCY
    // as a draft marker, never 'published'.
    expect(result.status).not.toBe('SOLVED');
    expect(result.events.every((e) => e.timeSlotId !== null)).toBe(true);
  });
});
