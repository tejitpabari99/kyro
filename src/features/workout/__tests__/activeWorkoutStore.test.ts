/**
 * `activeWorkoutStore` tests (M2-03 acceptance gate, 08 §4.9) — two halves:
 *
 *  1. "Every store action -> DB state assertion": one `it` per action,
 *     driving a real `WorkoutRepositoryImpl` against a real (in-memory)
 *     `better-sqlite3` driver — never a mocked repository (08 §5: "never
 *     mock repositories in integration suites") — then asserting the
 *     change actually landed in SQLite, not just in the in-memory draft.
 *  2. Rollback-on-repo-failure, with an **injected failing driver**
 *     (`driverThrowingOnCall`, the exact pattern
 *     `workout-repository.mutators.test.ts` (M2-02) already established
 *     for its own atomicity test) wrapped in a second
 *     `WorkoutRepositoryImpl` instance: the draft must revert to its exact
 *     pre-action snapshot, `error` must be a {@link DataError}, and the DB
 *     must show no partial write (the driver's `transaction()` rolls back
 *     on throw, same guarantee every repository mutator already relies on).
 *
 * The kill-simulation (100 seeded random-action runs, deep-equal after
 * rehydrate) lives in its own file,
 * `activeWorkoutStore.crash-safety.test.ts`, since it is a slower,
 * differently-shaped property test.
 */
import { RoutineRepositoryImpl } from '@/data/routines/routine-repository';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import * as sentry from '@/lib/sentry';

import {
  DataError,
  createActiveWorkoutStore,
  selectActiveWorkout,
  selectActiveWorkoutError,
  selectWorkoutExercise,
  selectWorkoutSet,
  toDataError,
} from '../activeWorkoutStore';

// `@/lib/sentry` is real (unmocked) here — the assertions below spy on its
// own `captureError` export — but the underlying `@sentry/react-native` SDK
// itself is mocked, same convention `error-reporting.test.ts` (M0-11)
// established: importing the real SDK un-mocked registers an internal
// `setInterval` cleanup timer at module-load time (`AsyncExpiringMap`) that
// otherwise leaks past the test run ("Jest did not exit" / `--detectOpenHandles`).
jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

/** Same helper `workout-repository.mutators.test.ts` (M2-02) uses for its atomicity test — wraps a real driver so its `execute` throws on the Nth (1-based) call whose SQL contains `sqlContains`. */
function driverThrowingOnCall(
  real: SqliteDriver,
  sqlContains: string,
  callIndex: number,
  message: string,
): SqliteDriver {
  let seen = 0;
  return {
    ...real,
    execute(sql, params) {
      if (sql.includes(sqlContains)) {
        seen += 1;
        if (seen === callIndex) {
          throw new Error(message);
        }
      }
      return real.execute(sql, params);
    },
  };
}

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

function rawSet(driver: SqliteDriver, setId: string): Record<string, unknown> {
  return driver.queryAll(`SELECT * FROM sets WHERE id = ?`, [setId])[0]!;
}

function rawWorkoutExercise(driver: SqliteDriver, id: string): Record<string, unknown> | undefined {
  return driver.queryAll(`SELECT * FROM workout_exercises WHERE id = ?`, [id])[0];
}

function rawWorkout(driver: SqliteDriver, id: string): Record<string, unknown> | undefined {
  return driver.queryAll(`SELECT * FROM workouts WHERE id = ?`, [id])[0];
}

describe('activeWorkoutStore (M2-03)', () => {
  let driver: SqliteDriver;
  let repository: WorkoutRepositoryImpl;
  let store: ReturnType<typeof createActiveWorkoutStore>;
  let benchId: string;
  let squatId: string;

  beforeEach(() => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    repository = new WorkoutRepositoryImpl(driver);
    store = createActiveWorkoutStore();
    benchId = insertExercise(driver, 'bench-press');
    squatId = insertExercise(driver, 'back-squat');
  });

  afterEach(() => {
    driver.close();
    jest.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Guard rails
  // -----------------------------------------------------------------------

  it('throws a clear error when an action is called before rehydrate()', async () => {
    await expect(store.getState().startEmpty({ title: 'x', startTime: Date.now() })).rejects.toThrow(
      /rehydrate\(\)/,
    );
  });

  it('rehydrate() with no active workout leaves workout null and flips loaded', async () => {
    await store.getState().rehydrate(repository);
    expect(store.getState().workout).toBeNull();
    expect(store.getState().loaded).toBe(true);
  });

  it('rehydrate() restores an in-progress workout created outside this store instance', async () => {
    const created = await repository.startEmpty({ title: 'Morning', startTime: 1000 });
    await store.getState().rehydrate(repository);
    expect(store.getState().workout?.id).toBe(created.id);
    expect(store.getState().workout?.title).toBe('Morning');
  });

  // -----------------------------------------------------------------------
  // Lifecycle
  // -----------------------------------------------------------------------

  describe('startEmpty', () => {
    it('creates an active workout in the draft and in the DB', async () => {
      await store.getState().rehydrate(repository);
      const workout = await store.getState().startEmpty({ title: 'Push Day', startTime: 5000 });

      expect(workout).not.toBeNull();
      expect(store.getState().workout?.title).toBe('Push Day');
      const row = rawWorkout(driver, workout!.id);
      expect(row).toMatchObject({ title: 'Push Day', state: 'active', start_time: 5000 });
    });

    it('a second startEmpty while one is active surfaces a DataError and leaves the draft alone', async () => {
      await store.getState().rehydrate(repository);
      const first = await store.getState().startEmpty({ title: 'First', startTime: 1 });

      const result = await store.getState().startEmpty({ title: 'Second', startTime: 2 });

      expect(result).toBeNull();
      expect(store.getState().error).toBeInstanceOf(DataError);
      expect(store.getState().workout?.id).toBe(first!.id);
      // Only one active row in the DB.
      expect(driver.queryAll(`SELECT id FROM workouts WHERE state = 'active'`)).toHaveLength(1);
    });
  });

  describe('startFromRoutine (M3-05)', () => {
    it('creates an active workout pre-populated from the routine in the draft and in the DB', async () => {
      const routineRepo = new RoutineRepositoryImpl(driver);
      const routine = await routineRepo.create({
        title: 'Push Day',
        exercises: [{ exerciseId: benchId, sets: [{ setType: 'normal', weightKg: 60, reps: 8 }] }],
      });

      await store.getState().rehydrate(repository);
      const workout = await store.getState().startFromRoutine(routine.id);

      expect(workout).not.toBeNull();
      expect(store.getState().workout?.routineId).toBe(routine.id);
      expect(store.getState().workout?.title).toBe('Push Day');
      expect(store.getState().workout?.exercises).toHaveLength(1);
      const row = rawWorkout(driver, workout!.id);
      expect(row).toMatchObject({ title: 'Push Day', state: 'active', routine_id: routine.id });
    });

    it('a startFromRoutine while a workout is already active surfaces a DataError and leaves the draft alone', async () => {
      const routineRepo = new RoutineRepositoryImpl(driver);
      const routine = await routineRepo.create({ title: 'Push Day' });

      await store.getState().rehydrate(repository);
      const first = await store.getState().startEmpty({ title: 'First', startTime: 1 });

      const result = await store.getState().startFromRoutine(routine.id);

      expect(result).toBeNull();
      expect(store.getState().error).toBeInstanceOf(DataError);
      expect(store.getState().workout?.id).toBe(first!.id);
      expect(driver.queryAll(`SELECT id FROM workouts WHERE state = 'active'`)).toHaveLength(1);
    });
  });

  describe('discard', () => {
    it('clears the draft and deletes the DB row', async () => {
      await store.getState().rehydrate(repository);
      const workout = await store.getState().startEmpty({ title: 'Discard me', startTime: 1 });

      await store.getState().discard();

      expect(store.getState().workout).toBeNull();
      expect(rawWorkout(driver, workout!.id)).toBeUndefined();
    });
  });

  describe('finish', () => {
    it('flips DB state to completed, deletes unchecked sets, and clears the draft', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'Leg Day', startTime: 1 });
      const [exercise] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const setId = exercise!.sets[0]!.id;
      await store.getState().updateSet(setId, { weightKg: 100, reps: 5 });
      await store.getState().setCompleted(setId, true);
      await store.getState().addSet(exercise!.id); // left unchecked -> deleted by finish

      const finished = await store.getState().finish({ title: 'Leg Day (final)' });

      expect(store.getState().workout).toBeNull();
      expect(finished?.title).toBe('Leg Day (final)');
      const row = rawWorkout(driver, finished!.id);
      expect(row).toMatchObject({ state: 'completed', title: 'Leg Day (final)' });
      const remainingSets = driver.queryAll<{ id: string }>(
        `SELECT s.id FROM sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id WHERE we.workout_id = ?`,
        [finished!.id],
      );
      expect(remainingSets).toHaveLength(1); // the unchecked added set was deleted
    });
  });

  // -----------------------------------------------------------------------
  // Exercises
  // -----------------------------------------------------------------------

  describe('addExercises', () => {
    it('appends the exercise to the draft and creates DB rows (one bare set, no history)', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });

      const added = await store.getState().addExercises([{ exerciseId: benchId }]);

      expect(added).toHaveLength(1);
      expect(store.getState().workout?.exercises).toHaveLength(1);
      expect(store.getState().workout?.exercises[0]?.exerciseId).toBe(benchId);
      expect(rawWorkoutExercise(driver, added[0]!.id)).toMatchObject({ exercise_id: benchId });
      expect(driver.queryAll(`SELECT id FROM sets WHERE workout_exercise_id = ?`, [added[0]!.id])).toHaveLength(1);
    });
  });

  describe('removeExercise', () => {
    it('removes it from the draft, deletes the DB row, and renumbers siblings', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a, b] = await store.getState().addExercises([{ exerciseId: benchId }, { exerciseId: squatId }]);

      await store.getState().removeExercise(a!.id);

      expect(store.getState().workout?.exercises).toHaveLength(1);
      expect(store.getState().workout?.exercises[0]?.id).toBe(b!.id);
      expect(store.getState().workout?.exercises[0]?.position).toBe(0);
      expect(rawWorkoutExercise(driver, a!.id)).toBeUndefined();
      expect(rawWorkoutExercise(driver, b!.id)).toMatchObject({ position: 0 });
    });
  });

  describe('reorderExercises', () => {
    it('applies the new order to both the draft and DB positions', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a, b] = await store.getState().addExercises([{ exerciseId: benchId }, { exerciseId: squatId }]);

      await store.getState().reorderExercises([b!.id, a!.id]);

      expect(store.getState().workout?.exercises.map((e) => e.id)).toEqual([b!.id, a!.id]);
      expect(rawWorkoutExercise(driver, b!.id)).toMatchObject({ position: 0 });
      expect(rawWorkoutExercise(driver, a!.id)).toMatchObject({ position: 1 });
    });
  });

  describe('replaceExercise', () => {
    it('repoints exerciseId and clears set values in both the draft and DB', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const setId = a!.sets[0]!.id;
      await store.getState().updateSet(setId, { weightKg: 80, reps: 8 });
      await store.getState().setCompleted(setId, true);

      await store.getState().replaceExercise(a!.id, squatId);

      const exercise = store.getState().workout?.exercises[0];
      expect(exercise?.exerciseId).toBe(squatId);
      expect(exercise?.sets[0]).toMatchObject({ weightKg: null, reps: null, isCompleted: false });
      expect(rawWorkoutExercise(driver, a!.id)).toMatchObject({ exercise_id: squatId });
      expect(rawSet(driver, setId)).toMatchObject({ weight_kg: null, is_completed: 0 });
    });
  });

  describe('updateExercise', () => {
    it('writes notes/restSeconds/supersetId ("note", superset, timer-change actions) through to draft + DB', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);

      await store.getState().updateExercise(a!.id, { notes: 'go heavy', restSeconds: 90, supersetId: 0 });

      expect(store.getState().workout?.exercises[0]).toMatchObject({
        notes: 'go heavy',
        restSeconds: 90,
        supersetId: 0,
      });
      expect(rawWorkoutExercise(driver, a!.id)).toMatchObject({
        notes: 'go heavy',
        rest_seconds: 90,
        superset_id: 0,
      });
    });
  });

  describe('removeFromSuperset (M2-12, 02 §8)', () => {
    it('a 2-member group: removing one clears BOTH exercises\' supersetId (auto-dissolve)', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a, b] = await store.getState().addExercises([{ exerciseId: benchId }, { exerciseId: squatId }]);
      await store.getState().updateExercise(a!.id, { supersetId: 0 });
      await store.getState().updateExercise(b!.id, { supersetId: 0 });

      await store.getState().removeFromSuperset(a!.id);

      expect(store.getState().workout?.exercises[0]).toMatchObject({ supersetId: null });
      expect(store.getState().workout?.exercises[1]).toMatchObject({ supersetId: null });
      expect(rawWorkoutExercise(driver, a!.id)).toMatchObject({ superset_id: null });
      expect(rawWorkoutExercise(driver, b!.id)).toMatchObject({ superset_id: null });
    });

    it('a 3-member group: removing one leaves the other two still grouped (no dissolution)', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const deadliftId = insertExercise(driver, 'deadlift');
      const [a, b, c] = await store.getState().addExercises([
        { exerciseId: benchId },
        { exerciseId: squatId },
        { exerciseId: deadliftId },
      ]);
      await store.getState().updateExercise(a!.id, { supersetId: 0 });
      await store.getState().updateExercise(b!.id, { supersetId: 0 });
      await store.getState().updateExercise(c!.id, { supersetId: 0 });

      await store.getState().removeFromSuperset(a!.id);

      expect(store.getState().workout?.exercises[0]).toMatchObject({ supersetId: null });
      expect(store.getState().workout?.exercises[1]).toMatchObject({ supersetId: 0 });
      expect(store.getState().workout?.exercises[2]).toMatchObject({ supersetId: 0 });
      expect(rawWorkoutExercise(driver, b!.id)).toMatchObject({ superset_id: 0 });
      expect(rawWorkoutExercise(driver, c!.id)).toMatchObject({ superset_id: 0 });
    });

    it('an already-ungrouped exercise: no-op beyond its own (already-null) supersetId', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);

      await store.getState().removeFromSuperset(a!.id);

      expect(store.getState().workout?.exercises[0]).toMatchObject({ supersetId: null });
      expect(store.getState().error).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Sets
  // -----------------------------------------------------------------------

  describe('addSet', () => {
    it('appends a bare set to the exercise in both draft and DB', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);

      const added = await store.getState().addSet(a!.id);

      expect(added).not.toBeNull();
      expect(store.getState().workout?.exercises[0]?.sets).toHaveLength(2);
      expect(driver.queryAll(`SELECT id FROM sets WHERE workout_exercise_id = ?`, [a!.id])).toHaveLength(2);
    });
  });

  describe('addWarmUpSets (M2-16)', () => {
    it('inserts new rows above the existing set(s) in both draft and DB, shifting positions', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const originalSetId = a!.sets[0]!.id;

      const updated = await store.getState().addWarmUpSets(a!.id, [
        { setType: 'warmup', weightKg: 20, reps: 10 },
        { setType: 'warmup', weightKg: 40, reps: 8 },
      ]);

      expect(updated).not.toBeNull();
      const draftSets = store.getState().workout!.exercises[0]!.sets;
      expect(draftSets.map((s) => ({ id: s.id, setType: s.setType, position: s.position }))).toEqual([
        expect.objectContaining({ setType: 'warmup', position: 0 }),
        expect.objectContaining({ setType: 'warmup', position: 1 }),
        expect.objectContaining({ id: originalSetId, setType: 'normal', position: 2 }),
      ]);
      const persisted = driver.queryAll(
        `SELECT id, set_type, position FROM sets WHERE workout_exercise_id = ? ORDER BY position ASC`,
        [a!.id],
      );
      expect(persisted).toEqual([
        expect.objectContaining({ set_type: 'warmup', position: 0 }),
        expect.objectContaining({ set_type: 'warmup', position: 1 }),
        expect.objectContaining({ id: originalSetId, set_type: 'normal', position: 2 }),
      ]);
    });

    it('rolls back to the exact prior draft and surfaces a DataError on repo failure', async () => {
      const failingDriver = driverThrowingOnCall(driver, 'UPDATE sets SET position', 1, 'boom');
      const failingRepo = new WorkoutRepositoryImpl(failingDriver, {});
      await store.getState().rehydrate(failingRepo);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const before = store.getState().workout;

      const result = await store.getState().addWarmUpSets(a!.id, [{ setType: 'warmup', weightKg: 20, reps: 10 }]);

      expect(result).toBeNull();
      expect(store.getState().workout).toEqual(before);
      expect(store.getState().error).toBeInstanceOf(DataError);
      expect(store.getState().error?.action).toBe('addWarmUpSets');
    });
  });

  describe('updateSet ("check set" value-entry path)', () => {
    it('writes weight/reps through to draft + DB, leaving sibling set object identities untouched', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const setA = a!.sets[0]!.id;
      const setB = (await store.getState().addSet(a!.id))!.id;
      const untouchedSetBefore = store.getState().workout!.exercises[0]!.sets.find((s) => s.id === setB);

      await store.getState().updateSet(setA, { weightKg: 100, reps: 5 });

      expect(store.getState().workout?.exercises[0]?.sets.find((s) => s.id === setA)).toMatchObject({
        weightKg: 100,
        reps: 5,
      });
      expect(rawSet(driver, setA)).toMatchObject({ weight_kg: 100, reps: 5 });
      // 06 §8 perf discipline: the sibling set's object reference is exactly
      // the same instance as before — a selector on setB would not re-render.
      const untouchedSetAfter = store.getState().workout!.exercises[0]!.sets.find((s) => s.id === setB);
      expect(untouchedSetAfter).toBe(untouchedSetBefore);
    });
  });

  describe('setCompleted ("check" flow)', () => {
    it('flips is_completed in draft + DB, and uncheck reverses it', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const setId = a!.sets[0]!.id;

      await store.getState().setCompleted(setId, true);
      expect(store.getState().workout?.exercises[0]?.sets[0]?.isCompleted).toBe(true);
      expect(rawSet(driver, setId)).toMatchObject({ is_completed: 1 });

      await store.getState().setCompleted(setId, false);
      expect(store.getState().workout?.exercises[0]?.sets[0]?.isCompleted).toBe(false);
      expect(rawSet(driver, setId)).toMatchObject({ is_completed: 0 });
    });
  });

  describe('setSetType', () => {
    it('re-badges the set in draft + DB', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const setId = a!.sets[0]!.id;

      await store.getState().setSetType(setId, 'warmup');

      expect(store.getState().workout?.exercises[0]?.sets[0]?.setType).toBe('warmup');
      expect(rawSet(driver, setId)).toMatchObject({ set_type: 'warmup' });
    });
  });

  describe('removeSet', () => {
    it('deletes the row and renumbers remaining siblings in draft + DB', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const firstSetId = a!.sets[0]!.id;
      const secondSetId = (await store.getState().addSet(a!.id))!.id;

      await store.getState().removeSet(firstSetId);

      expect(store.getState().workout?.exercises[0]?.sets).toHaveLength(1);
      expect(store.getState().workout?.exercises[0]?.sets[0]).toMatchObject({ id: secondSetId, position: 0 });
      expect(rawSet(driver, secondSetId)).toMatchObject({ position: 0 });
      expect(driver.queryAll(`SELECT id FROM sets WHERE id = ?`, [firstSetId])).toHaveLength(0);
    });
  });

  // -----------------------------------------------------------------------
  // Meta
  // -----------------------------------------------------------------------

  describe('updateMeta ("pause/resume stopwatch", title edit)', () => {
    it('writes title/durationPauseOffsetMs through to draft + DB', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1000 });

      await store.getState().updateMeta({ title: 'Renamed', durationPauseOffsetMs: 45000 });

      expect(store.getState().workout).toMatchObject({ title: 'Renamed', durationPauseOffsetMs: 45000 });
      const row = rawWorkout(driver, store.getState().workout!.id);
      expect(row).toMatchObject({ title: 'Renamed', duration_pause_offset_ms: 45000 });
    });
  });

  describe('previousSets (read-only pass-through)', () => {
    it('delegates to the repository', async () => {
      await store.getState().rehydrate(repository);
      const result = await store.getState().previousSets(benchId);
      expect(result).toEqual([]);
    });
  });

  describe('clearError', () => {
    it('resets error to null', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'A', startTime: 1 });
      await store.getState().startEmpty({ title: 'B', startTime: 2 }); // fails -> sets error
      expect(store.getState().error).not.toBeNull();

      store.getState().clearError();

      expect(store.getState().error).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Per-set/per-exercise selectors (06 §8)
  // -----------------------------------------------------------------------

  describe('selectors', () => {
    it('selectWorkoutSet/selectWorkoutExercise return null when nothing is active or the id is unknown', async () => {
      await store.getState().rehydrate(repository);
      expect(selectWorkoutSet('nope')(store.getState())).toBeNull();
      expect(selectWorkoutExercise('nope')(store.getState())).toBeNull();
    });

    it('selectWorkoutSet finds a set nested inside any exercise', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const setId = a!.sets[0]!.id;

      expect(selectWorkoutSet(setId)(store.getState())?.id).toBe(setId);
      expect(selectWorkoutExercise(a!.id)(store.getState())?.id).toBe(a!.id);
    });

    it('selectWorkoutSet keeps scanning past an exercise with no match to find the set on a later one', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [, b] = await store.getState().addExercises([{ exerciseId: benchId }, { exerciseId: squatId }]);
      const setOnSecondExercise = b!.sets[0]!.id;

      expect(selectWorkoutSet(setOnSecondExercise)(store.getState())?.id).toBe(setOnSecondExercise);
    });

    it('selectWorkoutSet returns null when a workout is active but the id matches no set anywhere', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      await store.getState().addExercises([{ exerciseId: benchId }]);

      expect(selectWorkoutSet('no-such-set')(store.getState())).toBeNull();
    });

    it('selectActiveWorkout returns the whole draft; selectActiveWorkoutError returns the current DataError', async () => {
      await store.getState().rehydrate(repository);
      expect(selectActiveWorkout(store.getState())).toBeNull();
      expect(selectActiveWorkoutError(store.getState())).toBeNull();

      const workout = await store.getState().startEmpty({ title: 'W', startTime: 1 });
      expect(selectActiveWorkout(store.getState())?.id).toBe(workout!.id);

      await store.getState().startEmpty({ title: 'dup', startTime: 2 }); // fails -> sets error
      expect(selectActiveWorkoutError(store.getState())).toBeInstanceOf(DataError);
    });
  });

  // -----------------------------------------------------------------------
  // toDataError (exported utility)
  // -----------------------------------------------------------------------

  describe('toDataError', () => {
    it('wraps a plain Error with the action name and preserves it as `cause`', () => {
      const original = new Error('boom');
      const wrapped = toDataError(original, 'updateSet');
      expect(wrapped).toBeInstanceOf(DataError);
      expect(wrapped.action).toBe('updateSet');
      expect(wrapped.cause).toBe(original);
      expect(wrapped.message).toBe('updateSet failed: boom');
    });

    it('wraps a non-Error thrown value via String()', () => {
      const wrapped = toDataError('a bare string throw', 'removeSet');
      expect(wrapped.message).toBe('removeSet failed: a bare string throw');
    });

    it('passes an already-wrapped DataError through unchanged (idempotent)', () => {
      const already = new DataError('already wrapped', 'finish', new Error('inner'));
      expect(toDataError(already, 'setCompleted')).toBe(already);
    });
  });

  // -----------------------------------------------------------------------
  // Guard rail: every mutator on a known-id row requires an active workout
  // -----------------------------------------------------------------------

  describe('requireWorkout guard', () => {
    it('rejects with a clear error when called with no active workout', async () => {
      await store.getState().rehydrate(repository);
      await expect(store.getState().updateSet('missing-set', { weightKg: 1 })).rejects.toThrow(
        /no active workout/,
      );
    });
  });

  describe('removeSet on an unknown id', () => {
    it('rejects rather than silently no-op-ing', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      await expect(store.getState().removeSet('not-a-real-set-id')).rejects.toThrow(/not found/);
    });
  });

  describe('reorderExercises with a malformed id list', () => {
    it('leaves the draft unchanged and surfaces the repository\'s ReorderMismatchError as a DataError', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a, b] = await store.getState().addExercises([{ exerciseId: benchId }, { exerciseId: squatId }]);
      const beforeSnapshot = store.getState().workout;

      await store.getState().reorderExercises([a!.id, b!.id, 'bogus-extra-id']);

      expect(store.getState().workout).toEqual(beforeSnapshot);
      expect(store.getState().error).toBeInstanceOf(DataError);
    });
  });

  // -----------------------------------------------------------------------
  // updateExercise/updateSet targeting an id absent from the draft
  // (`withExercise`/`withSet`'s own "no match" fallback) — the repository
  // itself then throws its own not-found error, so this doubles as a
  // robustness check: a stale/foreign id never silently corrupts the draft.
  // -----------------------------------------------------------------------

  describe('updateExercise/updateSet with an id absent from the current draft', () => {
    it('updateExercise: draft is left exactly as it was and a DataError surfaces', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      await store.getState().addExercises([{ exerciseId: benchId }]);
      const beforeSnapshot = store.getState().workout;

      await store.getState().updateExercise('not-a-real-workout-exercise-id', { notes: 'x' });

      expect(store.getState().workout).toEqual(beforeSnapshot);
      expect(store.getState().error).toBeInstanceOf(DataError);
    });

    it('updateSet: draft is left exactly as it was and a DataError surfaces', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      await store.getState().addExercises([{ exerciseId: benchId }]);
      const beforeSnapshot = store.getState().workout;

      await store.getState().updateSet('not-a-real-set-id', { weightKg: 1 });

      expect(store.getState().workout).toEqual(beforeSnapshot);
      expect(store.getState().error).toBeInstanceOf(DataError);
    });
  });

  // -----------------------------------------------------------------------
  // Patch-field undefined-vs-provided coverage (the `!== undefined ? … : …`
  // "leave unchanged" convention `updateSet`/`updateExercise`/`updateMeta`
  // share with `WorkoutRepositoryImpl` — see that file's header) — the
  // suites above always exercise one side of each field's ternary; these
  // fill in whichever side was still missing.
  // -----------------------------------------------------------------------

  describe('patch convention: the other side of each undefined-vs-provided ternary', () => {
    it('updateSet: omitting weight/reps keeps them, while distance/duration/rpe/customMetric (provided) do update', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const setId = a!.sets[0]!.id;
      await store.getState().updateSet(setId, { weightKg: 50, reps: 5 });

      await store.getState().updateSet(setId, {
        distanceMeters: 100,
        durationSeconds: 30,
        rpe: 8,
        customMetric: 12,
      });

      const set = store.getState().workout?.exercises[0]?.sets[0];
      expect(set).toMatchObject({
        weightKg: 50,
        reps: 5,
        distanceMeters: 100,
        durationSeconds: 30,
        rpe: 8,
        customMetric: 12,
      });
    });

    it('updateExercise: omitting notes keeps it, while restSeconds (provided) does update', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId, notes: 'keep me' }]);

      await store.getState().updateExercise(a!.id, { restSeconds: 45 });

      expect(store.getState().workout?.exercises[0]).toMatchObject({ notes: 'keep me', restSeconds: 45 });
    });

    it('updateMeta: omitting title keeps it, while description/startTime/endTime (provided) do update', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'Keep this title', startTime: 1 });

      await store.getState().updateMeta({ description: 'new desc', startTime: 500, endTime: 999_999 });

      expect(store.getState().workout).toMatchObject({
        title: 'Keep this title',
        description: 'new desc',
        startTime: 500,
        endTime: 999_999,
      });
    });
  });

  // -----------------------------------------------------------------------
  // Race safety: the defensive `state.workout ? … : state` guard in every
  // post-await success reconciliation (addExercises/replaceExercise/
  // updateExercise/addSet/updateSet/setSetType/setCompleted) — proven by
  // deliberately racing a synchronous `store.setState({ workout: null })`
  // (standing in for a concurrent `discard()`) into the gap between an
  // action starting its repo `await` and that same action's success
  // callback running. The repo write itself still lands for real (nothing
  // about the DB write is raced) — only the in-memory reconciliation must
  // no-op rather than resurrect a cleared draft.
  // -----------------------------------------------------------------------

  describe('race safety: workout cleared mid-await (defensive null-workout guards)', () => {
    it('addExercises', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const pending = store.getState().addExercises([{ exerciseId: benchId }]);
      store.setState({ workout: null });
      await pending;
      expect(store.getState().workout).toBeNull();
    });

    it('replaceExercise', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const pending = store.getState().replaceExercise(a!.id, squatId);
      store.setState({ workout: null });
      await pending;
      expect(store.getState().workout).toBeNull();
    });

    it('updateExercise', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const pending = store.getState().updateExercise(a!.id, { notes: 'x' });
      store.setState({ workout: null });
      await pending;
      expect(store.getState().workout).toBeNull();
    });

    it('addSet', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const pending = store.getState().addSet(a!.id);
      store.setState({ workout: null });
      await pending;
      expect(store.getState().workout).toBeNull();
    });

    it('updateSet', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const pending = store.getState().updateSet(a!.sets[0]!.id, { weightKg: 1 });
      store.setState({ workout: null });
      await pending;
      expect(store.getState().workout).toBeNull();
    });

    it('setSetType', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const pending = store.getState().setSetType(a!.sets[0]!.id, 'dropset');
      store.setState({ workout: null });
      await pending;
      expect(store.getState().workout).toBeNull();
    });

    it('setCompleted', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const pending = store.getState().setCompleted(a!.sets[0]!.id, true);
      store.setState({ workout: null });
      await pending;
      expect(store.getState().workout).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // Rollback on repo failure (08 §4.9) — injected failing driver
  // -----------------------------------------------------------------------

  describe('rollback on repo failure', () => {
    it('updateSet: draft reverts to its pre-action snapshot, a DataError surfaces, DB shows no partial write', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const setId = a!.sets[0]!.id;

      const beforeSnapshot = store.getState().workout;
      const captureErrorSpy = jest.spyOn(sentry, 'captureError');

      const failingDriver = driverThrowingOnCall(driver, 'UPDATE sets', 1, 'simulated disk failure');
      const failingRepository = new WorkoutRepositoryImpl(failingDriver);
      const failingStore = createActiveWorkoutStore();
      await failingStore.getState().rehydrate(failingRepository);

      await failingStore.getState().updateSet(setId, { weightKg: 999, reps: 999 });

      expect(failingStore.getState().workout).toEqual(beforeSnapshot);
      expect(failingStore.getState().error).toBeInstanceOf(DataError);
      expect(failingStore.getState().error?.action).toBe('updateSet');
      expect(captureErrorSpy).toHaveBeenCalledWith(expect.any(Error));
      // No partial write landed — the driver's transaction() rolled back.
      expect(rawSet(driver, setId)).toMatchObject({ weight_kg: null, reps: null });
    });

    it('removeExercise: draft and DB both keep the exercise when the repo call fails', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const beforeSnapshot = store.getState().workout;

      const failingDriver = driverThrowingOnCall(
        driver,
        'DELETE FROM workout_exercises',
        1,
        'simulated disk failure',
      );
      const failingRepository = new WorkoutRepositoryImpl(failingDriver);
      const failingStore = createActiveWorkoutStore();
      await failingStore.getState().rehydrate(failingRepository);

      await failingStore.getState().removeExercise(a!.id);

      expect(failingStore.getState().workout).toEqual(beforeSnapshot);
      expect(failingStore.getState().error).toBeInstanceOf(DataError);
      expect(rawWorkoutExercise(driver, a!.id)).toBeDefined();
    });

    it('addExercises: on failure the draft is left exactly as it was (nothing to roll back — no id was drafted yet)', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const beforeSnapshot = store.getState().workout;

      const failingDriver = driverThrowingOnCall(
        driver,
        'INSERT INTO workout_exercises',
        1,
        'simulated disk failure',
      );
      const failingRepository = new WorkoutRepositoryImpl(failingDriver);
      const failingStore = createActiveWorkoutStore();
      await failingStore.getState().rehydrate(failingRepository);

      const added = await failingStore.getState().addExercises([{ exerciseId: benchId }]);

      expect(added).toEqual([]);
      expect(failingStore.getState().workout).toEqual(beforeSnapshot);
      expect(failingStore.getState().error).toBeInstanceOf(DataError);
    });

    it('discard: draft is restored and the DB row still exists when the repo call fails', async () => {
      await store.getState().rehydrate(repository);
      const created = await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const beforeSnapshot = store.getState().workout;

      const failingDriver = driverThrowingOnCall(driver, 'DELETE FROM workouts', 1, 'simulated disk failure');
      const failingRepository = new WorkoutRepositoryImpl(failingDriver);
      const failingStore = createActiveWorkoutStore();
      await failingStore.getState().rehydrate(failingRepository);

      await failingStore.getState().discard();

      expect(failingStore.getState().workout).toEqual(beforeSnapshot);
      expect(failingStore.getState().error).toBeInstanceOf(DataError);
      expect(rawWorkout(driver, created!.id)).toBeDefined();
    });

    it('finish: draft (and active DB row) are restored when the repo call fails', async () => {
      await store.getState().rehydrate(repository);
      const created = await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const beforeSnapshot = store.getState().workout;

      const failingDriver = driverThrowingOnCall(driver, 'UPDATE workouts', 1, 'simulated disk failure');
      const failingRepository = new WorkoutRepositoryImpl(failingDriver);
      const failingStore = createActiveWorkoutStore();
      await failingStore.getState().rehydrate(failingRepository);

      const result = await failingStore.getState().finish();

      expect(result).toBeNull();
      expect(failingStore.getState().workout).toEqual(beforeSnapshot);
      expect(failingStore.getState().error).toBeInstanceOf(DataError);
      expect(rawWorkout(driver, created!.id)).toMatchObject({ state: 'active' });
    });

    it('replaceExercise: draft and DB both keep the original exercise when the repo call fails', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const beforeSnapshot = store.getState().workout;

      const failingDriver = driverThrowingOnCall(
        driver,
        'UPDATE workout_exercises SET exercise_id',
        1,
        'simulated disk failure',
      );
      const failingRepository = new WorkoutRepositoryImpl(failingDriver);
      const failingStore = createActiveWorkoutStore();
      await failingStore.getState().rehydrate(failingRepository);

      await failingStore.getState().replaceExercise(a!.id, squatId);

      expect(failingStore.getState().workout).toEqual(beforeSnapshot);
      expect(failingStore.getState().error).toBeInstanceOf(DataError);
      expect(rawWorkoutExercise(driver, a!.id)).toMatchObject({ exercise_id: benchId });
    });

    it('updateExercise: draft and DB both keep the prior notes/restSeconds when the repo call fails', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const beforeSnapshot = store.getState().workout;

      const failingDriver = driverThrowingOnCall(
        driver,
        'UPDATE workout_exercises SET notes',
        1,
        'simulated disk failure',
      );
      const failingRepository = new WorkoutRepositoryImpl(failingDriver);
      const failingStore = createActiveWorkoutStore();
      await failingStore.getState().rehydrate(failingRepository);

      await failingStore.getState().updateExercise(a!.id, { notes: 'should not stick' });

      expect(failingStore.getState().workout).toEqual(beforeSnapshot);
      expect(failingStore.getState().error).toBeInstanceOf(DataError);
      expect(rawWorkoutExercise(driver, a!.id)).toMatchObject({ notes: null });
    });

    it('addSet: draft is left exactly as it was (nothing to roll back) and DB gains no row when the repo call fails', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const beforeSnapshot = store.getState().workout;

      const failingDriver = driverThrowingOnCall(driver, 'INSERT INTO sets', 1, 'simulated disk failure');
      const failingRepository = new WorkoutRepositoryImpl(failingDriver);
      const failingStore = createActiveWorkoutStore();
      await failingStore.getState().rehydrate(failingRepository);

      const added = await failingStore.getState().addSet(a!.id);

      expect(added).toBeNull();
      expect(failingStore.getState().workout).toEqual(beforeSnapshot);
      expect(failingStore.getState().error).toBeInstanceOf(DataError);
      expect(driver.queryAll(`SELECT id FROM sets WHERE workout_exercise_id = ?`, [a!.id])).toHaveLength(1);
    });

    it('removeSet: draft and DB both keep the set when the repo call fails', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const setId = a!.sets[0]!.id;
      const beforeSnapshot = store.getState().workout;

      const failingDriver = driverThrowingOnCall(
        driver,
        'DELETE FROM sets WHERE id',
        1,
        'simulated disk failure',
      );
      const failingRepository = new WorkoutRepositoryImpl(failingDriver);
      const failingStore = createActiveWorkoutStore();
      await failingStore.getState().rehydrate(failingRepository);

      await failingStore.getState().removeSet(setId);

      expect(failingStore.getState().workout).toEqual(beforeSnapshot);
      expect(failingStore.getState().error).toBeInstanceOf(DataError);
      expect(rawSet(driver, setId)).toBeDefined();
    });

    it('setSetType: draft and DB both keep the prior type when the repo call fails', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const setId = a!.sets[0]!.id;
      const beforeSnapshot = store.getState().workout;

      const failingDriver = driverThrowingOnCall(
        driver,
        'UPDATE sets SET set_type',
        1,
        'simulated disk failure',
      );
      const failingRepository = new WorkoutRepositoryImpl(failingDriver);
      const failingStore = createActiveWorkoutStore();
      await failingStore.getState().rehydrate(failingRepository);

      await failingStore.getState().setSetType(setId, 'dropset');

      expect(failingStore.getState().workout).toEqual(beforeSnapshot);
      expect(failingStore.getState().error).toBeInstanceOf(DataError);
      expect(rawSet(driver, setId)).toMatchObject({ set_type: 'normal' });
    });

    it('setCompleted: draft and DB both keep is_completed=0 when the repo call fails', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'W', startTime: 1 });
      const [a] = await store.getState().addExercises([{ exerciseId: benchId }]);
      const setId = a!.sets[0]!.id;
      const beforeSnapshot = store.getState().workout;

      const failingDriver = driverThrowingOnCall(
        driver,
        'UPDATE sets SET is_completed',
        1,
        'simulated disk failure',
      );
      const failingRepository = new WorkoutRepositoryImpl(failingDriver);
      const failingStore = createActiveWorkoutStore();
      await failingStore.getState().rehydrate(failingRepository);

      await failingStore.getState().setCompleted(setId, true);

      expect(failingStore.getState().workout).toEqual(beforeSnapshot);
      expect(failingStore.getState().error).toBeInstanceOf(DataError);
      expect(rawSet(driver, setId)).toMatchObject({ is_completed: 0 });
    });

    it('updateMeta: draft and DB both keep the prior title when the repo call fails', async () => {
      await store.getState().rehydrate(repository);
      await store.getState().startEmpty({ title: 'Original', startTime: 1 });
      const beforeSnapshot = store.getState().workout;

      const failingDriver = driverThrowingOnCall(driver, 'UPDATE workouts', 1, 'simulated disk failure');
      const failingRepository = new WorkoutRepositoryImpl(failingDriver);
      const failingStore = createActiveWorkoutStore();
      await failingStore.getState().rehydrate(failingRepository);

      await failingStore.getState().updateMeta({ title: 'Should not stick' });

      expect(failingStore.getState().workout).toEqual(beforeSnapshot);
      expect(failingStore.getState().error).toBeInstanceOf(DataError);
      expect(rawWorkout(driver, beforeSnapshot!.id)).toMatchObject({ title: 'Original' });
    });
  });
});
