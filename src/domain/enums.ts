/**
 * Domain enums (M1-01) — 05 §2: the canonical string values used in the DB
 * (CHECK constraints, `src/data/sqlite/schema.ts`), CSV export/import
 * (`domain/csv-codec.ts`, later), and every UI picker/label. This module is
 * the **single source of truth**: nothing else in the codebase should
 * hand-roll one of these lists — import from here instead so the DB schema,
 * the dataset build script (M1-04), and the UI can never drift apart.
 *
 * Pure TS, zero React/React Native/Expo imports (06 §2 dependency rule,
 * enforced by `eslint.config.js`'s `src/domain/**` zone) — this is the
 * first source file under `src/domain/`, so it also activates the
 * `src/domain/**` Jest `coverageThreshold` entry (95% lines / 90% branches,
 * 08 §3) in `jest.config.js`, previously commented out pending exactly this
 * (M0-03's `TODO(M1)`).
 *
 * Each enum is exposed three ways:
 *  - `..._VALUES` — a `readonly [...]` tuple (exact literal order from 05
 *    §2), the shape `drizzle-orm`'s `text({ enum: ... })` and Zod's
 *    `z.enum(...)` both want, and what `schema.ts` uses to build each
 *    table's CHECK constraint SQL so the constraint and the TS union can
 *    never disagree.
 *  - a TS union type of the same name (singular).
 *  - for enums with UI labels (`muscle_group`, `equipment`), a `..._LABELS`
 *    record and a `..._OPTIONS` array of `{value, label}` (05 §2.3/§2.4) —
 *    the shape option-picker Sheets consume directly (03 §2).
 */

// ---------------------------------------------------------------------------
// exercise_type (05 §2.1) — 8 values
// ---------------------------------------------------------------------------

export const EXERCISE_TYPE_VALUES = [
  'weight_reps',
  'reps_only',
  'bodyweight_reps',
  'bodyweight_assisted_reps',
  'duration',
  'weight_duration',
  'distance_duration',
  'short_distance_weight',
] as const;

export type ExerciseType = (typeof EXERCISE_TYPE_VALUES)[number];

/**
 * Human-readable label per `exercise_type` value (M1-08, first consumer:
 * the exercise detail "About" tab, 03 §3's own example — "Weight & Reps"
 * for `weight_reps`). Not spelled out verbatim anywhere in `05`/`03` beyond
 * that one example, so the remaining seven are derived from `02` §4's set
 * -table column layout for each type (the only other place the doc
 * describes what each type actually tracks) rather than invented from
 * scratch: `reps_only` tracks reps alone, `bodyweight_reps` adds optional
 * bodyweight-plus-load, `bodyweight_assisted_reps` subtracts assistance,
 * `duration`/`weight_duration` are time-based (with/without load),
 * `distance_duration` is cardio (distance over time), and
 * `short_distance_weight` is load carried over a short distance (farmer's
 * walk, sled push). Will also back M1-09's exercise-type picker
 * (03 §5: "picker with column-preview explanation").
 */
export const EXERCISE_TYPE_LABELS: Record<ExerciseType, string> = {
  weight_reps: 'Weight & Reps',
  reps_only: 'Reps Only',
  bodyweight_reps: 'Bodyweight Reps',
  bodyweight_assisted_reps: 'Assisted Bodyweight',
  duration: 'Duration',
  weight_duration: 'Weight & Duration',
  distance_duration: 'Distance & Duration',
  short_distance_weight: 'Short Distance & Weight',
};

/** `{value, label}` pairs in canonical order — mirrors `MUSCLE_GROUP_OPTIONS`/`EQUIPMENT_OPTIONS` (03 §2/§5's option-picker Sheet shape). */
export const EXERCISE_TYPE_OPTIONS = EXERCISE_TYPE_VALUES.map((value) => ({
  value,
  label: EXERCISE_TYPE_LABELS[value],
}));

// ---------------------------------------------------------------------------
// set_type (05 §2.2) — 4 values
// ---------------------------------------------------------------------------

export const SET_TYPE_VALUES = ['normal', 'warmup', 'failure', 'dropset'] as const;

export type SetType = (typeof SET_TYPE_VALUES)[number];

// ---------------------------------------------------------------------------
// muscle_group (05 §2.3) — 20 values, with UI labels
// ---------------------------------------------------------------------------

export const MUSCLE_GROUP_VALUES = [
  'abdominals',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'quadriceps',
  'hamstrings',
  'calves',
  'glutes',
  'abductors',
  'adductors',
  'lats',
  'upper_back',
  'traps',
  'lower_back',
  'chest',
  'cardio',
  'neck',
  'full_body',
  'other',
] as const;

export type MuscleGroup = (typeof MUSCLE_GROUP_VALUES)[number];

/** 05 §2.3 — UI label per `muscle_group` value, verbatim. */
export const MUSCLE_GROUP_LABELS: Record<MuscleGroup, string> = {
  abdominals: 'Abdominals',
  shoulders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Forearms',
  quadriceps: 'Quadriceps',
  hamstrings: 'Hamstrings',
  calves: 'Calves',
  glutes: 'Glutes',
  abductors: 'Abductors',
  adductors: 'Adductors',
  lats: 'Lats',
  upper_back: 'Upper Back',
  traps: 'Traps',
  lower_back: 'Lower Back',
  chest: 'Chest',
  cardio: 'Cardio',
  neck: 'Neck',
  full_body: 'Full Body',
  other: 'Other',
};

/** `{value, label}` pairs in canonical order — what option-picker Sheets render (03 §2). */
export const MUSCLE_GROUP_OPTIONS = MUSCLE_GROUP_VALUES.map((value) => ({
  value,
  label: MUSCLE_GROUP_LABELS[value],
}));

// ---------------------------------------------------------------------------
// equipment (05 §2.4) — 9 values, with UI labels
// ---------------------------------------------------------------------------

export const EQUIPMENT_VALUES = [
  'none',
  'barbell',
  'dumbbell',
  'kettlebell',
  'machine',
  'plate',
  'resistance_band',
  'suspension',
  'other',
] as const;

export type Equipment = (typeof EQUIPMENT_VALUES)[number];

/** 05 §2.4 — UI label per `equipment` value, verbatim. */
export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  none: 'None/Bodyweight',
  barbell: 'Barbell',
  dumbbell: 'Dumbbell',
  kettlebell: 'Kettlebell',
  machine: 'Machine',
  plate: 'Plate',
  resistance_band: 'Resistance Band',
  suspension: 'Suspension',
  other: 'Other',
};

/** `{value, label}` pairs in canonical order — what option-picker Sheets render (03 §2). */
export const EQUIPMENT_OPTIONS = EQUIPMENT_VALUES.map((value) => ({
  value,
  label: EQUIPMENT_LABELS[value],
}));

// ---------------------------------------------------------------------------
// rpe (05 §2.5) — numeric domain, not a string enum. Stored REAL,
// CHECK-constrained to exactly these 8 values.
// ---------------------------------------------------------------------------

export const RPE_VALUES = [6, 7, 7.5, 8, 8.5, 9, 9.5, 10] as const;

export type Rpe = (typeof RPE_VALUES)[number];

// ---------------------------------------------------------------------------
// Settings enums (05 §2.6) — string literal unions backing the `settings`
// kv rows (`src/data/settings/settings-schema.ts` owns the Zod/default
// wiring for those rows; these tuples are the same canonical value lists,
// kept here so DB/CSV/UI code that needs the bare values — not the full
// Settings object shape — has one place to import them from, per 05 §2's
// framing of this whole section as "used in DB, code, and CSV").
// ---------------------------------------------------------------------------

export const WEIGHT_UNIT_VALUES = ['kg', 'lbs'] as const;
export type WeightUnit = (typeof WEIGHT_UNIT_VALUES)[number];

export const DISTANCE_UNIT_VALUES = ['km', 'miles'] as const;
export type DistanceUnit = (typeof DISTANCE_UNIT_VALUES)[number];

export const BODY_MEASUREMENT_UNIT_VALUES = ['metric', 'imperial'] as const;
export type BodyMeasurementUnit = (typeof BODY_MEASUREMENT_UNIT_VALUES)[number];

export const THEME_VALUES = ['system', 'light', 'dark'] as const;
export type Theme = (typeof THEME_VALUES)[number];

export const FIRST_DAY_OF_WEEK_VALUES = ['monday', 'sunday', 'saturday'] as const;
export type FirstDayOfWeek = (typeof FIRST_DAY_OF_WEEK_VALUES)[number];

export const PREVIOUS_VALUES_MODE_VALUES = ['any_workout', 'same_routine'] as const;
export type PreviousValuesMode = (typeof PREVIOUS_VALUES_MODE_VALUES)[number];

export const WORKOUT_STATE_VALUES = ['active', 'completed'] as const;
export type WorkoutState = (typeof WORKOUT_STATE_VALUES)[number];
