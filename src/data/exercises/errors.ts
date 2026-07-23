/**
 * Typed errors for `ExerciseRepository` (M1-06) — 05 §6 / 03 §5's
 * constraints, each surfaced as a distinct `Error` subclass (checkable via
 * `instanceof`) rather than letting a raw SQLite constraint-violation
 * message (or a generic `Error`) leak through to callers.
 */

/** Thrown by `create`/`update`/`restore` when the target name collides, case-insensitively, with an already-active exercise (03 §5: "unique among non-archived exercises, case-insensitive"). */
export class DuplicateExerciseNameError extends Error {
  constructor(public readonly attemptedName: string) {
    super(`An active exercise named "${attemptedName}" already exists.`);
    this.name = 'DuplicateExerciseNameError';
  }
}

/** Thrown by `update`/`archive`/`restore`/`delete` (and any other id-keyed lookup) when no row matches `id`. */
export class ExerciseNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`Exercise "${id}" was not found.`);
    this.name = 'ExerciseNotFoundError';
  }
}

/**
 * Thrown by `update` when a patch attempts to change `exerciseType` on an
 * exercise that already has at least one logged set (03 §5: "immutable
 * after the first logged set — changing measurement semantics would corrupt
 * history").
 */
export class ExerciseTypeImmutableError extends Error {
  constructor(public readonly id: string) {
    super(
      `Exercise "${id}" has at least one logged set; its exercise type can no longer be changed.`,
    );
    this.name = 'ExerciseTypeImmutableError';
  }
}

/**
 * Thrown by `delete` when the exercise is referenced by at least one
 * `workout_exercises`/`routine_exercises` row (05 §6: "throws IfReferenced").
 * Callers (03 §5) should catch this and offer the Archive path instead.
 */
export class ExerciseReferencedError extends Error {
  constructor(
    public readonly id: string,
    public readonly referenceCount: number,
  ) {
    super(
      `Exercise "${id}" is referenced by ${referenceCount} workout/routine row(s) and cannot be deleted; archive it instead.`,
    );
    this.name = 'ExerciseReferencedError';
  }
}

/**
 * Thrown by `update`/`delete` when targeting a built-in (`is_custom = 0`)
 * row — built-ins are immutable except via the dataset-seeding path
 * (`seedBuiltins`) and the user-facing "Duplicate as Custom" flow (03 §1/§5),
 * never a direct `update`/`delete` call.
 */
export class BuiltinExerciseImmutableError extends Error {
  constructor(public readonly id: string) {
    super(`Exercise "${id}" is a built-in exercise and cannot be edited or deleted directly.`);
    this.name = 'BuiltinExerciseImmutableError';
  }
}
