/**
 * `WorkoutRepositoryImpl` granular-mutator + `previousSets` integration
 * tests (M2-02 acceptance gate) — same pattern as
 * `workout-repository.lifecycle.test.ts` (M2-01): real `better-sqlite3`
 * against the migrated schema, one `describe` per method, happy path + the
 * task's named edge cases (position renumbering, single-transaction
 * atomicity, previousSets' any_workout/same_routine/occurrence/fewer-sets
 * cases).
 */
import { openBetterSqlite3Driver } from '../../sqlite/driver.better-sqlite3';
import { migrate } from '../../sqlite/migrator';
import type { SqliteDriver } from '../../sqlite/driver';
import {
  ReorderMismatchError,
  SetNotFoundError,
  WorkoutExerciseNotFoundError,
} from '../errors';
import { WorkoutRepositoryImpl } from '../workout-repository';

/** Wrap a real driver so its `execute` throws `message` on the Nth (1-based) call whose SQL contains `sqlContains`, then behaves normally — used for the single-transaction-atomicity test. */
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

/** Insert a completed workout with one workout_exercise (occurrence 0) for `exerciseId`, seeded with `sets`. Returns the workout id. */
function insertCompletedWorkoutWithExercise(
  driver: SqliteDriver,
  workoutId: string,
  exerciseId: string,
  startTime: number,
  sets: { setType?: 'normal' | 'warmup' | 'failure' | 'dropset'; weightKg?: number; reps?: number }[],
  opts: { routineId?: string | null } = {},
): string {
  driver.execute(
    `INSERT INTO workouts (id, title, routine_id, state, start_time, end_time, created_at, updated_at)
     VALUES (?, 'Fixture workout', ?, 'completed', ?, ?, ?, ?)`,
    [workoutId, opts.routineId ?? null, startTime, startTime + 1_000, startTime, startTime],
  );
  const weId = insertWorkoutExercise(driver, workoutId, exerciseId, 0);
  sets.forEach((set, index) => {
    insertSet(driver, weId, index, { ...set, isCompleted: 1 });
  });
  return workoutId;
}

describe('WorkoutRepositoryImpl — mutators + previousSets (M2-02 integration, better-sqlite3)', () => {
  let driver: SqliteDriver;
  let repo: WorkoutRepositoryImpl;
  let benchId: string;
  let squatId: string;
  let activeWorkoutId: string;

  beforeEach(async () => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    repo = new WorkoutRepositoryImpl(driver);
    benchId = insertExercise(driver, 'bench-press');
    squatId = insertExercise(driver, 'back-squat');
    const active = await repo.startEmpty({ title: 'Active Workout', startTime: 100_000 });
    activeWorkoutId = active.id;
  });

  afterEach(() => {
    driver.close();
  });

  // -------------------------------------------------------------------
  // addExercises
  // -------------------------------------------------------------------
  describe('addExercises', () => {
    it('pre-creates the same number of empty normal sets as the most recent completed occurrence', async () => {
      insertCompletedWorkoutWithExercise(driver, 'hist-1', benchId, 1_000, [
        { weightKg: 60, reps: 8 },
        { weightKg: 60, reps: 8 },
        { weightKg: 60, reps: 6 },
      ]);

      const [added] = await repo.addExercises(activeWorkoutId, [{ exerciseId: benchId }]);

      expect(added!.exerciseId).toBe(benchId);
      expect(added!.position).toBe(0);
      expect(added!.sets).toHaveLength(3);
      expect(added!.sets.every((s) => s.setType === 'normal')).toBe(true);
      expect(added!.sets.every((s) => s.weightKg === null && s.reps === null)).toBe(true);
      expect(added!.sets.every((s) => !s.isCompleted)).toBe(true);
      expect(added!.sets.map((s) => s.position)).toEqual([0, 1, 2]);
    });

    it('creates a single empty normal set when the exercise has no history', async () => {
      const [added] = await repo.addExercises(activeWorkoutId, [{ exerciseId: squatId }]);
      expect(added!.sets).toHaveLength(1);
      expect(added!.sets[0]!.setType).toBe('normal');
    });

    it('appends multiple items in selection order with correct positions and passes through superset/notes/restSeconds', async () => {
      const [first, second] = await repo.addExercises(activeWorkoutId, [
        { exerciseId: benchId, notes: 'Go slow', restSeconds: 90 },
        { exerciseId: squatId, supersetId: 0 },
      ]);

      expect(first!.position).toBe(0);
      expect(first!.notes).toBe('Go slow');
      expect(first!.restSeconds).toBe(90);
      expect(second!.position).toBe(1);
      expect(second!.supersetId).toBe(0);
    });

    it('appends after already-existing exercises rather than resetting positions', async () => {
      await repo.addExercises(activeWorkoutId, [{ exerciseId: benchId }]);
      const [second] = await repo.addExercises(activeWorkoutId, [{ exerciseId: squatId }]);
      expect(second!.position).toBe(1);
    });

    it('returns [] for an empty items array without touching the workout', async () => {
      expect(await repo.addExercises(activeWorkoutId, [])).toEqual([]);
    });

    it('throws WorkoutNotFoundError for an unknown workoutId', async () => {
      await expect(repo.addExercises('does-not-exist', [{ exerciseId: benchId }])).rejects.toThrow();
    });

    it('is atomic: a failure partway through rolls back the entire call, including earlier items in the same batch', async () => {
      const raceDriver = driverThrowingOnCall(
        driver,
        'INSERT INTO workout_exercises',
        2, // succeed on the first item, fail on the second
        'simulated disk failure',
      );
      const raceRepo = new WorkoutRepositoryImpl(raceDriver);

      await expect(
        raceRepo.addExercises(activeWorkoutId, [
          { exerciseId: benchId },
          { exerciseId: squatId },
        ]),
      ).rejects.toThrow('simulated disk failure');

      const full = await repo.getFull(activeWorkoutId);
      expect(full!.exercises).toEqual([]); // first item's insert was rolled back too
    });
  });

  // -------------------------------------------------------------------
  // removeExercise / reorderExercises
  // -------------------------------------------------------------------
  describe('removeExercise', () => {
    it('deletes the exercise and renumbers the remaining ones contiguous from 0', async () => {
      const [a, b, c] = await repo.addExercises(activeWorkoutId, [
        { exerciseId: benchId },
        { exerciseId: squatId },
        { exerciseId: benchId },
      ]);

      await repo.removeExercise(activeWorkoutId, b!.id);

      const full = await repo.getFull(activeWorkoutId);
      expect(full!.exercises.map((e) => e.id)).toEqual([a!.id, c!.id]);
      expect(full!.exercises.map((e) => e.position)).toEqual([0, 1]);
    });

    it('throws WorkoutExerciseNotFoundError for an unknown id', async () => {
      await expect(
        repo.removeExercise(activeWorkoutId, 'does-not-exist'),
      ).rejects.toBeInstanceOf(WorkoutExerciseNotFoundError);
    });

    it('throws WorkoutExerciseNotFoundError when the exercise belongs to a different workout', async () => {
      const [we] = await repo.addExercises(activeWorkoutId, [{ exerciseId: benchId }]);
      await repo.discard(activeWorkoutId);
      const other = await repo.startEmpty({ title: 'Other', startTime: 200_000 });

      await expect(repo.removeExercise(other.id, we!.id)).rejects.toBeInstanceOf(
        WorkoutExerciseNotFoundError,
      );
    });
  });

  describe('reorderExercises', () => {
    it('applies the given order as 0-based positions', async () => {
      const [a, b, c] = await repo.addExercises(activeWorkoutId, [
        { exerciseId: benchId },
        { exerciseId: squatId },
        { exerciseId: benchId },
      ]);

      await repo.reorderExercises(activeWorkoutId, [c!.id, a!.id, b!.id]);

      const full = await repo.getFull(activeWorkoutId);
      expect(full!.exercises.map((e) => e.id)).toEqual([c!.id, a!.id, b!.id]);
      expect(full!.exercises.map((e) => e.position)).toEqual([0, 1, 2]);
    });

    it('throws ReorderMismatchError when the id list is missing an existing exercise', async () => {
      const [a] = await repo.addExercises(activeWorkoutId, [
        { exerciseId: benchId },
        { exerciseId: squatId },
      ]);

      await expect(repo.reorderExercises(activeWorkoutId, [a!.id])).rejects.toBeInstanceOf(
        ReorderMismatchError,
      );
    });

    it('throws ReorderMismatchError when the id list includes a foreign id', async () => {
      const [a] = await repo.addExercises(activeWorkoutId, [{ exerciseId: benchId }]);

      await expect(
        repo.reorderExercises(activeWorkoutId, [a!.id, 'not-a-real-id']),
      ).rejects.toBeInstanceOf(ReorderMismatchError);
    });
  });

  // -------------------------------------------------------------------
  // replaceExercise
  // -------------------------------------------------------------------
  describe('replaceExercise', () => {
    it('repoints exercise_id, keeps set count/positions, and clears every value + is_completed', async () => {
      const [added] = await repo.addExercises(activeWorkoutId, [{ exerciseId: benchId }]);
      await repo.addSet(added!.id);
      await repo.updateSet(added!.sets[0]!.id, { weightKg: 60, reps: 8 });
      await repo.setCompleted(added!.sets[0]!.id, true);

      const replaced = await repo.replaceExercise(added!.id, squatId);

      expect(replaced.exerciseId).toBe(squatId);
      expect(replaced.sets).toHaveLength(2);
      expect(replaced.sets.map((s) => s.position)).toEqual([0, 1]);
      expect(replaced.sets.every((s) => s.setType === 'normal')).toBe(true);
      expect(replaced.sets.every((s) => !s.isCompleted)).toBe(true);
      expect(replaced.sets.every((s) => s.weightKg === null && s.reps === null)).toBe(true);
    });
  });

  // -------------------------------------------------------------------
  // addSet / updateSet / removeSet / setSetType / setCompleted
  // -------------------------------------------------------------------
  describe('addSet', () => {
    it('appends a bare unchecked normal set by default', async () => {
      const [we] = await repo.addExercises(activeWorkoutId, [{ exerciseId: benchId }]);
      const set = await repo.addSet(we!.id);
      expect(set.position).toBe(1); // addExercises already seeded one set at position 0
      expect(set.setType).toBe('normal');
      expect(set.isCompleted).toBe(false);
    });

    it('accepts explicit initial values', async () => {
      const [we] = await repo.addExercises(activeWorkoutId, [{ exerciseId: squatId }]);
      const set = await repo.addSet(we!.id, { setType: 'warmup', weightKg: 40, reps: 10 });
      expect(set.setType).toBe('warmup');
      expect(set.weightKg).toBe(40);
      expect(set.reps).toBe(10);
    });

    it('throws WorkoutExerciseNotFoundError for an unknown workoutExerciseId', async () => {
      await expect(repo.addSet('does-not-exist')).rejects.toBeInstanceOf(
        WorkoutExerciseNotFoundError,
      );
    });
  });

  describe('insertWarmupSets (M2-16, 02 §12)', () => {
    it('inserts the new rows above existing sets, shifting the originals down by rows.length', async () => {
      const [we] = await repo.addExercises(activeWorkoutId, [{ exerciseId: benchId }]);
      const originalFirstId = we!.sets[0]!.id;
      const second = await repo.addSet(we!.id, { weightKg: 100, reps: 5 });

      const updated = await repo.insertWarmupSets(we!.id, [
        { setType: 'warmup', weightKg: 20, reps: 10 },
        { setType: 'warmup', weightKg: 40, reps: 8 },
      ]);

      expect(updated.sets.map((s) => ({ id: s.id, position: s.position, setType: s.setType }))).toEqual([
        expect.objectContaining({ position: 0, setType: 'warmup' }),
        expect.objectContaining({ position: 1, setType: 'warmup' }),
        expect.objectContaining({ id: originalFirstId, position: 2, setType: 'normal' }),
        expect.objectContaining({ id: second.id, position: 3, setType: 'normal' }),
      ]);
      expect(updated.sets[0]!.weightKg).toBe(20);
      expect(updated.sets[0]!.reps).toBe(10);
      expect(updated.sets[1]!.weightKg).toBe(40);
      // Persisted, not just the in-memory return value.
      const persisted = await repo.getFull(activeWorkoutId);
      expect(persisted!.exercises[0]!.sets.map((s) => s.position)).toEqual([0, 1, 2, 3]);
    });

    it('defaults an omitted setType to warmup (the flow always inserts warm-up rows)', async () => {
      const [we] = await repo.addExercises(activeWorkoutId, [{ exerciseId: benchId }]);
      const updated = await repo.insertWarmupSets(we!.id, [{ weightKg: 20, reps: 10 }]);
      expect(updated.sets[0]!.setType).toBe('warmup');
    });

    it('every inserted row starts unchecked, regardless of input', async () => {
      const [we] = await repo.addExercises(activeWorkoutId, [{ exerciseId: benchId }]);
      const updated = await repo.insertWarmupSets(we!.id, [{ weightKg: 20, reps: 10 }]);
      expect(updated.sets[0]!.isCompleted).toBe(false);
    });

    it('rows.length === 0 is a no-op read — returns the exercise unchanged', async () => {
      const [we] = await repo.addExercises(activeWorkoutId, [{ exerciseId: benchId }]);
      const before = await repo.getFull(activeWorkoutId);
      const updated = await repo.insertWarmupSets(we!.id, []);
      expect(updated.sets).toHaveLength(1);
      expect(updated.sets[0]!.id).toBe(before!.exercises[0]!.sets[0]!.id);
    });

    it('inserting into an exercise with zero existing sets just seeds the new rows at 0..n-1', async () => {
      const [we] = await repo.addExercises(activeWorkoutId, [{ exerciseId: benchId }]);
      // addExercises seeds one bare set; remove it to exercise the empty case.
      await repo.removeSet(we!.sets[0]!.id);

      const updated = await repo.insertWarmupSets(we!.id, [
        { weightKg: 20, reps: 10 },
        { weightKg: 40, reps: 8 },
      ]);
      expect(updated.sets.map((s) => s.position)).toEqual([0, 1]);
    });

    it('throws WorkoutExerciseNotFoundError for an unknown workoutExerciseId', async () => {
      await expect(
        repo.insertWarmupSets('does-not-exist', [{ weightKg: 20, reps: 10 }]),
      ).rejects.toBeInstanceOf(WorkoutExerciseNotFoundError);
    });
  });

  describe('updateSet', () => {
    it('patches only the given fields, leaving others unchanged', async () => {
      const [we] = await repo.addExercises(activeWorkoutId, [{ exerciseId: benchId }]);
      const setId = we!.sets[0]!.id;

      await repo.updateSet(setId, { weightKg: 60, reps: 8 });
      const afterFirst = await repo.updateSet(setId, { reps: 10 });

      expect(afterFirst.weightKg).toBe(60);
      expect(afterFirst.reps).toBe(10);
    });

    it('an explicit null clears a field', async () => {
      const [we] = await repo.addExercises(activeWorkoutId, [{ exerciseId: benchId }]);
      const setId = we!.sets[0]!.id;

      await repo.updateSet(setId, { weightKg: 60 });
      const cleared = await repo.updateSet(setId, { weightKg: null });

      expect(cleared.weightKg).toBeNull();
    });

    it('throws SetNotFoundError for an unknown id', async () => {
      await expect(repo.updateSet('does-not-exist', { reps: 1 })).rejects.toBeInstanceOf(
        SetNotFoundError,
      );
    });
  });

  describe('removeSet', () => {
    it('deletes the set and renumbers the remaining siblings contiguous from 0', async () => {
      const [we] = await repo.addExercises(activeWorkoutId, [{ exerciseId: benchId }]);
      const second = await repo.addSet(we!.id);
      const third = await repo.addSet(we!.id);
      const firstId = we!.sets[0]!.id;

      await repo.removeSet(second.id);

      const full = await repo.getFull(activeWorkoutId);
      const sets = full!.exercises[0]!.sets;
      expect(sets.map((s) => s.id)).toEqual([firstId, third.id]);
      expect(sets.map((s) => s.position)).toEqual([0, 1]);
    });

    it('throws SetNotFoundError for an unknown id', async () => {
      await expect(repo.removeSet('does-not-exist')).rejects.toBeInstanceOf(SetNotFoundError);
    });
  });

  describe('setSetType', () => {
    it('updates the set type without touching values or renumbering', async () => {
      const [we] = await repo.addExercises(activeWorkoutId, [{ exerciseId: benchId }]);
      const setId = we!.sets[0]!.id;

      const updated = await repo.setSetType(setId, 'warmup');
      expect(updated.setType).toBe('warmup');
      expect(updated.position).toBe(0);
    });
  });

  describe('setCompleted', () => {
    it('toggles is_completed', async () => {
      const [we] = await repo.addExercises(activeWorkoutId, [{ exerciseId: benchId }]);
      const setId = we!.sets[0]!.id;

      const checked = await repo.setCompleted(setId, true);
      expect(checked.isCompleted).toBe(true);

      const unchecked = await repo.setCompleted(setId, false);
      expect(unchecked.isCompleted).toBe(false);
    });
  });

  // -------------------------------------------------------------------
  // updateExercise / updateMeta
  // -------------------------------------------------------------------
  describe('updateExercise', () => {
    it('patches notes/restSeconds/supersetId, undefined-vs-null semantics', async () => {
      const [we] = await repo.addExercises(activeWorkoutId, [
        { exerciseId: benchId, notes: 'Original note', restSeconds: 60 },
      ]);

      const patched = await repo.updateExercise(we!.id, { restSeconds: 120 });
      expect(patched.notes).toBe('Original note'); // untouched
      expect(patched.restSeconds).toBe(120);

      const cleared = await repo.updateExercise(we!.id, { notes: null, supersetId: 2 });
      expect(cleared.notes).toBeNull();
      expect(cleared.supersetId).toBe(2);
      expect(cleared.restSeconds).toBe(120); // still untouched
    });
  });

  describe('updateMeta', () => {
    it('patches title/description/times/pause-offset, undefined-vs-null semantics', async () => {
      const patched = await repo.updateMeta(activeWorkoutId, {
        title: 'Renamed',
        startTime: 90_000,
        durationPauseOffsetMs: 5_000,
      });

      expect(patched.title).toBe('Renamed');
      expect(patched.startTime).toBe(90_000);
      expect(patched.durationPauseOffsetMs).toBe(5_000);
      expect(patched.description).toBeNull(); // untouched, was already null

      const withDescription = await repo.updateMeta(activeWorkoutId, { description: 'Notes' });
      expect(withDescription.title).toBe('Renamed'); // still untouched
      expect(withDescription.description).toBe('Notes');
    });
  });

  // -------------------------------------------------------------------
  // previousSets
  // -------------------------------------------------------------------
  describe('previousSets', () => {
    it('any_workout: returns the most recent completed workout\'s non-warmup and warmup buckets, independently indexed', async () => {
      insertCompletedWorkoutWithExercise(driver, 'hist-old', benchId, 1_000, [
        { weightKg: 50, reps: 10 },
      ]);
      insertCompletedWorkoutWithExercise(driver, 'hist-new', benchId, 2_000, [
        { setType: 'warmup', weightKg: 20, reps: 10 },
        { weightKg: 60, reps: 8 },
        { weightKg: 60, reps: 6 },
      ]);

      const result = await repo.previousSets(benchId);

      const nonWarmups = result.filter((s) => !s.isWarmup).sort((a, b) => a.bucketIndex - b.bucketIndex);
      const warmups = result.filter((s) => s.isWarmup);
      expect(nonWarmups.map((s) => [s.bucketIndex, s.weightKg, s.reps])).toEqual([
        [0, 60, 8],
        [1, 60, 6],
      ]);
      expect(warmups).toEqual([
        {
          bucketIndex: 0,
          isWarmup: true,
          setType: 'warmup',
          weightKg: 20,
          reps: 10,
          distanceMeters: null,
          durationSeconds: null,
          rpe: null,
          customMetric: null,
        },
      ]);
    });

    it('same_routine: restricts to completed workouts with the given routineId', async () => {
      insertCompletedWorkoutWithExercise(driver, 'hist-routine-a', benchId, 1_000, [
        { weightKg: 40, reps: 12 },
      ], { routineId: 'routine-a' });
      insertCompletedWorkoutWithExercise(driver, 'hist-routine-b', benchId, 2_000, [
        { weightKg: 70, reps: 5 },
      ], { routineId: 'routine-b' });

      const forRoutineA = await repo.previousSets(benchId, { routineId: 'routine-a' });
      expect(forRoutineA.map((s) => s.weightKg)).toEqual([40]);

      const forUnknownRoutine = await repo.previousSets(benchId, { routineId: 'routine-c' });
      expect(forUnknownRoutine).toEqual([]);
    });

    it('occurrence matching: a duplicated exercise resolves PREVIOUS by occurrence order within the referenced workout', async () => {
      driver.execute(
        `INSERT INTO workouts (id, title, state, start_time, end_time, created_at, updated_at)
         VALUES ('hist-dup', 'Push Day', 'completed', 1000, 2000, 1000, 1000)`,
      );
      const occ0 = insertWorkoutExercise(driver, 'hist-dup', benchId, 0);
      insertSet(driver, occ0, 0, { weightKg: 60, reps: 8, isCompleted: 1 });
      const occ1 = insertWorkoutExercise(driver, 'hist-dup', benchId, 1);
      insertSet(driver, occ1, 0, { weightKg: 65, reps: 6, isCompleted: 1 });

      const first = await repo.previousSets(benchId, { occurrenceIndex: 0 });
      const second = await repo.previousSets(benchId, { occurrenceIndex: 1 });

      expect(first.map((s) => s.weightKg)).toEqual([60]);
      expect(second.map((s) => s.weightKg)).toEqual([65]);
    });

    it('occurrence out of range for the referenced workout returns []', async () => {
      insertCompletedWorkoutWithExercise(driver, 'hist-1', benchId, 1_000, [
        { weightKg: 60, reps: 8 },
      ]);

      expect(await repo.previousSets(benchId, { occurrenceIndex: 1 })).toEqual([]);
    });

    it('fewer previous sets than current rows means missing bucket indices, not padded entries', async () => {
      insertCompletedWorkoutWithExercise(driver, 'hist-1', benchId, 1_000, [
        { weightKg: 60, reps: 8 },
      ]);

      const result = await repo.previousSets(benchId);
      expect(result).toHaveLength(1);
      expect(result.some((s) => s.bucketIndex === 1)).toBe(false); // a 2nd current row has no match
    });

    it('beforeWorkoutId restricts to workouts at-or-before it and excludes it', async () => {
      insertCompletedWorkoutWithExercise(driver, 'hist-early', benchId, 1_000, [
        { weightKg: 50, reps: 10 },
      ]);
      const editingWorkoutId = insertCompletedWorkoutWithExercise(
        driver,
        'hist-editing',
        benchId,
        2_000,
        [{ weightKg: 999, reps: 1 }],
      );
      insertCompletedWorkoutWithExercise(driver, 'hist-after', benchId, 3_000, [
        { weightKg: 70, reps: 5 },
      ]);

      const result = await repo.previousSets(benchId, { beforeWorkoutId: editingWorkoutId });
      expect(result.map((s) => s.weightKg)).toEqual([50]);
    });

    it('returns [] when the exercise has no completed history', async () => {
      expect(await repo.previousSets(squatId)).toEqual([]);
    });
  });

  // -------------------------------------------------------------------
  // superset_id round trip (M2-12, 02 §8 acceptance: "group ids survive a
  // save/reload round trip") — a fresh `WorkoutRepositoryImpl` instance
  // against the *same* driver/DB simulates a cold reload far more
  // faithfully than re-reading through the instance that just wrote the
  // data (same "second instance, same underlying DB" convention this
  // suite's own `raceRepo`/`raceDriver` atomicity test above already uses,
  // and `activeWorkoutStore.crash-safety.test.ts`'s "drop the store,
  // rehydrate a fresh one" pattern at the store layer).
  // -------------------------------------------------------------------
  describe('superset_id round trip (M2-12)', () => {
    it('a 3-member circuit\'s shared supersetId survives getFull() through a brand-new repository instance', async () => {
      const [a, b, c] = await repo.addExercises(activeWorkoutId, [
        { exerciseId: benchId },
        { exerciseId: squatId },
        { exerciseId: benchId },
      ]);
      const groupId = Math.min(a!.position, b!.position, c!.position);
      await repo.updateExercise(a!.id, { supersetId: groupId });
      await repo.updateExercise(b!.id, { supersetId: groupId });
      await repo.updateExercise(c!.id, { supersetId: groupId });

      // Fresh instance, same driver — the "reload" half of the round trip.
      const reloadedRepo = new WorkoutRepositoryImpl(driver);

      const viaGetFull = await reloadedRepo.getFull(activeWorkoutId);
      expect(viaGetFull!.exercises.map((e) => e.supersetId)).toEqual([groupId, groupId, groupId]);

      const viaGetActive = await reloadedRepo.getActive();
      expect(viaGetActive!.exercises.map((e) => e.supersetId)).toEqual([groupId, groupId, groupId]);
    });

    it('an ungrouped exercise stays null through the same reload', async () => {
      const [a, b] = await repo.addExercises(activeWorkoutId, [
        { exerciseId: benchId },
        { exerciseId: squatId },
      ]);
      await repo.updateExercise(a!.id, { supersetId: 0 });
      // b left ungrouped.

      const reloadedRepo = new WorkoutRepositoryImpl(driver);
      const full = await reloadedRepo.getFull(activeWorkoutId);
      expect(full!.exercises.find((e) => e.id === a!.id)!.supersetId).toBe(0);
      expect(full!.exercises.find((e) => e.id === b!.id)!.supersetId).toBeNull();
    });
  });
});
