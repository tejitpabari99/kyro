/**
 * Typed errors for `RoutineRepository` (M3-01) — same pattern
 * `src/data/exercises/errors.ts` (M1-06) / `src/data/workouts/errors.ts`
 * (M2-01/M2-02) established: every repository-level invariant violation is
 * a distinct `Error` subclass (checkable via `instanceof`), never a raw
 * SQLite constraint message or a generic `Error` leaking to callers.
 */

/** Thrown by any id-keyed lookup/mutator (`get`'s internal helpers, `update`, `delete`, `duplicate`, `moveToFolder`, `reorderRoutines`'s permutation check, …) when no `routines` row matches `id`. */
export class RoutineNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Routine "${id}" was not found.`);
    this.name = 'RoutineNotFoundError';
  }
}

/** Thrown by any folder-id-keyed lookup/mutator (`renameFolder`, `setFolderCollapsed`, `deleteFolder`, `create`/`update`/`moveToFolder` when the target `folderId` doesn't exist, …) when no `routine_folders` row matches `id`. */
export class RoutineFolderNotFoundError extends Error {
  constructor(public readonly id: number) {
    super(`Routine folder "${id}" was not found.`);
    this.name = 'RoutineFolderNotFoundError';
  }
}

/**
 * Thrown by `reorderRoutines` when the supplied id list isn't exactly a
 * permutation of `folderId`'s current routine ids (missing, extra, or
 * foreign ids) — a defensive guard against silently corrupting `position`
 * ordering from a stale client-side list. Same contract as
 * `WorkoutRepository`'s `ReorderMismatchError`.
 */
export class RoutineReorderMismatchError extends Error {
  constructor(public readonly folderId: number | null) {
    super(
      `reorderRoutines: the supplied id list for folder ${folderId === null ? 'null (My Routines)' : `"${folderId}"`} does not exactly match its current routines.`,
    );
    this.name = 'RoutineReorderMismatchError';
  }
}

/** Thrown by `reorderFolders` when the supplied id list isn't exactly a permutation of every existing `routine_folders` id. */
export class FolderReorderMismatchError extends Error {
  constructor() {
    super('reorderFolders: the supplied id list does not exactly match the existing folders.');
    this.name = 'FolderReorderMismatchError';
  }
}

/**
 * Thrown by `create`/`update` (and, defensively, `duplicate`/
 * `createFromWorkout`'s internal builders) when a `routine_sets` input sets
 * both `reps` and `repRangeStart` — the repository-boundary re-enforcement
 * of the `routine_sets_reps_xor_range_check` CHECK (05 §3.3 / `schema.ts`),
 * per this task's explicit instruction to raise a clear typed error before
 * ever reaching the DB rather than relying solely on the raw SQLite CHECK
 * failure.
 */
export class RepsXorRangeViolationError extends Error {
  constructor() {
    super(
      'A routine set target cannot set both a fixed "reps" value and a rep range (repRangeStart/repRangeEnd) — choose one.',
    );
    this.name = 'RepsXorRangeViolationError';
  }
}

/** Thrown by `createFromWorkout`/`updateFromWorkout` when the source `workoutId` does not resolve to a (non-deleted) `workouts` row. */
export class WorkoutNotFoundForRoutineError extends Error {
  constructor(public readonly workoutId: string) {
    super(`Workout "${workoutId}" was not found (createFromWorkout/updateFromWorkout).`);
    this.name = 'WorkoutNotFoundForRoutineError';
  }
}

/**
 * Thrown by `updateFromWorkout` (M3-06, 04 §2.4) when `workoutId`'s own
 * `routine_id` doesn't match the `routineId` argument — a defensive
 * scope-check against a caller writing one routine's workout structure back
 * onto an unrelated routine (mirrors the "validate cross-entity references"
 * convention `WorkoutNotFoundForRoutineError`/`RoutineNotFoundError` already
 * establish here, rather than silently proceeding with mismatched ids).
 */
export class WorkoutRoutineMismatchError extends Error {
  constructor(
    public readonly routineId: string,
    public readonly workoutId: string,
  ) {
    super(
      `updateFromWorkout: workout "${workoutId}" was not started from routine "${routineId}".`,
    );
    this.name = 'WorkoutRoutineMismatchError';
  }
}
