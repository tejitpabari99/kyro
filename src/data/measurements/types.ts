/**
 * `MeasurementRepository`'s public shapes (M5-01) — 05 §6's interface,
 * typed against `src/data/sqlite/schema.ts`'s `bodyMeasurements`/
 * `progressPhotos` tables (05 §3.4) field-for-field (camelCase here; the
 * repository implementation owns the snake_case mapping at the SQL
 * boundary, same split `ExerciseRepository`'s `types.ts` header describes).
 *
 * ## The 17 fields, canonical order (05 §3.4 / 04 §6.1)
 *
 * {@link MEASUREMENT_FIELD_KEYS} fixes one canonical order for the 17
 * measurement fields, copied verbatim from `05` §3.4's own DDL comment
 * grouping (`weight_kg, fat_percent, lean_mass_kg`, then the cm-family in
 * the doc's own line breaks). `schema.ts`'s `bodyMeasurements` table
 * declares its columns in this exact same order — kept in lockstep
 * deliberately so a reviewer can diff the two side by side. Every field is
 * independently nullable (05 §3.4: "a day may log only some fields") —
 * storage is always canonical kg/cm (05 §5); lb/in conversion happens only
 * at the UI boundary via `domain/units.ts` (M1-02), never in this
 * repository.
 */

/** The 17 independently-nullable body-measurement fields (05 §3.4, 04 §6.1), canonical kg/cm units. */
export interface MeasurementFields {
  weightKg: number | null;
  fatPercent: number | null;
  leanMassKg: number | null;
  neckCm: number | null;
  shouldersCm: number | null;
  chestCm: number | null;
  leftBicepCm: number | null;
  rightBicepCm: number | null;
  leftForearmCm: number | null;
  rightForearmCm: number | null;
  abdomenCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  leftThighCm: number | null;
  rightThighCm: number | null;
  leftCalfCm: number | null;
  rightCalfCm: number | null;
}

/**
 * {@link MeasurementFields}' keys, in the exact canonical order 05 §3.4
 * lists them — the one source of truth for "all 17 fields, in order" that
 * both this repository (dynamic `upsert`/`series` column mapping below) and
 * future UI callers (M5-02's log-entry sheet, iterating all 17 as form
 * rows) should use rather than re-deriving `Object.keys` order.
 */
export const MEASUREMENT_FIELD_KEYS: readonly (keyof MeasurementFields)[] = [
  'weightKg',
  'fatPercent',
  'leanMassKg',
  'neckCm',
  'shouldersCm',
  'chestCm',
  'leftBicepCm',
  'rightBicepCm',
  'leftForearmCm',
  'rightForearmCm',
  'abdomenCm',
  'waistCm',
  'hipsCm',
  'leftThighCm',
  'rightThighCm',
  'leftCalfCm',
  'rightCalfCm',
];

/** `MeasurementFields` camelCase key -> `body_measurements` snake_case column name (05 §3.4). */
export const MEASUREMENT_FIELD_COLUMNS: Record<keyof MeasurementFields, string> = {
  weightKg: 'weight_kg',
  fatPercent: 'fat_percent',
  leanMassKg: 'lean_mass_kg',
  neckCm: 'neck_cm',
  shouldersCm: 'shoulders_cm',
  chestCm: 'chest_cm',
  leftBicepCm: 'left_bicep_cm',
  rightBicepCm: 'right_bicep_cm',
  leftForearmCm: 'left_forearm_cm',
  rightForearmCm: 'right_forearm_cm',
  abdomenCm: 'abdomen_cm',
  waistCm: 'waist_cm',
  hipsCm: 'hips_cm',
  leftThighCm: 'left_thigh_cm',
  rightThighCm: 'right_thigh_cm',
  leftCalfCm: 'left_calf_cm',
  rightCalfCm: 'right_calf_cm',
};

/** One row of the `body_measurements` table (05 §3.4), decoded into TS-native shapes. `date` is the `'YYYY-MM-DD'` local-date primary/upsert key (04 §6.1). */
export interface BodyMeasurement extends MeasurementFields {
  date: string;
  createdAt: number;
  updatedAt: number;
}

/** One row of the `progress_photos` table (05 §3.4). `id` is also the stored file's basename; `fileName` is relative to the photos dir (05 §8) — never an absolute path. */
export interface ProgressPhoto {
  id: string;
  date: string;
  fileName: string;
  createdAt: number;
}

/** One `{date, value}` point from {@link MeasurementRepository.series}. */
export interface MeasurementPoint {
  date: string;
  value: number;
}

/**
 * Bounds for `list`/`series`/`photos`. Unlike `WorkoutDatesRange`
 * (`src/data/workouts/types.ts`, epoch-ms `start_time` with an
 * inclusive-start/exclusive-end convention needed because a raw timestamp
 * carries a time-of-day), `date` here is already an exact `'YYYY-MM-DD'`
 * local-day key with no time component — so both bounds are simply
 * **inclusive**, compared lexicographically (which matches chronological
 * order for zero-padded `YYYY-MM-DD` strings, same property
 * `domain/streaks.ts`'s `localDateKey` relies on). "Last 90 days including
 * today" is then just `{start: ninetyDaysAgoKey, end: todayKey}` with no
 * off-by-one to reason about.
 */
export interface MeasurementDateRange {
  /** Inclusive lower bound (`'YYYY-MM-DD'`); omitted = no lower bound. */
  start?: string;
  /** Inclusive upper bound (`'YYYY-MM-DD'`); omitted = no upper bound. */
  end?: string;
}

/**
 * Constructor deps for `MeasurementRepositoryImpl` — the seam for the two
 * photo-file side effects `addPhoto`/`deletePhoto` need but this class
 * cannot reach directly: `06` §2's dependency rule (lint-enforced,
 * `eslint.config.js`'s `src/data` zone) forbids `src/data/**` importing
 * `src/lib/**`, so the real `expo-file-system`-backed copy/delete
 * implementation (`src/lib/files.ts`'s progress-photo helpers, M5-03's
 * scope per `docs/plan/tasks/M5-tasks.md`) cannot be called from here
 * directly. This is the exact same shape `WorkoutRepositoryDeps.onAutoHeal`
 * already established for the analogous "src/data needs a src/lib-only
 * capability (Sentry)" problem (`src/data/workouts/types.ts`) — the real
 * wiring happens one layer up, at the repository's construction call site
 * (M5-02/M5-03's screens), exactly where `app/_layout.tsx` wires
 * `onAutoHeal` to `src/lib/sentry.ts` today.
 */
export interface MeasurementRepositoryDeps {
  /**
   * Copies/moves the picked `sourceUri` into permanent photo storage (05 §8:
   * `photos/progress/{uuid}.jpg`) and returns the **relative file name**
   * `addPhoto` stores in `progress_photos.file_name` — never an absolute
   * path (05 §8's "DB stores relative file names only" rule). `id` is the
   * `progress_photos.id` `addPhoto` already generated for this photo *before*
   * calling this hook — 05 §3.4's own DDL comment on `progress_photos.id`
   * ("uuid; also the file basename") is a real invariant the real
   * implementation must satisfy by naming the file after `id` (e.g.
   * `${id}.jpg`), not by minting a second, unrelated uuid the way
   * `saveExercisePhoto`'s internal-uuid-generation shape does for exercise
   * images (`src/lib/files.ts`) — exercise images have no such id-equals-
   * basename invariant to preserve, so that precedent doesn't apply here.
   * Without `id` in this signature, a real implementation would have no way
   * to honor the schema's own documented invariant (found in review — the
   * original signature omitted `id` entirely). Defaults to an identity
   * pass-through (`sourceUri` is returned unchanged, treated as already
   * being the final relative file name, `id` unused) — enough for repository
   * tests/fixtures that pre-stage a file and pass its relative name
   * directly; production callers (M5-03) inject the real crop/resize/copy
   * implementation once `src/lib/files.ts` grows a progress-photo save
   * helper.
   */
  savePhotoFile?: (id: string, date: string, sourceUri: string) => Promise<string>;
  /**
   * Deletes one stored photo file by its relative file name. Defaults to a
   * no-op — nothing to delete when no real file lifecycle is wired (plain
   * repository unit tests). Must be idempotent in any real implementation
   * (a missing file is not an error) — mirrors `deleteExercisePhoto`'s
   * `idempotent: true` posture (`src/lib/files.ts`), which this repository
   * relies on rather than re-specifying.
   */
  deletePhotoFile?: (fileName: string) => Promise<void>;
}

/**
 * 05 §6's `MeasurementRepository` interface, implemented by
 * `MeasurementRepositoryImpl` (`./measurement-repository.ts`).
 */
export interface MeasurementRepository {
  /**
   * Merges every **present and non-null** field in `fields` into the row
   * keyed by `date` (04 §6.1: "saving again upserts — merge non-null
   * fields"), creating the row if absent. A field that is **absent from
   * `fields`, or explicitly `null`**, is left completely untouched — this
   * is the literal reading of "merge non-null fields" (04 §6 acceptance:
   * "second save of weight keeps earlier waist"), and it is what lets a
   * partial log-entry form (most of whose 17 fields are blank/`null` on any
   * given save) never clobber values a previous save already set. Use
   * {@link MeasurementRepository.clearField} for an explicit per-field
   * clear. A call whose `fields` has zero present-non-null entries is a
   * pure no-op — it never creates an empty row (05 §8 / 04 §6.1: rows with
   * every field null and no photos don't exist).
   */
  upsert(date: string, fields: Partial<MeasurementFields>): Promise<void>;
  /**
   * Explicitly clears one field on `date`'s row (sets it `NULL`) — the
   * per-field "clear"/delete-entry action 04 §6.1 describes ("delete clears
   * that field for the date"). A no-op if `date` has no row (idempotent,
   * same "never throw on an already-gone side effect" posture
   * `deleteExercisePhoto` established). If clearing this field leaves the
   * row with every field `NULL` and zero photos, the row is removed
   * entirely (04 §6.1: "empty entries with no photos are removed").
   */
  clearField(date: string, field: keyof MeasurementFields): Promise<void>;
  /** Every measurement row in `range` (inclusive bounds), ordered by `date` ascending. */
  list(range?: MeasurementDateRange): Promise<BodyMeasurement[]>;
  /**
   * Sorted `{date, value}` points for one field over `range` — only dates
   * where `field` is non-null are included, so gaps in sparse data are
   * preserved as genuine gaps (missing dates), never interpolated or
   * zero-filled (04 §6 acceptance: "gaps don't interpolate misleadingly").
   */
  series(field: keyof MeasurementFields, range: MeasurementDateRange): Promise<MeasurementPoint[]>;
  /**
   * Attaches a new photo to `date`, creating `date`'s `body_measurements`
   * row first if it doesn't already exist (05 §3.4: `progress_photos.date`
   * is a `NOT NULL` FK to `body_measurements.date` — a photo-only entry,
   * with every measurement field left `null`, is a valid row shape). Saves
   * the file via {@link MeasurementRepositoryDeps.savePhotoFile} before
   * writing either row, so a failed file save never leaves an orphaned DB
   * row.
   */
  addPhoto(date: string, sourceUri: string): Promise<ProgressPhoto>;
  /** Every photo in `range` (inclusive bounds), ordered by `date` then `createdAt` ascending. */
  photos(range?: MeasurementDateRange): Promise<ProgressPhoto[]>;
  /**
   * Removes one photo — both its `progress_photos` row and its underlying
   * file (via {@link MeasurementRepositoryDeps.deletePhotoFile}, file first
   * so a failed DB delete never leaves a dangling file reference with no
   * file to recover). If this was the date's last photo and every
   * measurement field is already `null`, the date's row is removed too (04
   * §6.1). Throws `ProgressPhotoNotFoundError` (`./errors.ts`) when `id`
   * doesn't resolve to a row.
   */
  deletePhoto(id: string): Promise<void>;
}
