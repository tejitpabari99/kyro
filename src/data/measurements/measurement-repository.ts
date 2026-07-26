/**
 * `MeasurementRepositoryImpl` (M5-01) — 05 §6's `MeasurementRepository`
 * interface (`./types.ts`) implemented against the raw `SqliteDriver`
 * surface (`../sqlite/driver.ts`), the exact same driver-access pattern
 * `SettingsRepository`/`ExerciseRepositoryImpl`/`WorkoutRepositoryImpl`
 * already established — see `settings-repository.ts`'s header for the
 * fuller rationale (identical behavior on both backends via one narrow
 * surface, no second backend-specific Drizzle client). `src/data/sqlite/
 * schema.ts`'s `bodyMeasurements`/`progressPhotos` tables (05 §3.4) remain
 * the source of truth for the DDL; this file only reads/writes them.
 *
 * The schema itself (`body_measurements`/`progress_photos`, migration
 * `0001_exercises_workouts_routines_measurements.sql`) already landed with
 * the rest of the v1 schema bundle before M5 — nothing here adds a new
 * migration; `src/data/migrations/__tests__/0002-full-v1-schema.test.ts`
 * and `full-v1-schema-constraints.test.ts` already cover its DDL/FK
 * integrity (05 §10's "every migration lands with an integration test"
 * requirement, satisfied at the time that migration landed).
 *
 * ## Design notes
 *
 * - **Merge-upsert** (`upsert`): only keys present in `fields` **and**
 *   non-null are written; everything else is left alone. Built via a
 *   dynamic column list rather than a fixed 17-column `UPDATE`/`INSERT` so
 *   a two-field save never touches the other 15 columns at the SQL level
 *   either — see `./types.ts`'s doc comment on the interface member for the
 *   full "why" (04 §6 acceptance case: second weight-only save keeps an
 *   earlier waist value). A call with zero present-non-null fields is a
 *   pure no-op (never creates an empty row).
 * - **Row auto-deletion** (`clearField`/`deletePhoto`, via the shared
 *   private `pruneRowIfEmpty`): once a `body_measurements` row has every
 *   field `NULL` and zero `progress_photos` rows, it is deleted outright
 *   (04 §6.1 / 05 §8). `upsert`/`addPhoto` can only ever *add* data, so
 *   neither needs this check — only the two "remove a thing" methods can
 *   ever produce an empty row.
 * - **Photo file lifecycle** (`addPhoto`/`deletePhoto`): the actual
 *   `expo-file-system` copy/delete cannot be called from `src/data/**` (06
 *   §2's dependency rule, lint-enforced — see `MeasurementRepositoryDeps`'s
 *   doc comment in `./types.ts` for the full rationale and its
 *   `WorkoutRepositoryDeps.onAutoHeal` precedent). Both file-side-effect
 *   calls happen **before** their SQL write in `addPhoto` and **before**
 *   the SQL delete in `deletePhoto` — a failed file operation then never
 *   leaves the DB in a state that disagrees with the filesystem (no
 *   orphaned DB row pointing at a file that was never written; no orphaned
 *   DB row surviving after its file is already gone only in the narrow
 *   window between the two calls, which the M5-03 orphan sweep (05 §8)
 *   exists specifically to reconcile if a crash lands exactly there).
 * - **Id generation**: `../shared/uuid.ts`'s `generateUuid`, generated
 *   before entering `driver.transaction(...)` in `addPhoto` (the callback
 *   is synchronous — `../sqlite/driver.ts`'s contract, same "Id generation"
 *   note `workout-repository.ts`'s header gives).
 */
import { generateUuid } from '../shared/uuid';
import type { SqliteDriver } from '../sqlite/driver';
import { ProgressPhotoNotFoundError } from './errors';
import type {
  BodyMeasurement,
  MeasurementDateRange,
  MeasurementFields,
  MeasurementRepository,
  MeasurementRepositoryDeps,
  MeasurementPoint,
  ProgressPhoto,
} from './types';
import { MEASUREMENT_FIELD_COLUMNS, MEASUREMENT_FIELD_KEYS } from './types';

// ---------------------------------------------------------------------------
// Raw row shapes (snake_case) — the SQL-boundary shape this file maps
// to/from the camelCase `BodyMeasurement`/`ProgressPhoto` types (05 §3.4).
// ---------------------------------------------------------------------------

interface BodyMeasurementRow {
  date: string;
  weight_kg: number | null;
  fat_percent: number | null;
  lean_mass_kg: number | null;
  neck_cm: number | null;
  shoulders_cm: number | null;
  chest_cm: number | null;
  left_bicep_cm: number | null;
  right_bicep_cm: number | null;
  left_forearm_cm: number | null;
  right_forearm_cm: number | null;
  abdomen_cm: number | null;
  waist_cm: number | null;
  hips_cm: number | null;
  left_thigh_cm: number | null;
  right_thigh_cm: number | null;
  left_calf_cm: number | null;
  right_calf_cm: number | null;
  created_at: number;
  updated_at: number;
}

interface ProgressPhotoRow {
  id: string;
  date: string;
  file_name: string;
  created_at: number;
}

function mapBodyMeasurementRow(row: BodyMeasurementRow): BodyMeasurement {
  return {
    date: row.date,
    weightKg: row.weight_kg,
    fatPercent: row.fat_percent,
    leanMassKg: row.lean_mass_kg,
    neckCm: row.neck_cm,
    shouldersCm: row.shoulders_cm,
    chestCm: row.chest_cm,
    leftBicepCm: row.left_bicep_cm,
    rightBicepCm: row.right_bicep_cm,
    leftForearmCm: row.left_forearm_cm,
    rightForearmCm: row.right_forearm_cm,
    abdomenCm: row.abdomen_cm,
    waistCm: row.waist_cm,
    hipsCm: row.hips_cm,
    leftThighCm: row.left_thigh_cm,
    rightThighCm: row.right_thigh_cm,
    leftCalfCm: row.left_calf_cm,
    rightCalfCm: row.right_calf_cm,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapProgressPhotoRow(row: ProgressPhotoRow): ProgressPhoto {
  return {
    id: row.id,
    date: row.date,
    fileName: row.file_name,
    createdAt: row.created_at,
  };
}

/** Builds a `WHERE <column> >= ? AND <column> <= ?`-style clause (both bounds inclusive, `./types.ts`'s `MeasurementDateRange` doc comment) — empty string/no params when `range` has neither bound. */
function buildDateRangeWhere(
  range: MeasurementDateRange,
  column: string,
): { where: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (range.start !== undefined) {
    conditions.push(`${column} >= ?`);
    params.push(range.start);
  }
  if (range.end !== undefined) {
    conditions.push(`${column} <= ?`);
    params.push(range.end);
  }
  return { where: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '', params };
}

const DEFAULT_SAVE_PHOTO_FILE: NonNullable<MeasurementRepositoryDeps['savePhotoFile']> = async (
  _id,
  _date,
  sourceUri,
) => sourceUri;

const DEFAULT_DELETE_PHOTO_FILE: NonNullable<MeasurementRepositoryDeps['deletePhotoFile']> =
  async () => undefined;

export class MeasurementRepositoryImpl implements MeasurementRepository {
  private readonly savePhotoFile: NonNullable<MeasurementRepositoryDeps['savePhotoFile']>;
  private readonly deletePhotoFile: NonNullable<MeasurementRepositoryDeps['deletePhotoFile']>;

  constructor(
    private readonly driver: SqliteDriver,
    deps: MeasurementRepositoryDeps = {},
  ) {
    this.savePhotoFile = deps.savePhotoFile ?? DEFAULT_SAVE_PHOTO_FILE;
    this.deletePhotoFile = deps.deletePhotoFile ?? DEFAULT_DELETE_PHOTO_FILE;
  }

  async upsert(date: string, fields: Partial<MeasurementFields>): Promise<void> {
    const presentEntries = MEASUREMENT_FIELD_KEYS.filter((key) => {
      const value = fields[key];
      return value !== undefined && value !== null;
    }).map((key) => [MEASUREMENT_FIELD_COLUMNS[key], fields[key] as number] as const);

    if (presentEntries.length === 0) {
      // Nothing to merge — never create/touch a row for an all-absent/
      // all-null save (`./types.ts`'s doc comment on this method).
      return;
    }

    const now = Date.now();

    if (!this.rowExists(date)) {
      const columns = ['date', ...presentEntries.map(([column]) => column), 'created_at', 'updated_at'];
      const placeholders = columns.map(() => '?').join(', ');
      this.driver.execute(
        `INSERT INTO body_measurements (${columns.join(', ')}) VALUES (${placeholders})`,
        [date, ...presentEntries.map(([, value]) => value), now, now],
      );
      return;
    }

    const setClause = presentEntries.map(([column]) => `${column} = ?`).join(', ');
    this.driver.execute(
      `UPDATE body_measurements SET ${setClause}, updated_at = ? WHERE date = ?`,
      [...presentEntries.map(([, value]) => value), now, date],
    );
  }

  async clearField(date: string, field: keyof MeasurementFields): Promise<void> {
    const column = MEASUREMENT_FIELD_COLUMNS[field];
    // Wrapped in one transaction — the UPDATE and `pruneRowIfEmpty`'s own
    // conditional DELETE are two write statements together implementing one
    // logical operation, the same "multi-write mutation gets one
    // transaction" convention `WorkoutRepositoryImpl` uses throughout and
    // this file's own `addPhoto` already follows (found in review: this
    // method and `deletePhoto` were the two places that didn't, previously).
    this.driver.transaction(() => {
      const result = this.driver.execute(
        `UPDATE body_measurements SET ${column} = NULL, updated_at = ? WHERE date = ?`,
        [Date.now(), date],
      );
      if (result.changes === 0) {
        // No row for this date — idempotent no-op (`./types.ts`'s doc
        // comment on this method).
        return;
      }
      this.pruneRowIfEmpty(date);
    });
  }

  async list(range: MeasurementDateRange = {}): Promise<BodyMeasurement[]> {
    const { where, params } = buildDateRangeWhere(range, 'date');
    const rows = this.driver.queryAll<BodyMeasurementRow>(
      `SELECT * FROM body_measurements ${where} ORDER BY date ASC`,
      params,
    );
    return rows.map(mapBodyMeasurementRow);
  }

  async series(
    field: keyof MeasurementFields,
    range: MeasurementDateRange,
  ): Promise<MeasurementPoint[]> {
    const column = MEASUREMENT_FIELD_COLUMNS[field];
    const { where, params } = buildDateRangeWhere(range, 'date');
    const notNullClause = `${column} IS NOT NULL`;
    const whereClause = where ? `${where} AND ${notNullClause}` : `WHERE ${notNullClause}`;
    const rows = this.driver.queryAll<{ date: string; value: number }>(
      `SELECT date, ${column} AS value FROM body_measurements ${whereClause} ORDER BY date ASC`,
      params,
    );
    return rows.map((row) => ({ date: row.date, value: row.value }));
  }

  async addPhoto(date: string, sourceUri: string): Promise<ProgressPhoto> {
    const id = await generateUuid();
    // `id` generated first so it can be handed to `savePhotoFile` — the real
    // implementation names the file after it (05 §3.4: "id ... also the
    // file basename"); see `MeasurementRepositoryDeps.savePhotoFile`'s doc
    // comment in `./types.ts` for the full rationale (found in review).
    const fileName = await this.savePhotoFile(id, date, sourceUri);
    const now = Date.now();

    this.driver.transaction(() => {
      if (!this.rowExists(date)) {
        this.driver.execute(
          `INSERT INTO body_measurements (date, created_at, updated_at) VALUES (?, ?, ?)`,
          [date, now, now],
        );
      }
      this.driver.execute(
        `INSERT INTO progress_photos (id, date, file_name, created_at) VALUES (?, ?, ?, ?)`,
        [id, date, fileName, now],
      );
    });

    return { id, date, fileName, createdAt: now };
  }

  async photos(range: MeasurementDateRange = {}): Promise<ProgressPhoto[]> {
    const { where, params } = buildDateRangeWhere(range, 'date');
    const rows = this.driver.queryAll<ProgressPhotoRow>(
      `SELECT * FROM progress_photos ${where} ORDER BY date ASC, created_at ASC`,
      params,
    );
    return rows.map(mapProgressPhotoRow);
  }

  async deletePhoto(id: string): Promise<void> {
    const row = this.driver.queryAll<ProgressPhotoRow>(
      `SELECT * FROM progress_photos WHERE id = ?`,
      [id],
    )[0];
    if (!row) {
      throw new ProgressPhotoNotFoundError(id);
    }

    // File deleted before the DB row (this file's header, "Photo file
    // lifecycle") — idempotent per `MeasurementRepositoryDeps.deletePhotoFile`'s
    // own contract, so a retry after a partial failure is always safe. The
    // async file op happens outside `driver.transaction` (its callback must
    // be synchronous, same convention `addPhoto`/`WorkoutRepositoryImpl`
    // follow); the two DB writes that remain (the photo DELETE and
    // `pruneRowIfEmpty`'s own conditional DELETE) are wrapped together in
    // one transaction — found in review: this previously ran as two
    // unwrapped statements, inconsistent with `addPhoto`'s own convention in
    // this same file.
    await this.deletePhotoFile(row.file_name);
    this.driver.transaction(() => {
      this.driver.execute(`DELETE FROM progress_photos WHERE id = ?`, [id]);
      this.pruneRowIfEmpty(row.date);
    });
  }

  // -------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------

  private rowExists(date: string): boolean {
    return (
      this.driver.queryAll<{ date: string }>(`SELECT date FROM body_measurements WHERE date = ?`, [
        date,
      ]).length > 0
    );
  }

  /** Deletes `date`'s `body_measurements` row when every field is `NULL` and it has zero photos (04 §6.1 / 05 §8) — shared by `clearField` and `deletePhoto`, the only two methods that can ever remove data. */
  private pruneRowIfEmpty(date: string): void {
    const row = this.driver.queryAll<BodyMeasurementRow>(
      `SELECT * FROM body_measurements WHERE date = ?`,
      [date],
    )[0];
    if (!row) {
      return;
    }

    const allFieldsNull = MEASUREMENT_FIELD_KEYS.every(
      (key) => row[MEASUREMENT_FIELD_COLUMNS[key] as keyof BodyMeasurementRow] === null,
    );
    if (!allFieldsNull) {
      return;
    }

    const photoCount = this.driver.queryAll<{ count: number }>(
      `SELECT COUNT(*) AS count FROM progress_photos WHERE date = ?`,
      [date],
    )[0]!.count;
    if (photoCount > 0) {
      return;
    }

    this.driver.execute(`DELETE FROM body_measurements WHERE date = ?`, [date]);
  }
}
