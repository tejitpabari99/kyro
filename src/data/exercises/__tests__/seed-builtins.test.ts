/**
 * `seedBuiltinExercises` integration test (M1-05 acceptance gate) — runs
 * against the real migration-produced schema on the `better-sqlite3` backend
 * (08 §5 parity: same SQL the on-device `expo-sqlite` driver would run).
 *
 * Three scenarios, per the task's exact acceptance gate:
 *  1. Fresh DB seeds all 873 real `assets/exercise-db.json` rows correctly
 *     (spot-checked against a few known real records) — plus a timing log
 *     as the `< 1s` on-device-target proxy.
 *  2. Re-running with an unchanged version is a no-op: no duplicate rows, no
 *     `updated_at` churn on any row.
 *  3. A version bump (one changed record, one removed record, on a small
 *     synthetic fixture) updates the changed built-in, archives the removed
 *     one, and leaves a custom row + a fake logged-history row completely
 *     untouched.
 */
import type { MappedExerciseRecord } from '@/domain/exercise-mapping';

import { openBetterSqlite3Driver } from '../../sqlite/driver.better-sqlite3';
import { migrate } from '../../sqlite/migrator';
import type { SqliteDriver } from '../../sqlite/driver';
import { BUNDLED_EXERCISE_DATASET, seedBuiltinExercises } from '../seed-builtins';

interface ExerciseRow {
  id: string;
  name: string;
  exercise_type: string;
  primary_muscle_group: string;
  secondary_muscle_groups: string;
  equipment: string;
  instructions: string;
  images: string;
  is_custom: number;
  uses_custom_metric: number;
  aliases: string;
  archived_at: number | null;
  created_at: number;
  updated_at: number;
}

function getRow(driver: SqliteDriver, id: string): ExerciseRow | undefined {
  return driver.queryAll<ExerciseRow>(`SELECT * FROM exercises WHERE id = ?`, [id])[0];
}

function countRows(driver: SqliteDriver, whereSql = '1'): number {
  const rows = driver.queryAll<{ n: number }>(`SELECT COUNT(*) as n FROM exercises WHERE ${whereSql}`);
  return rows[0]!.n;
}

function datasetVersion(driver: SqliteDriver): string | undefined {
  return driver.queryAll<{ value: string }>(
    `SELECT value FROM app_meta WHERE key = 'dataset_version'`,
  )[0]?.value;
}

function makeRecord(overrides: Partial<MappedExerciseRecord> & { id: string }): MappedExerciseRecord {
  return {
    name: overrides.id,
    exercise_type: 'weight_reps',
    primary_muscle_group: 'chest',
    secondary_muscle_groups: [],
    equipment: 'none',
    instructions: ['Step one.'],
    images: [],
    is_custom: 0,
    uses_custom_metric: 0,
    aliases: [],
    ...overrides,
  };
}

describe('seedBuiltinExercises (M1-05 integration, better-sqlite3)', () => {
  let driver: SqliteDriver;

  beforeEach(() => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
  });

  afterEach(() => {
    driver.close();
  });

  describe('fresh DB, real bundled dataset', () => {
    it('seeds all 873 rows and spot-checks known fields', () => {
      const startedAt = Date.now();
      const result = seedBuiltinExercises(
        driver,
        BUNDLED_EXERCISE_DATASET.exercises,
        BUNDLED_EXERCISE_DATASET.version,
      );
      const elapsedMs = Date.now() - startedAt;
      // Manual timing-proxy log for the <1s on-device target (this task's
      // acceptance gate asks this be logged, not asserted numerically —
      // Node/better-sqlite3 timing is not the device, just a proxy).
      console.log(
        `[M1-05] seedBuiltinExercises: fresh-DB seed of ${BUNDLED_EXERCISE_DATASET.exercises.length} ` +
          `rows took ${elapsedMs}ms (result.durationMs=${result.durationMs}ms) on better-sqlite3/Node.`,
      );

      expect(result.didSeed).toBe(true);
      expect(result.previousVersion).toBeNull();
      expect(result.inserted).toBe(BUNDLED_EXERCISE_DATASET.exerciseCount);
      expect(result.updated).toBe(0);
      expect(result.archived).toBe(0);
      expect(result.restored).toBe(0);
      expect(result.unchanged).toBe(0);

      expect(countRows(driver, `is_custom = 0`)).toBe(BUNDLED_EXERCISE_DATASET.exerciseCount);
      expect(datasetVersion(driver)).toBe(BUNDLED_EXERCISE_DATASET.version);

      // Spot-check a few real, well-known records against the source JSON.
      const squat = getRow(driver, 'Barbell_Squat')!;
      expect(squat).toBeDefined();
      expect(squat.name).toBe('Barbell Squat');
      expect(squat.exercise_type).toBe('weight_reps');
      expect(squat.primary_muscle_group).toBe('quadriceps');
      expect(squat.equipment).toBe('barbell');
      expect(JSON.parse(squat.secondary_muscle_groups)).toEqual([
        'calves',
        'glutes',
        'hamstrings',
        'lower_back',
      ]);
      expect(squat.is_custom).toBe(0);
      expect(squat.archived_at).toBeNull();

      const deadlift = getRow(driver, 'Barbell_Deadlift')!;
      expect(deadlift.name).toBe('Barbell Deadlift');
      expect(JSON.parse(deadlift.aliases)).toEqual(['DL']);

      const plank = getRow(driver, 'Plank')!;
      expect(plank.exercise_type).toBe('duration');
      expect(plank.primary_muscle_group).toBe('abdominals');
      expect(plank.equipment).toBe('none');
    }, 30000);

    it('re-running with the same version is a no-op: no duplicates, no updated_at churn', () => {
      const first = seedBuiltinExercises(
        driver,
        BUNDLED_EXERCISE_DATASET.exercises,
        BUNDLED_EXERCISE_DATASET.version,
      );
      expect(first.didSeed).toBe(true);

      const squatBefore = getRow(driver, 'Barbell_Squat')!;
      const countBefore = countRows(driver);

      const second = seedBuiltinExercises(
        driver,
        BUNDLED_EXERCISE_DATASET.exercises,
        BUNDLED_EXERCISE_DATASET.version,
      );

      expect(second.didSeed).toBe(false);
      expect(second.inserted).toBe(0);
      expect(second.updated).toBe(0);
      expect(second.archived).toBe(0);

      expect(countRows(driver)).toBe(countBefore);
      const squatAfter = getRow(driver, 'Barbell_Squat')!;
      expect(squatAfter.updated_at).toBe(squatBefore.updated_at);
      expect(squatAfter.created_at).toBe(squatBefore.created_at);
    }, 30000);
  });

  describe('version bump, small synthetic fixture', () => {
    const v1Records: MappedExerciseRecord[] = [
      makeRecord({ id: 'fixture-a', name: 'Fixture A' }),
      makeRecord({ id: 'fixture-b', name: 'Fixture B' }),
      makeRecord({ id: 'fixture-c', name: 'Fixture C' }),
      makeRecord({ id: 'fixture-d', name: 'Fixture D' }),
      makeRecord({ id: 'fixture-e-removed', name: 'Fixture E (will be removed)' }),
    ];
    // v2: fixture-e-removed dropped, fixture-d's name changed, a-c unchanged.
    const v2Records: MappedExerciseRecord[] = [
      makeRecord({ id: 'fixture-a', name: 'Fixture A' }),
      makeRecord({ id: 'fixture-b', name: 'Fixture B' }),
      makeRecord({ id: 'fixture-c', name: 'Fixture C' }),
      makeRecord({ id: 'fixture-d', name: 'Fixture D (renamed)' }),
    ];

    function seedV1(now: () => number): void {
      const result = seedBuiltinExercises(driver, v1Records, 'v1', now);
      expect(result.didSeed).toBe(true);
      expect(result.inserted).toBe(v1Records.length);
    }

    it('updates the changed built-in, archives the removed one, leaves a custom row + fake history row untouched', () => {
      let clock = 1_000_000;
      const now = () => clock;

      seedV1(now);

      // A custom exercise row (is_custom = 1) — must never be touched by seeding.
      driver.execute(
        `INSERT INTO exercises
           (id, name, exercise_type, primary_muscle_group, secondary_muscle_groups,
            equipment, instructions, images, animation_uri, is_custom,
            uses_custom_metric, aliases, archived_at, created_at, updated_at)
         VALUES ('custom-1', 'My Custom Curl', 'weight_reps', 'biceps', '[]', 'dumbbell', '[]', '[]',
                 NULL, 1, 0, '[]', NULL, 500, 500)`,
      );

      // A fake logged-history row referencing the built-in that's about to
      // be archived (fixture-e-removed) — archiving must never touch or
      // cascade into workout/set history (archived exercises still render
      // in history per 03 §5).
      driver.execute(
        `INSERT INTO workouts (id, title, state, start_time, created_at, updated_at)
         VALUES ('workout-1', 'Fake workout', 'completed', 500, 500, 500)`,
      );
      driver.execute(
        `INSERT INTO workout_exercises (id, workout_id, exercise_id, position)
         VALUES ('we-1', 'workout-1', 'fixture-e-removed', 0)`,
      );
      driver.execute(
        `INSERT INTO sets (id, workout_exercise_id, position, set_type, weight_kg, reps, is_completed)
         VALUES ('set-1', 'we-1', 0, 'normal', 100, 5, 1)`,
      );

      const customBefore = getRow(driver, 'custom-1')!;
      const aBefore = getRow(driver, 'fixture-a')!;
      const bBefore = getRow(driver, 'fixture-b')!;
      const cBefore = getRow(driver, 'fixture-c')!;
      const setBefore = driver.queryAll(`SELECT * FROM sets WHERE id = 'set-1'`)[0];

      clock = 2_000_000;
      const result = seedBuiltinExercises(driver, v2Records, 'v2', now);

      expect(result.didSeed).toBe(true);
      expect(result.previousVersion).toBe('v1');
      expect(result.version).toBe('v2');
      expect(result.updated).toBe(1); // fixture-d
      expect(result.archived).toBe(1); // fixture-e-removed
      expect(result.unchanged).toBe(3); // a, b, c
      expect(result.inserted).toBe(0);

      // fixture-d: content changed -> updated, updated_at bumped.
      const dAfter = getRow(driver, 'fixture-d')!;
      expect(dAfter.name).toBe('Fixture D (renamed)');
      expect(dAfter.updated_at).toBe(2_000_000);
      expect(dAfter.archived_at).toBeNull();

      // fixture-e-removed: archived, NOT deleted.
      const eAfter = getRow(driver, 'fixture-e-removed')!;
      expect(eAfter).toBeDefined();
      expect(eAfter.archived_at).toBe(2_000_000);
      expect(eAfter.name).toBe('Fixture E (will be removed)');

      // fixture-a/b/c: content unchanged -> completely untouched (no updated_at churn).
      const aAfter = getRow(driver, 'fixture-a')!;
      const bAfter = getRow(driver, 'fixture-b')!;
      const cAfter = getRow(driver, 'fixture-c')!;
      expect(aAfter.updated_at).toBe(aBefore.updated_at);
      expect(bAfter.updated_at).toBe(bBefore.updated_at);
      expect(cAfter.updated_at).toBe(cBefore.updated_at);

      // Custom row: completely untouched.
      const customAfter = getRow(driver, 'custom-1')!;
      expect(customAfter).toEqual(customBefore);

      // Fake history row: completely untouched, and still references the
      // now-archived exercise (archived exercises still render in history).
      const setAfter = driver.queryAll(`SELECT * FROM sets WHERE id = 'set-1'`)[0];
      expect(setAfter).toEqual(setBefore);
      const weRows = driver.queryAll(`SELECT * FROM workout_exercises WHERE id = 'we-1'`);
      expect(weRows).toHaveLength(1);
      expect((weRows[0] as { exercise_id: string }).exercise_id).toBe('fixture-e-removed');

      expect(datasetVersion(driver)).toBe('v2');
    });

    it('restores a content-identical built-in that reappears after being archived', () => {
      let clock = 1_000_000;
      const now = () => clock;

      seedV1(now);
      clock = 2_000_000;
      seedBuiltinExercises(driver, v2Records, 'v2', now); // archives fixture-e-removed

      expect(getRow(driver, 'fixture-e-removed')!.archived_at).toBe(2_000_000);

      // v3 brings fixture-e-removed back with identical content.
      clock = 3_000_000;
      const v3Records = [...v2Records, makeRecord({ id: 'fixture-e-removed', name: 'Fixture E (will be removed)' })];
      const result = seedBuiltinExercises(driver, v3Records, 'v3', now);

      expect(result.restored).toBe(1);
      expect(result.updated).toBe(0);
      const restored = getRow(driver, 'fixture-e-removed')!;
      expect(restored.archived_at).toBeNull();
      expect(restored.updated_at).toBe(3_000_000);
    });
  });
});
