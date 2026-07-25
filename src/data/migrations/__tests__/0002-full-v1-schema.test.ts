/**
 * Migration 0002 fixture-upgrade test (M1-01 acceptance gate) — 08 §5.3: "seed
 * representative data at version N−1 (fixtures), migrate, assert integrity."
 *
 * Loads the committed version-1 fixture dump (`../__fixtures__/
 * 0001-app-meta-and-settings.sql` — `app_meta` + `settings`, some seeded
 * settings rows), runs the real migration runner against it (applying only
 * migration 0002, since the fixture is already at version 1), and asserts:
 *  - every M1-01 table and every 05 §3.1-3.4 index exists afterward.
 *  - the pre-existing settings data (and other `app_meta` keys) survived
 *    completely untouched — same rows, same values, no churn.
 */
import fixtureSql from '../__fixtures__/0001-app-meta-and-settings.sql';
import { openBetterSqlite3Driver } from '../../sqlite/driver.better-sqlite3';
import { migrate, splitStatements } from '../../sqlite/migrator';
import type { SqliteDriver } from '../../sqlite/driver';

function listTableNames(driver: SqliteDriver): string[] {
  const rows = driver.queryAll<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
  );
  return rows.map((row) => row.name);
}

function listIndexNames(driver: SqliteDriver): string[] {
  // `sqlite_autoindex_*` rows back UNIQUE/PK constraints implicitly — not
  // part of 05 §3's explicit index list, so excluded here.
  const rows = driver.queryAll<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%' ORDER BY name`,
  );
  return rows.map((row) => row.name);
}

/** Load a committed fixture dump (schema + seed rows) into a fresh database, statement by statement. */
function loadFixture(driver: SqliteDriver, sql: string): void {
  for (const statement of splitStatements(sql)) {
    driver.execute(statement);
  }
}

describe('migration 0002 fixture-upgrade (M1-01, 08 §5.3)', () => {
  let driver: SqliteDriver;

  beforeEach(() => {
    driver = openBetterSqlite3Driver(':memory:');
    loadFixture(driver, fixtureSql);
  });

  afterEach(() => {
    driver.close();
  });

  it('starts the fixture at schema version 1 with only app_meta + settings', () => {
    expect(listTableNames(driver)).toEqual(['app_meta', 'settings']);
    const versionRows = driver.queryAll<{ value: string }>(
      `SELECT value FROM app_meta WHERE key = 'schema_version'`,
    );
    expect(versionRows).toEqual([{ value: '1' }]);
  });

  // `migrate(driver)` (no explicit manifest arg) always runs the *real*,
  // full manifest — as of the M3-05 review fix that also includes migration
  // 0003 (`workout_exercises.routine_occurrence_index`, additive/nullable,
  // `manifest.ts`'s own header), and as of the M3-06 review fix migration
  // 0004 (`sets.routine_set_position`, same additive/nullable shape), so a
  // version-1 fixture now picks up all three remaining migrations, reaching
  // version 4.
  it('migrates the fixture forward: applies migrations 0002, 0003, and 0004, reaching version 4', () => {
    const result = migrate(driver);

    expect(result.fromVersion).toBe(1);
    expect(result.toVersion).toBe(4);
    expect(result.applied).toEqual([
      '0001_exercises_workouts_routines_measurements',
      '0002_workout_exercises_routine_occurrence_index',
      '0003_sets_routine_set_position',
    ]);
  });

  it('every M1-01 table exists after migrating', () => {
    migrate(driver);

    expect(listTableNames(driver)).toEqual(
      [
        'app_meta',
        'body_measurements',
        'exercises',
        'progress_photos',
        'routine_exercises',
        'routine_folders',
        'routine_sets',
        'routines',
        'settings',
        'sets',
        'sqlite_sequence', // routine_folders' AUTOINCREMENT bookkeeping table
        'workout_exercises',
        'workouts',
      ].sort(),
    );
  });

  it('every 05 §3.1-3.4 index exists after migrating, including both partial unique indexes', () => {
    migrate(driver);

    expect(listIndexNames(driver)).toEqual(
      [
        'idx_exercises_name',
        'idx_exercises_name_active',
        'idx_one_active_workout',
        'idx_photos_date',
        'idx_re_routine',
        'idx_sets_we',
        'idx_we_exercise',
        'idx_we_workout',
        'idx_workouts_start',
      ].sort(),
    );
  });

  it('pre-existing settings data survives the migration completely untouched', () => {
    const before = driver.queryAll<{ key: string; value: string }>(
      `SELECT key, value FROM settings ORDER BY key`,
    );

    migrate(driver);

    const after = driver.queryAll<{ key: string; value: string }>(
      `SELECT key, value FROM settings ORDER BY key`,
    );
    expect(after).toEqual(before);
    expect(after).toEqual([
      { key: 'default_rest_seconds', value: '120' },
      {
        key: 'sounds',
        value:
          '{"timer_sound":"bell","timer_volume":"high","set_check_volume":"normal","notification_volume":"low"}',
      },
      { key: 'theme', value: '"dark"' },
      { key: 'weight_unit', value: '"lbs"' },
    ]);
  });

  it('pre-existing app_meta keys other than schema_version survive untouched', () => {
    migrate(driver);

    const datasetVersion = driver.queryAll<{ value: string }>(
      `SELECT value FROM app_meta WHERE key = 'dataset_version'`,
    );
    expect(datasetVersion).toEqual([{ value: 'seed-fixture-v0' }]);
  });
});
