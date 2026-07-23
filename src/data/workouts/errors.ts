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

/** Thrown by any id-keyed lookup/mutator (`discard`, `finish`, `updateMeta`, …) when no `workouts` row matches `id`. */
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

// M2-02 adds WorkoutExerciseNotFoundError, SetNotFoundError, and
// ReorderMismatchError here, alongside the granular mutators that throw
// them (addExercises/removeExercise/reorderExercises/addSet/updateSet/…).
