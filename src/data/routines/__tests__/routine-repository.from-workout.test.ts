/**
 * `RoutineRepositoryImpl.createFromWorkout` integration tests (M3-01
 * acceptance gate: "createFromWorkout reproduces structure incl.
 * supersets/rest") — real `better-sqlite3` against the migrated schema.
 * `workouts`/`workout_exercises`/`sets` fixtures are inserted directly via
 * raw SQL, same pattern `workout-repository.lifecycle.test.ts` (M2-01)
 * established for tables outside the repository under test's own domain.
 * Also covers the `updateFromWorkout` M3-06 stub.
 */
import { openBetterSqlite3Driver } from '../../sqlite/driver.better-sqlite3';
import { migrate } from '../../sqlite/migrator';
import type { SqliteDriver } from '../../sqlite/driver';
import {
  RoutineFolderNotFoundError,
  WorkoutNotFoundForRoutineError,
} from '../errors';
import { RoutineRepositoryImpl } from '../routine-repository';

function insertExercise(driver: SqliteDriver, id: string): string {
  const now = Date.now();
  driver.execute(
    `INSERT INTO exercises
       (id, name, exercise_type, primary_muscle_group, secondary_muscle_groups,
        equipment, instructions, images, animation_uri, is_custom,
        uses_custom_metric, aliases, archived_at, created_at, updated_at)
     VALUES (?, ?, 'weight_reps', 'chest', '[]', 'barbell', '[]', '[]', NULL, 0, 0, '[]', NULL, ?, ?)`,
    [id, id, now, now],
  );
  return id;
}

function insertWorkout(
  driver: SqliteDriver,
  id: string,
  opts: { title?: string; deletedAt?: number | null } = {},
): string {
  const now = Date.now();
  driver.execute(
    `INSERT INTO workouts (id, title, state, start_time, end_time, created_at, updated_at, deleted_at)
     VALUES (?, ?, 'completed', ?, ?, ?, ?, ?)`,
    [id, opts.title ?? 'Push Day', now - 3_600_000, now, now, now, opts.deletedAt ?? null],
  );
  return id;
}

function insertWorkoutExercise(
  driver: SqliteDriver,
  workoutId: string,
  exerciseId: string,
  position: number,
  opts: { supersetId?: number | null; notes?: string | null; restSeconds?: number | null } = {},
): string {
  const id = `we-${workoutId}-${position}-${exerciseId}`;
  driver.execute(
    `INSERT INTO workout_exercises (id, workout_id, exercise_id, position, superset_id, notes, rest_seconds)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      workoutId,
      exerciseId,
      position,
      opts.supersetId ?? null,
      opts.notes ?? null,
      opts.restSeconds ?? null,
    ],
  );
  return id;
}

function insertSet(
  driver: SqliteDriver,
  workoutExerciseId: string,
  position: number,
  opts: {
    setType?: 'normal' | 'warmup' | 'failure' | 'dropset';
    weightKg?: number | null;
    reps?: number | null;
    distanceMeters?: number | null;
    durationSeconds?: number | null;
    customMetric?: number | null;
    isCompleted?: 0 | 1;
  } = {},
): string {
  const id = `set-${workoutExerciseId}-${position}`;
  driver.execute(
    `INSERT INTO sets
       (id, workout_exercise_id, position, set_type, weight_kg, reps, distance_meters,
        duration_seconds, custom_metric, is_completed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      workoutExerciseId,
      position,
      opts.setType ?? 'normal',
      opts.weightKg ?? null,
      opts.reps ?? null,
      opts.distanceMeters ?? null,
      opts.durationSeconds ?? null,
      opts.customMetric ?? null,
      opts.isCompleted ?? 1,
    ],
  );
  return id;
}

describe('RoutineRepositoryImpl — createFromWorkout / updateFromWorkout (M3-01 integration, better-sqlite3)', () => {
  let driver: SqliteDriver;
  let repo: RoutineRepositoryImpl;
  let benchId: string;
  let squatId: string;

  beforeEach(() => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    repo = new RoutineRepositoryImpl(driver);
    benchId = insertExercise(driver, 'bench-press');
    squatId = insertExercise(driver, 'back-squat');
  });

  afterEach(() => {
    driver.close();
  });

  it('reproduces structure incl. supersets, rest timers, notes, and achieved values as fixed targets', async () => {
    const workoutId = insertWorkout(driver, 'w1', { title: 'Push Day' });

    // Superset group 0: bench + an ungrouped-looking second bench occurrence.
    const benchWe = insertWorkoutExercise(driver, workoutId, benchId, 0, {
      supersetId: 0,
      notes: 'Elbows tucked',
      restSeconds: 90,
    });
    insertSet(driver, benchWe, 0, { setType: 'warmup', weightKg: 40, reps: 10 });
    insertSet(driver, benchWe, 1, { weightKg: 60, reps: 8 });
    insertSet(driver, benchWe, 2, { weightKg: 60, reps: 7 });

    const squatWe = insertWorkoutExercise(driver, workoutId, squatId, 1, {
      supersetId: 0,
      restSeconds: 120,
    });
    insertSet(driver, squatWe, 0, { weightKg: 100, reps: 5 });

    const routine = await repo.createFromWorkout(workoutId);

    expect(routine.title).toBe('Push Day');
    expect(routine.folderId).toBeNull();
    expect(routine.exercises).toHaveLength(2);

    const [firstExercise, secondExercise] = routine.exercises;
    expect(firstExercise!.exerciseId).toBe(benchId);
    expect(firstExercise!.supersetId).toBe(0);
    expect(firstExercise!.notes).toBe('Elbows tucked');
    expect(firstExercise!.restSeconds).toBe(90);
    expect(firstExercise!.sets).toHaveLength(3);
    expect(firstExercise!.sets[0]).toMatchObject({
      setType: 'warmup',
      weightKg: 40,
      reps: 10,
      repRangeStart: null,
      repRangeEnd: null,
    });
    expect(firstExercise!.sets[1]).toMatchObject({ weightKg: 60, reps: 8 });
    expect(firstExercise!.sets[2]).toMatchObject({ weightKg: 60, reps: 7 });

    expect(secondExercise!.exerciseId).toBe(squatId);
    expect(secondExercise!.supersetId).toBe(0);
    expect(secondExercise!.restSeconds).toBe(120);
    expect(secondExercise!.sets).toHaveLength(1);
    expect(secondExercise!.sets[0]).toMatchObject({ weightKg: 100, reps: 5 });
  });

  it('achieved reps become a fixed target, never a rep range', async () => {
    const workoutId = insertWorkout(driver, 'w1');
    const we = insertWorkoutExercise(driver, workoutId, benchId, 0);
    insertSet(driver, we, 0, { weightKg: 60, reps: 8 });

    const routine = await repo.createFromWorkout(workoutId);
    const set = routine.exercises[0]!.sets[0]!;
    expect(set.reps).toBe(8);
    expect(set.repRangeStart).toBeNull();
    expect(set.repRangeEnd).toBeNull();
  });

  it('accepts a title override and a folderId option', async () => {
    const workoutId = insertWorkout(driver, 'w1', { title: 'Original Workout Title' });
    const folder = await repo.createFolder({ title: 'Push' });

    const routine = await repo.createFromWorkout(workoutId, {
      title: 'My Custom Routine',
      folderId: folder.id,
    });

    expect(routine.title).toBe('My Custom Routine');
    expect(routine.folderId).toBe(folder.id);
  });

  it('defaults the title to the workout\'s own title when no override is given', async () => {
    const workoutId = insertWorkout(driver, 'w1', { title: 'Leg Day' });
    const routine = await repo.createFromWorkout(workoutId);
    expect(routine.title).toBe('Leg Day');
  });

  it('handles a workout with no exercises (empty routine)', async () => {
    const workoutId = insertWorkout(driver, 'w1');
    const routine = await repo.createFromWorkout(workoutId);
    expect(routine.exercises).toEqual([]);
  });

  it('throws WorkoutNotFoundForRoutineError for an unknown workout id', async () => {
    await expect(repo.createFromWorkout('nope')).rejects.toBeInstanceOf(
      WorkoutNotFoundForRoutineError,
    );
  });

  it('throws WorkoutNotFoundForRoutineError for a soft-deleted workout', async () => {
    const workoutId = insertWorkout(driver, 'w1', { deletedAt: Date.now() });
    await expect(repo.createFromWorkout(workoutId)).rejects.toBeInstanceOf(
      WorkoutNotFoundForRoutineError,
    );
  });

  it('throws RoutineFolderNotFoundError for an unknown folderId option', async () => {
    const workoutId = insertWorkout(driver, 'w1');
    await expect(repo.createFromWorkout(workoutId, { folderId: 999 })).rejects.toBeInstanceOf(
      RoutineFolderNotFoundError,
    );
  });

  describe('updateFromWorkout', () => {
    it('rejects — stub until M3-06', async () => {
      await expect(repo.updateFromWorkout('some-routine-id', 'some-workout-id')).rejects.toThrow(
        /M3-06/,
      );
    });
  });
});
