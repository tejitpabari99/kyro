/**
 * `generateSyntheticHistory` (M4-11, 09 M4 exit / 06 §8 / 05 §4) — the
 * "big-data fixture" the M4-11 perf-budget test (and, per that task's own
 * text, M5's import-perf work + 08 §7's spot-checks) load into a real
 * database to exercise `WorkoutRepositoryImpl.statsFeed`/`setsForExercise`
 * and `domain/stats-buckets.ts`/`domain/records.ts` at 1000+-workout,
 * 5-year scale. Extends `workout-builder.ts`'s fixture module rather than
 * inventing a second DSL — but that file's own header is explicit that its
 * `FixtureSet` shape is `weight_reps`-only "today" (a documented TODO, not
 * an oversight); this module needs every `exercise_type` (04 §4's
 * per-type stats/chart spread) so it works directly in row-shaped data
 * instead of stretching that DSL over a shape it was never built for.
 *
 * Pure generation only — no I/O, no `SqliteDriver` — mirrors
 * `workout-builder.ts`'s own posture. `./synthetic-history-loader.ts` is the
 * (impure) bulk-insert half that turns this module's output into real
 * `exercises`/`workouts`/`workout_exercises`/`sets` rows.
 *
 * ## Roster: one exercise per `exercise_type`, plus two `weight_reps`
 *
 * `SYNTHETIC_EXERCISES` below is 9 entries: 7 are real
 * `assets/exercise-db.json` ids (hand-copied fields, same "copy the real
 * row" convention `src/features/exercises/__tests__/exercise-fixtures.ts`
 * already established) covering every `exercise_type` the bundled dataset
 * actually contains at least one of; the 8th `exercise_type`
 * (`weight_duration`) has **zero** real rows in the whole 873-exercise
 * bundle (verified: `exercises.filter(e => e.exercise_type ===
 * 'weight_duration').length === 0`), so that one entry is an invented
 * custom-shaped id instead of a copied real one — still a legal `exercises`
 * row, just never coincides with a real seeded builtin. A second
 * `weight_reps` entry is included (two total) so the two heaviest-weighted
 * ids in {@link EXERCISE_WEIGHTS} can each accumulate "low-thousands rows"
 * of history on their own (05 §4's own phrase for the records-computation
 * perf case) rather than every type having identical, thin history depth.
 *
 * ## Weighting + scheduling
 *
 * Each workout picks 4-6 exercises via weighted-without-replacement
 * sampling ({@link EXERCISE_WEIGHTS}: the two `weight_reps` ids weighted 4x
 * every other type's single id) — mirrors real training logs, where
 * compound weight_reps lifts dominate session composition and every other
 * type appears less often but still regularly (stats dashboard's per-type
 * volume / muscle-distribution cards, 04 §4.1, need every type actually
 * present to be a meaningful test, not just technically reachable).
 * Workouts are spread deterministically across a 5-year span ending "now"
 * (evenly spaced by index + bounded jitter, both from a seeded PRNG —
 * `mulberry32`, so two calls with the same `seed` produce byte-identical
 * output, useful for the perf test's own "log the actual counts" step).
 *
 * Sets-per-occurrence and the value fields populated vary by
 * `exercise_type` ({@link makeSets}) — weight_reps/bodyweight/assisted
 * exercises get a mild linear "progression" keyed off how many times that
 * exercise has already occurred earlier in the generated history (nice-to-
 * have realism per this task's own text, not required), everything else
 * gets plausible fixed ranges. Every generated set is `isCompleted: true`
 * — real completed-workout history can never contain an unchecked set
 * (`WorkoutRepositoryImpl.finish` deletes every `is_completed = 0` row at
 * finish time, `./workout-repository.ts`'s own header, step 1), so a
 * synthetic set claiming otherwise would misrepresent the shape real
 * history actually has.
 */
import type { ExerciseType, MuscleGroup, SetType } from '@/domain/enums';

// ---------------------------------------------------------------------------
// Roster
// ---------------------------------------------------------------------------

export interface SyntheticExercise {
  id: string;
  exerciseType: ExerciseType;
  primaryMuscleGroup: MuscleGroup;
  secondaryMuscleGroups: MuscleGroup[];
}

/** See file header, "Roster" — 7 real `assets/exercise-db.json` ids + 1 invented `weight_duration` id + a 2nd `weight_reps` id. */
export const SYNTHETIC_EXERCISES: readonly SyntheticExercise[] = [
  {
    id: 'Ab_Crunch_Machine',
    exerciseType: 'weight_reps',
    primaryMuscleGroup: 'abdominals',
    secondaryMuscleGroups: [],
  },
  {
    id: 'Barbell_Bench_Press_-_Medium_Grip',
    exerciseType: 'weight_reps',
    primaryMuscleGroup: 'chest',
    secondaryMuscleGroups: ['shoulders', 'triceps'],
  },
  {
    id: '3_4_Sit-Up',
    exerciseType: 'reps_only',
    primaryMuscleGroup: 'abdominals',
    secondaryMuscleGroups: [],
  },
  {
    id: 'Bench_Dips',
    exerciseType: 'bodyweight_reps',
    primaryMuscleGroup: 'triceps',
    secondaryMuscleGroups: ['chest', 'shoulders'],
  },
  {
    id: 'Band_Assisted_Pull-Up',
    exerciseType: 'bodyweight_assisted_reps',
    primaryMuscleGroup: 'lats',
    secondaryMuscleGroups: ['abdominals', 'forearms', 'upper_back'],
  },
  {
    id: '90_90_Hamstring',
    exerciseType: 'duration',
    primaryMuscleGroup: 'hamstrings',
    secondaryMuscleGroups: ['calves'],
  },
  {
    // Invented — no real `weight_duration` row exists anywhere in
    // `assets/exercise-db.json` (file header). `is_custom = 1` on insert
    // (`./synthetic-history-loader.ts`).
    id: 'synthetic-weighted-plank-hold',
    exerciseType: 'weight_duration',
    primaryMuscleGroup: 'abdominals',
    secondaryMuscleGroups: ['shoulders'],
  },
  {
    id: 'Elliptical_Trainer',
    exerciseType: 'distance_duration',
    primaryMuscleGroup: 'cardio',
    secondaryMuscleGroups: ['calves', 'glutes', 'hamstrings'],
  },
  {
    id: 'Bear_Crawl_Sled_Drags',
    exerciseType: 'short_distance_weight',
    primaryMuscleGroup: 'quadriceps',
    secondaryMuscleGroups: ['calves', 'glutes', 'hamstrings'],
  },
] as const;

const ROSTER_BY_ID = new Map(SYNTHETIC_EXERCISES.map((exercise) => [exercise.id, exercise]));

/** Weighted-sampling pool weights (file header, "Weighting + scheduling") — the two `weight_reps` ids 4x every other (single) id. */
const EXERCISE_WEIGHTS: readonly { id: string; weight: number }[] = SYNTHETIC_EXERCISES.map((exercise) => ({
  id: exercise.id,
  weight: exercise.exerciseType === 'weight_reps' ? 4 : 1,
}));

// ---------------------------------------------------------------------------
// Deterministic PRNG (mulberry32) — seeded, reproducible across calls
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickExerciseIds(prng: () => number, count: number): string[] {
  const pool: string[] = [];
  for (const { id, weight } of EXERCISE_WEIGHTS) {
    for (let i = 0; i < weight; i += 1) pool.push(id);
  }

  const picked = new Set<string>();
  const cappedCount = Math.min(count, EXERCISE_WEIGHTS.length);
  let guard = 0;
  while (picked.size < cappedCount && guard < cappedCount * 200) {
    picked.add(pool[Math.floor(prng() * pool.length)]!);
    guard += 1;
  }
  return Array.from(picked);
}

// ---------------------------------------------------------------------------
// Set generation (per exercise_type — file header)
// ---------------------------------------------------------------------------

export interface SyntheticSet {
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function set(overrides: Partial<SyntheticSet> & { setType?: SetType }): SyntheticSet {
  return {
    setType: overrides.setType ?? 'normal',
    weightKg: overrides.weightKg ?? null,
    reps: overrides.reps ?? null,
    distanceMeters: overrides.distanceMeters ?? null,
    durationSeconds: overrides.durationSeconds ?? null,
  };
}

/**
 * Builds this occurrence's sets for `exercise` — `occurrenceIndex` is how
 * many times this exercise id has already appeared earlier in the
 * generated history (0-based), used for the mild progressive-overload
 * nice-to-have (file header). One exhaustive `switch` over every
 * `ExerciseType`, `never`-guarded default — same exhaustiveness posture
 * `domain/records.ts`'s `eligibilityForExerciseType` already established,
 * so a new `ExerciseType` added to `enums.ts` without a case here fails
 * `tsc --noEmit`.
 */
function makeSets(exercise: SyntheticExercise, occurrenceIndex: number, prng: () => number): SyntheticSet[] {
  const withWarmup = occurrenceIndex % 3 === 0;

  switch (exercise.exerciseType) {
    case 'weight_reps': {
      const baseWeight = 40 + (occurrenceIndex % 40) * 0.5;
      const sets: SyntheticSet[] = [];
      if (withWarmup) {
        sets.push(set({ setType: 'warmup', weightKg: round1(baseWeight * 0.5), reps: 10 }));
      }
      for (let i = 0; i < 3; i += 1) {
        sets.push(
          set({ weightKg: round1(baseWeight + i * 2.5), reps: 6 + Math.floor(prng() * 6) }),
        );
      }
      return sets;
    }
    case 'reps_only':
      return Array.from({ length: 3 }, () => set({ reps: 8 + Math.floor(prng() * 10) }));
    case 'bodyweight_reps': {
      const addedWeight = Math.min(20, Math.floor(occurrenceIndex / 5));
      return Array.from({ length: 3 }, () =>
        set({ weightKg: addedWeight, reps: 6 + Math.floor(prng() * 8) }),
      );
    }
    case 'bodyweight_assisted_reps': {
      const assistanceWeight = Math.max(0, 30 - Math.floor(occurrenceIndex / 4));
      return Array.from({ length: 3 }, () =>
        set({ weightKg: assistanceWeight, reps: 5 + Math.floor(prng() * 6) }),
      );
    }
    case 'duration':
      return Array.from({ length: 3 }, () =>
        set({ durationSeconds: 30 + Math.floor(prng() * 60) }),
      );
    case 'weight_duration':
      return Array.from({ length: 3 }, () =>
        set({ weightKg: 5 + Math.floor(prng() * 15), durationSeconds: 20 + Math.floor(prng() * 40) }),
      );
    case 'distance_duration':
      return Array.from({ length: 2 }, () =>
        set({
          distanceMeters: 1000 + Math.floor(prng() * 4000),
          durationSeconds: 300 + Math.floor(prng() * 1200),
        }),
      );
    case 'short_distance_weight':
      return Array.from({ length: 3 }, () =>
        set({ weightKg: 20 + Math.floor(prng() * 40), distanceMeters: 10 + Math.floor(prng() * 20) }),
      );
    default: {
      const exhaustive: never = exercise.exerciseType;
      throw new Error(`synthetic-history.makeSets: unhandled exercise_type "${exhaustive as string}".`);
    }
  }
}

// ---------------------------------------------------------------------------
// Workout assembly
// ---------------------------------------------------------------------------

export interface SyntheticWorkoutExercise {
  exerciseId: string;
  sets: SyntheticSet[];
}

export interface SyntheticWorkout {
  id: string;
  title: string;
  startTime: number;
  endTime: number;
  exercises: SyntheticWorkoutExercise[];
}

export interface SyntheticHistoryDataset {
  exercises: readonly SyntheticExercise[];
  workouts: SyntheticWorkout[];
}

export interface SyntheticHistoryOptions {
  /** Default 1040 — ~4/week across the 5-year span, comfortably over M4-11's "1000+" floor. */
  workoutCount?: number;
  /** Default `new Date()` — the span end. */
  now?: Date;
  /** Default a fixed constant — same `seed` + same `workoutCount`/`now` always produces byte-identical output. */
  seed?: number;
}

const DEFAULT_WORKOUT_COUNT = 1040;
const FIVE_YEARS_MS = 5 * 365.25 * 24 * 60 * 60 * 1000;
const DEFAULT_SEED = 0x5eed1e55;

/** Generates the 5-year, 1000+-workout synthetic history — see file header. */
export function generateSyntheticHistory(options: SyntheticHistoryOptions = {}): SyntheticHistoryDataset {
  const workoutCount = options.workoutCount ?? DEFAULT_WORKOUT_COUNT;
  const now = options.now ?? new Date();
  const prng = mulberry32(options.seed ?? DEFAULT_SEED);

  const spanStart = now.getTime() - FIVE_YEARS_MS;
  const occurrenceCounts = new Map<string, number>();
  const workouts: SyntheticWorkout[] = [];

  for (let i = 0; i < workoutCount; i += 1) {
    const frac = workoutCount === 1 ? 1 : i / (workoutCount - 1);
    const jitterMs = (prng() - 0.5) * (FIVE_YEARS_MS / workoutCount) * 0.6;
    const startTime = Math.min(
      now.getTime() - 1,
      Math.round(spanStart + frac * FIVE_YEARS_MS + jitterMs),
    );
    const durationMinutes = 40 + prng() * 40;
    const endTime = Math.round(startTime + durationMinutes * 60_000);

    const exerciseCount = 4 + (i % 3);
    const exerciseIds = pickExerciseIds(prng, exerciseCount);

    const exercises = exerciseIds.map((exerciseId) => {
      const exercise = ROSTER_BY_ID.get(exerciseId)!;
      const occurrenceIndex = occurrenceCounts.get(exerciseId) ?? 0;
      occurrenceCounts.set(exerciseId, occurrenceIndex + 1);
      return { exerciseId, sets: makeSets(exercise, occurrenceIndex, prng) };
    });

    workouts.push({
      id: `synthetic-workout-${i}`,
      title: `Synthetic Workout ${i}`,
      startTime,
      endTime,
      exercises,
    });
  }

  return { exercises: SYNTHETIC_EXERCISES, workouts };
}
