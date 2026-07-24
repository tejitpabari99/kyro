/**
 * `WorkoutRepositoryImpl` lifecycle integration tests (M2-01 acceptance
 * gate) — run fully in Node via `better-sqlite3` against the real migrated
 * schema (05 §10 / 08 §5 parity), same pattern
 * `src/data/exercises/__tests__/exercise-repository.test.ts` (M1-06)
 * established: one `describe` per method, happy path + the task's named
 * edge cases (one-active throw, auto-heal, finish fixtures, soft-delete).
 *
 * `workout_exercises`/`sets` rows this suite needs beyond what the
 * repository itself creates are inserted directly via raw SQL against the
 * driver — the granular mutators (`addExercises`, `addSet`, …) don't exist
 * until M2-02, exactly the same reasoning `exercise-repository.test.ts`
 * used for `workouts`/`workout_exercises` before `WorkoutRepository` existed
 * at all.
 */
import { RoutineRepositoryImpl } from '../../routines/routine-repository';
import { openBetterSqlite3Driver } from '../../sqlite/driver.better-sqlite3';
import { migrate } from '../../sqlite/migrator';
import type { SqliteDriver } from '../../sqlite/driver';
import {
  ActiveWorkoutExistsError,
  RoutineNotFoundForWorkoutError,
  WorkoutNotActiveError,
  WorkoutNotFoundError,
} from '../errors';
import type { AutoHealEvent } from '../types';
import { WorkoutRepositoryImpl } from '../workout-repository';

/** Wrap a real driver so its `execute` throws `message` the first time a SQL statement containing `sqlContains` runs, then behaves normally after — same TOCTOU-race simulation helper `exercise-repository.test.ts` uses. */
function driverThrowingOnce(real: SqliteDriver, sqlContains: string, message: string): SqliteDriver {
  let hasThrown = false;
  return {
    ...real,
    execute(sql, params) {
      if (!hasThrown && sql.includes(sqlContains)) {
        hasThrown = true;
        throw new Error(message);
      }
      return real.execute(sql, params);
    },
  };
}

describe('WorkoutRepositoryImpl — lifecycle (M2-01 integration, better-sqlite3)', () => {
  let driver: SqliteDriver;
  let repo: WorkoutRepositoryImpl;
  let onAutoHeal: jest.Mock<void, [AutoHealEvent]>;
  let benchId: string;
  let squatId: string;

  beforeEach(() => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    onAutoHeal = jest.fn();
    repo = new WorkoutRepositoryImpl(driver, { onAutoHeal });
    benchId = insertExercise(driver, 'bench-press');
    squatId = insertExercise(driver, 'back-squat');
  });

  afterEach(() => {
    driver.close();
  });

  // -------------------------------------------------------------------
  // getActive / startEmpty
  // -------------------------------------------------------------------
  describe('getActive / startEmpty', () => {
    it('getActive returns null when there is no active workout', async () => {
      expect(await repo.getActive()).toBeNull();
    });

    it('startEmpty creates an active workout with no exercises', async () => {
      const workout = await repo.startEmpty({ title: 'Morning Workout', startTime: 1_000 });

      expect(workout.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(workout.title).toBe('Morning Workout');
      expect(workout.state).toBe('active');
      expect(workout.startTime).toBe(1_000);
      expect(workout.endTime).toBeNull();
      expect(workout.durationPauseOffsetMs).toBe(0);
      expect(workout.routineId).toBeNull();
      expect(workout.exercises).toEqual([]);

      const active = await repo.getActive();
      expect(active).toEqual(workout);
    });

    it('throws ActiveWorkoutExistsError from startEmpty when a workout is already active', async () => {
      const first = await repo.startEmpty({ title: 'First', startTime: 1_000 });

      await expect(repo.startEmpty({ title: 'Second', startTime: 2_000 })).rejects.toBeInstanceOf(
        ActiveWorkoutExistsError,
      );
      // The failed attempt must not have touched the existing active workout.
      expect((await repo.getActive())!.id).toBe(first.id);
    });

    it('translates a raw UNIQUE-constraint INSERT failure into ActiveWorkoutExistsError (defensive race path)', async () => {
      // No active workout exists, so the pre-check passes — but the INSERT
      // itself still fails with the raw SQLite message (simulating the
      // benign TOCTOU race between the pre-check and the write, the same
      // scenario `ExerciseRepositoryImpl.create`'s defensive `catch` exists
      // for). The defensive `catch` in `startEmpty` must translate it.
      const raceDriver = driverThrowingOnce(
        driver,
        'INSERT INTO workouts',
        'UNIQUE constraint failed: workouts.state',
      );
      const raceRepo = new WorkoutRepositoryImpl(raceDriver, { onAutoHeal });

      await expect(
        raceRepo.startEmpty({ title: 'Race', startTime: 3_000 }),
      ).rejects.toBeInstanceOf(ActiveWorkoutExistsError);
    });

  });

  // -------------------------------------------------------------------
  // startFromRoutine (M3-05, 02 §1/§6, 04 §2.3)
  // -------------------------------------------------------------------
  describe('startFromRoutine', () => {
    let routineRepo: RoutineRepositoryImpl;

    beforeEach(() => {
      routineRepo = new RoutineRepositoryImpl(driver);
    });

    it('pre-populates exercises in order, unchecked bare sets carrying no values, rest/notes/superset copied, routine_id + title + description set', async () => {
      const routine = await routineRepo.create({
        title: 'Push Day',
        notes: 'Warm up shoulders first.',
        exercises: [
          {
            exerciseId: benchId,
            supersetId: 5,
            notes: 'Slow eccentric',
            restSeconds: 120,
            sets: [
              { setType: 'warmup', weightKg: 20, reps: 10 },
              { setType: 'normal', weightKg: 60, reps: 8 },
              { setType: 'normal', weightKg: 60, reps: 8 },
            ],
          },
          {
            exerciseId: squatId,
            supersetId: 5,
            notes: null,
            restSeconds: 90,
            sets: [{ setType: 'normal', weightKg: 100, reps: 5 }],
          },
        ],
      });

      const workout = await repo.startFromRoutine(routine.id);

      expect(workout.state).toBe('active');
      expect(workout.routineId).toBe(routine.id);
      expect(workout.title).toBe('Push Day');
      expect(workout.description).toBe('Warm up shoulders first.');
      expect(workout.exercises).toHaveLength(2);

      const [bench, squat] = workout.exercises;
      expect(bench!.exerciseId).toBe(benchId);
      expect(bench!.position).toBe(0);
      expect(bench!.supersetId).toBe(5);
      expect(bench!.notes).toBe('Slow eccentric');
      expect(bench!.restSeconds).toBe(120);
      expect(bench!.sets).toHaveLength(3);
      expect(bench!.sets.map((s) => s.setType)).toEqual(['warmup', 'normal', 'normal']);
      expect(bench!.sets.map((s) => s.position)).toEqual([0, 1, 2]);
      // Nothing pre-checked; no target values baked onto the row (02 §1
      // acceptance: "nothing is pre-checked" — targets are a live-render
      // concern, see this repo's own M3-05 header note).
      for (const s of bench!.sets) {
        expect(s.isCompleted).toBe(false);
        expect(s.weightKg).toBeNull();
        expect(s.reps).toBeNull();
        expect(s.distanceMeters).toBeNull();
        expect(s.durationSeconds).toBeNull();
        expect(s.rpe).toBeNull();
        expect(s.customMetric).toBeNull();
      }

      expect(squat!.exerciseId).toBe(squatId);
      expect(squat!.position).toBe(1);
      expect(squat!.supersetId).toBe(5);
      expect(squat!.notes).toBeNull();
      expect(squat!.restSeconds).toBe(90);
      expect(squat!.sets).toHaveLength(1);
    });

    it('copies a rep-range set as a bare unchecked "normal" row (target itself lives only on routine_sets, never on sets)', async () => {
      const routine = await routineRepo.create({
        title: 'Legs',
        exercises: [
          {
            exerciseId: squatId,
            sets: [{ setType: 'normal', repRangeStart: 6, repRangeEnd: 8 }],
          },
        ],
      });

      const workout = await repo.startFromRoutine(routine.id);

      const set = workout.exercises[0]!.sets[0]!;
      expect(set.setType).toBe('normal');
      expect(set.isCompleted).toBe(false);
      expect(set.reps).toBeNull();
      expect(set.weightKg).toBeNull();
    });

    it('supports a zero-exercise routine (04 §2.1: allowed)', async () => {
      const routine = await routineRepo.create({ title: 'Empty Routine' });

      const workout = await repo.startFromRoutine(routine.id);

      expect(workout.exercises).toEqual([]);
      expect(workout.routineId).toBe(routine.id);
      expect(workout.title).toBe('Empty Routine');
    });

    it('description is null when the routine has no notes', async () => {
      const routine = await routineRepo.create({ title: 'No Notes' });
      const workout = await repo.startFromRoutine(routine.id);
      expect(workout.description).toBeNull();
    });

    it('throws RoutineNotFoundForWorkoutError for an unknown routine id', async () => {
      await expect(repo.startFromRoutine('does-not-exist')).rejects.toBeInstanceOf(
        RoutineNotFoundForWorkoutError,
      );
      expect(await repo.getActive()).toBeNull();
    });

    it('throws ActiveWorkoutExistsError when a workout is already active — does not bypass the one-active invariant', async () => {
      const routine = await routineRepo.create({ title: 'Push Day' });
      const first = await repo.startFromRoutine(routine.id);

      await expect(repo.startFromRoutine(routine.id)).rejects.toBeInstanceOf(
        ActiveWorkoutExistsError,
      );
      expect((await repo.getActive())!.id).toBe(first.id);
    });
  });

  // -------------------------------------------------------------------
  // getActive auto-heal (06 §9 / 08 §4.9)
  // -------------------------------------------------------------------
  describe('getActive — auto-heal', () => {
    it('keeps the newest of multiple active workouts, completes the rest, and reports via onAutoHeal', async () => {
      // The partial unique index (idx_one_active_workout) is the real
      // backstop against this ever happening through the app's own repo
      // methods — reaching the "somehow violated" state 06 §9 describes
      // requires bypassing it directly, exactly as a pre-index legacy row
      // or a migration bug would.
      driver.execute(`DROP INDEX idx_one_active_workout`);

      const now = Date.now();
      driver.execute(
        `INSERT INTO workouts (id, title, state, start_time, created_at, updated_at)
         VALUES ('older-active', 'Older', 'active', ?, ?, ?)`,
        [now - 10_000, now - 10_000, now - 10_000],
      );
      driver.execute(
        `INSERT INTO workouts (id, title, state, start_time, created_at, updated_at)
         VALUES ('newer-active', 'Newer', 'active', ?, ?, ?)`,
        [now, now, now],
      );

      const active = await repo.getActive();

      expect(active!.id).toBe('newer-active');
      expect(active!.state).toBe('active');

      expect(onAutoHeal).toHaveBeenCalledTimes(1);
      expect(onAutoHeal).toHaveBeenCalledWith({
        keptWorkoutId: 'newer-active',
        healedWorkoutIds: ['older-active'],
      });

      const healedRow = driver.queryAll<{
        state: string;
        end_time: number | null;
        updated_at: number;
      }>(`SELECT state, end_time, updated_at FROM workouts WHERE id = 'older-active'`)[0]!;
      expect(healedRow.state).toBe('completed');
      expect(healedRow.end_time).toBe(healedRow.updated_at);
      expect(healedRow.end_time).not.toBeNull();

      // Re-querying should be a stable no-op now that only one active row remains.
      onAutoHeal.mockClear();
      const activeAgain = await repo.getActive();
      expect(activeAgain!.id).toBe('newer-active');
      expect(onAutoHeal).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------
  // discard
  // -------------------------------------------------------------------
  describe('discard', () => {
    it('deletes the active workout and cascades its exercises/sets', async () => {
      const workout = await repo.startEmpty({ title: 'To Discard', startTime: 1_000 });
      const weId = insertWorkoutExercise(driver, workout.id, benchId, 0);
      insertSet(driver, weId, 0, { weightKg: 60, reps: 8, isCompleted: 1 });

      await repo.discard(workout.id);

      expect(await repo.getActive()).toBeNull();
      expect(await repo.getFull(workout.id)).toBeNull();
      expect(driver.queryAll(`SELECT * FROM workout_exercises WHERE id = ?`, [weId])).toEqual([]);
      expect(driver.queryAll(`SELECT * FROM sets WHERE workout_exercise_id = ?`, [weId])).toEqual(
        [],
      );
    });

    it('throws WorkoutNotFoundError for an unknown id', async () => {
      await expect(repo.discard('does-not-exist')).rejects.toBeInstanceOf(WorkoutNotFoundError);
    });

    it('throws WorkoutNotActiveError for a completed workout', async () => {
      const workout = await repo.startEmpty({ title: 'Finish Me', startTime: 1_000 });
      await repo.finish(workout.id);

      await expect(repo.discard(workout.id)).rejects.toBeInstanceOf(WorkoutNotActiveError);
    });
  });

  // -------------------------------------------------------------------
  // finish
  // -------------------------------------------------------------------
  describe('finish', () => {
    it('unchanged fixture: all sets checked — nothing deleted, positions untouched, state/end_time set', async () => {
      const workout = await repo.startEmpty({ title: 'Leg Day', startTime: 1_000 });
      const weId = insertWorkoutExercise(driver, workout.id, squatId, 0);
      insertSet(driver, weId, 0, { weightKg: 100, reps: 5, isCompleted: 1 });
      insertSet(driver, weId, 1, { weightKg: 100, reps: 5, isCompleted: 1 });

      const finished = await repo.finish(workout.id);

      expect(finished.state).toBe('completed');
      expect(finished.endTime).not.toBeNull();
      expect(finished.exercises).toHaveLength(1);
      expect(finished.exercises[0]!.sets).toHaveLength(2);
      expect(finished.exercises[0]!.sets.map((s) => s.position)).toEqual([0, 1]);
      expect(finished.exercises[0]!.sets.every((s) => s.isCompleted)).toBe(true);
    });

    it('value-change fixture: meta overrides (title/description/start/end) are applied', async () => {
      const workout = await repo.startEmpty({ title: 'Original Title', startTime: 1_000 });
      const weId = insertWorkoutExercise(driver, workout.id, benchId, 0);
      insertSet(driver, weId, 0, { weightKg: 60, reps: 8, isCompleted: 1 });

      const finished = await repo.finish(workout.id, {
        title: 'Renamed Workout',
        description: 'Felt strong today',
        startTime: 500,
        endTime: 9_000,
      });

      expect(finished.title).toBe('Renamed Workout');
      expect(finished.description).toBe('Felt strong today');
      expect(finished.startTime).toBe(500);
      expect(finished.endTime).toBe(9_000);
    });

    it('structural fixture: unchecked sets deleted, an exercise left with zero sets is dropped, positions renumbered contiguous', async () => {
      const workout = await repo.startEmpty({ title: 'Push Day', startTime: 1_000 });

      // Exercise 0 (bench): one checked, one unchecked → survives with 1 set at position 0.
      const benchWe = insertWorkoutExercise(driver, workout.id, benchId, 0);
      insertSet(driver, benchWe, 0, { weightKg: 60, reps: 8, isCompleted: 1 });
      insertSet(driver, benchWe, 1, { weightKg: 60, reps: 6, isCompleted: 0 });

      // Exercise 1 (squat): entirely unchecked → dropped entirely.
      const squatWe = insertWorkoutExercise(driver, workout.id, squatId, 1);
      insertSet(driver, squatWe, 0, { weightKg: 100, reps: 5, isCompleted: 0 });

      // Exercise 2 (bench again — duplicate exercise, distinct workout_exercise row):
      // both checked → survives fully, and its position must renumber down
      // to 1 once exercise 1 (squat) is dropped.
      const benchWe2 = insertWorkoutExercise(driver, workout.id, benchId, 2);
      insertSet(driver, benchWe2, 0, { weightKg: 65, reps: 8, isCompleted: 1 });
      insertSet(driver, benchWe2, 1, { weightKg: 65, reps: 7, isCompleted: 1 });

      const finished = await repo.finish(workout.id);

      expect(finished.exercises).toHaveLength(2);

      const [first, second] = finished.exercises;
      expect(first!.id).toBe(benchWe);
      expect(first!.position).toBe(0);
      expect(first!.sets).toHaveLength(1);
      expect(first!.sets[0]!.position).toBe(0);
      expect(first!.sets[0]!.reps).toBe(8);

      expect(second!.id).toBe(benchWe2);
      expect(second!.position).toBe(1);
      expect(second!.sets).toHaveLength(2);
      expect(second!.sets.map((s) => s.position)).toEqual([0, 1]);

      expect(driver.queryAll(`SELECT * FROM workout_exercises WHERE id = ?`, [squatWe])).toEqual(
        [],
      );
    });

    it('superset auto-dissolve: a member entirely dropped (all sets unchecked) leaves the survivor ungrouped (M2-19 follow-up review)', async () => {
      const workout = await repo.startEmpty({ title: 'Push Day', startTime: 1_000 });

      // Two-member superset (group id 0): bench survives (one checked set),
      // squat is dropped entirely (its only set is unchecked) — bench
      // should come out of finish() with superset_id NULL, not still 0.
      const benchWe = insertWorkoutExercise(driver, workout.id, benchId, 0, { supersetId: 0 });
      insertSet(driver, benchWe, 0, { weightKg: 60, reps: 8, isCompleted: 1 });

      const squatWe = insertWorkoutExercise(driver, workout.id, squatId, 1, { supersetId: 0 });
      insertSet(driver, squatWe, 0, { weightKg: 100, reps: 5, isCompleted: 0 });

      const finished = await repo.finish(workout.id);

      expect(finished.exercises).toHaveLength(1);
      expect(finished.exercises[0]!.id).toBe(benchWe);
      expect(finished.exercises[0]!.supersetId).toBeNull();
    });

    it('superset auto-dissolve: a still-2+-member group keeps its superset_id (control case)', async () => {
      const workout = await repo.startEmpty({ title: 'Push Day', startTime: 1_000 });

      const benchWe = insertWorkoutExercise(driver, workout.id, benchId, 0, { supersetId: 0 });
      insertSet(driver, benchWe, 0, { weightKg: 60, reps: 8, isCompleted: 1 });

      const benchWe2 = insertWorkoutExercise(driver, workout.id, benchId, 1, { supersetId: 0 });
      insertSet(driver, benchWe2, 0, { weightKg: 65, reps: 7, isCompleted: 1 });

      const finished = await repo.finish(workout.id);

      expect(finished.exercises).toHaveLength(2);
      expect(finished.exercises[0]!.supersetId).toBe(0);
      expect(finished.exercises[1]!.supersetId).toBe(0);
    });

    it('throws WorkoutNotFoundError for an unknown id', async () => {
      await expect(repo.finish('does-not-exist')).rejects.toBeInstanceOf(WorkoutNotFoundError);
    });

    it('throws WorkoutNotActiveError when the workout is already completed', async () => {
      const workout = await repo.startEmpty({ title: 'Already Done', startTime: 1_000 });
      await repo.finish(workout.id);

      await expect(repo.finish(workout.id)).rejects.toBeInstanceOf(WorkoutNotActiveError);
    });
  });

  // -------------------------------------------------------------------
  // getFull
  // -------------------------------------------------------------------
  describe('getFull', () => {
    it('returns null for an unknown id', async () => {
      expect(await repo.getFull('does-not-exist')).toBeNull();
    });

    it('hydrates exercises and sets in position order', async () => {
      const workout = await repo.startEmpty({ title: 'Full Hydrate', startTime: 1_000 });
      const weId = insertWorkoutExercise(driver, workout.id, benchId, 0);
      insertSet(driver, weId, 1, { weightKg: 61, reps: 7 });
      insertSet(driver, weId, 0, { weightKg: 60, reps: 8 });

      const full = await repo.getFull(workout.id);
      expect(full!.exercises[0]!.sets.map((s) => s.position)).toEqual([0, 1]);
      expect(full!.exercises[0]!.sets[0]!.weightKg).toBe(60);
    });
  });

  // -------------------------------------------------------------------
  // listCompleted / softDelete
  // -------------------------------------------------------------------
  describe('listCompleted / softDelete', () => {
    it('lists completed workouts newest-first, excluding active ones', async () => {
      const w1 = await repo.startEmpty({ title: 'W1', startTime: 1_000 });
      await repo.finish(w1.id, { endTime: 1_500 });
      const w2 = await repo.startEmpty({ title: 'W2', startTime: 2_000 });
      await repo.finish(w2.id, { endTime: 2_500 });
      await repo.startEmpty({ title: 'Still Active', startTime: 3_000 });

      const page = await repo.listCompleted();
      expect(page.map((w) => w.id)).toEqual([w2.id, w1.id]);
    });

    it('paginates via before/limit', async () => {
      const w1 = await repo.startEmpty({ title: 'W1', startTime: 1_000 });
      await repo.finish(w1.id, { endTime: 1_500 });
      const w2 = await repo.startEmpty({ title: 'W2', startTime: 2_000 });
      await repo.finish(w2.id, { endTime: 2_500 });
      const w3 = await repo.startEmpty({ title: 'W3', startTime: 3_000 });
      await repo.finish(w3.id, { endTime: 3_500 });

      const firstPage = await repo.listCompleted({ limit: 2 });
      expect(firstPage.map((w) => w.id)).toEqual([w3.id, w2.id]);

      const secondPage = await repo.listCompleted({ before: 2_000 });
      expect(secondPage.map((w) => w.id)).toEqual([w1.id]);
    });

    it('softDelete hides a workout from listCompleted and getFull', async () => {
      const workout = await repo.startEmpty({ title: 'To Soft Delete', startTime: 1_000 });
      await repo.finish(workout.id, { endTime: 1_500 });

      expect((await repo.listCompleted()).map((w) => w.id)).toContain(workout.id);

      await repo.softDelete(workout.id);

      expect((await repo.listCompleted()).map((w) => w.id)).not.toContain(workout.id);
      expect(await repo.getFull(workout.id)).toBeNull();

      // Soft delete, not hard delete — the row (and its children) still exist.
      const row = driver.queryAll<{ deleted_at: number | null }>(
        `SELECT deleted_at FROM workouts WHERE id = ?`,
        [workout.id],
      )[0];
      expect(row).toBeDefined();
      expect(row!.deleted_at).not.toBeNull();
    });

    it('softDelete throws WorkoutNotFoundError for an unknown id', async () => {
      await expect(repo.softDelete('does-not-exist')).rejects.toBeInstanceOf(WorkoutNotFoundError);
    });
  });
});

// ---------------------------------------------------------------------------
// Fixture helpers — raw SQL against the driver, same pattern
// `exercise-repository.test.ts` established for tables the caller's own
// repository doesn't own.
// ---------------------------------------------------------------------------

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
    rpe?: number | null;
    customMetric?: number | null;
    isCompleted?: 0 | 1;
  } = {},
): string {
  const id = `set-${workoutExerciseId}-${position}`;
  driver.execute(
    `INSERT INTO sets
       (id, workout_exercise_id, position, set_type, weight_kg, reps, distance_meters,
        duration_seconds, rpe, custom_metric, is_completed)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      workoutExerciseId,
      position,
      opts.setType ?? 'normal',
      opts.weightKg ?? null,
      opts.reps ?? null,
      opts.distanceMeters ?? null,
      opts.durationSeconds ?? null,
      opts.rpe ?? null,
      opts.customMetric ?? null,
      opts.isCompleted ?? 0,
    ],
  );
  return id;
}
