/**
 * `BackupService` (M5-09, 05 §9) — full-fidelity backup/restore beyond CSV.
 * Lives in `src/features/data-transfer/` alongside `csv-service.ts`/
 * `hevy-import-service.ts` — the same "glues `src/data/**` (raw
 * `SqliteDriver`) + `src/lib/**` (zip codec, file I/O) together" role those
 * two files' own headers describe, for the identical `eslint.config.js`
 * `import/no-restricted-paths` reason: only `src/features/**` may import
 * both zones at once.
 *
 * ## `db.json` shape: raw `SELECT *`, not repository domain objects
 *
 * 05 §9: "`db.json` (full logical dump of all tables, schema-versioned)".
 * `dumpTable`/`restoreTable` below talk to the 12 real tables
 * (`src/data/sqlite/schema.ts`) via `SqliteDriver.queryAll`/`execute`
 * directly — the exact same "bypass repository domain-object mapping, want
 * the literal schema shape" posture `src/test/fixtures/
 * synthetic-history-loader.ts`'s own header establishes for bulk writes,
 * applied here to a bulk *dump* as well as the restore-side bulk *write*.
 * Column lists per table ({@link BACKUP_TABLES}) are hand-transcribed from
 * `schema.ts` (snake_case, one-to-one with its DDL) rather than derived from
 * Drizzle's schema objects at runtime — this stays a plain, inspectable
 * constant that changes only when a real migration changes a table's shape,
 * matching `synthetic-history-loader.ts`'s own hand-listed INSERT columns.
 *
 * ## Table order: parents before children, insert; children before parents, delete
 *
 * Both `better-sqlite3` and `expo-sqlite` run with `PRAGMA foreign_keys =
 * ON` (`driver.better-sqlite3.ts`/`driver.expo.ts`'s own headers) and check
 * FK constraints **immediately**, not deferred to commit — so a bulk DELETE
 * or INSERT that visits a child table before its parent (or vice versa)
 * genuinely fails mid-transaction, not just "works but is bad style".
 * {@link BACKUP_TABLES} is ordered parent-first for INSERT
 * (`settings`/`app_meta` first — no FKs at all — then `exercises` before
 * `workouts`/`routine_exercises` reference it, `workouts` before
 * `workout_exercises`, `workout_exercises` before `sets`, `routine_folders`
 * before `routines`, `routines` before `routine_exercises`,
 * `routine_exercises` before `routine_sets`, `body_measurements` before
 * `progress_photos`); DELETE runs the exact reverse of that same array
 * (children first) via `[...BACKUP_TABLES].reverse()` in
 * {@link replaceAllTables} — one array, two directions, so the two orderings
 * can never drift apart from each other by hand-editing them separately.
 *
 * ## Schema-version gate: exact match only, no forward migration built
 *
 * 05 §9/§10 describe restoring an *older* dump by "migrat[ing] the logical
 * dump forward" first. This app is pre-launch (`docs/plan/EXECUTION-LOG.md`'s
 * own running status — no released build, no real user ever ran an older
 * schema version) — there is no actual older `db.json` shape in existence to
 * migrate from, and this task's own brief is explicit that speculative
 * migration logic for versions that don't exist yet is worse than admitting
 * the gap honestly. `restore()` below therefore implements the other half
 * 05 §9 asks for verbatim ("validate version ... reject if unsupported" is
 * the real, buildable half of that sentence) and nothing more: a `db.json`
 * whose `schemaVersion` doesn't **exactly** match this running app's own
 * `app_meta.schema_version` is rejected with a clear, actionable error
 * before any table is touched. The moment a second real schema version ships
 * (this app's very next migration, in practice) this gate's "reject
 * everything but exact match" becomes overly strict for the *trivial* case
 * (an old-version dump with zero column/table differences up to the new
 * version) — deliberately accepted as a known, documented limitation rather
 * than guessed at now; see `docs/plan/EXECUTION-LOG.md`'s M5-09 row for the
 * full reasoning trail.
 */
import { localDateKey } from '@/domain/streaks';
import type { SqliteDriver, SqliteRow } from '@/data/sqlite/driver';
import { base64ToBytes, bytesToBase64, bytesToUtf8, unzipEntries, utf8ToBytes, zipEntries } from '@/lib/zip';

// ---------------------------------------------------------------------------
// Table specs — see file header, "db.json shape" / "Table order"
// ---------------------------------------------------------------------------

interface BackupTableSpec {
  name: string;
  columns: readonly string[];
}

/** Parent-before-child order for INSERT; reversed for DELETE. See file header. Every one of the 12 real tables in `src/data/sqlite/schema.ts` — `settings`/`app_meta` included, per 05 §9's "full logical dump of all tables". */
const BACKUP_TABLES: readonly BackupTableSpec[] = [
  { name: 'settings', columns: ['key', 'value'] },
  { name: 'app_meta', columns: ['key', 'value'] },
  {
    name: 'exercises',
    columns: [
      'id',
      'name',
      'exercise_type',
      'primary_muscle_group',
      'secondary_muscle_groups',
      'equipment',
      'instructions',
      'images',
      'animation_uri',
      'is_custom',
      'uses_custom_metric',
      'aliases',
      'archived_at',
      'created_at',
      'updated_at',
    ],
  },
  {
    name: 'workouts',
    columns: [
      'id',
      'title',
      'description',
      'routine_id',
      'state',
      'start_time',
      'end_time',
      'duration_pause_offset_ms',
      'created_at',
      'updated_at',
      'deleted_at',
    ],
  },
  {
    name: 'workout_exercises',
    columns: [
      'id',
      'workout_id',
      'exercise_id',
      'position',
      'superset_id',
      'notes',
      'rest_seconds',
      'routine_occurrence_index',
    ],
  },
  {
    name: 'sets',
    columns: [
      'id',
      'workout_exercise_id',
      'position',
      'set_type',
      'weight_kg',
      'reps',
      'distance_meters',
      'duration_seconds',
      'rpe',
      'custom_metric',
      'is_completed',
      'routine_set_position',
    ],
  },
  {
    name: 'routine_folders',
    columns: ['id', 'title', 'position', 'collapsed', 'created_at', 'updated_at'],
  },
  {
    name: 'routines',
    columns: ['id', 'title', 'notes', 'folder_id', 'position', 'created_at', 'updated_at'],
  },
  {
    name: 'routine_exercises',
    columns: ['id', 'routine_id', 'exercise_id', 'position', 'superset_id', 'notes', 'rest_seconds'],
  },
  {
    name: 'routine_sets',
    columns: [
      'id',
      'routine_exercise_id',
      'position',
      'set_type',
      'weight_kg',
      'reps',
      'rep_range_start',
      'rep_range_end',
      'distance_meters',
      'duration_seconds',
      'custom_metric',
    ],
  },
  {
    name: 'body_measurements',
    columns: [
      'date',
      'weight_kg',
      'fat_percent',
      'lean_mass_kg',
      'neck_cm',
      'shoulders_cm',
      'chest_cm',
      'left_bicep_cm',
      'right_bicep_cm',
      'left_forearm_cm',
      'right_forearm_cm',
      'abdomen_cm',
      'waist_cm',
      'hips_cm',
      'left_thigh_cm',
      'right_thigh_cm',
      'left_calf_cm',
      'right_calf_cm',
      'created_at',
      'updated_at',
    ],
  },
  { name: 'progress_photos', columns: ['id', 'date', 'file_name', 'created_at'] },
];

const SCHEMA_VERSION_KEY = 'schema_version';
const LAST_BACKUP_AT_KEY = 'last_backup_at';
const PHOTOS_ZIP_PREFIX = 'photos/progress/';
const DB_JSON_ZIP_PATH = 'db.json';

/**
 * True when `fileName` is a safe, flat file name — no path separators, no
 * `.`/`..` traversal segments, non-empty. A restore's zip archive is a file
 * the user picked from anywhere on-device (Files app, a download, a shared
 * attachment) — its entry *paths* are attacker/corruption-influenced input,
 * not something this app minted. `writeProgressPhotoFileBase64`
 * (`lib/progress-photos.ts`) joins its `fileName` argument onto the real
 * on-disk photo directory with plain string concatenation and no
 * sanitization of its own (`progressPhotoUri`) — so a photo entry whose
 * derived name is e.g. `../../../../Library/Preferences/evil.plist` (a "zip
 * slip" payload: `PHOTOS_ZIP_PREFIX` + `../../../../...` still starts with
 * `photos/progress/`, so it would otherwise pass the existing prefix filter
 * untouched) would resolve outside `photos/progress/` and overwrite an
 * arbitrary file inside the app's sandbox, including the SQLite database
 * file `replaceAllTables` just finished restoring. Checked for every photo
 * entry *before* any table is touched (see `restoreBackup`) — same "reject
 * the whole file up front" posture the schema-version/corrupt-JSON checks
 * below already use, rather than partially applying a backup and failing
 * mid-photo-copy.
 */
function isSafeBackupPhotoFileName(fileName: string): boolean {
  return fileName.length > 0 && fileName !== '.' && fileName !== '..' && !/[/\\]/.test(fileName);
}

/** One backup's full logical dump — every `BACKUP_TABLES` table's rows, verbatim raw-SQL shape. */
interface BackupDump {
  schemaVersion: number;
  exportedAt: number;
  tables: Record<string, SqliteRow[]>;
}

function readCurrentSchemaVersion(driver: SqliteDriver): number {
  const rows = driver.queryAll<{ value: string }>('SELECT value FROM app_meta WHERE key = ?', [
    SCHEMA_VERSION_KEY,
  ]);
  if (rows.length === 0) {
    return 0;
  }
  const parsed = Number.parseInt(rows[0]!.value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dumpAllTables(driver: SqliteDriver): BackupDump {
  const tables: Record<string, SqliteRow[]> = {};
  for (const spec of BACKUP_TABLES) {
    tables[spec.name] = driver.queryAll<SqliteRow>(`SELECT * FROM ${spec.name}`);
  }
  return {
    schemaVersion: readCurrentSchemaVersion(driver),
    exportedAt: Date.now(),
    tables,
  };
}

/** Replace-all: delete every row from every table (children-before-parents), then re-insert every row from `dump.tables` (parents-before-children) — one `driver.transaction`, per 05 §9's "replace-all" (a crash mid-restore must never leave a half-wiped, half-restored DB). */
function replaceAllTables(driver: SqliteDriver, dump: BackupDump): void {
  driver.transaction(() => {
    for (const spec of [...BACKUP_TABLES].reverse()) {
      driver.execute(`DELETE FROM ${spec.name}`);
    }
    for (const spec of BACKUP_TABLES) {
      const rows = dump.tables[spec.name] ?? [];
      const placeholders = spec.columns.map(() => '?').join(', ');
      const sql = `INSERT INTO ${spec.name} (${spec.columns.join(', ')}) VALUES (${placeholders})`;
      for (const row of rows) {
        driver.execute(
          sql,
          spec.columns.map((column) => (row[column] === undefined ? null : row[column])),
        );
      }
    }
  });
}

function recordLastBackupAt(driver: SqliteDriver, timestamp: number): void {
  driver.execute(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [LAST_BACKUP_AT_KEY, String(timestamp)],
  );
}

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

export interface BackupServiceDeps {
  driver: SqliteDriver;
  /** Every progress-photo file name currently on disk (production: `listProgressPhotoFileNames`, `src/lib/progress-photos.ts`). */
  listPhotoFileNames: () => Promise<string[]>;
  /** Read one on-disk progress-photo file's bytes as base64 (production: `readProgressPhotoFileBase64`, `src/lib/progress-photos.ts`). */
  readPhotoFileBase64: (fileName: string) => Promise<string>;
  /** Write one progress-photo file's bytes (base64) to `photos/progress/<fileName>`, creating the directory if needed (production: `writeProgressPhotoFileBase64`, `src/lib/progress-photos.ts`). */
  writePhotoFileBase64: (fileName: string, base64: string) => Promise<void>;
  /** Write the finished zip archive's bytes (base64) to `fileName` under the cache directory, returning its absolute URI (production: `writeCacheBackupZip`, `src/lib/backup-file.ts`). */
  writeCacheZipFile: (fileName: string, base64: string) => Promise<string>;
  /** Read an arbitrary file URI's bytes as base64 — the user-picked backup zip (production: `readBackupZipFile`, `src/lib/backup-file.ts`). */
  readFileBase64: (fileUri: string) => Promise<string>;
}

export interface BackupExportResult {
  uri: string;
  fileName: string;
  workoutCount: number;
  photoCount: number;
  exportedAt: number;
}

export interface BackupRestoreResult {
  workoutCount: number;
  photoCount: number;
  restoredAt: number;
}

/** A whole-file problem `restore` can't recover from — not a valid zip, missing `db.json`, corrupt JSON, or an unsupported schema version. Returned rather than thrown, same "expected whole-file failure is a value, not an exception" posture `hevy-import-service.ts`'s own `HevyImportFileError` establishes (`HevyImportScreen.tsx`'s `phase.status === 'error'` renders this shape directly). */
export interface BackupRestoreFileError {
  error: string;
}

export interface BackupServiceApi {
  /**
   * Dumps every `BACKUP_TABLES` row + every on-disk progress photo into one
   * `kyro_backup_{date}.zip`, writes it to the cache directory, and records
   * `last_backup_at` in `app_meta` once the zip write succeeds. Does *not*
   * itself open the OS share sheet — mirrors `CsvService.exportAll`'s own
   * split (`csv-service.ts`'s own header: the service produces the file,
   * the screen shares it via `lib/share-file.ts`).
   */
  export(): Promise<BackupExportResult>;
  /**
   * Unzips `fileUri`, validates its `db.json` schema version against this
   * app's own current `app_meta.schema_version` (exact match only — see
   * file header), then replace-alls every table inside one
   * `driver.transaction` and copies every zip'd photo back into
   * `photos/progress/`. Does **not** run the orphan sweep or invalidate any
   * query cache itself — both are UI-layer concerns the caller (the
   * Backup/Restore screen) performs right after this resolves, mirroring
   * `HevyImportScreen.tsx`'s own "bulk invalidation happens here, not
   * inside the service" split.
   */
  restore(fileUri: string): Promise<BackupRestoreResult | BackupRestoreFileError>;
}

function backupZipFileName(now: number): string {
  return `kyro_backup_${localDateKey(now)}.zip`;
}

export function createBackupService(deps: BackupServiceDeps): BackupServiceApi {
  async function exportBackup(): Promise<BackupExportResult> {
    const dump = dumpAllTables(deps.driver);
    const dbJsonEntry = { path: DB_JSON_ZIP_PATH, data: utf8ToBytes(JSON.stringify(dump)) };

    const photoFileNames = await deps.listPhotoFileNames();
    const photoEntries = await Promise.all(
      photoFileNames.map(async (fileName) => {
        const base64 = await deps.readPhotoFileBase64(fileName);
        return { path: `${PHOTOS_ZIP_PREFIX}${fileName}`, data: base64ToBytes(base64), store: true };
      }),
    );

    const zipBytes = zipEntries([dbJsonEntry, ...photoEntries]);
    const fileName = backupZipFileName(dump.exportedAt);
    const uri = await deps.writeCacheZipFile(fileName, bytesToBase64(zipBytes));

    // "Record last_backup_at in app_meta after a successful export" (05 §9)
    // — recorded once the zip has actually been written to disk, which is
    // this service's own definition of "successful" (the OS share sheet
    // step after this, if any, can never report a reliable "user actually
    // saved it" signal either way — `lib/share-file.ts`'s own header
    // documents that exact platform limitation).
    recordLastBackupAt(deps.driver, dump.exportedAt);

    return {
      uri,
      fileName,
      workoutCount: dump.tables.workouts?.length ?? 0,
      photoCount: photoEntries.length,
      exportedAt: dump.exportedAt,
    };
  }

  async function restoreBackup(fileUri: string): Promise<BackupRestoreResult | BackupRestoreFileError> {
    const zipBase64 = await deps.readFileBase64(fileUri);

    let entries: Record<string, Uint8Array>;
    try {
      entries = unzipEntries(base64ToBytes(zipBase64));
    } catch {
      return { error: 'This file is not a valid Kyro backup (could not read it as a zip archive).' };
    }

    const dbJsonBytes = entries[DB_JSON_ZIP_PATH];
    if (!dbJsonBytes) {
      return { error: 'This file is not a valid Kyro backup — it has no db.json inside it.' };
    }

    let dump: BackupDump;
    try {
      dump = JSON.parse(bytesToUtf8(dbJsonBytes)) as BackupDump;
    } catch {
      return { error: 'This file is not a valid Kyro backup — its db.json is corrupt.' };
    }

    if (typeof dump.schemaVersion !== 'number' || typeof dump.tables !== 'object' || dump.tables === null) {
      return { error: 'This file is not a valid Kyro backup — its db.json has an unrecognized shape.' };
    }

    const currentSchemaVersion = readCurrentSchemaVersion(deps.driver);
    if (dump.schemaVersion !== currentSchemaVersion) {
      // See file header, "Schema-version gate" — no forward-migration logic
      // exists yet (nothing to migrate from, pre-launch), so any mismatch
      // (older *or* newer) is rejected rather than guessed at.
      return {
        error: `This backup was made with a different app version (schema ${dump.schemaVersion}) than this app currently supports (schema ${currentSchemaVersion}). Restoring across app versions isn't supported yet.`,
      };
    }

    const photoEntries = Object.entries(entries).filter(([path]) => path.startsWith(PHOTOS_ZIP_PREFIX));

    // Validate every photo entry's derived file name *before* touching the
    // DB — see `isSafeBackupPhotoFileName`'s own header. A zip-slip payload
    // must reject the whole restore, not partially replace the DB and then
    // fail (or silently write outside `photos/progress/`) mid-photo-copy.
    for (const [path] of photoEntries) {
      const fileName = path.slice(PHOTOS_ZIP_PREFIX.length);
      if (fileName && !isSafeBackupPhotoFileName(fileName)) {
        return {
          error: 'This file is not a valid Kyro backup — it contains an unsafe photo file path.',
        };
      }
    }

    replaceAllTables(deps.driver, dump);

    for (const [path, bytes] of photoEntries) {
      const fileName = path.slice(PHOTOS_ZIP_PREFIX.length);
      if (!fileName) continue; // Defensive: the prefix itself is never a real file entry.
      await deps.writePhotoFileBase64(fileName, bytesToBase64(bytes));
    }

    return {
      workoutCount: dump.tables.workouts?.length ?? 0,
      photoCount: photoEntries.length,
      restoredAt: Date.now(),
    };
  }

  return { export: exportBackup, restore: restoreBackup };
}
