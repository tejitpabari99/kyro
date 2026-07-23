# 05 — Data Model & Storage

**Source of truth** for entities, enums, units, schemas, and data interchange. Other docs defer to this one.

Stack (decision P1): **SQLite via `expo-sqlite`** + **Drizzle ORM** (schema in TypeScript, compile-time typed queries) + **drizzle-kit generated SQL migrations bundled with the app**. Rationale: expo-sqlite is the first-party, New-Architecture-ready driver (with SQLCipher optionality and `expo-sqlite/kv-store`); Drizzle is the lightest typed ORM with a clean migration story that runs the exact same schema under Node (`better-sqlite3`) for fast integration tests (`08` §5) — that dual-driver property is the deciding factor over WatermelonDB (sync-oriented, heavier, schema DSL lock-in) and raw SQL (no types). Repositories (§6) hide Drizzle from the rest of the app.

Conventions: table/column names snake_case; ids: UUIDv4 TEXT for user-created rows, dataset slugs for built-in exercises, INTEGER autoincrement for folders; timestamps INTEGER epoch **milliseconds UTC**; booleans INTEGER 0/1; soft delete via `deleted_at` on workouts (sync-readiness, research §3.1); enums stored as TEXT with CHECK constraints.

---

## 1. Entity overview

```
exercises 1←n workout_exercises n→1 workouts (state: active|completed)
exercises 1←n routine_exercises n→1 routines n→1 routine_folders
workout_exercises 1←n sets          routine_exercises 1←n routine_sets
body_measurements 1←n progress_photos
settings (kv)                        app_meta (kv: schema/dataset versions)
```

Derived (computed, never stored): PR records, set records, statistics, streaks (`04` §4–5).

## 2. Enums (canonical strings — used in DB, code, and CSV)

### 2.1 `exercise_type` (8)
`weight_reps` · `reps_only` · `bodyweight_reps` · `bodyweight_assisted_reps` · `duration` · `weight_duration` · `distance_duration` · `short_distance_weight`

### 2.2 `set_type` (4)
`normal` · `warmup` · `failure` · `dropset`

### 2.3 `muscle_group` (20) — with UI labels
`abdominals` Abdominals · `shoulders` Shoulders · `biceps` Biceps · `triceps` Triceps · `forearms` Forearms · `quadriceps` Quadriceps · `hamstrings` Hamstrings · `calves` Calves · `glutes` Glutes · `abductors` Abductors · `adductors` Adductors · `lats` Lats · `upper_back` Upper Back · `traps` Traps · `lower_back` Lower Back · `chest` Chest · `cardio` Cardio · `neck` Neck · `full_body` Full Body · `other` Other

### 2.4 `equipment` (9)
`none` None/Bodyweight · `barbell` Barbell · `dumbbell` Dumbbell · `kettlebell` Kettlebell · `machine` Machine · `plate` Plate · `resistance_band` Resistance Band · `suspension` Suspension · `other` Other

### 2.5 `rpe` (numeric domain)
Allowed values exactly: `6, 7, 7.5, 8, 8.5, 9, 9.5, 10`. Stored REAL, CHECK-constrained.

### 2.6 Settings enums
`weight_unit`: `kg|lbs` · `distance_unit`: `km|miles` · `body_measurement_unit`: `metric|imperial` · `theme`: `system|light|dark` · `first_day_of_week`: `monday|sunday|saturday` · `previous_values_mode`: `any_workout|same_routine` · `workout_state`: `active|completed`.

## 3. Schema (DDL-level; Drizzle mirrors this exactly)

### 3.1 exercises

```sql
CREATE TABLE exercises (
  id                      TEXT PRIMARY KEY,              -- slug (built-in) | uuid (custom)
  name                    TEXT NOT NULL,
  exercise_type           TEXT NOT NULL CHECK (exercise_type IN (...8...)),
  primary_muscle_group    TEXT NOT NULL CHECK (primary_muscle_group IN (...20...)),
  secondary_muscle_groups TEXT NOT NULL DEFAULT '[]',    -- JSON array of muscle_group
  equipment               TEXT NOT NULL DEFAULT 'none' CHECK (equipment IN (...9...)),
  instructions            TEXT NOT NULL DEFAULT '[]',    -- JSON array of step strings
  images                  TEXT NOT NULL DEFAULT '[]',    -- JSON array: asset keys (built-in) | file names (custom)
  animation_uri           TEXT,                          -- reserved for GIF milestone (03 §4)
  is_custom               INTEGER NOT NULL DEFAULT 0,
  uses_custom_metric      INTEGER NOT NULL DEFAULT 0,
  aliases                 TEXT NOT NULL DEFAULT '[]',    -- JSON array, search synonyms
  archived_at             INTEGER,                       -- null = visible in browse/picker
  created_at              INTEGER NOT NULL,
  updated_at              INTEGER NOT NULL
);
CREATE INDEX idx_exercises_name ON exercises(name COLLATE NOCASE);
CREATE UNIQUE INDEX idx_exercises_name_active ON exercises(name COLLATE NOCASE) WHERE archived_at IS NULL;
```

### 3.2 workouts / workout_exercises / sets

```sql
CREATE TABLE workouts (
  id          TEXT PRIMARY KEY,                          -- uuid
  title       TEXT NOT NULL,
  description TEXT,
  routine_id  TEXT,                                      -- soft reference (no FK action; routine may be deleted)
  state       TEXT NOT NULL DEFAULT 'completed' CHECK (state IN ('active','completed')),
  start_time  INTEGER NOT NULL,                          -- epoch ms UTC
  end_time    INTEGER,                                   -- null while active
  duration_pause_offset_ms INTEGER NOT NULL DEFAULT 0,   -- accumulated paused time (02 §2)
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER                                    -- soft delete
);
CREATE UNIQUE INDEX idx_one_active_workout ON workouts(state) WHERE state = 'active' AND deleted_at IS NULL;
CREATE INDEX idx_workouts_start ON workouts(start_time DESC) WHERE deleted_at IS NULL;

CREATE TABLE workout_exercises (
  id            TEXT PRIMARY KEY,                        -- uuid
  workout_id    TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  exercise_id   TEXT NOT NULL REFERENCES exercises(id),
  position      INTEGER NOT NULL,                        -- 0-based order in workout
  superset_id   INTEGER,                                 -- null = ungrouped; 0,1,2… per workout
  notes         TEXT,
  rest_seconds  INTEGER                                  -- null = Off
);
CREATE INDEX idx_we_workout  ON workout_exercises(workout_id, position);
CREATE INDEX idx_we_exercise ON workout_exercises(exercise_id);

CREATE TABLE sets (
  id                  TEXT PRIMARY KEY,                  -- uuid
  workout_exercise_id TEXT NOT NULL REFERENCES workout_exercises(id) ON DELETE CASCADE,
  position            INTEGER NOT NULL,                  -- 0-based row order (display index derived)
  set_type            TEXT NOT NULL DEFAULT 'normal' CHECK (set_type IN ('normal','warmup','failure','dropset')),
  weight_kg           REAL,                              -- canonical kg; bodyweight: added load; assisted: assistance (positive)
  reps                INTEGER,
  distance_meters     REAL,                              -- canonical meters
  duration_seconds    INTEGER,                           -- canonical seconds
  rpe                 REAL CHECK (rpe IN (6,7,7.5,8,8.5,9,9.5,10)),
  custom_metric       REAL,
  is_completed        INTEGER NOT NULL DEFAULT 0         -- meaningful for active workouts; completed workouts contain only 1s
);
CREATE INDEX idx_sets_we ON sets(workout_exercise_id, position);
```

Invariants (enforced in repository layer + tests): at most one active workout; on finish, `is_completed=0` rows deleted and remaining all `=1`; positions contiguous from 0; all value fields nullable and only type-relevant fields populated.

### 3.3 routines / routine_exercises / routine_sets / routine_folders

```sql
CREATE TABLE routine_folders (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  position   INTEGER NOT NULL,
  collapsed  INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE routines (
  id         TEXT PRIMARY KEY,                           -- uuid
  title      TEXT NOT NULL,
  notes      TEXT,
  folder_id  INTEGER REFERENCES routine_folders(id) ON DELETE SET NULL,  -- null = "My Routines"
  position   INTEGER NOT NULL,                           -- order within folder
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE routine_exercises (
  id           TEXT PRIMARY KEY,
  routine_id   TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  exercise_id  TEXT NOT NULL REFERENCES exercises(id),
  position     INTEGER NOT NULL,
  superset_id  INTEGER,
  notes        TEXT,
  rest_seconds INTEGER
);
CREATE INDEX idx_re_routine ON routine_exercises(routine_id, position);

CREATE TABLE routine_sets (                              -- TARGETS, not results
  id                  TEXT PRIMARY KEY,
  routine_exercise_id TEXT NOT NULL REFERENCES routine_exercises(id) ON DELETE CASCADE,
  position            INTEGER NOT NULL,
  set_type            TEXT NOT NULL DEFAULT 'normal' CHECK (set_type IN ('normal','warmup','failure','dropset')),
  weight_kg           REAL,
  reps                INTEGER,                           -- exclusive with rep_range_*
  rep_range_start     INTEGER,
  rep_range_end       INTEGER,
  distance_meters     REAL,
  duration_seconds    INTEGER,
  custom_metric       REAL,
  CHECK (NOT (reps IS NOT NULL AND rep_range_start IS NOT NULL))
);
```

### 3.4 body_measurements / progress_photos

```sql
CREATE TABLE body_measurements (
  date            TEXT PRIMARY KEY,                      -- 'YYYY-MM-DD' local date; upsert key (04 §6.1)
  weight_kg       REAL,  fat_percent     REAL,  lean_mass_kg    REAL,
  neck_cm         REAL,  shoulders_cm    REAL,  chest_cm        REAL,
  left_bicep_cm   REAL,  right_bicep_cm  REAL,
  left_forearm_cm REAL,  right_forearm_cm REAL,
  abdomen_cm      REAL,  waist_cm        REAL,  hips_cm         REAL,
  left_thigh_cm   REAL,  right_thigh_cm  REAL,
  left_calf_cm    REAL,  right_calf_cm   REAL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE progress_photos (
  id         TEXT PRIMARY KEY,                           -- uuid; also the file basename
  date       TEXT NOT NULL REFERENCES body_measurements(date) ON DELETE CASCADE,
  file_name  TEXT NOT NULL,                              -- relative to photos dir (§8)
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_photos_date ON progress_photos(date);
```

### 3.5 settings / app_meta

```sql
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);  -- JSON-encoded values
CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);  -- 'dataset_version', 'schema_version', 'last_backup_at'…
```

Settings keys (typed via a `Settings` TS interface + Zod schema, defaults in code): `weight_unit`, `distance_unit`, `body_measurement_unit`, `theme`, `first_day_of_week`, `weekly_goal`, `default_rest_seconds`, `previous_values_mode`, `warmup_in_stats`, `rpe_enabled`, `plate_calc` `{enabled, bars:[{name,weight_kg}], plates:[{weight_kg,count}]}`, `warmup_calc` `{sets:[{percent,reps}], plate_increment_kg, dumbbell_increment_kg}`, `smart_superset_scroll`, `inline_timer`, `keep_awake`, `live_pr_banner`, `sounds` `{timer_sound, timer_volume, set_check_volume, notification_volume}`, `rest_notifications_enabled`, `sentry_enabled`.

## 4. Query performance notes

Heaviest queries and their index support:
- Previous values (`02` §6): latest completed workout containing exercise X → `idx_we_exercise` + `idx_workouts_start`; single indexed join, LIMIT 1.
- PR/records scan (`04` §5): all sets for exercise X joined through `workout_exercises` → same indexes; ~5 y of data ≈ low thousands of rows per exercise — full scan per exercise is fine; cache per session.
- History pagination: `idx_workouts_start` + per-workout hydrate (2 queries/page via `IN` batching).
- Stats buckets: computed in TS from a single ranged query of `(workout start_time, exercise_id, primary_muscle_group, set fields)`; avoid N+1.

## 5. Units & conversion (canonical everywhere)

Storage is always **kg / meters / seconds / cm** (P11-adjacent; research ground truth). Display conversion lives in one module `lib/units.ts`:

- `kgToLb = kg × 2.2046226218` (display round: nearest 0.5 lb for weights ≥ 10 lb, else 0.1); `lbToKg` inverse, stored full precision (REAL).
- `mToKm/mToMiles` (miles = m / 1609.344; display 2 decimals); short distance displays meters/feet (feet = m × 3.28084, whole).
- Durations stored seconds; displayed mm:ss under 1 h, h:mm:ss above.
- Body: cm↔in (in = cm / 2.54, display 1 decimal), kg↔lb.
- **No drift rule:** conversions happen only at the display/input boundary; typed values in display units convert to canonical once on commit. Round-trip tests required (`08` §4.5).

## 6. Repository layer (the sync-readiness seam)

All app code outside `data/` consumes these interfaces (TypeScript, simplified):

```ts
interface ExerciseRepository {
  list(filter?: {query?; muscle?; equipment?; includeArchived?}): Promise<Exercise[]>
  get(id: string): Promise<Exercise | null>
  create(input: NewCustomExercise): Promise<Exercise>
  update(id: string, patch: Partial<CustomExerciseFields>): Promise<Exercise>
  archive(id: string): Promise<void>;  restore(id: string): Promise<void>
  delete(id: string): Promise<void>                    // throws IfReferenced
  referenceCount(id: string): Promise<number>
  recentlyUsed(limit: number): Promise<Exercise[]>
  seedBuiltins(dataset: DatasetRecord[], version: string): Promise<void>
}

interface WorkoutRepository {
  getActive(): Promise<WorkoutFull | null>
  startEmpty(input: {title; startTime}): Promise<WorkoutFull>
  startFromRoutine(routineId: string): Promise<WorkoutFull>
  // granular mutators used by the active-workout store (each is one transaction):
  addExercises / removeExercise / reorderExercises / replaceExercise
  addSet / updateSet / removeSet / setSetType / setCompleted
  updateExercise (notes, rest_seconds, superset_id) / updateMeta (title, times, pause offset)
  finish(id: string, meta: FinishMeta): Promise<WorkoutFull>   // deletes unchecked, sets state/end_time
  discard(id: string): Promise<void>
  listCompleted(page: {before?; limit}): Promise<WorkoutSummary[]>
  getFull(id: string): Promise<WorkoutFull | null>
  update(id: string, full: WorkoutFull): Promise<void>          // edit past workout (replace content)
  softDelete(id: string): Promise<void>
  previousSets(exerciseId: string, opts: {routineId?; beforeWorkoutId?}): Promise<PreviousSet[]>
  workoutDates(range): Promise<{date; count}[]>                 // calendar
  setsForExercise(exerciseId: string): Promise<HistoricalSet[]> // records/charts feed
  statsFeed(range): Promise<StatsRow[]>                          // dashboard feed (§4)
}

interface RoutineRepository { /* folders + routines CRUD, reorder, duplicate,
  createFromWorkout(workoutId), updateFromWorkout(routineId, workoutId), getFull(id) */ }

interface MeasurementRepository {
  upsert(date: string, fields: Partial<MeasurementFields>): Promise<void>
  clearField(date: string, field: keyof MeasurementFields): Promise<void>
  list(range?): Promise<BodyMeasurement[]>
  series(field: keyof MeasurementFields, range): Promise<Point[]>
  addPhoto(date: string, sourceUri: string): Promise<ProgressPhoto>
  photos(range?): Promise<ProgressPhoto[]>;  deletePhoto(id: string): Promise<void>
}

interface SettingsRepository { get(): Promise<Settings>; set<K>(key: K, value: Settings[K]): Promise<void> }

interface CsvService  { exportAll(units): Promise<FileUri>; exportWorkout(id, units): Promise<FileUri>
                        importHevy(fileUri): Promise<ImportReport> }
interface BackupService { export(): Promise<FileUri>; restore(fileUri): Promise<RestoreReport> }
```

Implementations live in `data/sqlite/*` (Drizzle). Domain services (`RecordsService`, `StatsService`, warm-up/plate calculators, Epley) are pure functions over repository outputs — no SQL. **Cloud-sync path** (`11` §2): because every mutation flows through repositories and rows carry `updated_at`/`deleted_at`, a future `SyncedWorkoutRepository` decorator can journal mutations and reconcile — zero UI changes.

## 7. CSV export / import (Hevy-compatible)

### 7.1 Export columns (exact, in order — 14)

```
"title","start_time","end_time","description","exercise_title","superset_id",
"exercise_notes","set_index","set_type","weight_kg","reps","distance_km",
"duration_seconds","rpe"
```

- Header unit-dependence (matches Hevy): with `weight_unit=lbs` the column is `weight_lbs`; with `distance_unit=miles` it's `distance_miles`; values converted accordingly (weight 2 decimals max, distance 2 decimals).
- One row per set (completed workouts only), workout order by start_time then exercise position then set position; `set_index` is the 0-based set position within the exercise.
- Dates: `"28 Mar 2025, 17:29"` (`d MMM yyyy, HH:mm`, English month abbreviations, **local time**).
- Empty string for nulls; `superset_id` empty when ungrouped; all fields double-quoted; UTF-8, `\n` line endings; embedded quotes doubled per RFC 4180.
- `custom_metric` is NOT exported (Hevy doesn't); it survives via backup (§9).
- Export surfaces: Settings → Data → Export CSV → `kyro_workouts.csv` via iOS share sheet; single-workout export from workout detail.

### 7.2 Import (Hevy CSV)

Settings → Data → Import Hevy CSV → document picker → parse → **preview screen** (workouts found, date range, exercises matched/unmatched, rows skipped with reasons) → confirm → transactional insert → report.

Rules:
- Accept both metric (`weight_kg`/`distance_km`) and imperial (`weight_lbs`/`distance_miles`) headers; convert to canonical.
- Workout identity: group rows by (`title`, `start_time`); parse Hevy's date format (also accept ISO 8601 defensively).
- **Exercise matching:** exact case-insensitive name match against library (incl. aliases) → matched; else auto-create a **custom** exercise named as-is, type inferred from populated columns (weight+reps → `weight_reps`; reps only → `reps_only`; duration only → `duration`; weight+duration → `weight_duration`; distance+duration → `distance_duration`; weight+distance → `short_distance_weight`); flagged in the report for later re-typing/merging.
- `set_type` values map 1:1; unknown → `normal` + warning. RPE values outside the enum → nearest valid + warning. Duplicate import (same title+start_time already exists) → skip workout, count in report.
- All-or-nothing per workout; malformed rows skip the row with a line-numbered warning.
- After import: bulk invalidate records caches; recompute streaks/stats lazily.

### 7.3 Round-trip requirement

`export(import(hevy.csv))` must equal the source semantically (same workouts/sets/values in canonical units), and `import(export(db))` must be a no-op (all duplicates skipped). Both are automated tests (`08` §4.6).

### 7.4 Custom exercises in CSV

Export writes the exercise name only. Import matches by name; the same name re-links to the same custom exercise on round-trip.

## 8. File storage (photos & custom exercise images)

- Root: `${documentDirectory}` (backed up by iOS device backups) —
  `photos/progress/{uuid}.jpg` (progress photos, re-encoded ≤ 2048 px, q80)
  `photos/exercises/{exerciseId}/{uuid}.jpg` (custom exercise media)
- DB stores relative file names only (never absolute paths — container path changes across reinstalls).
- Deletion of the owning row deletes files (repository responsibility); an orphan sweep runs on app start (files without DB rows → delete; rows without files → placeholder render + warning log).

## 9. Backup & restore (beyond CSV)

CSV loses: routines, folders, custom exercise metadata, measurements, photos, settings. Therefore **Backup** = single `kyro_backup_{date}.zip`: `db.json` (full logical dump of all tables, schema-versioned) + `photos/` tree. Restore: pick file → validate version (migrate logical dump forward if older) → **replace-all** with double confirm ("This replaces all current data") → orphan sweep. Surfaced in Settings → Data. Suggested monthly reminder toggle (local notification). Not iCloud-integrated in v1 (files app / share sheet destinations suffice).

## 10. Migrations

- drizzle-kit generates versioned SQL files, bundled and applied sequentially at cold start before UI (splash gate; `06` §5.1); `app_meta.schema_version` tracks applied head. Never edit an applied migration.
- Every migration lands with an integration test: seed representative data at version N−1 (fixtures), migrate, assert integrity (`08` §5.3).
- Dataset seeding (`03` §6.4) is data, not schema: keyed by `app_meta.dataset_version`, upsert-by-id, custom rows untouched.
- Destructive migrations (column drops) require a two-release deprecation in comments — cheap discipline that keeps the backup `db.json` restorable across versions.
