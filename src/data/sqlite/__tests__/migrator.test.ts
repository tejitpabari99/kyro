/**
 * Migration runner integration test (M0-09 + M1-01 acceptance gate) — 05
 * §10 / 08 §5: runs the real generated migration SQL (`src/data/migrations/
 * *.sql`, via the manifest) against the `better-sqlite3` backend, the same
 * files the on-device `expo-sqlite` driver would apply (parity is the
 * point — no separate "test-only" SQL). M1-01 added migration 0002 (the
 * full v1 schema, 05 §3.1-3.4) to the manifest; the fixture-upgrade test
 * for that specific migration lives in
 * `../migrations/__tests__/0002-full-v1-schema.test.ts`, so this suite
 * only needs updating to reflect the manifest now having two entries.
 */
import { openBetterSqlite3Driver } from '../driver.better-sqlite3';
import { migrate } from '../migrator';
import type { SqliteDriver } from '../driver';

function listTableNames(driver: SqliteDriver): string[] {
  const rows = driver.queryAll<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`,
  );
  return rows.map((row) => row.name);
}

/** Every table the full manifest (migrations 0001+0002) creates, sorted (sqlite_master order). */
const ALL_TABLES = [
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
  // SQLite's own bookkeeping table for `INTEGER PRIMARY KEY AUTOINCREMENT`
  // columns (`routine_folders.id`) — an implicit side effect of that column
  // option, not something either migration creates directly.
  'sqlite_sequence',
  'workout_exercises',
  'workouts',
].sort();

describe('migration runner (better-sqlite3 integration, M0-09 + M1-01)', () => {
  let driver: SqliteDriver;

  beforeEach(() => {
    driver = openBetterSqlite3Driver(':memory:');
  });

  afterEach(() => {
    driver.close();
  });

  it('migrates an empty database: creates the full v1 schema and records schema_version', () => {
    expect(listTableNames(driver)).toEqual([]);

    const result = migrate(driver);

    expect(result.fromVersion).toBe(0);
    expect(result.toVersion).toBe(2);
    expect(result.applied).toEqual([
      '0000_app_meta_and_settings',
      '0001_exercises_workouts_routines_measurements',
    ]);

    expect(listTableNames(driver)).toEqual(ALL_TABLES);

    const versionRows = driver.queryAll<{ value: string }>(
      `SELECT value FROM app_meta WHERE key = 'schema_version'`,
    );
    expect(versionRows).toEqual([{ value: '2' }]);

    // Both original tables are actually usable (not just present) —
    // round-trip a row through each, matching 05 §3.5's DDL exactly.
    driver.execute(`INSERT INTO settings (key, value) VALUES (?, ?)`, ['theme', '"dark"']);
    expect(
      driver.queryAll<{ value: string }>(`SELECT value FROM settings WHERE key = 'theme'`),
    ).toEqual([{ value: '"dark"' }]);
  });

  it('the full manifest creates exactly the M0-09 + M1-01 tables (no more, no less)', () => {
    migrate(driver);
    expect(listTableNames(driver)).toEqual(ALL_TABLES);
  });

  it('re-running against an already-migrated database is a no-op (idempotent)', () => {
    const first = migrate(driver);
    expect(first.applied).toEqual([
      '0000_app_meta_and_settings',
      '0001_exercises_workouts_routines_measurements',
    ]);

    const second = migrate(driver);

    expect(second.fromVersion).toBe(2);
    expect(second.toVersion).toBe(2);
    expect(second.applied).toEqual([]);
    expect(listTableNames(driver)).toEqual(ALL_TABLES);
  });

  it('applies out-of-order migration entries in ascending version order', () => {
    // Deliberately unsorted input — asserts the runner sorts by `version`
    // itself rather than trusting manifest entry order.
    const result = migrate(driver, [
      {
        version: 2,
        tag: 'second',
        sql: 'CREATE TABLE second_table (id INTEGER PRIMARY KEY)',
      },
      {
        version: 1,
        tag: 'first',
        sql:
          'CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);\n' +
          '--> statement-breakpoint\n' +
          'CREATE TABLE first_table (id INTEGER PRIMARY KEY)',
      },
    ]);

    expect(result.applied).toEqual(['first', 'second']);
    expect(result.toVersion).toBe(2);
    expect(listTableNames(driver)).toEqual(['app_meta', 'first_table', 'second_table']);
  });

  it('treats an app_meta table with no schema_version row as version 0', () => {
    // A table that exists but has no `schema_version` row yet (distinct
    // from the table not existing at all) — both read as version 0.
    driver.execute('CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');

    const result = migrate(driver, []);

    expect(result.fromVersion).toBe(0);
    expect(result.toVersion).toBe(0);
    expect(result.applied).toEqual([]);
  });

  it('treats an unparseable schema_version value as version 0 (defensive fallback)', () => {
    driver.execute('CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
    driver.execute(`INSERT INTO app_meta (key, value) VALUES ('schema_version', 'not-a-number')`);

    const result = migrate(driver, []);

    expect(result.fromVersion).toBe(0);
  });

  it('rolls back the whole migration if one of its statements fails, leaving schema_version unrecorded', () => {
    // Pre-create `settings` outside the runner so migration 0001's own
    // `CREATE TABLE settings` statement collides and throws — asserts the
    // transaction wrapping (one transaction per migration, 06 §5.2) leaves
    // no partial state (no `app_meta` row, no `schema_version` bump) rather
    // than a half-applied migration.
    driver.execute('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)');

    expect(() => migrate(driver)).toThrow();

    expect(listTableNames(driver)).toEqual(['settings']);
  });
});
