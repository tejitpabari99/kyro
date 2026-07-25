/**
 * `RoutineRepositoryImpl.createFromWorkout` integration tests (M3-01
 * acceptance gate: "createFromWorkout reproduces structure incl.
 * supersets/rest") — real `better-sqlite3` against the migrated schema.
 * `workouts`/`workout_exercises`/`sets` fixtures are inserted directly via
 * raw SQL, same pattern `workout-repository.lifecycle.test.ts` (M2-01)
 * established for tables outside the repository under test's own domain.
 *
 * `updateFromWorkout` (M3-06, 04 §2.4's own acceptance criteria: "in-range
 * reps preserve the range; declining leaves routine untouched") is covered
 * below in its own `describe` block, same fixture-building helpers reused —
 * a source routine is built via the real `repo.create(...)` (never inserted
 * by raw SQL) so its ids are real, then a workout+workout_exercises+sets
 * fixture is inserted with `routine_id`/`routine_occurrence_index` wired to
 * correlate against it, mirroring exactly what `WorkoutRepositoryImpl
 * .startFromRoutine`+`finish()` would have produced.
 */
import { openBetterSqlite3Driver } from '../../sqlite/driver.better-sqlite3';
import { migrate } from '../../sqlite/migrator';
import type { SqliteDriver } from '../../sqlite/driver';
import {
  RoutineFolderNotFoundError,
  RoutineNotFoundError,
  WorkoutNotFoundForRoutineError,
  WorkoutRoutineMismatchError,
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
  opts: { title?: string; deletedAt?: number | null; routineId?: string | null } = {},
): string {
  const now = Date.now();
  driver.execute(
    `INSERT INTO workouts (id, title, routine_id, state, start_time, end_time, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, 'completed', ?, ?, ?, ?, ?)`,
    [
      id,
      opts.title ?? 'Push Day',
      opts.routineId ?? null,
      now - 3_600_000,
      now,
      now,
      now,
      opts.deletedAt ?? null,
    ],
  );
  return id;
}

function insertWorkoutExercise(
  driver: SqliteDriver,
  workoutId: string,
  exerciseId: string,
  position: number,
  opts: {
    supersetId?: number | null;
    notes?: string | null;
    restSeconds?: number | null;
    routineOccurrenceIndex?: number | null;
  } = {},
): string {
  const id = `we-${workoutId}-${position}-${exerciseId}`;
  driver.execute(
    `INSERT INTO workout_exercises
       (id, workout_id, exercise_id, position, superset_id, notes, rest_seconds, routine_occurrence_index)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      workoutId,
      exerciseId,
      position,
      opts.supersetId ?? null,
      opts.notes ?? null,
      opts.restSeconds ?? null,
      opts.routineOccurrenceIndex ?? null,
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

  describe('updateFromWorkout (M3-06, 04 §2.4)', () => {
    it('rewrites per-set targets from the workout\'s achieved values and bumps updated_at', async () => {
      const routine = await repo.create({
        title: 'Push Day',
        exercises: [
          { exerciseId: benchId, restSeconds: 90, sets: [{ reps: 8, weightKg: 60 }] },
          { exerciseId: squatId, restSeconds: 120, sets: [{ reps: 5, weightKg: 100 }] },
        ],
      });
      // Force an old, deterministic updated_at so the "bumped" assertion
      // below can't coincidentally pass from two same-millisecond Date.now() calls.
      driver.execute(`UPDATE routines SET updated_at = ? WHERE id = ?`, [1000, routine.id]);

      const workoutId = insertWorkout(driver, 'w1', { routineId: routine.id });
      const benchWe = insertWorkoutExercise(driver, workoutId, benchId, 0, {
        restSeconds: 90,
        routineOccurrenceIndex: 0,
      });
      insertSet(driver, benchWe, 0, { weightKg: 65, reps: 8 }); // weight changed
      const squatWe = insertWorkoutExercise(driver, workoutId, squatId, 1, {
        restSeconds: 120,
        routineOccurrenceIndex: 0,
      });
      insertSet(driver, squatWe, 0, { weightKg: 100, reps: 6 }); // reps changed

      const updated = await repo.updateFromWorkout(routine.id, workoutId);

      expect(updated.exercises[0]!.exerciseId).toBe(benchId);
      expect(updated.exercises[0]!.sets[0]).toMatchObject({ weightKg: 65, reps: 8 });
      expect(updated.exercises[1]!.exerciseId).toBe(squatId);
      expect(updated.exercises[1]!.sets[0]).toMatchObject({ weightKg: 100, reps: 6 });
      expect(updated.updatedAt).toBeGreaterThan(1000);

      // Persisted, not just returned — a fresh getFull agrees.
      const reread = await repo.getFull(routine.id);
      expect(reread).toEqual(updated);
    });

    it('achieved reps inside an existing rep-range target preserves the range; only weight updates', async () => {
      const routine = await repo.create({
        title: 'Push Day',
        exercises: [
          { exerciseId: benchId, sets: [{ repRangeStart: 6, repRangeEnd: 8, weightKg: 60 }] },
        ],
      });
      const workoutId = insertWorkout(driver, 'w1', { routineId: routine.id });
      const benchWe = insertWorkoutExercise(driver, workoutId, benchId, 0, {
        routineOccurrenceIndex: 0,
      });
      insertSet(driver, benchWe, 0, { weightKg: 65, reps: 7 }); // in [6,8]

      const updated = await repo.updateFromWorkout(routine.id, workoutId);

      expect(updated.exercises[0]!.sets[0]).toMatchObject({
        weightKg: 65,
        reps: null,
        repRangeStart: 6,
        repRangeEnd: 8,
      });
    });

    it('achieved reps at the inclusive range boundary (6 or 8) still preserves the range', async () => {
      const routine = await repo.create({
        title: 'Push Day',
        exercises: [
          { exerciseId: benchId, sets: [{ repRangeStart: 6, repRangeEnd: 8, weightKg: 60 }] },
        ],
      });
      const workoutId = insertWorkout(driver, 'w1', { routineId: routine.id });
      const benchWe = insertWorkoutExercise(driver, workoutId, benchId, 0, {
        routineOccurrenceIndex: 0,
      });
      insertSet(driver, benchWe, 0, { weightKg: 60, reps: 6 });

      const updated = await repo.updateFromWorkout(routine.id, workoutId);
      expect(updated.exercises[0]!.sets[0]).toMatchObject({ reps: null, repRangeStart: 6, repRangeEnd: 8 });
    });

    it('achieved reps outside the existing range collapses the target to the achieved fixed value', async () => {
      const routine = await repo.create({
        title: 'Push Day',
        exercises: [
          { exerciseId: benchId, sets: [{ repRangeStart: 6, repRangeEnd: 8, weightKg: 60 }] },
        ],
      });
      const workoutId = insertWorkout(driver, 'w1', { routineId: routine.id });
      const benchWe = insertWorkoutExercise(driver, workoutId, benchId, 0, {
        routineOccurrenceIndex: 0,
      });
      insertSet(driver, benchWe, 0, { weightKg: 65, reps: 10 }); // outside [6,8]

      const updated = await repo.updateFromWorkout(routine.id, workoutId);
      expect(updated.exercises[0]!.sets[0]).toMatchObject({
        weightKg: 65,
        reps: 10,
        repRangeStart: null,
        repRangeEnd: null,
      });
    });

    it('a mid-workout-added exercise (routineOccurrenceIndex null) is included in the new structure with a fixed target', async () => {
      const routine = await repo.create({
        title: 'Push Day',
        exercises: [{ exerciseId: benchId, sets: [{ reps: 8, weightKg: 60 }] }],
      });
      const workoutId = insertWorkout(driver, 'w1', { routineId: routine.id });
      const benchWe = insertWorkoutExercise(driver, workoutId, benchId, 0, {
        routineOccurrenceIndex: 0,
      });
      insertSet(driver, benchWe, 0, { weightKg: 60, reps: 8 });
      const curlId = insertExercise(driver, 'curl');
      const curlWe = insertWorkoutExercise(driver, workoutId, curlId, 1, {
        routineOccurrenceIndex: null,
      });
      insertSet(driver, curlWe, 0, { weightKg: 12, reps: 12 });

      const updated = await repo.updateFromWorkout(routine.id, workoutId);
      expect(updated.exercises).toHaveLength(2);
      expect(updated.exercises[1]!.exerciseId).toBe(curlId);
      expect(updated.exercises[1]!.sets[0]).toMatchObject({
        weightKg: 12,
        reps: 12,
        repRangeStart: null,
        repRangeEnd: null,
      });
    });

    it('an extra achieved set past the routine\'s own set count gets a fixed target (no original to correlate against)', async () => {
      const routine = await repo.create({
        title: 'Push Day',
        exercises: [{ exerciseId: benchId, sets: [{ repRangeStart: 6, repRangeEnd: 8, weightKg: 60 }] }],
      });
      const workoutId = insertWorkout(driver, 'w1', { routineId: routine.id });
      const benchWe = insertWorkoutExercise(driver, workoutId, benchId, 0, {
        routineOccurrenceIndex: 0,
      });
      insertSet(driver, benchWe, 0, { weightKg: 65, reps: 7 });
      insertSet(driver, benchWe, 1, { weightKg: 60, reps: 6 }); // no routine_sets[1] to correlate against

      const updated = await repo.updateFromWorkout(routine.id, workoutId);
      expect(updated.exercises[0]!.sets).toHaveLength(2);
      expect(updated.exercises[0]!.sets[0]).toMatchObject({ reps: null, repRangeStart: 6, repRangeEnd: 8 });
      expect(updated.exercises[0]!.sets[1]).toMatchObject({ reps: 6, repRangeStart: null, repRangeEnd: null });
    });

    it('copies superset grouping / rest / notes from the workout\'s final structure', async () => {
      const routine = await repo.create({
        title: 'Push Day',
        exercises: [
          { exerciseId: benchId, sets: [{ reps: 8, weightKg: 60 }] },
          { exerciseId: squatId, sets: [{ reps: 5, weightKg: 100 }] },
        ],
      });
      const workoutId = insertWorkout(driver, 'w1', { routineId: routine.id });
      const benchWe = insertWorkoutExercise(driver, workoutId, benchId, 0, {
        supersetId: 0,
        notes: 'Elbows tucked',
        restSeconds: 75,
        routineOccurrenceIndex: 0,
      });
      insertSet(driver, benchWe, 0, { weightKg: 60, reps: 8 });
      const squatWe = insertWorkoutExercise(driver, workoutId, squatId, 1, {
        supersetId: 0,
        restSeconds: 60,
        routineOccurrenceIndex: 0,
      });
      insertSet(driver, squatWe, 0, { weightKg: 100, reps: 5 });

      const updated = await repo.updateFromWorkout(routine.id, workoutId);
      expect(updated.exercises[0]!.supersetId).toBe(0);
      expect(updated.exercises[0]!.notes).toBe('Elbows tucked');
      expect(updated.exercises[0]!.restSeconds).toBe(75);
      expect(updated.exercises[1]!.supersetId).toBe(0);
      expect(updated.exercises[1]!.restSeconds).toBe(60);
    });

    it('routine title/notes are untouched — only structure + updated_at change', async () => {
      const routine = await repo.create({
        title: 'Push Day',
        notes: 'My favorite routine',
        exercises: [{ exerciseId: benchId, sets: [{ reps: 8, weightKg: 60 }] }],
      });
      const workoutId = insertWorkout(driver, 'w1', { routineId: routine.id });
      const benchWe = insertWorkoutExercise(driver, workoutId, benchId, 0, {
        routineOccurrenceIndex: 0,
      });
      insertSet(driver, benchWe, 0, { weightKg: 70, reps: 8 });

      const updated = await repo.updateFromWorkout(routine.id, workoutId);
      expect(updated.title).toBe('Push Day');
      expect(updated.notes).toBe('My favorite routine');
    });

    it('declining (never calling updateFromWorkout) leaves the routine byte-identical after the workout finishes', async () => {
      const routine = await repo.create({
        title: 'Push Day',
        exercises: [{ exerciseId: benchId, sets: [{ reps: 8, weightKg: 60 }] }],
      });
      const before = await repo.getFull(routine.id);

      const workoutId = insertWorkout(driver, 'w1', { routineId: routine.id });
      const benchWe = insertWorkoutExercise(driver, workoutId, benchId, 0, {
        routineOccurrenceIndex: 0,
      });
      insertSet(driver, benchWe, 0, { weightKg: 999, reps: 1 }); // materially different, but update never called

      const after = await repo.getFull(routine.id);
      expect(after).toEqual(before);
    });

    it('throws RoutineNotFoundError for an unknown routineId', async () => {
      const workoutId = insertWorkout(driver, 'w1');
      await expect(repo.updateFromWorkout('nope', workoutId)).rejects.toBeInstanceOf(
        RoutineNotFoundError,
      );
    });

    it('throws WorkoutNotFoundForRoutineError for an unknown workoutId', async () => {
      const routine = await repo.create({ title: 'Push Day' });
      await expect(repo.updateFromWorkout(routine.id, 'nope')).rejects.toBeInstanceOf(
        WorkoutNotFoundForRoutineError,
      );
    });

    it('throws WorkoutNotFoundForRoutineError for a soft-deleted workout', async () => {
      const routine = await repo.create({ title: 'Push Day' });
      const workoutId = insertWorkout(driver, 'w1', { routineId: routine.id, deletedAt: Date.now() });
      await expect(repo.updateFromWorkout(routine.id, workoutId)).rejects.toBeInstanceOf(
        WorkoutNotFoundForRoutineError,
      );
    });

    it('throws WorkoutRoutineMismatchError when the workout belongs to a different routine', async () => {
      const routineA = await repo.create({ title: 'Push Day' });
      const routineB = await repo.create({ title: 'Pull Day' });
      const workoutId = insertWorkout(driver, 'w1', { routineId: routineB.id });
      await expect(repo.updateFromWorkout(routineA.id, workoutId)).rejects.toBeInstanceOf(
        WorkoutRoutineMismatchError,
      );
    });
  });
});
