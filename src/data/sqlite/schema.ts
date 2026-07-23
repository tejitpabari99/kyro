/**
 * Drizzle schema. `settings`/`app_meta` (05 §3.5) landed in M0-09 as
 * migration 0001. M1-01 **extends** this same file (rather than replacing
 * it) with the full v1 schema — `exercises`, `workouts`, `workout_exercises`,
 * `sets`, `routine_folders`, `routines`, `routine_exercises`, `routine_sets`,
 * `body_measurements`, `progress_photos` (05 §3.1-3.4) — as migration 0002.
 * This file is the source drizzle-kit diffs against to generate
 * `src/data/migrations/*.sql` (`drizzle.config.ts`).
 *
 * `settings`/`app_meta` are plain `key/value` stores (JSON-encoded `value`
 * for `settings`; loosely-typed string values for `app_meta` such as
 * `schema_version`, `dataset_version`, `last_backup_at`, 05 §3.5) — no
 * relations, no indexes beyond the primary key. They are still not wired
 * into a live query client (the migration runner and `SettingsRepository`
 * work directly against the raw `SqliteDriver`, `06` §10/§8 §5 parity — see
 * `src/data/settings/settings-repository.ts`'s header for the full
 * rationale); their table objects here exist only for drizzle-kit's
 * schema-diff codegen.
 *
 * The M1-01 tables below are exported the same way (plain `SQLiteTable`
 * objects, consumed by drizzle-kit) — repositories that query them as a live
 * `drizzle(...)` client land in later M1 tasks (M1-06 `ExerciseRepository`
 * onward); this task's scope is schema + migration + the enum module only.
 *
 * **Cloud-sync scope note (read before editing `deleted_at`/`routine_folders`
 * here):** 05's DDL blocks show `[sync]`-tagged columns (`deleted_at` on
 * `exercises`/`routines`/`routine_folders`, `routine_folders.id` as TEXT
 * uuid) inline as part of the doc's forward-looking "end state" narration.
 * Per `docs/plan/tasks/M-CLOUD-tasks.md` MC-03 ("Local schema migration:
 * sync_outbox, tombstones, folder UUIDs"), those are additions/conversions
 * MC-03 performs **later**, as its own migration, once real dogfood data
 * exists — its own description reads "add `deleted_at` to routines,
 * routine_folders, exercises" and "convert `routine_folders.id`
 * INTEGER→TEXT UUID", which is only meaningful if neither exists yet. This
 * migration (0002) therefore deliberately omits all three; see the
 * inline scope note above the `exercises` table below and
 * `docs/plan/EXECUTION-LOG.md` for the full reasoning trail.
 */
import { sql } from 'drizzle-orm';
import { check, index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

import {
  EQUIPMENT_VALUES,
  EXERCISE_TYPE_VALUES,
  MUSCLE_GROUP_VALUES,
  RPE_VALUES,
  SET_TYPE_VALUES,
} from '@/domain/enums';

/** `settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)` — JSON-encoded values (05 §3.5). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/**
 * `app_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)` — plain string
 * values: `'schema_version'`, `'dataset_version'`, `'last_backup_at'`, … (05
 * §3.5). The migration runner (`migrator.ts`) owns writes to the
 * `schema_version` row; nothing else should write that key.
 */
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

// ---------------------------------------------------------------------------
// M1-01 — full v1 schema (05 §3.1-3.4), migration 0002.
//
// SCOPE NOTE on cloud-sync `[sync]` columns (05's inline tags): per this
// task's explicit instruction and independently confirmed against
// `docs/plan/tasks/M-CLOUD-tasks.md` MC-03 ("Local schema migration:
// sync_outbox, tombstones, folder UUIDs" — its own "How" says it *adds*
// `deleted_at` to routines/routine_folders/exercises and *converts*
// `routine_folders.id` INTEGER→TEXT UUID, which only makes sense if neither
// exists yet), this migration deliberately does NOT include:
//   - `deleted_at` on `exercises`, `routines`, `routine_folders` (MC-03 adds
//     these later as its own migration).
//   - `routine_folders.id` as TEXT uuid (stays INTEGER PRIMARY KEY
//     AUTOINCREMENT here; MC-03 converts it via a table-rebuild migration
//     once real dogfood data exists).
//   - the `sync_outbox` table (05 §3.6) and the cloud-related `app_meta` keys
//     (05's `[sync]` note under §3.5) — also MC-03/`12`'s scope.
// `idx_exercises_name_active` is therefore built WITHOUT a `deleted_at IS
// NULL` clause (just `archived_at IS NULL`) — MC-03's own description says
// it "rebuild[s] idx_exercises_name_active with the deleted_at IS NULL
// clause" later, confirming the clause isn't there yet.
// `workouts.deleted_at` DOES land now — 05 §3.2 shows it with a plain
// "-- soft delete" comment (no `[sync]` tag): it is pre-existing soft-delete
// used by `WorkoutRepository.softDelete` well before any cloud-sync
// milestone, unrelated to the tombstone-for-sync additions above.
// See docs/plan/EXECUTION-LOG.md for the full reasoning trail.
// ---------------------------------------------------------------------------

/** Table-level CHECK helper: `column IN ('a','b',...)` for a TEXT enum column. */
function textEnumCheck(column: unknown, values: readonly string[]) {
  return sql`${column} IN (${sql.join(
    values.map((value) => sql.raw(`'${value}'`)),
    sql.raw(', '),
  )})`;
}

/** Table-level CHECK helper: `column IN (n1,n2,...)` for a numeric-domain REAL column. */
function numericEnumCheck(column: unknown, values: readonly number[]) {
  return sql`${column} IN (${sql.join(
    values.map((value) => sql.raw(String(value))),
    sql.raw(', '),
  )})`;
}

/**
 * `exercises` (05 §3.1). `id` is a dataset slug for built-ins, a uuid for
 * customs (`is_custom = 1`). JSON-array TEXT columns (`secondary_muscle_groups`,
 * `instructions`, `images`, `aliases`) default to `'[]'`. `animation_uri` is
 * reserved for a future GIF milestone (03 §4) — nullable, no default.
 */
export const exercises = sqliteTable(
  'exercises',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    exerciseType: text('exercise_type').notNull(),
    primaryMuscleGroup: text('primary_muscle_group').notNull(),
    secondaryMuscleGroups: text('secondary_muscle_groups').notNull().default('[]'),
    equipment: text('equipment').notNull().default('none'),
    instructions: text('instructions').notNull().default('[]'),
    images: text('images').notNull().default('[]'),
    animationUri: text('animation_uri'),
    isCustom: integer('is_custom').notNull().default(0),
    usesCustomMetric: integer('uses_custom_metric').notNull().default(0),
    aliases: text('aliases').notNull().default('[]'),
    archivedAt: integer('archived_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('idx_exercises_name').on(sql`${table.name} COLLATE NOCASE`),
    // Partial unique index — active (non-archived) exercise names are unique
    // case-insensitively; archived rows may share a name with an active one
    // or another archived one (05 §3.1). See scope note above re: no
    // `deleted_at` clause yet (MC-03 adds it).
    uniqueIndex('idx_exercises_name_active')
      .on(sql`${table.name} COLLATE NOCASE`)
      .where(sql`${table.archivedAt} IS NULL`),
    check('exercises_exercise_type_check', textEnumCheck(table.exerciseType, EXERCISE_TYPE_VALUES)),
    check(
      'exercises_primary_muscle_group_check',
      textEnumCheck(table.primaryMuscleGroup, MUSCLE_GROUP_VALUES),
    ),
    check('exercises_equipment_check', textEnumCheck(table.equipment, EQUIPMENT_VALUES)),
  ],
);

/**
 * `workouts` (05 §3.2). `routine_id` is a deliberate soft reference (no FK —
 * "routine may be deleted", so it is a plain TEXT column, not
 * `.references()`). `duration_pause_offset_ms` is the accumulated
 * paused-time offset (02 §2). `deleted_at` is plain soft-delete, pre-dating
 * cloud sync (see scope note above).
 */
export const workouts = sqliteTable(
  'workouts',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description'),
    routineId: text('routine_id'),
    state: text('state').notNull().default('completed'),
    startTime: integer('start_time').notNull(),
    endTime: integer('end_time'),
    durationPauseOffsetMs: integer('duration_pause_offset_ms').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    deletedAt: integer('deleted_at'),
  },
  (table) => [
    // At most one active workout at a time, across non-deleted rows.
    uniqueIndex('idx_one_active_workout')
      .on(table.state)
      .where(sql`${table.state} = 'active' AND ${table.deletedAt} IS NULL`),
    index('idx_workouts_start')
      .on(sql`${table.startTime} DESC`)
      .where(sql`${table.deletedAt} IS NULL`),
    check('workouts_state_check', textEnumCheck(table.state, ['active', 'completed'])),
  ],
);

/** `workout_exercises` (05 §3.2) — one row per exercise slot within a workout. */
export const workoutExercises = sqliteTable(
  'workout_exercises',
  {
    id: text('id').primaryKey(),
    workoutId: text('workout_id')
      .notNull()
      .references(() => workouts.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    position: integer('position').notNull(),
    supersetId: integer('superset_id'),
    notes: text('notes'),
    restSeconds: integer('rest_seconds'),
  },
  (table) => [
    index('idx_we_workout').on(table.workoutId, table.position),
    index('idx_we_exercise').on(table.exerciseId),
  ],
);

/** `sets` (05 §3.2) — logged results. All value fields nullable; only type-relevant ones populated. */
export const sets = sqliteTable(
  'sets',
  {
    id: text('id').primaryKey(),
    workoutExerciseId: text('workout_exercise_id')
      .notNull()
      .references(() => workoutExercises.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    setType: text('set_type').notNull().default('normal'),
    weightKg: real('weight_kg'),
    reps: integer('reps'),
    distanceMeters: real('distance_meters'),
    durationSeconds: integer('duration_seconds'),
    rpe: real('rpe'),
    customMetric: real('custom_metric'),
    isCompleted: integer('is_completed').notNull().default(0),
  },
  (table) => [
    index('idx_sets_we').on(table.workoutExerciseId, table.position),
    check('sets_set_type_check', textEnumCheck(table.setType, SET_TYPE_VALUES)),
    check('sets_rpe_check', sql`${table.rpe} IS NULL OR ${numericEnumCheck(table.rpe, RPE_VALUES)}`),
  ],
);

/**
 * `routine_folders` (05 §3.3). `id` stays `INTEGER PRIMARY KEY AUTOINCREMENT`
 * for now — see scope note above (MC-03 converts this to a TEXT uuid later).
 */
export const routineFolders = sqliteTable('routine_folders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  position: integer('position').notNull(),
  collapsed: integer('collapsed').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/**
 * `routines` (05 §3.3). `folder_id` null = "My Routines". References
 * `routine_folders.id` — an INTEGER FK for now (matches that table's current
 * PK type; becomes TEXT when MC-03 converts both together).
 */
export const routines = sqliteTable('routines', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  notes: text('notes'),
  folderId: integer('folder_id').references(() => routineFolders.id, { onDelete: 'set null' }),
  position: integer('position').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** `routine_exercises` (05 §3.3) — one row per exercise slot within a routine. */
export const routineExercises = sqliteTable(
  'routine_exercises',
  {
    id: text('id').primaryKey(),
    routineId: text('routine_id')
      .notNull()
      .references(() => routines.id, { onDelete: 'cascade' }),
    exerciseId: text('exercise_id')
      .notNull()
      .references(() => exercises.id),
    position: integer('position').notNull(),
    supersetId: integer('superset_id'),
    notes: text('notes'),
    restSeconds: integer('rest_seconds'),
  },
  (table) => [index('idx_re_routine').on(table.routineId, table.position)],
);

/**
 * `routine_sets` (05 §3.3) — TARGETS, not results. `reps` and
 * `rep_range_start` are mutually exclusive (CHECK below): a set targets
 * either a fixed rep count or a range, never both.
 */
export const routineSets = sqliteTable(
  'routine_sets',
  {
    id: text('id').primaryKey(),
    routineExerciseId: text('routine_exercise_id')
      .notNull()
      .references(() => routineExercises.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    setType: text('set_type').notNull().default('normal'),
    weightKg: real('weight_kg'),
    reps: integer('reps'),
    repRangeStart: integer('rep_range_start'),
    repRangeEnd: integer('rep_range_end'),
    distanceMeters: real('distance_meters'),
    durationSeconds: integer('duration_seconds'),
    customMetric: real('custom_metric'),
  },
  (table) => [
    check('routine_sets_set_type_check', textEnumCheck(table.setType, SET_TYPE_VALUES)),
    check(
      'routine_sets_reps_xor_range_check',
      sql`NOT (${table.reps} IS NOT NULL AND ${table.repRangeStart} IS NOT NULL)`,
    ),
  ],
);

/**
 * `body_measurements` (05 §3.4). `date` (`'YYYY-MM-DD'` local date) is the
 * PK and upsert key (04 §6.1) — every measurement field is independently
 * nullable (a day may log only some fields).
 */
export const bodyMeasurements = sqliteTable('body_measurements', {
  date: text('date').primaryKey(),
  weightKg: real('weight_kg'),
  fatPercent: real('fat_percent'),
  leanMassKg: real('lean_mass_kg'),
  neckCm: real('neck_cm'),
  shouldersCm: real('shoulders_cm'),
  chestCm: real('chest_cm'),
  leftBicepCm: real('left_bicep_cm'),
  rightBicepCm: real('right_bicep_cm'),
  leftForearmCm: real('left_forearm_cm'),
  rightForearmCm: real('right_forearm_cm'),
  abdomenCm: real('abdomen_cm'),
  waistCm: real('waist_cm'),
  hipsCm: real('hips_cm'),
  leftThighCm: real('left_thigh_cm'),
  rightThighCm: real('right_thigh_cm'),
  leftCalfCm: real('left_calf_cm'),
  rightCalfCm: real('right_calf_cm'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

/** `progress_photos` (05 §3.4). `id` is also the file basename; `file_name` is relative to the photos dir (05 §8). */
export const progressPhotos = sqliteTable(
  'progress_photos',
  {
    id: text('id').primaryKey(),
    date: text('date')
      .notNull()
      .references(() => bodyMeasurements.date, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('idx_photos_date').on(table.date)],
);
