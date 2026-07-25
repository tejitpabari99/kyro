/**
 * `WorkoutRepositoryImpl.statsFeed` integration tests (M4-08 acceptance
 * gate) — same pattern `workout-repository.records.test.ts` (M4-02)
 * established: real `better-sqlite3` against the migrated schema, raw-SQL
 * fixture helpers for `exercises`/`workouts`/`workout_exercises`/`sets`
 * rows. Proves the single-query join (05 §4's "avoid N+1") returns the
 * right shape, respects the completed/non-deleted/range filters, and
 * carries each row's own exercise muscle-group data inline.
 */
import { openBetterSqlite3Driver } from '../../sqlite/driver.better-sqlite3';
import { migrate } from '../../sqlite/migrator';
import type { SqliteDriver } from '../../sqlite/driver';
import { WorkoutRepositoryImpl } from '../workout-repository';

function insertExercise(
  driver: SqliteDriver,
  id: string,
  opts: { exerciseType?: string; primaryMuscleGroup?: string; secondaryMuscleGroups?: string[] } = {},
): string {
  const now = Date.now();
  driver.execute(
    `INSERT INTO exercises
       (id, name, exercise_type, primary_muscle_group, secondary_muscle_groups,
        equipment, instructions, images, animation_uri, is_custom,
        uses_custom_metric, aliases, archived_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'barbell', '[]', '[]', NULL, 0, 0, '[]', NULL, ?, ?)`,
    [
      id,
      id,
      opts.exerciseType ?? 'weight_reps',
      opts.primaryMuscleGroup ?? 'chest',
      JSON.stringify(opts.secondaryMuscleGroups ?? []),
      now,
      now,
    ],
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
  opts: { state?: 'active' | 'completed'; startTime: number; endTime?: number; deletedAt?: number | null },
): void {
  const state = opts.state ?? 'completed';
  driver.execute(
    `INSERT INTO workouts (id, title, state, start_time, end_time, created_at, updated_at, deleted_at)
     VALUES (?, 'Fixture workout', ?, ?, ?, ?, ?, ?)`,
    [
      id,
      state,
      opts.startTime,
      state === 'completed' ? (opts.endTime ?? opts.startTime + 3_600_000) : null,
      opts.startTime,
      opts.startTime,
      opts.deletedAt ?? null,
    ],
  );
}

function seedCompletedWorkout(
  driver: SqliteDriver,
  workoutId: string,
  exerciseId: string,
  startTime: number,
  sets: { weightKg?: number | null; reps?: number | null; setType?: string; isCompleted?: 0 | 1 }[],
  opts: { endTime?: number } = {},
): void {
  insertWorkout(driver, workoutId, { startTime, endTime: opts.endTime });
  const weId = insertWorkoutExercise(driver, workoutId, exerciseId, 0);
  sets.forEach((set, index) => insertSet(driver, weId, index, set));
}

describe('WorkoutRepositoryImpl.statsFeed (M4-08, better-sqlite3 integration)', () => {
  let driver: SqliteDriver;
  let repo: WorkoutRepositoryImpl;
  let benchId: string;
  let squatId: string;

  beforeEach(() => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    repo = new WorkoutRepositoryImpl(driver);
    benchId = insertExercise(driver, 'bench-press', {
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
      secondaryMuscleGroups: ['triceps', 'shoulders'],
    });
    squatId = insertExercise(driver, 'back-squat', {
      exerciseType: 'bodyweight_reps',
      primaryMuscleGroup: 'quadriceps',
    });
  });

  afterEach(() => {
    driver.close();
  });

  it('returns [] when there is no history at all', async () => {
    expect(await repo.statsFeed()).toEqual([]);
  });

  it('maps every field, including the joined exercise muscle-group data', async () => {
    seedCompletedWorkout(driver, 'w1', benchId, 1_000, [{ weightKg: 100, reps: 5 }], { endTime: 2_000 });

    const rows = await repo.statsFeed();

    expect(rows).toEqual([
      {
        workoutId: 'w1',
        workoutStartTime: 1_000,
        workoutEndTime: 2_000,
        exerciseId: benchId,
        exerciseType: 'weight_reps',
        primaryMuscleGroup: 'chest',
        secondaryMuscleGroups: ['triceps', 'shoulders'],
        setType: 'normal',
        weightKg: 100,
        reps: 5,
        isCompleted: true,
      },
    ]);
  });

  it('returns one row per set — a multi-set workout yields multiple rows sharing the same workoutId', async () => {
    seedCompletedWorkout(driver, 'w1', benchId, 1_000, [
      { weightKg: 100, reps: 5 },
      { weightKg: 105, reps: 3 },
    ]);

    const rows = await repo.statsFeed();

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.workoutId === 'w1')).toBe(true);
  });

  it('joins across multiple exercises/workouts, each row carrying its own exercise context', async () => {
    seedCompletedWorkout(driver, 'w1', benchId, 1_000, [{ weightKg: 100, reps: 5 }]);
    seedCompletedWorkout(driver, 'w2', squatId, 2_000, [{ weightKg: 20, reps: 8 }]);

    const rows = await repo.statsFeed();

    expect(rows.map((r) => r.exerciseId).sort()).toEqual([benchId, squatId].sort());
    const squatRow = rows.find((r) => r.exerciseId === squatId)!;
    expect(squatRow.primaryMuscleGroup).toBe('quadriceps');
    expect(squatRow.exerciseType).toBe('bodyweight_reps');
  });

  it('excludes an active workout entirely', async () => {
    insertWorkout(driver, 'w-active', { startTime: 1_000, state: 'active' });
    const weId = insertWorkoutExercise(driver, 'w-active', benchId, 0);
    insertSet(driver, weId, 0, { weightKg: 999, reps: 1 });

    expect(await repo.statsFeed()).toEqual([]);
  });

  it('excludes a soft-deleted workout entirely', async () => {
    seedCompletedWorkout(driver, 'w-deleted', benchId, 1_000, [{ weightKg: 999, reps: 1 }]);
    await repo.softDelete('w-deleted');

    expect(await repo.statsFeed()).toEqual([]);
  });

  it('is ordered by workout start_time ascending', async () => {
    seedCompletedWorkout(driver, 'w-later', benchId, 5_000, [{ weightKg: 100, reps: 5 }]);
    seedCompletedWorkout(driver, 'w-earlier', benchId, 1_000, [{ weightKg: 90, reps: 5 }]);

    const rows = await repo.statsFeed();

    expect(rows.map((r) => r.workoutId)).toEqual(['w-earlier', 'w-later']);
  });

  // -- Range filtering (inclusive start, exclusive end — matches workoutDates) --

  describe('range filtering', () => {
    beforeEach(() => {
      seedCompletedWorkout(driver, 'w-1000', benchId, 1_000, [{ weightKg: 100, reps: 5 }]);
      seedCompletedWorkout(driver, 'w-2000', benchId, 2_000, [{ weightKg: 100, reps: 5 }]);
      seedCompletedWorkout(driver, 'w-3000', benchId, 3_000, [{ weightKg: 100, reps: 5 }]);
    });

    it('start is inclusive', async () => {
      const rows = await repo.statsFeed({ start: 2_000 });
      expect(rows.map((r) => r.workoutId)).toEqual(['w-2000', 'w-3000']);
    });

    it('end is exclusive', async () => {
      const rows = await repo.statsFeed({ end: 3_000 });
      expect(rows.map((r) => r.workoutId)).toEqual(['w-1000', 'w-2000']);
    });

    it('start and end together bound both sides', async () => {
      const rows = await repo.statsFeed({ start: 2_000, end: 3_000 });
      expect(rows.map((r) => r.workoutId)).toEqual(['w-2000']);
    });

    it('omitting range returns every completed workout', async () => {
      const rows = await repo.statsFeed();
      expect(rows).toHaveLength(3);
    });
  });

  it('carries an unchecked set through as isCompleted: false (bucketing owns the gating rule, not this query)', async () => {
    seedCompletedWorkout(driver, 'w1', benchId, 1_000, [{ weightKg: 100, reps: 5, isCompleted: 0 }]);

    const rows = await repo.statsFeed();

    expect(rows[0]!.isCompleted).toBe(false);
  });

  it('carries a warm-up set through with its own setType (bucketing owns the gating rule, not this query)', async () => {
    seedCompletedWorkout(driver, 'w1', benchId, 1_000, [{ weightKg: 40, reps: 10, setType: 'warmup' }]);

    const rows = await repo.statsFeed();

    expect(rows[0]!.setType).toBe('warmup');
  });
});
