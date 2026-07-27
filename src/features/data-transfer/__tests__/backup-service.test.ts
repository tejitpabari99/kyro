/**
 * `BackupService` integration tests (M5-09 acceptance gate, 05 §9) — real
 * `better-sqlite3` against the migrated schema (same 08 §5 parity posture
 * every other `src/data/**`/`src/features/data-transfer/**` integration
 * suite here uses), with the photo-file and zip-cache halves backed by a
 * **real temporary directory** (`fs`/`os.tmpdir()`), the exact pattern
 * `measurement-repository.test.ts`'s own `fakeFileDeps()` established for
 * "add creates file+row, delete removes both" being a genuine on-disk
 * assertion rather than a mocked call-count — this task's own brief asks
 * for the identical posture on the photo side of `export()`/`restore()`.
 *
 * Core acceptance case (`M5-tasks.md`'s M5-09 test gate): seed every one of
 * the 12 real tables + 2 real photo files -> `export()` -> forcibly wipe
 * both the DB (every table truncated) and the photo directory (every file
 * deleted) -> `restore()` the exported zip -> assert every table's rows and
 * every photo file are back exactly as seeded. Also covers the schema-
 * version reject gate and the three "not a valid backup" file-error cases,
 * each asserting zero DB mutation on failure.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { migrate } from '@/data/sqlite/migrator';
import { bytesToBase64, utf8ToBytes, zipEntries } from '@/lib/zip';

import { createBackupService, type BackupServiceDeps } from '../backup-service';

// ---------------------------------------------------------------------------
// Real temp-directory file deps — see file header.
// ---------------------------------------------------------------------------

function fakeBackupFileDeps(): {
  deps: Omit<BackupServiceDeps, 'driver'>;
  listPhotoFiles: () => string[];
  wipePhotoFiles: () => void;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kyro-backup-'));
  const photoDir = path.join(root, 'photos', 'progress');
  const cacheDir = path.join(root, 'cache');
  fs.mkdirSync(photoDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });

  return {
    listPhotoFiles: () => (fs.existsSync(photoDir) ? fs.readdirSync(photoDir) : []),
    wipePhotoFiles: () => {
      for (const name of fs.readdirSync(photoDir)) {
        fs.unlinkSync(path.join(photoDir, name));
      }
    },
    deps: {
      listPhotoFileNames: async () => (fs.existsSync(photoDir) ? fs.readdirSync(photoDir) : []),
      readPhotoFileBase64: async (fileName) =>
        fs.readFileSync(path.join(photoDir, fileName)).toString('base64'),
      writePhotoFileBase64: async (fileName, base64) => {
        fs.mkdirSync(photoDir, { recursive: true });
        fs.writeFileSync(path.join(photoDir, fileName), Buffer.from(base64, 'base64'));
      },
      writeCacheZipFile: async (fileName, base64) => {
        const filePath = path.join(cacheDir, fileName);
        fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
        return `file://${filePath}`;
      },
      readFileBase64: async (fileUri) => {
        const filePath = fileUri.replace('file://', '');
        return fs.readFileSync(filePath).toString('base64');
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Seed data — one representative row per table (all 12), covering every FK
// relationship `BACKUP_TABLES`' insert/delete ordering must respect.
// ---------------------------------------------------------------------------

function seedSampleData(driver: SqliteDriver): void {
  const now = Date.now();
  driver.transaction(() => {
    driver.execute(`INSERT INTO settings (key, value) VALUES ('theme', '"dark"')`);
    driver.execute(
      `INSERT INTO app_meta (key, value) VALUES ('dataset_version', 'v1-test')`,
    );

    driver.execute(
      `INSERT INTO exercises
         (id, name, exercise_type, primary_muscle_group, secondary_muscle_groups,
          equipment, instructions, images, animation_uri, is_custom,
          uses_custom_metric, aliases, archived_at, created_at, updated_at)
       VALUES ('ex-1', 'Bench Press', 'weight_reps', 'chest', '[]', 'barbell', '[]', '[]', NULL, 0, 0, '[]', NULL, ?, ?)`,
      [now, now],
    );

    driver.execute(
      `INSERT INTO workouts
         (id, title, description, routine_id, state, start_time, end_time,
          duration_pause_offset_ms, created_at, updated_at, deleted_at)
       VALUES ('w-1', 'Morning Workout', 'Felt strong', NULL, 'completed', ?, ?, 0, ?, ?, NULL)`,
      [now, now + 1000, now, now],
    );
    driver.execute(
      `INSERT INTO workout_exercises (id, workout_id, exercise_id, position, superset_id, notes, rest_seconds, routine_occurrence_index)
       VALUES ('we-1', 'w-1', 'ex-1', 0, NULL, NULL, 90, NULL)`,
    );
    driver.execute(
      `INSERT INTO sets
         (id, workout_exercise_id, position, set_type, weight_kg, reps, distance_meters,
          duration_seconds, rpe, custom_metric, is_completed, routine_set_position)
       VALUES ('set-1', 'we-1', 0, 'normal', 60, 8, NULL, NULL, NULL, NULL, 1, NULL)`,
    );
    driver.execute(
      `INSERT INTO sets
         (id, workout_exercise_id, position, set_type, weight_kg, reps, distance_meters,
          duration_seconds, rpe, custom_metric, is_completed, routine_set_position)
       VALUES ('set-2', 'we-1', 1, 'dropset', 55, 10, NULL, NULL, 8, NULL, 1, NULL)`,
    );

    driver.execute(
      `INSERT INTO routine_folders (id, title, position, collapsed, created_at, updated_at)
       VALUES (1, 'Push/Pull/Legs', 0, 0, ?, ?)`,
      [now, now],
    );
    driver.execute(
      `INSERT INTO routines (id, title, notes, folder_id, position, created_at, updated_at)
       VALUES ('r-1', 'Push Day', NULL, 1, 0, ?, ?)`,
      [now, now],
    );
    driver.execute(
      `INSERT INTO routine_exercises (id, routine_id, exercise_id, position, superset_id, notes, rest_seconds)
       VALUES ('re-1', 'r-1', 'ex-1', 0, NULL, NULL, 90)`,
    );
    driver.execute(
      `INSERT INTO routine_sets
         (id, routine_exercise_id, position, set_type, weight_kg, reps, rep_range_start,
          rep_range_end, distance_meters, duration_seconds, custom_metric)
       VALUES ('rs-1', 're-1', 0, 'normal', 60, 8, NULL, NULL, NULL, NULL, NULL)`,
    );

    driver.execute(
      `INSERT INTO body_measurements
         (date, weight_kg, fat_percent, lean_mass_kg, neck_cm, shoulders_cm, chest_cm,
          left_bicep_cm, right_bicep_cm, left_forearm_cm, right_forearm_cm, abdomen_cm,
          waist_cm, hips_cm, left_thigh_cm, right_thigh_cm, left_calf_cm, right_calf_cm,
          created_at, updated_at)
       VALUES ('2026-01-01', 80, 15.5, 68, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, 90, NULL, NULL, NULL, NULL, NULL, ?, ?)`,
      [now, now],
    );
    driver.execute(
      `INSERT INTO progress_photos (id, date, file_name, created_at) VALUES ('photo-1', '2026-01-01', 'photo-1.jpg', ?)`,
      [now],
    );
    driver.execute(
      `INSERT INTO progress_photos (id, date, file_name, created_at) VALUES ('photo-2', '2026-01-01', 'photo-2.jpg', ?)`,
      [now],
    );
  });
}

const TABLE_NAMES = [
  'settings',
  'app_meta',
  'exercises',
  'workouts',
  'workout_exercises',
  'sets',
  'routine_folders',
  'routines',
  'routine_exercises',
  'routine_sets',
  'body_measurements',
  'progress_photos',
] as const;

/** Snapshots every table's rows, keyed by table name, ordered deterministically. */
function snapshotAllTables(driver: SqliteDriver): Record<string, unknown[]> {
  const snapshot: Record<string, unknown[]> = {};
  for (const table of TABLE_NAMES) {
    // `rowid` is SQLite's own implicit stable ordering for insertion order —
    // safe here since none of these tables use `WITHOUT ROWID`.
    snapshot[table] = driver.queryAll(`SELECT * FROM ${table} ORDER BY rowid`);
  }
  return snapshot;
}

/**
 * Deletes every row from every table, without going through `BackupService`
 * at all — the test's own independent "wipe" step, so a passing restore
 * assertion can't be trivially explained by `restore()` simply never having
 * run. Leaves `app_meta.schema_version` itself untouched: in real use this
 * key is the *currently-installed app's own* migrated-schema bookkeeping
 * (`migrator.ts` owns writes to it), never something a data wipe erases —
 * a real disaster-recovery scenario is "the app's data is gone," never
 * "the app doesn't know what schema version it's running," so wiping that
 * one key here would test a scenario that cannot actually occur.
 */
function wipeAllTables(driver: SqliteDriver): void {
  driver.transaction(() => {
    for (const table of [...TABLE_NAMES].reverse()) {
      if (table === 'app_meta') {
        driver.execute(`DELETE FROM app_meta WHERE key != 'schema_version'`);
      } else {
        driver.execute(`DELETE FROM ${table}`);
      }
    }
  });
}

describe('BackupService (better-sqlite3 + real temp-dir integration, M5-09)', () => {
  let driver: SqliteDriver;

  beforeEach(() => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
  });

  afterEach(() => {
    driver.close();
  });

  it('[named acceptance case] export -> wipe DB+files -> restore -> every table + every photo file match the pre-wipe state exactly', async () => {
    seedSampleData(driver);
    const { deps, listPhotoFiles, wipePhotoFiles } = fakeBackupFileDeps();
    // Real photo files on disk, matching the seeded `progress_photos` rows
    // — written through the same `deps.writePhotoFileBase64` production
    // code path exercises, not by reaching into the temp dir directly.
    await deps.writePhotoFileBase64('photo-1.jpg', Buffer.from('fake-jpeg-bytes-1').toString('base64'));
    await deps.writePhotoFileBase64('photo-2.jpg', Buffer.from('fake-jpeg-bytes-2').toString('base64'));

    const service = createBackupService({ driver, ...deps });

    // Snapshot taken *before* `export()` — `export()` itself writes
    // `last_backup_at` into the live `app_meta` table only *after* its own
    // `db.json` dump was already taken (this file's own header, "Record
    // last_backup_at ... after a successful export"), so that one key is
    // deliberately not part of what a given export's zip contains. Snapshotting
    // pre-export is therefore the correct "what should come back after
    // restore" baseline — see the dedicated `last_backup_at` assertion right
    // below for that key's own (separate) round trip.
    const beforeSnapshot = snapshotAllTables(driver);
    expect(beforeSnapshot.workouts).toHaveLength(1);
    expect(beforeSnapshot.progress_photos).toHaveLength(2);

    const exportResult = await service.export();
    expect(exportResult.workoutCount).toBe(1);
    expect(exportResult.photoCount).toBe(2);
    expect(exportResult.uri).toContain(exportResult.fileName);
    expect(exportResult.fileName).toMatch(/^kyro_backup_\d{4}-\d{2}-\d{2}\.zip$/);

    // `last_backup_at` recorded (05 §9 / schema.ts header).
    const [lastBackupRow] = driver.queryAll<{ value: string }>(
      `SELECT value FROM app_meta WHERE key = 'last_backup_at'`,
    );
    expect(lastBackupRow).toBeDefined();
    expect(Number(lastBackupRow!.value)).toBeCloseTo(exportResult.exportedAt, -2);

    // Independent wipe — see `wipeAllTables`'s own doc comment.
    wipeAllTables(driver);
    wipePhotoFiles();
    expect(snapshotAllTables(driver).workouts).toHaveLength(0);
    expect(listPhotoFiles()).toHaveLength(0);

    const restoreResult = await service.restore(exportResult.uri);
    expect('error' in restoreResult).toBe(false);
    if ('error' in restoreResult) throw new Error('unreachable');
    expect(restoreResult.workoutCount).toBe(1);
    expect(restoreResult.photoCount).toBe(2);

    const afterSnapshot = snapshotAllTables(driver);
    expect(afterSnapshot).toEqual(beforeSnapshot);

    const restoredFiles = listPhotoFiles().sort();
    expect(restoredFiles).toEqual(['photo-1.jpg', 'photo-2.jpg']);
    expect(await deps.readPhotoFileBase64('photo-1.jpg')).toBe(
      Buffer.from('fake-jpeg-bytes-1').toString('base64'),
    );
    expect(await deps.readPhotoFileBase64('photo-2.jpg')).toBe(
      Buffer.from('fake-jpeg-bytes-2').toString('base64'),
    );
  });

  it('restore replaces rows rather than merging — pre-restore junk rows are gone afterward, not just supplemented', async () => {
    seedSampleData(driver);
    const { deps } = fakeBackupFileDeps();
    const service = createBackupService({ driver, ...deps });
    const exportResult = await service.export();

    // Simulate drift since the export: a new, never-exported workout.
    driver.execute(
      `INSERT INTO workouts
         (id, title, description, routine_id, state, start_time, end_time,
          duration_pause_offset_ms, created_at, updated_at, deleted_at)
       VALUES ('w-junk', 'Should Not Survive', NULL, NULL, 'completed', 0, 100, 0, 0, 0, NULL)`,
    );
    expect(driver.queryAll(`SELECT id FROM workouts`)).toHaveLength(2);

    const result = await service.restore(exportResult.uri);
    expect('error' in result).toBe(false);

    const workoutIds = driver.queryAll<{ id: string }>(`SELECT id FROM workouts`).map((r) => r.id);
    expect(workoutIds).toEqual(['w-1']);
  });

  it('rejects a zip whose db.json is valid JSON but has an unrecognized shape (e.g. schemaVersion as a string), without mutating the DB', async () => {
    seedSampleData(driver);
    const { deps } = fakeBackupFileDeps();
    const service = createBackupService({ driver, ...deps });
    const zipped = zipEntries([
      { path: 'db.json', data: utf8ToBytes(JSON.stringify({ schemaVersion: 'four', tables: {} })) },
    ]);
    const uri = await deps.writeCacheZipFile('bad-shape.zip', bytesToBase64(zipped));

    const beforeSnapshot = snapshotAllTables(driver);
    const result = await service.restore(uri);

    expect(result).toEqual({ error: expect.stringContaining('unrecognized shape') });
    expect(snapshotAllTables(driver)).toEqual(beforeSnapshot);
  });

  it('rejects a backup whose schema_version does not match the current app schema version, without mutating the DB', async () => {
    seedSampleData(driver);
    const { deps } = fakeBackupFileDeps();
    const service = createBackupService({ driver, ...deps });

    const badZip = zipEntries([
      {
        path: 'db.json',
        data: utf8ToBytes(
          JSON.stringify({ schemaVersion: 999, exportedAt: Date.now(), tables: {} }),
        ),
      },
    ]);
    const uri = await deps.writeCacheZipFile('bad.zip', bytesToBase64(badZip));

    const beforeSnapshot = snapshotAllTables(driver);
    const result = await service.restore(uri);

    expect(result).toEqual({ error: expect.stringContaining('schema') });
    expect(snapshotAllTables(driver)).toEqual(beforeSnapshot);
  });

  it('rejects a non-zip file with a clear error, without mutating the DB', async () => {
    seedSampleData(driver);
    const { deps } = fakeBackupFileDeps();
    const service = createBackupService({ driver, ...deps });
    const uri = await deps.writeCacheZipFile('not-a-zip.zip', bytesToBase64(utf8ToBytes('garbage')));

    const beforeSnapshot = snapshotAllTables(driver);
    const result = await service.restore(uri);

    expect(result).toEqual({ error: expect.stringContaining('not a valid Kyro backup') });
    expect(snapshotAllTables(driver)).toEqual(beforeSnapshot);
  });

  it('rejects a zip with no db.json inside it, without mutating the DB', async () => {
    seedSampleData(driver);
    const { deps } = fakeBackupFileDeps();
    const service = createBackupService({ driver, ...deps });
    const zipped = zipEntries([{ path: 'photos/progress/only-a-photo.jpg', data: utf8ToBytes('x') }]);
    const uri = await deps.writeCacheZipFile('no-dbjson.zip', bytesToBase64(zipped));

    const beforeSnapshot = snapshotAllTables(driver);
    const result = await service.restore(uri);

    expect(result).toEqual({ error: expect.stringContaining('db.json') });
    expect(snapshotAllTables(driver)).toEqual(beforeSnapshot);
  });

  it('rejects a zip whose db.json is corrupt (not valid JSON), without mutating the DB', async () => {
    seedSampleData(driver);
    const { deps } = fakeBackupFileDeps();
    const service = createBackupService({ driver, ...deps });
    const zipped = zipEntries([{ path: 'db.json', data: utf8ToBytes('{not valid json') }]);
    const uri = await deps.writeCacheZipFile('corrupt.zip', bytesToBase64(zipped));

    const beforeSnapshot = snapshotAllTables(driver);
    const result = await service.restore(uri);

    expect(result).toEqual({ error: expect.stringContaining('corrupt') });
    expect(snapshotAllTables(driver)).toEqual(beforeSnapshot);
  });

  it('rejects a zip whose photo entry path attempts directory traversal ("zip slip"), without mutating the DB or writing any file', async () => {
    // Found in M5-09 review: `path.slice(PHOTOS_ZIP_PREFIX.length)` was fed
    // straight into `writePhotoFileBase64` (plain string concatenation onto
    // the real photo directory, no sanitization) with no check that the
    // result stays inside `photos/progress/`. A malicious/corrupt backup
    // zip — the restored file is picked from anywhere on-device, not
    // necessarily produced by this app — could otherwise overwrite an
    // arbitrary file inside the app sandbox, including the SQLite database
    // `replaceAllTables` just finished restoring.
    seedSampleData(driver);
    const { deps, listPhotoFiles } = fakeBackupFileDeps();
    const service = createBackupService({ driver, ...deps });

    const schemaVersion = Number(
      driver.queryAll<{ value: string }>(`SELECT value FROM app_meta WHERE key = 'schema_version'`)[0]!
        .value,
    );
    const zipped = zipEntries([
      {
        path: 'db.json',
        data: utf8ToBytes(JSON.stringify({ schemaVersion, exportedAt: Date.now(), tables: {} })),
      },
      { path: 'photos/progress/../../../evil.jpg', data: utf8ToBytes('malicious payload') },
    ]);
    const uri = await deps.writeCacheZipFile('zip-slip.zip', bytesToBase64(zipped));

    const beforeSnapshot = snapshotAllTables(driver);
    const result = await service.restore(uri);

    expect(result).toEqual({ error: expect.stringContaining('unsafe photo file path') });
    expect(snapshotAllTables(driver)).toEqual(beforeSnapshot);
    // Nothing should have been written to the (real) photo directory either
    // — the whole restore is rejected before any table or file is touched.
    expect(listPhotoFiles()).toEqual([]);
  });

  // ---------------------------------------------------------------------------
  // Transactional atomicity (M5-09 review addition) — `replaceAllTables`
  // wraps its children-first DELETE pass and parents-first INSERT pass in one
  // `driver.transaction(...)` call (this file's own header, "Restore
  // transactionality"). A mid-restore DB failure must leave the PRE-restore
  // data intact — not a half-wiped DB, and not a half-restored one either —
  // same "mid-batch DB failure rolls back the ENTIRE transaction" case
  // `hevy-import-service.test.ts` locks in for `bulkInsertWorkouts` (found
  // missing here during the M5-09 review; this is the analogous test for
  // `replaceAllTables`).
  // ---------------------------------------------------------------------------

  it('a mid-restore DB failure rolls back the ENTIRE transaction — pre-restore data (including the DELETEs already run on earlier tables) is fully intact, not a half-wiped DB', async () => {
    seedSampleData(driver);
    const { deps } = fakeBackupFileDeps();
    const service = createBackupService({ driver, ...deps });
    const exportResult = await service.export();

    // Drift since the export, so "restore rolled back cleanly" and "restore
    // never ran at all" are distinguishable: if the transaction had *not*
    // rolled back, this junk row would already be gone (deleted by the
    // DELETE-all pass) even though the failure happened later, on a
    // different table's INSERT.
    driver.execute(
      `INSERT INTO workouts
         (id, title, description, routine_id, state, start_time, end_time,
          duration_pause_offset_ms, created_at, updated_at, deleted_at)
       VALUES ('w-junk', 'Should Survive A Failed Restore', NULL, NULL, 'completed', 0, 100, 0, 0, 0, NULL)`,
    );
    const beforeSnapshot = snapshotAllTables(driver);
    expect(beforeSnapshot.workouts).toHaveLength(2);

    // Simulate a DB-level failure LATE in the INSERT pass (routine_sets,
    // second-to-last table) — by this point every table's DELETE has
    // already run for real, and several tables' INSERTs (exercises,
    // workouts, workout_exercises, sets, routine_folders, routines,
    // routine_exercises) have already gone through the real driver too. If
    // rollback is genuinely all-or-nothing, none of that survives either.
    const realExecute = driver.execute.bind(driver);
    jest.spyOn(driver, 'execute').mockImplementation((sql: string, params?: unknown[]) => {
      if (sql.trim().startsWith('INSERT INTO routine_sets')) {
        throw new Error('simulated mid-restore DB failure');
      }
      return realExecute(sql, params);
    });

    await expect(service.restore(exportResult.uri)).rejects.toThrow('simulated mid-restore DB failure');

    // Pre-restore state — junk row included, no partial restore rows —
    // must be back exactly, not a half-wiped or half-restored DB.
    expect(snapshotAllTables(driver)).toEqual(beforeSnapshot);
  });

  it('export() with zero photos on disk still succeeds, with photoCount 0', async () => {
    seedSampleData(driver);
    // Remove the progress_photos rows this test doesn't want, so there is
    // nothing referencing a photo file that was never written to disk.
    driver.execute(`DELETE FROM progress_photos`);
    const { deps } = fakeBackupFileDeps();
    const service = createBackupService({ driver, ...deps });

    const result = await service.export();

    expect(result.photoCount).toBe(0);
  });
});
