/**
 * Fixture builder helpers (08 §1): a small fluent DSL for constructing
 * workout-shaped test data without hand-rolling nested object literals in
 * every test. Usage (08 §1's canonical example):
 *
 *   aWorkout().with(exercise('bench').sets('80x8', 'W:40x10'))
 *
 * This is a skeleton (M0-03 scope): the shape lands now, most of it is
 * genuinely useful today (set-spec parsing, exercise/workout composition),
 * and a few methods are explicit stubs for concepts that don't have a
 * domain model yet (supersets, per-set RPE, non-weight_reps set types) —
 * flesh those out incrementally as the tasks that introduce them land
 * (each stub says which one). Do not treat the stubs as load-bearing; they
 * exist so later tasks extend one established pattern instead of inventing
 * a new fixture DSL each time.
 */

/** Mirrors `set_type` (05 §2.2): `normal · warmup · failure · dropset`. */
export type FixtureSetType = 'normal' | 'warmup' | 'failure' | 'dropset';

export interface FixtureSet {
  type: FixtureSetType;
  weightKg: number;
  reps: number;
  checked: boolean;
}

export interface FixtureExercise {
  name: string;
  sets: FixtureSet[];
  /** TODO(M1+, once superset/group-id lands in the domain model). */
  supersetGroup: number | null;
}

export interface FixtureWorkout {
  title: string;
  exercises: FixtureExercise[];
}

const SET_SPEC_PATTERN = /^(?:([A-Z]+):)?(\d+(?:\.\d+)?)x(\d+)$/;

const SET_TYPE_PREFIXES: Record<string, FixtureSetType> = {
  W: 'warmup',
  F: 'failure',
  D: 'dropset',
};

/**
 * Parse a compact set spec into a `FixtureSet`.
 *
 * Format: `[PREFIX:]WEIGHTxREPS` — e.g. `"80x8"` (normal, 80 kg × 8 reps),
 * `"W:40x10"` (warm-up, 40 kg × 10 reps). Known prefixes: `W` (warmup),
 * `F` (failure), `D` (dropset); no prefix means `normal`.
 *
 * TODO(M1+): extend to non-`weight_reps` exercise types (bodyweight,
 * duration, distance, distance+duration — 05 §2) once those set shapes are
 * needed by tests; today every fixture set is `weight_reps`.
 */
export function parseSetSpec(spec: string): FixtureSet {
  const match = SET_SPEC_PATTERN.exec(spec);
  if (!match) {
    throw new Error(
      `Fixture set spec "${spec}" does not match "[PREFIX:]WEIGHTxREPS" (e.g. "80x8", "W:40x10").`,
    );
  }

  const [, prefix, weight, reps] = match;
  const type = prefix ? SET_TYPE_PREFIXES[prefix] : 'normal';
  if (!type) {
    throw new Error(
      `Unknown fixture set prefix "${prefix}" in spec "${spec}". Known prefixes: ${Object.keys(
        SET_TYPE_PREFIXES,
      ).join(', ')}.`,
    );
  }

  return { type, weightKg: Number(weight), reps: Number(reps), checked: true };
}

export class ExerciseBuilder {
  private readonly exercise: FixtureExercise;

  constructor(name: string) {
    this.exercise = { name, sets: [], supersetGroup: null };
  }

  /** Append sets parsed from spec strings — see `parseSetSpec`. */
  sets(...specs: string[]): this {
    this.exercise.sets.push(...specs.map(parseSetSpec));
    return this;
  }

  /** Mark the last-added set as unchecked (still-pending). */
  lastUnchecked(): this {
    const last = this.exercise.sets.at(-1);
    if (!last) {
      throw new Error('lastUnchecked() called before any sets() — nothing to mark.');
    }
    last.checked = false;
    return this;
  }

  /** TODO(M1+, once superset grouping exists in the domain model). */
  inSuperset(_groupId: number): this {
    throw new Error('ExerciseBuilder.inSuperset() is not implemented yet — see M1 superset work.');
  }

  build(): FixtureExercise {
    return this.exercise;
  }
}

/** Start building a fixture exercise — see module docs for the DSL example. */
export function exercise(name: string): ExerciseBuilder {
  return new ExerciseBuilder(name);
}

export class WorkoutBuilder {
  private workout: FixtureWorkout = { title: 'Fixture Workout', exercises: [] };

  /** Attach one or more exercises built via `exercise(...)`. */
  with(...builders: ExerciseBuilder[]): this {
    this.workout.exercises.push(...builders.map((builder) => builder.build()));
    return this;
  }

  titled(title: string): this {
    this.workout.title = title;
    return this;
  }

  /** TODO(M1+, once routines exist in the domain model). */
  fromRoutine(_routineId: number): this {
    throw new Error('WorkoutBuilder.fromRoutine() is not implemented yet — see M1 routine work.');
  }

  build(): FixtureWorkout {
    return this.workout;
  }
}

/** Start building a fixture workout — see module docs for the DSL example. */
export function aWorkout(): WorkoutBuilder {
  return new WorkoutBuilder();
}
