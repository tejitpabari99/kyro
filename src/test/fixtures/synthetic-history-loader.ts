/**
 * `insertSyntheticHistory` (M4-11) — the impure half of the synthetic-
 * history fixture (`./synthetic-history.ts`'s own header): turns a
 * generated {@link SyntheticHistoryDataset} into real `exercises`/
 * `workouts`/`workout_exercises`/`sets` rows against any `SqliteDriver`
 * (better-sqlite3 in Jest/scripts, `expo-sqlite` on device — the same
 * shared-driver-surface posture every repository in `src/data/` already
 * uses, `../../data/sqlite/driver.ts`'s own header).
 *
 * **Why a bulk-insert helper instead of the real
 * `startEmpty`/`addExercises`/`finish` mutator path**: M4-11's own task
 * brief allows exactly this ("go through real repo write paths (or a
 * documented bulk-insert helper that produces the same schema shape)") —
 * the thing that must reflect real production code paths is the *read*
 * side (`WorkoutRepositoryImpl.statsFeed`/`setsForExercise`, timed by
 * `__tests__/perf-budgets.test.ts`), not the one-time seeding of 1000+
 * workouts, which the real mutator path would make prohibitively slow in a
 * test run (each call awaits `generateUuid()` — real OS-CSPRNG-backed on
 * device — multiple times per workout, by design, `workout-repository.ts`'s
 * own header). This helper writes the exact same columns those mutators
 * write (compare `workout-repository.stats.test.ts`'s own hand-rolled
 * `insertWorkout`/`insertWorkoutExercise`/`insertSet` helpers — this is that
 * same, already-established pattern, scaled up and reused across three
 * callers instead of redefined a fourth time).
 *
 * **Idempotent exercise upsert**: every `exercises` row is inserted only if
 * an id-matching row doesn't already exist. This matters because the same
 * dataset is loaded into two very different starting states — a bare
 * migrated `:memory:` DB with no exercises at all (the perf test, and
 * `scripts/load-fixture.ts`'s own standalone file) vs. the real running
 * app's on-device DB, which already seeded all ~873 real builtins
 * (`seedBuiltinExercises`, M1-05) before this ever runs. 7 of
 * {@link SYNTHETIC_EXERCISES}'s 9 ids are real builtin ids, so on-device
 * this upsert is a no-op for those 7 and only actually inserts the one
 * invented `weight_duration` id (`synthetic-history.ts`'s own header) —
 * exactly the "reuse what's already there, add only what's missing"
 * behavior both call sites need without two different code paths.
 */
import type { SqliteDriver } from '../../data/sqlite/driver';
import type { SyntheticHistoryDataset } from './synthetic-history';

function ensureExercisesExist(driver: SqliteDriver, dataset: SyntheticHistoryDataset): void {
  const now = Date.now();
  for (const exercise of dataset.exercises) {
    const existing = driver.queryAll<{ id: string }>('SELECT id FROM exercises WHERE id = ?', [
      exercise.id,
    ]);
    if (existing.length > 0) continue;

    driver.execute(
      `INSERT INTO exercises
         (id, name, exercise_type, primary_muscle_group, secondary_muscle_groups,
          equipment, instructions, images, animation_uri, is_custom,
          uses_custom_metric, aliases, archived_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'none', '[]', '[]', NULL, 1, 0, '[]', NULL, ?, ?)`,
      [
        exercise.id,
        exercise.id,
        exercise.exerciseType,
        exercise.primaryMuscleGroup,
        JSON.stringify(exercise.secondaryMuscleGroups),
        now,
        now,
      ],
    );
  }
}

/** Result summary — the perf test and the dev-only loader script/screen both report these counts (EXECUTION-LOG.md's own evidence, and the on-screen result for the app loader). */
export interface InsertSyntheticHistoryResult {
  exerciseCount: number;
  workoutCount: number;
  setCount: number;
  elapsedMs: number;
}

/**
 * Bulk-inserts `dataset` into `driver` — see file header for why this is a
 * documented raw-SQL helper rather than the real mutator path. One
 * transaction for the whole dataset (06 §5.2's one-transaction-per-action
 * principle, applied to a single bulk load rather than per-workout).
 */
export function insertSyntheticHistory(
  driver: SqliteDriver,
  dataset: SyntheticHistoryDataset,
): InsertSyntheticHistoryResult {
  const startedAt = Date.now();
  let setCount = 0;

  driver.transaction(() => {
    ensureExercisesExist(driver, dataset);

    for (const workout of dataset.workouts) {
      driver.execute(
        `INSERT INTO workouts
           (id, title, description, routine_id, state, start_time, end_time,
            duration_pause_offset_ms, created_at, updated_at, deleted_at)
         VALUES (?, ?, NULL, NULL, 'completed', ?, ?, 0, ?, ?, NULL)`,
        [workout.id, workout.title, workout.startTime, workout.endTime, workout.startTime, workout.endTime],
      );

      workout.exercises.forEach((workoutExercise, position) => {
        const workoutExerciseId = `${workout.id}-we-${position}`;
        driver.execute(
          `INSERT INTO workout_exercises (id, workout_id, exercise_id, position, superset_id, notes, rest_seconds)
           VALUES (?, ?, ?, ?, NULL, NULL, NULL)`,
          [workoutExerciseId, workout.id, workoutExercise.exerciseId, position],
        );

        workoutExercise.sets.forEach((syntheticSet, setPosition) => {
          driver.execute(
            `INSERT INTO sets
               (id, workout_exercise_id, position, set_type, weight_kg, reps, distance_meters,
                duration_seconds, rpe, custom_metric, is_completed)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 1)`,
            [
              `${workoutExerciseId}-set-${setPosition}`,
              workoutExerciseId,
              setPosition,
              syntheticSet.setType,
              syntheticSet.weightKg,
              syntheticSet.reps,
              syntheticSet.distanceMeters,
              syntheticSet.durationSeconds,
            ],
          );
          setCount += 1;
        });
      });
    }
  });

  return {
    exerciseCount: dataset.exercises.length,
    workoutCount: dataset.workouts.length,
    setCount,
    elapsedMs: Date.now() - startedAt,
  };
}
