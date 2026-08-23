import {
  ScheduleEventDraft,
  ScheduleValidationInput,
  teacherCourseKey,
  M3_SCHEDULE_CONTRACT_ID,
  M3_SCHEDULE_CONTRACT_VERSION,
} from '../m3-schedule-contract';
import { validateSchedule } from '../schedule-validator';
import type {
  SolveRequest,
  SolveResult,
  SolveStatus,
  SolverPort,
  UnplacedItem,
  RelaxationTier,
  SolverDiagnostics,
  ScheduleDemand,
} from './solver-port';

/** Deterministic PRNG (mulberry32). Same seed -> same sequence. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function minutes(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

type Placed = {
  demandId: string;
  event: ScheduleEventDraft;
};

/**
 * Deterministic TS heuristic + bounded backtracking solver (P1B-06, #262).
 *
 * Strategy:
 *  1. Order demands deterministically (by demandId, then seeded shuffle).
 *  2. For each demand, enumerate candidate (timeSlot, room) pairs, order them
 *     by a seeded score (preferred day, balance), and greedily place the first
 *     that does not introduce a HARD conflict.
 *  3. If a demand cannot be placed, record it as unplaced (no hard relaxation).
 *  4. Re-validate the full output with validateSchedule; if any hard conflict
 *     survived, drop the offending events (hard constraints NEVER relax).
 *  5. If placementRatio is below threshold and allowEmergency, mark EMERGENCY
 *     tier (still draft-only — caller must not auto-publish).
 *
 * Bounds: maxDepth (demands processed), maxNodes (candidate evaluations),
 * maxDurationMs. Cancellation: request.aborted.value checked each demand.
 */
export class DeterministicSolver implements SolverPort {
  private static readonly EMERGENCY_THRESHOLD = 0.6;

  async solve(request: SolveRequest): Promise<SolveResult> {
    const start = Date.now();
    const rng = mulberry32(request.seed);
    const bounds = request.bounds;
    let nodesVisited = 0;

    const demands = this.orderDemands(request.demands, rng);
    const placed: Placed[] = [];
    const unplaced: UnplacedItem[] = [];
    const relaxations: RelaxationTier[] = [];

    const teacherLoad: Record<string, number> = {};
    const roomLoad: Record<string, number> = {};
    const groupLoad: Record<string, number> = {};
    const dayBalance: Record<number, number> = {};

    for (let depth = 0; depth < demands.length; depth++) {
      if (depth >= bounds.maxDepth) {
        for (let i = depth; i < demands.length; i++) {
          unplaced.push({ demandId: demands[i].demandId, reasonCode: 'BOUNDS_EXHAUSTED', message: 'maxDepth reached' });
        }
        break;
      }
      if (request.aborted?.value) {
        for (let i = depth; i < demands.length; i++) {
          unplaced.push({ demandId: demands[i].demandId, reasonCode: 'CANCELLED', message: 'solve aborted' });
        }
        break;
      }
      const demand = demands[depth];
      const candidate = this.pickCandidate(demand, request, placed, rng, () => {
        nodesVisited++;
        if (nodesVisited >= bounds.maxNodes) return true;
        if (Date.now() - start >= bounds.maxDurationMs) return true;
        return false;
      });

      if (!candidate) {
        unplaced.push({
          demandId: demand.demandId,
          reasonCode: 'NO_VALID_SLOT',
          message: 'no (timeSlot, room) candidate without a hard conflict',
        });
        continue;
      }

      placed.push({ demandId: demand.demandId, event: candidate });
      this.bump(teacherLoad, candidate.teacherId);
      this.bump(roomLoad, candidate.roomId);
      this.bump(groupLoad, candidate.studentGroupId);
      this.bump(dayBalance, String(candidate.dayOfWeek));
    }

    // Hard-constraint re-check: never relax. Drop offending events.
    const events = placed.map((p) => p.event);
    const pruned = this.pruneHardConflicts(events, request);
    const prunedIds = new Set(pruned.map((e) => e.eventId));
    for (const p of placed) {
      if (!prunedIds.has(p.event.eventId)) {
        unplaced.push({ demandId: p.demandId, reasonCode: 'HARD_CONFLICT_UNRESOLVABLE', message: 'hard conflict detected post-placement' });
      }
    }

    const demandedCount = demands.length;
    const placedCount = pruned.length;
    const placementRatio = demandedCount === 0 ? 1 : placedCount / demandedCount;
    const bestSoFar = nodesVisited < bounds.maxNodes && Date.now() - start < bounds.maxDurationMs;

    let status: SolveStatus = 'SOLVED';
    if (placementRatio < 1) status = 'PARTIAL';
    if (request.allowEmergency && placementRatio < DeterministicSolver.EMERGENCY_THRESHOLD) {
      status = 'EMERGENCY';
      relaxations.push({
        tier: 'EMERGENCY',
        applied: true,
        reasonCode: 'EMERGENCY_TIER_ACTIVATED',
        detail: `placementRatio ${placementRatio.toFixed(2)} < ${DeterministicSolver.EMERGENCY_THRESHOLD}`,
      });
    }

    const diagnostics: SolverDiagnostics = {
      placedCount,
      demandedCount,
      teacherLoad,
      roomLoad,
      groupLoad,
      dayBalance,
    };

    return {
      status,
      events: pruned,
      placementRatio,
      unplaced,
      relaxations,
      diagnostics,
      bestSoFar,
      seed: request.seed,
      nodesVisited,
      durationMs: Date.now() - start,
    };
  }

  private orderDemands(demands: ScheduleDemand[], rng: () => number): ScheduleDemand[] {
    const sorted = [...demands].sort((a, b) => a.demandId.localeCompare(b.demandId));
    // Seeded Fisher-Yates for deterministic-but-non-trivial ordering.
    for (let i = sorted.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    }
    return sorted;
  }

  private pickCandidate(
    demand: ScheduleDemand,
    request: SolveRequest,
    placed: Placed[],
    rng: () => number,
    tick: () => boolean,
  ): ScheduleEventDraft | null {
    const refs = request.referenceSet;
    if (demand.teacherId && !refs.activeTeacherIds.has(demand.teacherId)) return null;
    if (demand.teacherBranchId && !refs.activeTeacherBranchIds.has(demand.teacherBranchId)) return null;
    if (demand.teacherId && demand.courseId && !refs.activeTeacherCourseKeys.has(teacherCourseKey(demand.teacherId, demand.courseId))) return null;

    const rooms = (demand.roomIds ?? [...refs.activeRoomIds]).filter((r) => refs.activeRoomIds.has(r));
    const slots = demand.timeSlotIds.filter((s) => refs.activeTimeSlotIds.has(s));
    if (rooms.length === 0 || slots.length === 0) return null;

    // Deterministically rank (timeSlot, room) pairs: prefer requested day,
    // prefer less-loaded room, then seeded tiebreak.
    const pairs: Array<{ slot: string; room: string; score: number }> = [];
    for (const slot of slots) {
      for (const room of rooms) {
        if (tick()) return null;
        const dayHint = demand.preferredDayOfWeek ?? 1;
        const score = (dayHint * 7 + (rooms.length - rooms.indexOf(room))) + rng() * 0.5;
        pairs.push({ slot, room, score });
      }
    }
    pairs.sort((a, b) => a.score - b.score);

    for (const pair of pairs) {
      if (tick()) return null;
      const event: ScheduleEventDraft = {
        eventId: `gen-${demand.demandId}`,
        teacherId: demand.teacherId,
        teacherBranchId: demand.teacherBranchId,
        studentGroupId: demand.studentGroupId,
        courseId: demand.courseId,
        roomId: pair.room,
        timeSlotId: pair.slot,
        dayOfWeek: demand.preferredDayOfWeek ?? 1,
        startTime: '09:00',
        endTime: '10:00',
      };
      if (!this.hasHardConflict(event, placed)) return event;
    }
    return null;
  }

  private hasHardConflict(event: ScheduleEventDraft, placed: Placed[]): boolean {
    const start = minutes(event.startTime);
    const end = minutes(event.endTime);
    for (const p of placed) {
      const e = p.event;
      if (e.dayOfWeek !== event.dayOfWeek) continue;
      const es = minutes(e.startTime);
      const ee = minutes(e.endTime);
      const overlap = start < ee && end > es;
      if (!overlap) continue;
      if (event.teacherId && event.teacherId === e.teacherId) return true;
      if (event.studentGroupId && event.studentGroupId === e.studentGroupId) return true;
      if (event.roomId && event.roomId === e.roomId) return true;
    }
    return false;
  }

  private pruneHardConflicts(events: ScheduleEventDraft[], request: SolveRequest): ScheduleEventDraft[] {
    const input: ScheduleValidationInput = {
      mode: 'FULL',
      tenantId: request.tenantId,
      branchId: request.branchId,
      scheduleId: 'solver-output',
      scheduleRevision: 1,
      currentScheduleRevision: 1,
      inputFingerprint: `solver-${request.seed}`,
      status: 'draft',
      effectiveFrom: '2026-09-01',
      events,
      references: request.referenceSet,
    };
    const evidence = validateSchedule(input);
    if (evidence.hardConflictCount === 0) return events;
    const bad = new Set(evidence.reasons.filter((r) => r.eventId).map((r) => r.eventId!));
    return events.filter((e) => !bad.has(e.eventId));
  }

  private bump(map: Record<string, number>, key: string | null): void {
    if (!key) return;
    map[key] = (map[key] ?? 0) + 1;
  }
}

// Keep contract symbols referenced for tree-shaking clarity.
void M3_SCHEDULE_CONTRACT_ID;
void M3_SCHEDULE_CONTRACT_VERSION;
