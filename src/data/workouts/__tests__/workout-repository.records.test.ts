/**
 * `WorkoutRepositoryImpl.setsForExercise` / `.exerciseHistoryWatermark`
 * integration tests (M4-02 acceptance gate) — same pattern
 * `workout-repository.mutators.test.ts` (M2-02) established: real
 * `better-sqlite3` against the migrated schema, raw-SQL fixture helpers for
 * the parts no repository method covers yet (exercises, arbitrary
 * `workout_exercises`/`sets` rows), real repository calls
 * (`startEmpty`/`addExercises`/`updateSet`/`setCompleted`/`finish`/
 * `updateMeta`/`softDelete`) where they exist, to prove the two new
 * methods behave correctly against the actual mutation paths that will
 * call `invalidateAfterWorkoutMutation` (`../../../features/stats
 * /records-service.ts`) in real use.
 */
import { openBetterSqlite3Driver } from '../../sqlite/driver.better-sqlite3';
import { migrate } from '../../sqlite/migrator';
import type { SqliteDriver } from '../../sqlite/driver';
import { WorkoutRepositoryImpl } from '../workout-repository';

function insertExercise(
  driver: SqliteDriver,
  id: string,
  exerciseType: string = 'weight_reps',
): string {
  const now = Date.now();
  driver.execute(
    `INSERT INTO exercises
       (id, name, exercise_type, primary_muscle_group, secondary_muscle_groups,
        equipment, instructions, images, animation_uri, is_custom,
        uses_custom_metric, aliases, archived_at, created_at, updated_at)
     VALUES (?, ?, ?, 'chest', '[]', 'barbell', '[]', '[]', NULL, 0, 0, '[]', NULL, ?, ?)`,
    [id, id, exerciseType, now, now],
  );
  return id;
}

function insertWorkoutExercise(driver: SqliteDriver, workoutId: string, exerciseId: string, position: number): string {
  const id = `we-${workoutId}-${position}-${exerciseId}`;
  driver.execute(
    `INSERT INTO workout_exercises (id, workout_id, exercise_id, position, superset_id, notes, rest_seconds)
     VALUES (?, ?, ?, ?, NULL, NULL, NULL)`,
    [id, workoutId, exerciseId, position],
  );
  return id;
}

function insertSet(
  driver: SqliteDriver,
  workoutExerciseId: string,
  position: number,
  opts: { weightKg?: number | null; reps?: number | null; setType?: string; isCompleted?: 0 | 1 } = {},
): string {
  const id = `set-${workoutExerciseId}-${position}`;
  driver.execute(
    `INSERT INTO sets
       (id, workout_exercise_id, position, set_type, weight_kg, reps, distance_meters,
        duration_seconds, rpe, custom_metric, is_completed)
     VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?)`,
    [
      id,
      workoutExerciseId,
      position,
      opts.setType ?? 'normal',
      opts.weightKg ?? null,
      opts.reps ?? null,
      opts.isCompleted ?? 1,
    ],
  );
  return id;
}

function insertWorkout(
  driver: SqliteDriver,
  id: string,
  opts: { state?: 'active' | 'completed'; startTime: number; updatedAt?: number; deletedAt?: number | null },
): void {
  const updatedAt = opts.updatedAt ?? opts.startTime;
  driver.execute(
    `INSERT INTO workouts (id, title, state, start_time, end_time, created_at, updated_at, deleted_at)
     VALUES (?, 'Fixture workout', ?, ?, ?, ?, ?, ?)`,
    [
      id,
      opts.state ?? 'completed',
      opts.startTime,
      (opts.state ?? 'completed') === 'completed' ? opts.startTime + 1_000 : null,
      opts.startTime,
      updatedAt,
      opts.deletedAt ?? null,
    ],
  );
}

/** One completed workout, one `workout_exercises` occurrence for `exerciseId`, `sets` seeded — the common-case fixture most cases below need. */
function seedCompletedWorkout(
  driver: SqliteDriver,
  workoutId: string,
  exerciseId: string,
  startTime: number,
  sets: { weightKg?: number | null; reps?: number | null; setType?: string }[],
  opts: { updatedAt?: number } = {},
): void {
  insertWorkout(driver, workoutId, { startTime, updatedAt: opts.updatedAt });
  const weId = insertWorkoutExercise(driver, workoutId, exerciseId, 0);
  sets.forEach((set, index) => insertSet(driver, weId, index, { ...set, isCompleted: 1 }));
}

describe('WorkoutRepositoryImpl — setsForExercise / exerciseHistoryWatermark (M4-02 integration, better-sqlite3)', () => {
  let driver: SqliteDriver;
  let repo: WorkoutRepositoryImpl;
  let benchId: string;
  let squatId: string;

  beforeEach(() => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    repo = new WorkoutRepositoryImpl(driver);
    benchId = insertExercise(driver, 'bench-press', 'weight_reps');
    squatId = insertExercise(driver, 'back-squat', 'bodyweight_reps');
  });

  afterEach(() => {
    driver.close();
  });

  // -------------------------------------------------------------------
  // setsForExercise
  // -------------------------------------------------------------------
  describe('setsForExercise', () => {
    it('returns [] for an exercise with no logged history', async () => {
      expect(await repo.setsForExercise(benchId)).toEqual([]);
    });

    it('returns [] for an unknown exercise id', async () => {
      expect(await repo.setsForExercise('does-not-exist')).toEqual([]);
    });

    it('maps every field, including this exercise\'s own exercise_type', async () => {
      seedCompletedWorkout(driver, 'w1', benchId, 1_000, [{ weightKg: 100, reps: 5 }]);

      const sets = await repo.setsForExercise(benchId);

      expect(sets).toEqual([
        {
          setId: 'set-we-w1-0-bench-press-0',
          workoutId: 'w1',
          workoutStartTime: 1_000,
          setOrder: 0,
          exerciseType: 'weight_reps',
          setType: 'normal',
          isCompleted: true,
          weightKg: 100,
          reps: 5,
          durationSeconds: null,
        },
      ]);
    });

    it('orders across workouts by workoutStartTime, assigning a sequential setOrder', async () => {
      seedCompletedWorkout(driver, 'w-later', benchId, 2_000, [{ weightKg: 105, reps: 5 }]);
      seedCompletedWorkout(driver, 'w-earlier', benchId, 1_000, [{ weightKg: 100, reps: 5 }]);

      const sets = await repo.setsForExercise(benchId);

      expect(sets.map((s) => s.workoutId)).toEqual(['w-earlier', 'w-later']);
      expect(sets.map((s) => s.setOrder)).toEqual([0, 1]);
    });

    it('a duplicated exercise within one workout (two workout_exercises occurrences) orders by occurrence position then set position, never repeating setOrder', async () => {
      insertWorkout(driver, 'w-dup', { startTime: 1_000 });
      const occ0 = insertWorkoutExercise(driver, 'w-dup', benchId, 0);
      insertSet(driver, occ0, 0, { weightKg: 60, reps: 8 });
      insertSet(driver, occ0, 1, { weightKg: 62.5, reps: 6 });
      const occ1 = insertWorkoutExercise(driver, 'w-dup', benchId, 1);
      insertSet(driver, occ1, 0, { weightKg: 65, reps: 5 });

      const sets = await repo.setsForExercise(benchId);

      expect(sets.map((s) => s.weightKg)).toEqual([60, 62.5, 65]);
      expect(sets.map((s) => s.setOrder)).toEqual([0, 1, 2]);
    });

    it('excludes an active workout\'s sets', async () => {
      insertWorkout(driver, 'w-active', { startTime: 1_000, state: 'active' });
      const weId = insertWorkoutExercise(driver, 'w-active', benchId, 0);
      insertSet(driver, weId, 0, { weightKg: 999, reps: 1 });

      expect(await repo.setsForExercise(benchId)).toEqual([]);
    });

    it('excludes a soft-deleted workout\'s sets', async () => {
      insertWorkout(driver, 'w-deleted', { startTime: 1_000, deletedAt: 5_000 });
      const weId = insertWorkoutExercise(driver, 'w-deleted', benchId, 0);
      insertSet(driver, weId, 0, { weightKg: 999, reps: 1 });

      expect(await repo.setsForExercise(benchId)).toEqual([]);
    });

    it('only returns sets for the requested exercise, not a sibling exercise in the same workout', async () => {
      insertWorkout(driver, 'w-both', { startTime: 1_000 });
      const benchWe = insertWorkoutExercise(driver, 'w-both', benchId, 0);
      insertSet(driver, benchWe, 0, { weightKg: 100, reps: 5 });
      const squatWe = insertWorkoutExercise(driver, 'w-both', squatId, 1);
      insertSet(driver, squatWe, 0, { weightKg: 20, reps: 8 });

      const benchSets = await repo.setsForExercise(benchId);
      expect(benchSets).toHaveLength(1);
      expect(benchSets[0]!.weightKg).toBe(100);
    });
  });

  // -------------------------------------------------------------------
  // exerciseHistoryWatermark
  // -------------------------------------------------------------------
  describe('exerciseHistoryWatermark', () => {
    it('is 0 for an exercise with no completed history', async () => {
      expect(await repo.exerciseHistoryWatermark(benchId)).toBe(0);
      expect(await repo.exerciseHistoryWatermark('does-not-exist')).toBe(0);
    });

    it('is the completed workout\'s own updated_at', async () => {
      seedCompletedWorkout(driver, 'w1', benchId, 1_000, [{ weightKg: 100, reps: 5 }], { updatedAt: 42_000 });

      expect(await repo.exerciseHistoryWatermark(benchId)).toBe(42_000);
    });

    it('is the max updated_at across every completed workout referencing the exercise', async () => {
      seedCompletedWorkout(driver, 'w1', benchId, 1_000, [{ weightKg: 100, reps: 5 }], { updatedAt: 10_000 });
      seedCompletedWorkout(driver, 'w2', benchId, 2_000, [{ weightKg: 105, reps: 5 }], { updatedAt: 30_000 });
      seedCompletedWorkout(driver, 'w3', benchId, 500, [{ weightKg: 90, reps: 5 }], { updatedAt: 20_000 });

      expect(await repo.exerciseHistoryWatermark(benchId)).toBe(30_000);
    });

    it('ignores an active workout\'s updated_at', async () => {
      insertWorkout(driver, 'w-active', { startTime: 1_000, state: 'active', updatedAt: 99_999 });
      insertWorkoutExercise(driver, 'w-active', benchId, 0);

      expect(await repo.exerciseHistoryWatermark(benchId)).toBe(0);
    });

    it('ignores a soft-deleted workout\'s updated_at', async () => {
      insertWorkout(driver, 'w-deleted', { startTime: 1_000, updatedAt: 99_999, deletedAt: 100_000 });
      insertWorkoutExercise(driver, 'w-deleted', benchId, 0);

      expect(await repo.exerciseHistoryWatermark(benchId)).toBe(0);
    });

    it('does not change for a mutation to an unrelated exercise\'s own workout', async () => {
      seedCompletedWorkout(driver, 'w-bench', benchId, 1_000, [{ weightKg: 100, reps: 5 }], { updatedAt: 10_000 });
      seedCompletedWorkout(driver, 'w-squat', squatId, 1_000, [{ weightKg: 20, reps: 8 }], { updatedAt: 10_000 });
      const before = await repo.exerciseHistoryWatermark(benchId);

      await repo.updateMeta('w-squat', { title: 'Renamed squat day' });

      expect(await repo.exerciseHistoryWatermark(benchId)).toBe(before);
    });

    // -- Real mutation paths (the ones `invalidateAfterWorkoutMutation`
    // fires alongside) actually bump the watermark end-to-end --

    it('finish() raises the watermark for every exercise in the newly-finished workout', async () => {
      const before = await repo.exerciseHistoryWatermark(benchId);
      expect(before).toBe(0);

      const workout = await repo.startEmpty({ title: 'Push Day', startTime: 1_000 });
      const [we] = await repo.addExercises(workout.id, [{ exerciseId: benchId }]);
      const set = we!.sets[0]!;
      await repo.updateSet(set.id, { weightKg: 100, reps: 5 });
      await repo.setCompleted(set.id, true);
      const finished = await repo.finish(workout.id);

      const after = await repo.exerciseHistoryWatermark(benchId);
      expect(after).toBeGreaterThan(before);
      expect(after).toBe(finished.updatedAt);
    });

    it('updateMeta() (the M4-05 edit path\'s own updated_at bump) raises the watermark', async () => {
      seedCompletedWorkout(driver, 'w1', benchId, 1_000, [{ weightKg: 100, reps: 5 }], { updatedAt: 10_000 });
      const before = await repo.exerciseHistoryWatermark(benchId);

      const updated = await repo.updateMeta('w1', { title: 'Renamed' });

      const after = await repo.exerciseHistoryWatermark(benchId);
      expect(after).toBeGreaterThan(before);
      expect(after).toBe(updated.updatedAt);
    });

    it('softDelete() raises the watermark, and setsForExercise/watermark both drop to reflect the now-excluded workout', async () => {
      seedCompletedWorkout(driver, 'w1', benchId, 1_000, [{ weightKg: 100, reps: 5 }], { updatedAt: 10_000 });
      expect(await repo.exerciseHistoryWatermark(benchId)).toBe(10_000);
      expect(await repo.setsForExercise(benchId)).toHaveLength(1);

      await repo.softDelete('w1');

      expect(await repo.setsForExercise(benchId)).toEqual([]);
      expect(await repo.exerciseHistoryWatermark(benchId)).toBe(0);
    });

    // -- M4-02 review fix: deleting a workout that does NOT hold the
    // per-exercise max `updated_at` must still change the watermark. A
    // naive `MAX(updated_at) WHERE deleted_at IS NULL` drops the deleted
    // row out of the aggregate entirely, so if some *other*, still-alive
    // workout already held a higher `updated_at`, the MAX is unaffected —
    // the watermark reports the same number before and after even though
    // `setsForExercise` just lost a workout's worth of sets. A
    // `RecordsService` cache entry keyed on that unchanged number would
    // wrongly report a hit and keep serving the deleted workout's sets. --

    it('softDelete() of a non-max-watermark workout still changes the watermark (does not under-invalidate)', async () => {
      seedCompletedWorkout(driver, 'w-old', benchId, 1_000, [{ weightKg: 100, reps: 5 }], { updatedAt: 10_000 });
      seedCompletedWorkout(driver, 'w-new', benchId, 2_000, [{ weightKg: 105, reps: 5 }], { updatedAt: 30_000 });
      const before = await repo.exerciseHistoryWatermark(benchId);
      expect(before).toBe(30_000);

      // Delete the OLDER workout — 'w-new' still holds the highest
      // updated_at among surviving rows, so a naive MAX(...)-over-alive-rows
      // watermark would stay 30_000 here, wrongly reporting "nothing
      // changed."
      await repo.softDelete('w-old');

      const after = await repo.exerciseHistoryWatermark(benchId);
      expect(after).not.toBe(before);
      expect(await repo.setsForExercise(benchId)).toHaveLength(1);
      expect((await repo.setsForExercise(benchId))[0]!.workoutId).toBe('w-new');
    });

    it('a RecordsService-style cache warmed before a non-max-watermark delete does not keep serving the deleted set (end-to-end proof)', async () => {
      seedCompletedWorkout(driver, 'w-old', benchId, 1_000, [{ weightKg: 100, reps: 5 }], { updatedAt: 10_000 });
      seedCompletedWorkout(driver, 'w-new', benchId, 2_000, [{ weightKg: 105, reps: 5 }], { updatedAt: 30_000 });

      // Simulate RecordsService's own cache-hit check: warm once, remember
      // the watermark and the sets it produced.
      const warmedWatermark = await repo.exerciseHistoryWatermark(benchId);
      const warmedSets = await repo.setsForExercise(benchId);
      expect(warmedSets).toHaveLength(2);

      await repo.softDelete('w-old');

      const currentWatermark = await repo.exerciseHistoryWatermark(benchId);
      // The cache-hit test IS "watermark unchanged" — this must be false
      // now, or a real RecordsService would skip re-fetching and keep
      // returning `warmedSets` (which still includes 'w-old's deleted set).
      expect(currentWatermark).not.toBe(warmedWatermark);

      const freshSets = await repo.setsForExercise(benchId);
      expect(freshSets).toHaveLength(1);
      expect(freshSets[0]!.workoutId).toBe('w-new');
    });
  });

  // -------------------------------------------------------------------
  // exerciseHistory (M4-09)
  // -------------------------------------------------------------------
  describe('exerciseHistory', () => {
    it('returns [] for an exercise with no logged history', async () => {
      expect(await repo.exerciseHistory(benchId)).toEqual([]);
    });

    it('returns [] for an unknown exercise id', async () => {
      expect(await repo.exerciseHistory('does-not-exist')).toEqual([]);
    });

    it('maps every field, including the parent workout\'s own title, distance/rpe/custom metric', async () => {
      insertWorkout(driver, 'w1', { startTime: 1_000 });
      driver.execute(`UPDATE workouts SET title = ? WHERE id = ?`, ['Push Day', 'w1']);
      const weId = insertWorkoutExercise(driver, 'w1', benchId, 0);
      driver.execute(
        `INSERT INTO sets
           (id, workout_exercise_id, position, set_type, weight_kg, reps, distance_meters,
            duration_seconds, rpe, custom_metric, is_completed)
         VALUES ('set-1', ?, 0, 'normal', 100, 5, 12.5, 30, 9, 3, 1)`,
        [weId],
      );

      const sets = await repo.exerciseHistory(benchId);

      expect(sets).toEqual([
        {
          setId: 'set-1',
          workoutId: 'w1',
          workoutTitle: 'Push Day',
          workoutStartTime: 1_000,
          setOrder: 0,
          setType: 'normal',
          isCompleted: true,
          weightKg: 100,
          reps: 5,
          distanceMeters: 12.5,
          durationSeconds: 30,
          rpe: 9,
          customMetric: 3,
        },
      ]);
    });

    it('orders across workouts by workoutStartTime, assigning a sequential setOrder (same contract as setsForExercise)', async () => {
      seedCompletedWorkout(driver, 'w-later', benchId, 2_000, [{ weightKg: 105, reps: 5 }]);
      seedCompletedWorkout(driver, 'w-earlier', benchId, 1_000, [{ weightKg: 100, reps: 5 }]);

      const sets = await repo.exerciseHistory(benchId);

      expect(sets.map((s) => s.workoutId)).toEqual(['w-earlier', 'w-later']);
      expect(sets.map((s) => s.setOrder)).toEqual([0, 1]);
    });

    it('excludes an active workout\'s sets', async () => {
      insertWorkout(driver, 'w-active', { startTime: 1_000, state: 'active' });
      const weId = insertWorkoutExercise(driver, 'w-active', benchId, 0);
      insertSet(driver, weId, 0, { weightKg: 999, reps: 1 });

      expect(await repo.exerciseHistory(benchId)).toEqual([]);
    });

    it('excludes a soft-deleted workout\'s sets', async () => {
      insertWorkout(driver, 'w-deleted', { startTime: 1_000, deletedAt: 5_000 });
      const weId = insertWorkoutExercise(driver, 'w-deleted', benchId, 0);
      insertSet(driver, weId, 0, { weightKg: 999, reps: 1 });

      expect(await repo.exerciseHistory(benchId)).toEqual([]);
    });

    it('only returns sets for the requested exercise, not a sibling exercise in the same workout', async () => {
      insertWorkout(driver, 'w-both', { startTime: 1_000 });
      const benchWe = insertWorkoutExercise(driver, 'w-both', benchId, 0);
      insertSet(driver, benchWe, 0, { weightKg: 100, reps: 5 });
      const squatWe = insertWorkoutExercise(driver, 'w-both', squatId, 1);
      insertSet(driver, squatWe, 0, { weightKg: 20, reps: 8 });

      const benchSets = await repo.exerciseHistory(benchId);
      expect(benchSets).toHaveLength(1);
      expect(benchSets[0]!.weightKg).toBe(100);
    });
  });

  // -------------------------------------------------------------------
  // getExercisesForWorkouts (M4-03)
  // -------------------------------------------------------------------
  describe('getExercisesForWorkouts', () => {
    it('returns an empty map for an empty id list', async () => {
      const result = await repo.getExercisesForWorkouts([]);
      expect(result.size).toBe(0);
    });

    it('a workoutId with no workout_exercises rows still gets an [] entry', async () => {
      insertWorkout(driver, 'w-empty', { startTime: 1_000 });

      const result = await repo.getExercisesForWorkouts(['w-empty']);

      expect(result.get('w-empty')).toEqual([]);
    });

    it('an unknown workoutId still gets an [] entry (defensive — caller does not have to special-case it)', async () => {
      const result = await repo.getExercisesForWorkouts(['does-not-exist']);
      expect(result.get('does-not-exist')).toEqual([]);
    });

    it('hydrates each workout\'s own exercises + sets, in position order, correctly isolated from a sibling workout', async () => {
      seedCompletedWorkout(driver, 'w1', benchId, 1_000, [
        { weightKg: 100, reps: 5 },
        { weightKg: 105, reps: 3 },
      ]);
      seedCompletedWorkout(driver, 'w2', squatId, 2_000, [{ weightKg: 20, reps: 8 }]);

      const result = await repo.getExercisesForWorkouts(['w1', 'w2']);

      const w1Exercises = result.get('w1')!;
      expect(w1Exercises).toHaveLength(1);
      expect(w1Exercises[0]!.exerciseId).toBe(benchId);
      expect(w1Exercises[0]!.sets.map((s) => s.weightKg)).toEqual([100, 105]);

      const w2Exercises = result.get('w2')!;
      expect(w2Exercises).toHaveLength(1);
      expect(w2Exercises[0]!.exerciseId).toBe(squatId);
      expect(w2Exercises[0]!.sets.map((s) => s.weightKg)).toEqual([20]);
    });

    it('a workout with two workout_exercises occurrences returns both, in position order', async () => {
      insertWorkout(driver, 'w-multi', { startTime: 1_000 });
      const we0 = insertWorkoutExercise(driver, 'w-multi', benchId, 0);
      insertSet(driver, we0, 0, { weightKg: 60, reps: 8 });
      const we1 = insertWorkoutExercise(driver, 'w-multi', squatId, 1);
      insertSet(driver, we1, 0, { weightKg: 20, reps: 10 });

      const result = await repo.getExercisesForWorkouts(['w-multi']);

      const exercises = result.get('w-multi')!;
      expect(exercises.map((e) => e.exerciseId)).toEqual([benchId, squatId]);
    });

    it('matches getFull\'s own hydration for the same workout (parity check)', async () => {
      seedCompletedWorkout(driver, 'w1', benchId, 1_000, [{ weightKg: 100, reps: 5 }]);

      const batched = await repo.getExercisesForWorkouts(['w1']);
      const full = await repo.getFull('w1');

      expect(batched.get('w1')).toEqual(full!.exercises);
    });
  });
});
