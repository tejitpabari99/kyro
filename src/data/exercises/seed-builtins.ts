/**
 * `seedBuiltinExercises` (M1-05) — 03 §6.4 step 6 / 05 §10's "seed migration":
 * upserts the bundled free-exercise-db dataset (`assets/exercise-db.json`,
 * M1-04) into the `exercises` table by id, at cold start, whenever the
 * bundled checksum differs from `app_meta.dataset_version`.
 *
 * This is the seam 05 §6's `ExerciseRepository.seedBuiltins(dataset:
 * DatasetRecord[], version: string): Promise<void>` wraps (M1-06) — this
 * module IS that method's underlying implementation, exposed standalone so
 * M1-05 can wire it into the cold-start sequence (`app/_layout.tsx`) before
 * the full repository exists. M1-06 should wrap it verbatim:
 *
 * ```ts
 * class ExerciseRepositoryImpl implements ExerciseRepository {
 *   async seedBuiltins(dataset: MappedExerciseRecord[], version: string) {
 *     seedBuiltinExercises(this.driver, dataset, version);
 *   }
 * }
 * ```
 *
 * Design (03 §6.4 step 6 / this task's exact acceptance gate):
 *  - Version check first: if `app_meta.dataset_version` already equals
 *    `version`, this is a pure no-op — returns immediately without opening a
 *    transaction or touching `exercises` at all (the common case on every
 *    cold start after the first successful seed / a no-newer-dataset
 *    relaunch).
 *  - On mismatch, everything below runs inside one `driver.transaction` (06
 *    §5.2's one-transaction-per-action principle) with parameterized
 *    statements (no string-built SQL) — the closest this shared
 *    `SqliteDriver` surface (`../sqlite/driver.ts`) gets to "prepared
 *    statements" without reaching past that abstraction into a
 *    backend-specific handle (see driver.ts's own header for why that
 *    boundary exists — 08 §5 backend parity).
 *  - Per bundled record: no existing row -> INSERT (is_custom=0,
 *    archived_at=NULL, created_at/updated_at=now). Existing row -> compare
 *    every content field (name/type/muscles/equipment/instructions/images/
 *    uses_custom_metric/aliases, JSON columns compared as their
 *    `JSON.stringify`'d text — the exact bytes an INSERT would have written,
 *    so equal arrays always compare byte-equal without a JSON.parse round
 *    trip) against the stored row:
 *      - identical content + already un-archived -> **skip entirely**, no
 *        UPDATE at all (the "no `updated_at` churn on unchanged rows"
 *        acceptance requirement).
 *      - identical content but currently archived -> the built-in
 *        reappeared in the bundle (e.g. a previous version's removal was
 *        reverted); only `archived_at` is cleared (+ `updated_at` bumped,
 *        since this genuinely is a state change).
 *      - content differs -> full UPDATE of every content column +
 *        `archived_at = NULL` (built-ins are immutable to users, so any
 *        difference can only come from a new bundled version) + `updated_at`
 *        bump. `animation_uri` is deliberately never part of this UPDATE's
 *        SET list — reserved for a future GIF milestone (03 §4) that may
 *        populate it out-of-band; a dataset-version bump must never clobber
 *        that back to NULL.
 *  - Built-in rows present in the DB (`is_custom = 0`) whose id is absent
 *    from the new bundled array get `archived_at` set (never deleted) —
 *    "removed built-ins get archived" (03 §6.4 step 6). Already-archived
 *    rows are left alone (no redundant write).
 *  - Custom rows (`is_custom = 1`) are never read or written by this
 *    function — the `WHERE is_custom = 0` on the initial SELECT is the only
 *    thing this module ever looks at, so user customs (and anything
 *    referencing them: workouts/routines history) are structurally
 *    untouched, not just untouched by convention.
 *  - `app_meta.dataset_version` is upserted to `version` as the last
 *    statement inside the same transaction — a crash mid-seed never leaves
 *    a partially-seeded table recorded as fully seeded.
 */
import type { MappedExerciseRecord } from '@/domain/exercise-mapping';

import type { SqliteDriver } from '../sqlite/driver';
// `assets/exercise-db.json`'s real, build-time-generated output (M1-04) —
// 873 mapped built-in records + the sha256 `version` checksum used both as
// the file's own `version` field and as the `app_meta.dataset_version`
// value this module compares against. Metro (app bundle) and Jest's `node`
// project (`moduleFileExtensions` includes `json`) both resolve this import
// natively; `tsconfig.json`'s `resolveJsonModule` (from `expo/tsconfig.base`)
// makes it typecheck. A relative path (not the `@/assets/*` alias) is used
// deliberately — the `node` Jest project's `moduleNameMapper` only maps
// `@/*` to `src/*`, so `@/assets/*` would resolve into (nonexistent)
// `src/assets/*` there.
import rawBundledDataset from '../../../assets/exercise-db.json';

const DATASET_VERSION_KEY = 'dataset_version';

/** The shape of `assets/exercise-db.json` (M1-04's emitted output). */
export interface BundledExerciseDataset {
  version: string;
  sourceCommit: string;
  exerciseCount: number;
  exercises: MappedExerciseRecord[];
}

/**
 * The real bundled dataset, typed. JSON-import type inference widens enum
 * fields to plain `string`/`number` (TS has no way to know the file only
 * ever contains legal `ExerciseType`/`MuscleGroup`/`Equipment` values) —
 * `assertValidDataset` (`domain/exercise-mapping.ts`) already enforced that
 * at build time (M1-04), so this narrowing cast is safe.
 */
export const BUNDLED_EXERCISE_DATASET = rawBundledDataset as BundledExerciseDataset;

/** Result of one {@link seedBuiltinExercises} call — returned for logging/tests, not required by callers. */
export interface SeedBuiltinsResult {
  /** `app_meta.dataset_version` before this call (`null` on a brand-new database). */
  previousVersion: string | null;
  /** The `version` this call seeded to (or confirmed already-current). */
  version: string;
  /** `false` when `previousVersion === version` — no-op, nothing below was touched. */
  didSeed: boolean;
  inserted: number;
  updated: number;
  /** Content-identical rows that were merely un-archived (built-in reappeared in the bundle). */
  restored: number;
  /** Previously-active built-ins absent from `dataset` this call — archived, not deleted. */
  archived: number;
  /** Rows left completely untouched (content identical, already un-archived). */
  unchanged: number;
  durationMs: number;
}

interface ExistingBuiltinRow {
  id: string;
  name: string;
  exercise_type: string;
  primary_muscle_group: string;
  secondary_muscle_groups: string;
  equipment: string;
  instructions: string;
  images: string;
  uses_custom_metric: number;
  aliases: string;
  archived_at: number | null;
}

function readDatasetVersion(driver: SqliteDriver): string | null {
  const rows = driver.queryAll<{ value: string }>(
    `SELECT value FROM app_meta WHERE key = ?`,
    [DATASET_VERSION_KEY],
  );
  return rows.length > 0 ? rows[0]!.value : null;
}

function writeDatasetVersion(driver: SqliteDriver, version: string): void {
  driver.execute(
    `INSERT INTO app_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [DATASET_VERSION_KEY, version],
  );
}

/**
 * Upsert-by-id `dataset` into the `exercises` table (`is_custom = 0` rows
 * only) and record `version` as the new `app_meta.dataset_version` — the
 * full seed/refresh operation described in this file's header. Synchronous
 * (both `SqliteDriver` backends' `transaction()` are synchronous) — callers
 * needing a `Promise` (05 §6's `ExerciseRepository.seedBuiltins` signature,
 * M1-06) simply wrap the call, nothing here is actually async.
 *
 * @param driver  Open `SqliteDriver` (post-migration — the `exercises` and
 *   `app_meta` tables must already exist).
 * @param dataset The records to seed, e.g. `BUNDLED_EXERCISE_DATASET.exercises`
 *   or a test fixture array.
 * @param version The checksum identifying `dataset` — e.g.
 *   `BUNDLED_EXERCISE_DATASET.version`, or a synthetic version string in
 *   tests. Compared verbatim against `app_meta.dataset_version`.
 * @param now Injectable clock (defaults to `Date.now`) — tests use this to
 *   assert `updated_at` does/doesn't change across calls without real delays.
 */
export function seedBuiltinExercises(
  driver: SqliteDriver,
  dataset: readonly MappedExerciseRecord[],
  version: string,
  now: () => number = Date.now,
): SeedBuiltinsResult {
  const startedAt = Date.now();
  const previousVersion = readDatasetVersion(driver);

  if (previousVersion === version) {
    return {
      previousVersion,
      version,
      didSeed: false,
      inserted: 0,
      updated: 0,
      restored: 0,
      archived: 0,
      unchanged: 0,
      durationMs: Date.now() - startedAt,
    };
  }

  let inserted = 0;
  let updated = 0;
  let restored = 0;
  let archived = 0;
  let unchanged = 0;

  driver.transaction(() => {
    const existingRows = driver.queryAll<ExistingBuiltinRow>(
      `SELECT id, name, exercise_type, primary_muscle_group, secondary_muscle_groups,
              equipment, instructions, images, uses_custom_metric, aliases, archived_at
       FROM exercises WHERE is_custom = 0`,
    );
    const existingById = new Map(existingRows.map((row) => [row.id, row]));
    const seenIds = new Set<string>();
    const nowMs = now();

    for (const record of dataset) {
      seenIds.add(record.id);
      const existing = existingById.get(record.id);

      const secondaryMuscleGroupsJson = JSON.stringify(record.secondary_muscle_groups);
      const instructionsJson = JSON.stringify(record.instructions);
      const imagesJson = JSON.stringify(record.images);
      const aliasesJson = JSON.stringify(record.aliases);

      if (!existing) {
        driver.execute(
          `INSERT INTO exercises
             (id, name, exercise_type, primary_muscle_group, secondary_muscle_groups,
              equipment, instructions, images, animation_uri, is_custom,
              uses_custom_metric, aliases, archived_at, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0, ?, ?, NULL, ?, ?)`,
          [
            record.id,
            record.name,
            record.exercise_type,
            record.primary_muscle_group,
            secondaryMuscleGroupsJson,
            record.equipment,
            instructionsJson,
            imagesJson,
            record.uses_custom_metric,
            aliasesJson,
            nowMs,
            nowMs,
          ],
        );
        inserted++;
        continue;
      }

      const contentUnchanged =
        existing.name === record.name &&
        existing.exercise_type === record.exercise_type &&
        existing.primary_muscle_group === record.primary_muscle_group &&
        existing.secondary_muscle_groups === secondaryMuscleGroupsJson &&
        existing.equipment === record.equipment &&
        existing.instructions === instructionsJson &&
        existing.images === imagesJson &&
        existing.uses_custom_metric === record.uses_custom_metric &&
        existing.aliases === aliasesJson;

      if (contentUnchanged && existing.archived_at === null) {
        unchanged++;
        continue;
      }

      if (contentUnchanged) {
        // Content identical, only the archived state needs clearing.
        driver.execute(`UPDATE exercises SET archived_at = NULL, updated_at = ? WHERE id = ?`, [
          nowMs,
          record.id,
        ]);
        restored++;
        continue;
      }

      driver.execute(
        `UPDATE exercises SET
           name = ?, exercise_type = ?, primary_muscle_group = ?, secondary_muscle_groups = ?,
           equipment = ?, instructions = ?, images = ?, uses_custom_metric = ?, aliases = ?,
           archived_at = NULL, updated_at = ?
         WHERE id = ?`,
        [
          record.name,
          record.exercise_type,
          record.primary_muscle_group,
          secondaryMuscleGroupsJson,
          record.equipment,
          instructionsJson,
          imagesJson,
          record.uses_custom_metric,
          aliasesJson,
          nowMs,
          record.id,
        ],
      );
      updated++;
    }

    // Built-ins present in the DB but absent from the new dataset -> archive
    // (never delete). Skip rows already archived (no redundant write).
    for (const existing of existingRows) {
      if (seenIds.has(existing.id) || existing.archived_at !== null) continue;
      driver.execute(`UPDATE exercises SET archived_at = ?, updated_at = ? WHERE id = ?`, [
        nowMs,
        nowMs,
        existing.id,
      ]);
      archived++;
    }

    writeDatasetVersion(driver, version);
  });

  return {
    previousVersion,
    version,
    didSeed: true,
    inserted,
    updated,
    restored,
    archived,
    unchanged,
    durationMs: Date.now() - startedAt,
  };
}

/**
 * Convenience wrapper around {@link seedBuiltinExercises} for the real app —
 * seeds/refreshes `BUNDLED_EXERCISE_DATASET` specifically. This is the
 * function the cold-start sequence (`app/_layout.tsx`) calls (06 §5.1:
 * "migrate -> seed/refresh dataset if version differs -> load settings ->
 * ..."); M1-06's `ExerciseRepository.seedBuiltins` takes an explicit
 * `dataset`/`version` pair instead (05 §6's interface shape) and should call
 * {@link seedBuiltinExercises} directly rather than this wrapper.
 */
export function seedBundledBuiltinExercises(
  driver: SqliteDriver,
  now: () => number = Date.now,
): SeedBuiltinsResult {
  return seedBuiltinExercises(
    driver,
    BUNDLED_EXERCISE_DATASET.exercises,
    BUNDLED_EXERCISE_DATASET.version,
    now,
  );
}
