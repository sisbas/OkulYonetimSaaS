/**
 * SolverPort — deterministik schedule generation abstraction (P1B-06, #262).
 *
 * Phase 1: deterministic TypeScript heuristic + bounded backtracking.
 * Phase 2 (deferred): a second SolverPort impl wrapping OR-Tools CP-SAT in a
 * worker — swapped behind this same interface, non-breaking.
 *
 * Defined as an abstract class (not just an interface) so Nest can use it as a
 * DI token: `{ provide: SolverPort, useClass: DeterministicSolver }`.
 *
 * Contract guarantees (from issue acceptance criteria):
 *  - deterministic given the same seed + input
 *  - bounded by maxDepth / maxNodes / maxDurationMs
 *  - cancellable via the aborted flag checked every N nodes
 *  - HARD constraints are never relaxed (validator re-run on output)
 *  - EMERGENCY tier (if used) is draft-only and never auto-applied/published
 */

import type {
  ScheduleEventDraft,
  ScheduleReferenceSet,
} from '../m3-schedule-contract';

/** Allowed time-slot pool entry with its timing metadata. */
export type TimeSlotRef = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
};

/** A single demanded lecture to place. */
export type ScheduleDemand = {
  demandId: string;
  studentGroupId: string;
  courseId: string;
  teacherId: string | null;
  teacherBranchId: string | null;
  /** Allowed time-slot pool (with timing metadata). */
  timeSlots: TimeSlotRef[];
  /** Allowed room ids (optional scoping). */
  roomIds?: string[];
  /** Preferred day-of-week hint (1-7); heuristic honours it softly. */
  preferredDayOfWeek?: number;
};

export type UnplacedItem = {
  demandId: string;
  reasonCode: 'NO_VALID_SLOT' | 'HARD_CONFLICT_UNRESOLVABLE' | 'BOUNDS_EXHAUSTED' | 'CANCELLED';
  message: string;
};

/** Named soft-relaxation tier, explicit with reason codes. */
export type RelaxationTier = {
  tier: 'PREFER_TEACHER_PREFERENCE' | 'BALANCE_ROOM_USAGE' | 'EMERGENCY';
  applied: boolean;
  reasonCode: string;
  detail?: string;
};

export type SolverDiagnostics = {
  placedCount: number;
  demandedCount: number;
  teacherLoad: Record<string, number>;
  roomLoad: Record<string, number>;
  groupLoad: Record<string, number>;
  /** Pedagogical balance: load spread across days (lower stdev = more balanced). */
  dayBalance: Record<string, number>;
};

export type SolveStatus = 'SOLVED' | 'PARTIAL' | 'EMERGENCY';

export type SolveResult = {
  status: SolveStatus;
  events: ScheduleEventDraft[];
  placementRatio: number;
  unplaced: UnplacedItem[];
  relaxations: RelaxationTier[];
  diagnostics: SolverDiagnostics;
  /** best-so-far retention flag (heuristic may stop early on bounds). */
  bestSoFar: boolean;
  seed: number;
  nodesVisited: number;
  durationMs: number;
};

export type SolveBounds = {
  maxDepth: number;
  maxNodes: number;
  maxDurationMs: number;
};

export type SolveRequest = {
  tenantId: string;
  branchId: string;
  referenceSet: ScheduleReferenceSet;
  demands: ScheduleDemand[];
  seed: number;
  bounds: SolveBounds;
  correlationId: string;
  /** When true, allow the EMERGENCY tier (still draft-only, never auto-publish). */
  allowEmergency?: boolean;
  aborted?: { value: boolean };
};

export abstract class SolverPort {
  abstract solve(request: SolveRequest): Promise<SolveResult>;
}
