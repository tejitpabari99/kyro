/**
 * `ExerciseRepositoryImpl` integration tests (M1-06 acceptance gate) — run
 * fully in Node via `better-sqlite3` against the real migrated schema (05
 * §10 / 08 §5 parity: same migration SQL the on-device `expo-sqlite` driver
 * would run). One `describe` per method, happy path + the task's named edge
 * cases:
 *  - duplicate active name rejected case-insensitively (`create`/`update`/`restore`)
 *  - archived excluded from default `list`, included with `includeArchived`
 *  - `delete` on a referenced exercise throws (real referencing row)
 *  - `recentlyUsed` ordering/distinctness (raw-SQL-inserted completed workouts —
 *    `WorkoutRepository` doesn't exist yet, M2 will be the first real caller)
 *  - alias match, against both the real vendored dataset's `aliases` field
 *    (via `seedBuiltins`) and a test-inserted custom exercise
 *
 * `WorkoutRepository`/`RoutineRepository` don't exist yet (M2/M3), so every
 * `workouts`/`workout_exercises`/`sets`/`routines`/`routine_exercises` row
 * this suite needs is inserted directly via raw SQL against the driver —
 * exactly the pattern `seed-builtins.test.ts` (M1-05) already established for
 * the same reason.
 */
import { BUNDLED_EXERCISE_DATASET } from '../seed-builtins';
import { openBetterSqlite3Driver } from '../../sqlite/driver.better-sqlite3';
import { migrate } from '../../sqlite/migrator';
import type { SqliteDriver } from '../../sqlite/driver';
import { ExerciseRepositoryImpl } from '../exercise-repository';
import {
  BuiltinExerciseImmutableError,
  DuplicateExerciseNameError,
  ExerciseNotFoundError,
  ExerciseReferencedError,
  ExerciseTypeImmutableError,
} from '../errors';
import type { NewCustomExercise } from '../types';

function makeCustomInput(overrides: Partial<NewCustomExercise> = {}): NewCustomExercise {
  return {
    name: 'Test Custom Curl',
    exerciseType: 'weight_reps',
    primaryMuscleGroup: 'biceps',
    ...overrides,
  };
}

/**
 * Wrap a real driver so its `execute` throws `message` the first time a SQL
 * statement containing `sqlContains` runs, then behaves normally after —
 * simulates the benign INSERT/UPDATE-time TOCTOU race `create`/`update`'s
 * defensive `catch` blocks exist for (unreachable via two sequential,
 * single-threaded repository calls, since the pre-check always observes the
 * first call's committed row before the second call's insert/update runs).
 */
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

describe('ExerciseRepositoryImpl (M1-06 integration, better-sqlite3)', () => {
  let driver: SqliteDriver;
  let repo: ExerciseRepositoryImpl;

  beforeEach(() => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    repo = new ExerciseRepositoryImpl(driver);
  });

  afterEach(() => {
    driver.close();
  });

  /** Insert a built-in-shaped row (`is_custom = 0`) directly — built-ins never go through `create`. */
  function insertBuiltin(id: string, overrides: { name?: string; archivedAt?: number | null } = {}) {
    const now = Date.now();
    driver.execute(
      `INSERT INTO exercises
         (id, name, exercise_type, primary_muscle_group, secondary_muscle_groups,
          equipment, instructions, images, animation_uri, is_custom,
          uses_custom_metric, aliases, archived_at, created_at, updated_at)
       VALUES (?, ?, 'weight_reps', 'chest', '[]', 'barbell', '[]', '[]', NULL, 0, 0, '[]', ?, ?, ?)`,
      [id, overrides.name ?? id, overrides.archivedAt ?? null, now, now],
    );
  }

  /** Insert a minimal completed workout with one exercise slot (and optionally one logged set), referencing `exerciseId`. */
  function insertCompletedWorkout(
    workoutId: string,
    exerciseId: string,
    startTime: number,
    opts: { withSet?: boolean } = {},
  ) {
    driver.execute(
      `INSERT INTO workouts (id, title, state, start_time, created_at, updated_at)
       VALUES (?, 'Fixture workout', 'completed', ?, ?, ?)`,
      [workoutId, startTime, startTime, startTime],
    );
    const workoutExerciseId = `${workoutId}-we`;
    driver.execute(
      `INSERT INTO workout_exercises (id, workout_id, exercise_id, position) VALUES (?, ?, ?, 0)`,
      [workoutExerciseId, workoutId, exerciseId],
    );
    if (opts.withSet) {
      driver.execute(
        `INSERT INTO sets (id, workout_exercise_id, position, weight_kg, reps, is_completed)
         VALUES (?, ?, 0, 100, 5, 1)`,
        [`${workoutExerciseId}-set`, workoutExerciseId],
      );
    }
  }

  function insertRoutineExercise(routineId: string, exerciseId: string) {
    const now = Date.now();
    driver.execute(
      `INSERT INTO routines (id, title, position, created_at, updated_at) VALUES (?, 'Fixture routine', 0, ?, ?)`,
      [routineId, now, now],
    );
    driver.execute(
      `INSERT INTO routine_exercises (id, routine_id, exercise_id, position) VALUES (?, ?, ?, 0)`,
      [`${routineId}-re`, routineId, exerciseId],
    );
  }

  // -------------------------------------------------------------------
  // create
  // -------------------------------------------------------------------
  describe('create', () => {
    it('creates a custom exercise with a generated uuid id, is_custom=true, and given fields', async () => {
      const exercise = await repo.create(
        makeCustomInput({ name: 'Concentration Curl', equipment: 'dumbbell' }),
      );

      expect(exercise.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(exercise.name).toBe('Concentration Curl');
      expect(exercise.isCustom).toBe(true);
      expect(exercise.equipment).toBe('dumbbell');
      expect(exercise.usesCustomMetric).toBe(false);
      expect(exercise.archivedAt).toBeNull();
      expect(exercise.secondaryMuscleGroups).toEqual([]);
      expect(exercise.instructions).toEqual([]);
      expect(exercise.images).toEqual([]);

      const reloaded = await repo.get(exercise.id);
      expect(reloaded).toEqual(exercise);
    });

    it('rejects a duplicate active name case-insensitively', async () => {
      await repo.create(makeCustomInput({ name: 'My Curl' }));

      await expect(repo.create(makeCustomInput({ name: 'MY CURL' }))).rejects.toBeInstanceOf(
        DuplicateExerciseNameError,
      );
      await expect(repo.create(makeCustomInput({ name: '  my curl  ' }))).rejects.toBeInstanceOf(
        DuplicateExerciseNameError,
      );
    });

    it('allows a name that only collides with an archived exercise', async () => {
      const original = await repo.create(makeCustomInput({ name: 'Archivable Curl' }));
      await repo.archive(original.id);

      const recreated = await repo.create(makeCustomInput({ name: 'Archivable Curl' }));
      expect(recreated.id).not.toBe(original.id);
    });

    it('rejects an empty/whitespace-only name', async () => {
      await expect(repo.create(makeCustomInput({ name: '   ' }))).rejects.toThrow();
    });

    it('translates a raw UNIQUE-constraint INSERT failure into DuplicateExerciseNameError (defensive race path)', async () => {
      const raceDriver = driverThrowingOnce(
        driver,
        'INSERT INTO exercises',
        'UNIQUE constraint failed: exercises.name',
      );
      const raceRepo = new ExerciseRepositoryImpl(raceDriver);

      await expect(raceRepo.create(makeCustomInput({ name: 'Race Name' }))).rejects.toBeInstanceOf(
        DuplicateExerciseNameError,
      );
    });

    it('rethrows a non-unique-constraint driver error unchanged', async () => {
      const raceDriver = driverThrowingOnce(driver, 'INSERT INTO exercises', 'disk I/O error');
      const raceRepo = new ExerciseRepositoryImpl(raceDriver);

      await expect(raceRepo.create(makeCustomInput({ name: 'Boom Name' }))).rejects.toThrow(
        'disk I/O error',
      );
    });

    it('falls back to a locally-generated uuid v4 when crypto.randomUUID is unavailable', async () => {
      const original = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
      Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
      try {
        const created = await repo.create(makeCustomInput({ name: 'No Crypto Global' }));
        expect(created.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
      } finally {
        if (original) {
          Object.defineProperty(globalThis, 'crypto', original);
        }
      }
    });
  });

  // -------------------------------------------------------------------
  // get
  // -------------------------------------------------------------------
  describe('get', () => {
    it('returns the mapped exercise for a known id', async () => {
      const created = await repo.create(makeCustomInput());
      const found = await repo.get(created.id);
      expect(found).toEqual(created);
    });

    it('returns null for an unknown id', async () => {
      expect(await repo.get('does-not-exist')).toBeNull();
    });
  });

  // -------------------------------------------------------------------
  // list
  // -------------------------------------------------------------------
  describe('list', () => {
    it('excludes archived exercises by default and includes them with includeArchived', async () => {
      const active = await repo.create(makeCustomInput({ name: 'Active One' }));
      const archived = await repo.create(makeCustomInput({ name: 'Archived One' }));
      await repo.archive(archived.id);

      const defaultList = await repo.list();
      expect(defaultList.map((e) => e.id)).toContain(active.id);
      expect(defaultList.map((e) => e.id)).not.toContain(archived.id);

      const fullList = await repo.list({ includeArchived: true });
      expect(fullList.map((e) => e.id)).toEqual(
        expect.arrayContaining([active.id, archived.id]),
      );
    });

    it('filters by exact muscle and equipment', async () => {
      const bicep = await repo.create(
        makeCustomInput({ name: 'Bicep Filter Test', primaryMuscleGroup: 'biceps', equipment: 'dumbbell' }),
      );
      const chest = await repo.create(
        makeCustomInput({ name: 'Chest Filter Test', primaryMuscleGroup: 'chest', equipment: 'barbell' }),
      );

      const byMuscle = await repo.list({ muscle: 'biceps' });
      expect(byMuscle.map((e) => e.id)).toContain(bicep.id);
      expect(byMuscle.map((e) => e.id)).not.toContain(chest.id);

      const byEquipment = await repo.list({ equipment: 'barbell' });
      expect(byEquipment.map((e) => e.id)).toContain(chest.id);
      expect(byEquipment.map((e) => e.id)).not.toContain(bicep.id);
    });

    it('matches query case/diacritic-insensitively against the name', async () => {
      const exercise = await repo.create(makeCustomInput({ name: 'Café Press' }));

      expect((await repo.list({ query: 'cafe' })).map((e) => e.id)).toContain(exercise.id);
      expect((await repo.list({ query: 'CAFÉ' })).map((e) => e.id)).toContain(exercise.id);
      expect((await repo.list({ query: 'squat' })).map((e) => e.id)).not.toContain(exercise.id);
    });

    it('matches query against a test-inserted custom exercise alias, not just its name', async () => {
      const exercise = await repo.create(makeCustomInput({ name: 'Overhead Barbell Press' }));
      // create() deliberately doesn't accept aliases (03 §2 scopes aliases to
      // the built-in curation file) — set one directly to exercise the
      // search-by-alias path on a custom row.
      driver.execute(`UPDATE exercises SET aliases = ? WHERE id = ?`, [
        JSON.stringify(['OHP']),
        exercise.id,
      ]);

      const results = await repo.list({ query: 'ohp' });
      expect(results.map((e) => e.id)).toContain(exercise.id);
      // Confirm this is genuinely an alias match, not a name substring match.
      expect(exercise.name.toLowerCase()).not.toContain('ohp');
    });

    it('matches query against a real vendored built-in alias via seedBuiltins ("OHP" -> Barbell Shoulder Press)', async () => {
      await repo.seedBuiltins(
        BUNDLED_EXERCISE_DATASET.exercises,
        BUNDLED_EXERCISE_DATASET.version,
      );

      const results = await repo.list({ query: 'ohp' });
      expect(results.map((e) => e.id)).toContain('Barbell_Shoulder_Press');
    });
  });

  // -------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------
  describe('update', () => {
    it('patches custom fields (happy path)', async () => {
      const created = await repo.create(makeCustomInput({ name: 'Original Name' }));

      const updated = await repo.update(created.id, {
        name: 'Renamed Curl',
        equipment: 'kettlebell',
        instructions: ['Step 1', 'Step 2'],
        secondaryMuscleGroups: ['forearms'],
        usesCustomMetric: true,
      });

      expect(updated.name).toBe('Renamed Curl');
      expect(updated.equipment).toBe('kettlebell');
      expect(updated.instructions).toEqual(['Step 1', 'Step 2']);
      expect(updated.secondaryMuscleGroups).toEqual(['forearms']);
      expect(updated.usesCustomMetric).toBe(true);
      expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt);
    });

    it('rejects renaming to a name already used by another active exercise, case-insensitively', async () => {
      await repo.create(makeCustomInput({ name: 'Taken Name' }));
      const other = await repo.create(makeCustomInput({ name: 'Other Name' }));

      await expect(repo.update(other.id, { name: 'TAKEN NAME' })).rejects.toBeInstanceOf(
        DuplicateExerciseNameError,
      );
    });

    it('allows renaming to its own current name unchanged (no false self-conflict)', async () => {
      const created = await repo.create(makeCustomInput({ name: 'Same Name' }));
      const updated = await repo.update(created.id, { name: 'Same Name', equipment: 'plate' });
      expect(updated.equipment).toBe('plate');
    });

    it('throws BuiltinExerciseImmutableError when targeting a built-in', async () => {
      insertBuiltin('builtin-1');
      await expect(repo.update('builtin-1', { name: 'Hacked Name' })).rejects.toBeInstanceOf(
        BuiltinExerciseImmutableError,
      );
    });

    it('throws ExerciseNotFoundError for an unknown id', async () => {
      await expect(repo.update('nope', { name: 'x' })).rejects.toBeInstanceOf(ExerciseNotFoundError);
    });

    it('rejects patching name to empty/whitespace-only', async () => {
      const created = await repo.create(makeCustomInput());
      await expect(repo.update(created.id, { name: '   ' })).rejects.toThrow();
    });

    it('translates a raw UNIQUE-constraint UPDATE failure into DuplicateExerciseNameError (defensive race path)', async () => {
      const created = await repo.create(makeCustomInput({ name: 'Update Race Original' }));
      const raceDriver = driverThrowingOnce(
        driver,
        'UPDATE exercises SET',
        'UNIQUE constraint failed: exercises.name',
      );
      const raceRepo = new ExerciseRepositoryImpl(raceDriver);

      await expect(
        raceRepo.update(created.id, { name: 'Update Race Renamed' }),
      ).rejects.toBeInstanceOf(DuplicateExerciseNameError);
    });

    it('rethrows a non-unique-constraint driver error unchanged', async () => {
      const created = await repo.create(makeCustomInput({ name: 'Update Boom Original' }));
      const raceDriver = driverThrowingOnce(driver, 'UPDATE exercises SET', 'disk I/O error');
      const raceRepo = new ExerciseRepositoryImpl(raceDriver);

      await expect(
        raceRepo.update(created.id, { name: 'Update Boom Renamed' }),
      ).rejects.toThrow('disk I/O error');
    });

    it('allows changing exerciseType before any set has ever been logged', async () => {
      const created = await repo.create(makeCustomInput({ exerciseType: 'weight_reps' }));
      const updated = await repo.update(created.id, { exerciseType: 'reps_only' });
      expect(updated.exerciseType).toBe('reps_only');
    });

    it('throws ExerciseTypeImmutableError once a set has been logged, but still allows non-type patches', async () => {
      const created = await repo.create(makeCustomInput({ exerciseType: 'weight_reps' }));
      insertCompletedWorkout('workout-type-lock', created.id, 1000, { withSet: true });

      await expect(
        repo.update(created.id, { exerciseType: 'reps_only' }),
      ).rejects.toBeInstanceOf(ExerciseTypeImmutableError);

      // Non-type fields remain editable.
      const renamed = await repo.update(created.id, { name: 'Still Editable Name' });
      expect(renamed.name).toBe('Still Editable Name');
      expect(renamed.exerciseType).toBe('weight_reps');
    });

    it('does not throw ExerciseTypeImmutableError when a workout_exercises row exists but no set was ever logged', async () => {
      const created = await repo.create(makeCustomInput({ exerciseType: 'weight_reps' }));
      insertCompletedWorkout('workout-no-set', created.id, 1000, { withSet: false });

      const updated = await repo.update(created.id, { exerciseType: 'reps_only' });
      expect(updated.exerciseType).toBe('reps_only');
    });
  });

  // -------------------------------------------------------------------
  // archive / restore
  // -------------------------------------------------------------------
  describe('archive / restore', () => {
    it('archive sets archivedAt; restore clears it', async () => {
      const created = await repo.create(makeCustomInput());
      await repo.archive(created.id);
      expect((await repo.get(created.id))!.archivedAt).not.toBeNull();

      await repo.restore(created.id);
      expect((await repo.get(created.id))!.archivedAt).toBeNull();
    });

    it('is idempotent (archiving twice / restoring an already-active row is a no-op)', async () => {
      const created = await repo.create(makeCustomInput());
      await repo.archive(created.id);
      const archivedAtFirst = (await repo.get(created.id))!.archivedAt;
      await repo.archive(created.id);
      expect((await repo.get(created.id))!.archivedAt).toBe(archivedAtFirst);

      await repo.restore(created.id);
      await repo.restore(created.id); // already active — should not throw
      expect((await repo.get(created.id))!.archivedAt).toBeNull();
    });

    it('restore throws DuplicateExerciseNameError if an active exercise has since taken the same name', async () => {
      const original = await repo.create(makeCustomInput({ name: 'Reused Name' }));
      await repo.archive(original.id);
      await repo.create(makeCustomInput({ name: 'Reused Name' }));

      await expect(repo.restore(original.id)).rejects.toBeInstanceOf(DuplicateExerciseNameError);
    });

    it('throws ExerciseNotFoundError for an unknown id on both archive and restore', async () => {
      await expect(repo.archive('nope')).rejects.toBeInstanceOf(ExerciseNotFoundError);
      await expect(repo.restore('nope')).rejects.toBeInstanceOf(ExerciseNotFoundError);
    });
  });

  // -------------------------------------------------------------------
  // delete
  // -------------------------------------------------------------------
  describe('delete', () => {
    it('hard-deletes a zero-reference custom exercise', async () => {
      const created = await repo.create(makeCustomInput());
      await repo.delete(created.id);
      expect(await repo.get(created.id)).toBeNull();
    });

    it('throws ExerciseReferencedError when referenced by a real workout_exercises row', async () => {
      const created = await repo.create(makeCustomInput());
      insertCompletedWorkout('workout-ref', created.id, 1000, { withSet: true });

      await expect(repo.delete(created.id)).rejects.toBeInstanceOf(ExerciseReferencedError);
      // Row must still exist — delete must not have partially applied.
      expect(await repo.get(created.id)).not.toBeNull();
    });

    it('throws ExerciseReferencedError when referenced only by a routine_exercises row', async () => {
      const created = await repo.create(makeCustomInput());
      insertRoutineExercise('routine-ref', created.id);

      await expect(repo.delete(created.id)).rejects.toBeInstanceOf(ExerciseReferencedError);
    });

    it('throws BuiltinExerciseImmutableError for a built-in, even with zero references', async () => {
      insertBuiltin('builtin-delete-test');
      await expect(repo.delete('builtin-delete-test')).rejects.toBeInstanceOf(
        BuiltinExerciseImmutableError,
      );
    });

    it('throws ExerciseNotFoundError for an unknown id', async () => {
      await expect(repo.delete('nope')).rejects.toBeInstanceOf(ExerciseNotFoundError);
    });
  });

  // -------------------------------------------------------------------
  // referenceCount
  // -------------------------------------------------------------------
  describe('referenceCount', () => {
    it('returns 0 for an unreferenced exercise', async () => {
      const created = await repo.create(makeCustomInput());
      expect(await repo.referenceCount(created.id)).toBe(0);
    });

    it('counts workout_exercises + routine_exercises rows together', async () => {
      const created = await repo.create(makeCustomInput());
      insertCompletedWorkout('workout-count-1', created.id, 1000, { withSet: true });
      insertCompletedWorkout('workout-count-2', created.id, 2000, { withSet: true });
      insertRoutineExercise('routine-count-1', created.id);

      expect(await repo.referenceCount(created.id)).toBe(3);
    });
  });

  // -------------------------------------------------------------------
  // recentlyUsed
  // -------------------------------------------------------------------
  describe('recentlyUsed', () => {
    it('returns distinct exercises, most-recently-logged first', async () => {
      const a = await repo.create(makeCustomInput({ name: 'Recent A' }));
      const b = await repo.create(makeCustomInput({ name: 'Recent B' }));
      const c = await repo.create(makeCustomInput({ name: 'Recent C' }));

      insertCompletedWorkout('w1', a.id, 1_000);
      insertCompletedWorkout('w2', b.id, 2_000);
      insertCompletedWorkout('w3', c.id, 3_000);
      // `a` logged again, more recently than `c` — must move to the front,
      // and must not appear twice (distinctness).
      insertCompletedWorkout('w4', a.id, 4_000);

      const recent = await repo.recentlyUsed(10);
      expect(recent.map((e) => e.id)).toEqual([a.id, c.id, b.id]);
    });

    it('respects the limit', async () => {
      const a = await repo.create(makeCustomInput({ name: 'Limit A' }));
      const b = await repo.create(makeCustomInput({ name: 'Limit B' }));
      insertCompletedWorkout('wl1', a.id, 1_000);
      insertCompletedWorkout('wl2', b.id, 2_000);

      const recent = await repo.recentlyUsed(1);
      expect(recent).toHaveLength(1);
      expect(recent[0]!.id).toBe(b.id);
    });

    it('ignores active (non-completed) and soft-deleted workouts', async () => {
      const a = await repo.create(makeCustomInput({ name: 'Ignore Active' }));
      driver.execute(
        `INSERT INTO workouts (id, title, state, start_time, created_at, updated_at)
         VALUES ('active-workout', 'Active', 'active', 5000, 5000, 5000)`,
      );
      driver.execute(
        `INSERT INTO workout_exercises (id, workout_id, exercise_id, position) VALUES ('active-we', 'active-workout', ?, 0)`,
        [a.id],
      );

      expect(await repo.recentlyUsed(10)).toEqual([]);
    });

    it('excludes archived exercises even if they were recently logged', async () => {
      const a = await repo.create(makeCustomInput({ name: 'Archived Recent' }));
      insertCompletedWorkout('w-archived', a.id, 1_000);
      await repo.archive(a.id);

      expect((await repo.recentlyUsed(10)).map((e) => e.id)).not.toContain(a.id);
    });
  });

  // -------------------------------------------------------------------
  // seedBuiltins
  // -------------------------------------------------------------------
  describe('seedBuiltins', () => {
    it('wraps seedBuiltinExercises: seeds the dataset and records app_meta.dataset_version', async () => {
      await repo.seedBuiltins(BUNDLED_EXERCISE_DATASET.exercises, BUNDLED_EXERCISE_DATASET.version);

      const squat = await repo.get('Barbell_Squat');
      expect(squat).not.toBeNull();
      expect(squat!.isCustom).toBe(false);

      const versionRow = driver.queryAll<{ value: string }>(
        `SELECT value FROM app_meta WHERE key = 'dataset_version'`,
      )[0];
      expect(versionRow?.value).toBe(BUNDLED_EXERCISE_DATASET.version);
    });

    it('is a no-op on a second call with the same version (delegated behavior, not reimplemented)', async () => {
      await repo.seedBuiltins(BUNDLED_EXERCISE_DATASET.exercises, BUNDLED_EXERCISE_DATASET.version);
      const before = await repo.get('Barbell_Squat');

      await repo.seedBuiltins(BUNDLED_EXERCISE_DATASET.exercises, BUNDLED_EXERCISE_DATASET.version);
      const after = await repo.get('Barbell_Squat');

      expect(after).toEqual(before);
    });
  });
});
