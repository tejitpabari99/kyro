/**
 * `domain/csv-codec.ts` (M5-05) — 05 §7.1's Hevy-compatible CSV export
 * encoder. Pure TS, zero React/RN/Expo/`src/data` imports (06 §2's
 * dependency rule, same posture every other `domain/**` module already
 * establishes) — every input here is a plain value shaped like (but not
 * identical to — see "Input shape" below) `WorkoutFull`/`WorkoutExerciseFull`/
 * `WorkoutSet` (`src/data/workouts/types.ts`, M2-01), never a repository
 * call. `CsvService.exportAll`/`exportWorkout` (05 §6, M5-06's own task) own
 * fetching real data and handing it to {@link encodeWorkoutsCsv}; this
 * module only ever turns already-fetched rows into a CSV string.
 *
 * ## Input shape: `WorkoutFull` plus exercise titles, minus what CSV never needs
 *
 * `WorkoutExerciseFull` (`src/data/workouts/types.ts`) carries `exerciseId`,
 * not the exercise's own name — the CSV's `exercise_title` column needs the
 * *name*, which only exists on the `exercises` table/`Exercise` shape
 * (`src/data/exercises/types.ts`), one join away. Rather than pull the
 * whole `Exercise` shape in here (a real `src/data` dependency this module
 * must never take, 06 §2), {@link CsvExportExercise} is `WorkoutExerciseFull`
 * with `exerciseId` swapped for `exerciseTitle: string` — the exact same
 * "denormalize onto the row so the pure function needs no lookup loop"
 * precedent `StatsFeedRow` (`domain/stats-buckets.ts`) already established
 * for this exact join. `CsvService`'s implementation (M5-06) is where the
 * real exercise-name lookup happens, not here.
 *
 * `customMetric` is deliberately **absent** from {@link CsvExportSet} (not
 * just unread) — 05 §7.1: "`custom_metric` is NOT exported (Hevy doesn't);
 * it survives via backup (§9)," confirmed against
 * `docs/plan/research/hevy-deep-dive.md` §3.2's own 14-column ground-truth
 * schema, which likewise has no `custom_metric` column even though Hevy's
 * own data model has the field (§1.1: "Extra field `custom_metric` ...
 * currently used for steps/floors"). Leaving the field off the input type
 * entirely — rather than accepting it and silently dropping it in the
 * encoder — makes "this can never leak into a CSV row" a compile-time fact,
 * not a runtime discipline a future edit could accidentally break.
 *
 * `isCompleted` is likewise absent from {@link CsvExportSet}: 05 §3.2/06
 * §2.4's `finish()` deletes every unchecked set when a workout is finished,
 * so a `state: 'completed'` workout's persisted `sets` rows are *already*
 * only ever the completed ones — there is nothing left to filter at the
 * set level, only at the workout level (see below).
 *
 * ## Row selection & ordering (05 §7.1)
 *
 * "One row per set (completed workouts only), workout order by start_time
 * then exercise position then set position." {@link encodeWorkoutsCsv} does
 * both the filter and the sort itself rather than trusting the caller's
 * array order — golden-file correctness is the whole point of this task, so
 * every ordering guarantee the spec makes is re-derived here, not assumed:
 *  - `workouts` filtered to `state === 'completed'` (an `'active'` workout
 *    passed in — e.g. the one in-progress session mid-`exportAll` — is
 *    silently excluded, never a caller error).
 *  - Filtered workouts sorted by `startTime` ascending.
 *  - Each workout's `exercises` sorted by `position` ascending.
 *  - Each exercise's `sets` sorted by `position` ascending; `set_index` in
 *    the output is that **sorted array's own 0-based index**, not the raw
 *    `position` value passed in — position values are only guaranteed
 *    locally unique and ascending (`src/data/workouts/types.ts`'s own
 *    `WorkoutSet.position` doc comment), not guaranteed contiguous from 0,
 *    so re-deriving the index from sorted order is what actually satisfies
 *    "0-based set position within the exercise" for every input, not just
 *    the already-contiguous common case.
 * `Array.prototype.sort` is stable per spec (ES2019+) — ties (e.g. two
 * workouts sharing one `startTime`) keep their input relative order rather
 * than reshuffling unpredictably.
 *
 * ## Unit-dependent headers & value conversion (05 §7.1)
 *
 * `weight_kg`/`weight_lbs` and `distance_km`/`distance_miles` are two
 * *headers* for the same two *columns* — {@link CsvExportUnits} picks which
 * pair of header strings the whole document uses, and every row's
 * weight/distance value is converted to match (never just the header
 * relabeled with the raw kg/meters value still underneath, which would
 * silently corrupt every re-import).
 *
 * Two genuinely different rounding rules are in play here, and conflating
 * them would be a real bug, not just a style choice:
 *  - **Weight**: 05 §7.1 says "weight 2 decimals max" — a plain
 *    round-to-2-decimals, nothing else. `domain/units.ts`'s
 *    `formatWeightLb` is *not* this: it applies 05 §5's UI-display bucket
 *    rounding (nearest 0.5 lb at/above 10 lb, else nearest 0.1 lb) meant for
 *    the workout logger's weight chips, which would silently coarsen CSV
 *    export values (e.g. `102.5 kg` -> `226.0 lb` chip-rounded instead of
 *    the true `225.97 lb`). This module therefore calls the *raw* `kgToLb`
 *    (full precision, no display rounding — export only ever converts
 *    canonical kg -> display unit, never the reverse, so `lbToKg` has no
 *    caller here) and applies its own {@link round2} — the "2 decimals max"
 *    rule, and only that rule.
 *  - **Distance**: 05 §7.1 says "distance 2 decimals" — which is *exactly*
 *    what `domain/units.ts`'s `formatDistanceKm`/`formatDistanceMiles`
 *    already do (that module's own doc comment: "2 decimals (05 §5)"), so
 *    this module reuses those two directly rather than re-deriving the same
 *    rounding a second time.
 * Both null-passthrough identically (`null` weight/distance -> empty CSV
 * field, per 05 §7.1's "empty string for nulls") — `kgToLb`/
 * `formatDistanceKm`/`formatDistanceMiles` all already do this themselves.
 *
 * ## Date formatting (05 §7.1): `d MMM yyyy, HH:mm`, local time, hand-rolled
 *
 * `"28 Mar 2025, 17:29"` / the task's own worked single-digit-day example
 * `"3 Jan 2026, 08:15"` — day **unpadded**, English 3-letter month
 * abbreviation, 4-digit year, comma-space, then zero-padded 24-hour
 * `HH:mm`. `06` §1 lists `date-fns` as this repo's chosen date library, but
 * it is not actually an installed dependency yet (`package.json` has no
 * `date-fns` entry — nothing in the codebase through M4 has needed it), and
 * this format's exact byte output must be locale/ICU-independent for golden
 * -file correctness across Node (Jest) and Hermes (device) — `Date`'s own
 * `toLocaleDateString`/`toLocaleString` depend on whatever ICU data the
 * runtime ships, which is exactly the kind of environment-dependent
 * behavior a byte-exact golden file cannot tolerate (`src/features/history/
 * date-format.ts`'s `toLocaleDateString` calls are fine for that file's
 * "Today"/"Tue, 15 Jul" *display* strings, where locale-dependent rendering
 * is actually the intent — CSV export explicitly is not that case). Adding
 * a new dependency for one date format, when 06 §1 already frames
 * `lib/csv.ts` itself as "dependency-free," is the wrong tradeoff — a
 * 12-entry month-abbreviation lookup table plus `Date`'s local-time getters
 * (`getDate`/`getMonth`/`getFullYear`/`getHours`/`getMinutes` — local time,
 * never the `getUTC*` family, per 05 §7.1's explicit "local time") is a few
 * lines and has zero runtime-dependent behavior.
 *
 * ## Why this file does NOT import `lib/csv.ts` (a real boundary finding)
 *
 * The task text for this module describes "dependency-free `lib/csv.ts`
 * writer + `domain/csv-codec.ts` encode" in a way that reads as if this
 * module calls into `lib/csv.ts`'s RFC 4180 quoting/writer for its final
 * text-assembly step. It cannot: `eslint.config.js`'s `import/no-restricted-
 * paths` zones (06 §2) forbid `src/domain -> src/lib` *and* `src/lib ->
 * src/domain` categorically, with no test-file carve-out (the zone's
 * `files` glob is `src/domain/**\/*.{ts,tsx}`, which matches this file's own
 * `__tests__` directory too) — only `src/features/**` is permitted to
 * import both layers and glue them together, and no `src/features/data-
 * transfer/*` file exists yet (that's M5-06's own task). Verified empirically
 * against the installed `eslint.config.js`, not assumed.
 *
 * Rather than have `encodeWorkoutsCsv` return unescaped row arrays (which
 * would push the "byte-exact golden CSV file" half of this task's own
 * acceptance gate onto a future task that doesn't exist yet), this module
 * implements its own minimal, private RFC 4180 field-quoting step
 * ({@link csvField}) — the same 2-line rule (`"..."` wrap + `"` -> `""`
 * doubling) `lib/csv.ts`'s `csvEscapeField` implements, independently
 * re-derived here rather than imported. Both implementations are unit-
 * tested independently (`lib/__tests__/csv.test.ts` for the generic
 * writer, `domain/__tests__/csv-codec.test.ts` for this file's byte-exact
 * golden output) — a deliberate, documented small duplication forced by the
 * architecture's hard domain/lib wall, not an oversight. `lib/csv.ts` still
 * exists as designed: a standalone, reusable RFC 4180 primitive for M5-07's
 * reader and any future `src/features/**` composition that legitimately can
 * import both layers.
 */
import type { Rpe, SetType, WorkoutState } from './enums';
import { formatDistanceKm, formatDistanceMiles, kgToLb } from './units';

// ---------------------------------------------------------------------------
// Input shapes
// ---------------------------------------------------------------------------

/** One `sets` row (05 §3.2) worth of CSV-export-relevant fields — see this file's header for what's deliberately absent (`customMetric`, `isCompleted`) and why. */
export interface CsvExportSet {
  /**
   * Sort key only — mirrors `WorkoutSet.position`. Not itself written to
   * the output; `set_index` is derived from this array's post-sort index
   * (see this file's header, "Row selection & ordering").
   */
  position: number;
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  rpe: Rpe | null;
}

/** One `workout_exercises` row (05 §3.2) worth of CSV-export-relevant fields, `exerciseId` swapped for `exerciseTitle` — see this file's header, "Input shape." */
export interface CsvExportExercise {
  /** Sort key only, mirrors `WorkoutExerciseFull.position` — not itself written to the output. */
  position: number;
  exerciseTitle: string;
  supersetId: number | null;
  /** -> `exercise_notes` column. */
  notes: string | null;
  sets: readonly CsvExportSet[];
}

/** One `workouts` row (05 §3.2) worth of CSV-export-relevant fields. */
export interface CsvExportWorkout {
  title: string;
  description: string | null;
  /** Only `'completed'` workouts produce any rows — see this file's header. */
  state: WorkoutState;
  /** Epoch ms, local-time formatted at render (05 §7.1). */
  startTime: number;
  /** Epoch ms, local-time formatted at render; `null` -> empty CSV field (an in-progress workout would never reach here since `state !== 'completed'`, but the type stays honest about `WorkoutFull.endTime`'s own nullability). */
  endTime: number | null;
  exercises: readonly CsvExportExercise[];
}

/** Which unit each row's `weight`/`distance` columns (header *and* values) are rendered in — 05 §7.1's "header unit-dependence." */
export interface CsvExportUnits {
  weightUnit: 'kg' | 'lbs';
  distanceUnit: 'km' | 'miles';
}

// ---------------------------------------------------------------------------
// Header (05 §7.1's exact 14 columns, in order)
// ---------------------------------------------------------------------------

const BASE_HEADER_PREFIX = [
  'title',
  'start_time',
  'end_time',
  'description',
  'exercise_title',
  'superset_id',
  'exercise_notes',
  'set_index',
  'set_type',
] as const;

const BASE_HEADER_SUFFIX = ['reps', 'duration_seconds', 'rpe'] as const;

function buildHeader(units: CsvExportUnits): string[] {
  const weightHeader = units.weightUnit === 'kg' ? 'weight_kg' : 'weight_lbs';
  const distanceHeader = units.distanceUnit === 'km' ? 'distance_km' : 'distance_miles';
  return [
    ...BASE_HEADER_PREFIX,
    weightHeader,
    BASE_HEADER_SUFFIX[0], // 'reps'
    distanceHeader,
    ...BASE_HEADER_SUFFIX.slice(1), // 'duration_seconds', 'rpe'
  ];
}

// ---------------------------------------------------------------------------
// Date formatting: `d MMM yyyy, HH:mm`, local time (see file header)
// ---------------------------------------------------------------------------

const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** Formats an epoch-ms timestamp as `d MMM yyyy, HH:mm` in **local** time (05 §7.1) — day unpadded, English month abbreviation, zero-padded 24h `HH:mm`. Exported for the golden-file/date-edge-case tests to exercise directly. */
export function formatCsvDateTime(epochMs: number): string {
  const date = new Date(epochMs);
  const day = date.getDate();
  const month = MONTH_ABBREVIATIONS[date.getMonth()];
  const year = date.getFullYear();
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  return `${day} ${month} ${year}, ${hours}:${minutes}`;
}

// ---------------------------------------------------------------------------
// RFC 4180 field quoting (private, minimal — see file header, "Why this
// file does NOT import lib/csv.ts")
// ---------------------------------------------------------------------------

/** Quotes and escapes one raw field value per RFC 4180 §2.5/§2.7 — wraps in double quotes unconditionally, doubling any embedded double quote. Independently re-derived from `lib/csv.ts`'s `csvEscapeField` (identical rule); see this file's header for why this module can't just import that function. */
function csvField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// ---------------------------------------------------------------------------
// Numeric field formatting
// ---------------------------------------------------------------------------

/**
 * Rounds to at most 2 decimal places, cleaning up binary-floating-point
 * residue (e.g. `0.1 + 0.2`-style noise) the same way `domain/units.ts`'s
 * internal `roundToIncrement` does, so a value like `102.50000000000001`
 * never leaks into a golden-file diff. Only used for weight (05 §7.1: "2
 * decimals max") — distance reuses `domain/units.ts`'s own
 * `formatDistanceKm`/`formatDistanceMiles`, which already apply the
 * identical rule (see this file's header).
 */
function round2(value: number): number {
  const rounded = Math.round(value * 100) / 100;
  return Math.round(rounded * 1e8) / 1e8;
}

/** `null` -> `''`; otherwise `String(value)` — JS's default number->string formatting never pads trailing zeros (`5` stays `"5"`, `5.2` stays `"5.2"`), which is exactly "N decimals max." */
function numberField(value: number | null): string {
  return value === null ? '' : String(value);
}

function weightField(weightKg: number | null, weightUnit: 'kg' | 'lbs'): string {
  if (weightKg === null) return '';
  const converted = weightUnit === 'kg' ? weightKg : (kgToLb(weightKg) as number);
  return numberField(round2(converted));
}

function distanceField(distanceMeters: number | null, distanceUnit: 'km' | 'miles'): string {
  const converted =
    distanceUnit === 'km' ? formatDistanceKm(distanceMeters) : formatDistanceMiles(distanceMeters);
  return numberField(converted);
}

// ---------------------------------------------------------------------------
// Encode
// ---------------------------------------------------------------------------

/**
 * Encodes `workouts` as a Hevy-compatible CSV document (05 §7.1) —
 * `CsvService.exportAll`/`exportWorkout`'s (M5-06) shared core, called once
 * with every completed workout for a full export or once with a single
 * workout for a single-workout export (filtering/selecting *which*
 * workouts to pass in is that service's job, not this function's — this
 * function's own `state` filter only guards against an active workout
 * slipping through, not against the caller wanting a subset).
 *
 * See this file's header for the full ordering/filtering/rounding/date-
 * format contract. Returns `''`-body-but-still-headed (i.e. just the header
 * row + trailing newline) when `workouts` has no completed-workout rows at
 * all — never an empty string outright, so the exported file always opens
 * as a valid (if header-only) CSV.
 */
export function encodeWorkoutsCsv(
  workouts: readonly CsvExportWorkout[],
  units: CsvExportUnits,
): string {
  const rows: string[][] = [buildHeader(units)];

  const sortedWorkouts = workouts
    .filter((workout) => workout.state === 'completed')
    .sort((a, b) => a.startTime - b.startTime);

  for (const workout of sortedWorkouts) {
    const sortedExercises = workout.exercises.slice().sort((a, b) => a.position - b.position);

    for (const exercise of sortedExercises) {
      const sortedSets = exercise.sets.slice().sort((a, b) => a.position - b.position);

      sortedSets.forEach((set, setIndex) => {
        rows.push([
          workout.title,
          formatCsvDateTime(workout.startTime),
          workout.endTime === null ? '' : formatCsvDateTime(workout.endTime),
          workout.description ?? '',
          exercise.exerciseTitle,
          exercise.supersetId === null ? '' : String(exercise.supersetId),
          exercise.notes ?? '',
          String(setIndex),
          set.setType,
          weightField(set.weightKg, units.weightUnit),
          numberField(set.reps),
          distanceField(set.distanceMeters, units.distanceUnit),
          numberField(set.durationSeconds),
          numberField(set.rpe),
        ]);
      });
    }
  }

  // \n line endings (05 §7.1 — never \r\n), trailing newline after the last
  // row (same POSIX text-file convention `lib/csv.ts`'s `writeCsv` uses).
  return rows.map((row) => row.map(csvField).join(',') + '\n').join('');
}
