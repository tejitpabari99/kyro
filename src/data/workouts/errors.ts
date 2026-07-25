/**
 * Typed errors for `WorkoutRepository` (M2-01, extended M2-02) — mirrors the
 * pattern `src/data/exercises/errors.ts` (M1-06) established: every
 * repository-level invariant violation is a distinct `Error` subclass
 * (checkable via `instanceof`), never a raw SQLite constraint message or a
 * generic `Error` leaking to callers. Only the lifecycle-method errors land
 * in the M2-01 commit — the granular-mutator errors (`WorkoutExerciseNotFoundError`,
 * `SetNotFoundError`, `ReorderMismatchError`) are added in M2-02, once the
 * methods that throw them exist (keeps `08` §3's `src/data/**` coverage gate
 * meaningful: an unused error class is uncovered by construction).
 */

/** Thrown by any id-keyed lookup/mutator (`discard`, `finish`, `updateMeta`, `startFromWorkout` (M3-07, "Repeat Workout" — see `workout-repository.ts`'s header), …) when no `workouts` row matches `id`. */
export class WorkoutNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Workout "${id}" was not found.`);
    this.name = 'WorkoutNotFoundError';
  }
}

/**
 * Thrown by `discard`/`finish` when the target workout's `state` is not
 * `'active'` — both are lifecycle transitions that only make sense against
 * the currently-active workout (05 §3.2 invariants).
 */
export class WorkoutNotActiveError extends Error {
  constructor(public readonly id: string) {
    super(`Workout "${id}" is not active.`);
    this.name = 'WorkoutNotActiveError';
  }
}

/**
 * Thrown by `startEmpty` (and, in the future, `startFromRoutine`, M3-05)
 * when an active workout already exists — the one-active-workout invariant
 * (05 §3.2 `idx_one_active_workout`, 02 §1). Callers should catch this and
 * present the resume/discard-and-start action sheet (02 §1).
 */
export class ActiveWorkoutExistsError extends Error {
  constructor(public readonly activeWorkoutId: string) {
    super(`An active workout ("${activeWorkoutId}") already exists.`);
    this.name = 'ActiveWorkoutExistsError';
  }
}

/**
 * Thrown by `startFromRoutine` (M3-05) when `routineId` does not resolve to
 * a `routines` row. Named (and kept) separately from
 * `src/data/routines/errors.ts`'s own `RoutineNotFoundError` rather than
 * imported from there — mirrors `RoutineRepositoryImpl.createFromWorkout`'s
 * own `WorkoutNotFoundForRoutineError` (defined in `data/routines/errors.ts`,
 * not imported from `data/workouts/errors.ts`): each repository keeps its
 * own error classes self-contained rather than depending on a sibling
 * repository's module, even for a lookup of a sibling table's row.
 */
export class RoutineNotFoundForWorkoutError extends Error {
  constructor(public readonly routineId: string) {
    super(`Routine "${routineId}" was not found (startFromRoutine).`);
    this.name = 'RoutineNotFoundForWorkoutError';
  }
}

/** Thrown when a `workout_exercises` id (optionally scoped to a `workoutId`) does not resolve to a row. */
export class WorkoutExerciseNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Workout exercise "${id}" was not found.`);
    this.name = 'WorkoutExerciseNotFoundError';
  }
}

/** Thrown when a `sets` id does not resolve to a row. */
export class SetNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Set "${id}" was not found.`);
    this.name = 'SetNotFoundError';
  }
}

/**
 * Thrown by `reorderExercises` when the supplied id list isn't exactly a
 * permutation of the workout's current `workout_exercises` ids (missing,
 * extra, or foreign ids) — a defensive guard against silently corrupting
 * `position` ordering from a stale client-side list.
 */
export class ReorderMismatchError extends Error {
  constructor(public readonly workoutId: string) {
    super(
      `reorderExercises: the supplied id list for workout "${workoutId}" does not exactly match its current exercises.`,
    );
    this.name = 'ReorderMismatchError';
  }
}
