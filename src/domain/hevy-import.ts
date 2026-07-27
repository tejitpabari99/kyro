/**
 * `domain/hevy-import.ts` (M5-07, 05 §7.2) — the pure half of the Hevy CSV
 * import pipeline: every rule in the task's own "How" line that is a plain
 * data transform (header/unit resolution, per-row parsing + validation,
 * workout grouping, exercise-occurrence grouping, exercise-type inference,
 * `set_type` mapping, RPE snapping) lives here, with zero React/RN/Expo/
 * `src/data`/`src/lib` imports (06 §2's dependency rule, the same posture
 * every other `src/domain/**` module already establishes — see
 * `domain/csv-codec.ts`'s own header for the fuller rationale, which
 * applies unchanged here).
 *
 * The **impure** half — reading the file off disk, matching exercise names
 * against the real `ExerciseRepository` (incl. auto-creating unmatched
 * ones), checking for already-imported duplicate workouts against the real
 * DB, and the transactional bulk insert — is `features/data-transfer/
 * hevy-import-service.ts`'s job (the one place allowed to import both this
 * module and `src/data/**`, per `eslint.config.js`'s `import/no-restricted-
 * paths` zones — see `csv-codec.ts`'s header for the same boundary finding
 * applied to CSV *export*). This module never sees a `SqliteDriver` or an
 * `ExerciseRepository` — it only ever turns already-read CSV records into
 * validated, in-memory draft structures the service can act on.
 *
 * ## Input shape: plain `{fields, line}` records, not `lib/csv.ts`'s own type
 *
 * {@link parseHevyCsvRecords} takes `readonly {fields: string[]; line:
 * number}[]` rather than importing `lib/csv.ts`'s `CsvRecord` type — the
 * exact same "structurally identical, independently declared" boundary
 * `csv-codec.ts`'s header documents for `csvField`/`csvEscapeField` (this
 * repo's domain/lib split forbids the import in *either* direction, with no
 * test-file carve-out). `features/data-transfer/hevy-import-service.ts` is
 * where `lib/csv.ts`'s `parseCsv(text).records` actually gets called and
 * handed to this module.
 *
 * ## Two-level error/skip model (05 §7.2, `M5-tasks.md`'s M5-07 "How")
 *
 * - **Malformed row** (`HevyRowError`): a single data row that is fatally
 *   unusable on its own — missing `title`/`start_time`/`end_time`/
 *   `exercise_title`, or a `start_time`/`end_time` that doesn't parse under
 *   either accepted date format ({@link parseCsvDateTime}). That one row is
 *   dropped *before* grouping (as if it never existed in the file) and
 *   reported with its 1-based source line number — every other row,
 *   including sibling rows of the same workout/exercise, is unaffected.
 *   Garbled-but-non-identity numeric fields (an unparseable `weight_kg`,
 *   `reps`, ...) are deliberately **not** fatal — see
 *   {@link parseNumericOrNull}'s own doc comment for why this is a
 *   documented, deliberate line, not an oversight.
 * - **Skipped workout** (`HevyWorkoutSkip`): after malformed rows are
 *   already gone and the survivors are grouped by `(title, start_time)`
 *   (`groupHevyRows`), a *group* can still be internally inconsistent in a
 *   way that makes the whole workout un-importable — different `end_time`/
 *   `description` values across rows that share the same `(title,
 *   start_time)` key, or a `superset_id`/`exercise_notes` mismatch within
 *   what should be one contiguous exercise occurrence
 *   (`buildExerciseBlocks`). `M5-tasks.md`'s own "all-or-nothing per
 *   workout" line is what this implements — the *whole* group is skipped,
 *   not just the offending row(s), because at that point there's no longer
 *   a well-defined single row to blame.
 *
 * ## Exercise-occurrence grouping: contiguous run of same `exercise_title`
 *
 * A Hevy CSV (and this app's own encoder, `csv-codec.ts`) denormalizes one
 * row per **set**, with `exercise_title`/`superset_id`/`exercise_notes`
 * repeated on every set row of one exercise occurrence — both real Hevy
 * exports and this app's own writer always emit one exercise occurrence as
 * one contiguous block of rows (never interleaved), so
 * {@link buildExerciseBlocks} recovers `workout_exercises`-shaped
 * occurrences by scanning a workout's rows in file order and starting a new
 * block whenever `exercise_title` changes from the immediately preceding
 * row. This also correctly handles the same exercise appearing **twice**,
 * non-consecutively, in one workout (e.g. it's used once early and again
 * later as a superset partner elsewhere) — two separate blocks, two
 * separate `workout_exercises` occurrences, exactly matching what Hevy (and
 * this app) would have exported for that case.
 *
 * ## Exercise-type inference (05 §7.2's 6-rule table) — exact match first,
 * documented fallback second
 *
 * `M5-tasks.md`'s table names exactly 6 populated-column combinations. Real
 * Hevy data always lands cleanly in one of the 6 (an exercise template has
 * exactly one `exercise_type`, so every set row for it will populate the
 * same fixed subset of {weight, reps, distance, duration} columns) — but
 * this function still has to have *some* answer for a combination the table
 * doesn't name (e.g. a hand-edited/malformed fixture with weight+reps+
 * duration all populated for one exercise, or an exercise with literally
 * every set's every optional field empty). {@link inferExerciseType}
 * therefore checks the 6 exact combinations first (matched only when the
 * *other* two metrics are also confirmed absent, not just "these two are
 * present") and falls back to a priority-ordered heuristic — first
 * weight+reps, then reps alone, then weight+duration, then distance+
 * duration, then weight+distance, then duration alone, then an unconditional
 * `weight_reps` last resort — only when no exact combination matched,
 * flagging `ambiguous: true` so the caller can warn about the guess rather
 * than silently trusting it. This exact fallback priority is a genuinely
 * ambiguous spec point without a real-world Hevy export to arbitrate it —
 * documented here and in `docs/plan/EXECUTION-LOG.md`'s M5-07 row.
 */
import { parseCsvDateTime } from './csv-codec';
import { RPE_VALUES, SET_TYPE_VALUES, type ExerciseType, type Rpe, type SetType } from './enums';
import { kmToM, lbToKg, milesToM } from './units';

// ---------------------------------------------------------------------------
// Header / unit resolution
// ---------------------------------------------------------------------------

export interface HevyCsvUnits {
  weightUnit: 'kg' | 'lbs';
  distanceUnit: 'km' | 'miles';
}

interface HevyHeaderColumns {
  title: number;
  startTime: number;
  endTime: number;
  description: number;
  exerciseTitle: number;
  supersetId: number;
  exerciseNotes: number;
  setIndex: number;
  setType: number;
  weight: number;
  reps: number;
  distance: number;
  durationSeconds: number;
  rpe: number;
}

export interface HevyHeaderResolution {
  units: HevyCsvUnits;
  columns: HevyHeaderColumns;
}

/** A whole-file-level problem — no per-row/per-workout salvage is possible (an unrecognizable header means every data row is unreadable). */
export interface HevyHeaderError {
  error: string;
}

const REQUIRED_BASE_COLUMN_NAMES = [
  'title',
  'start_time',
  'end_time',
  'description',
  'exercise_title',
  'superset_id',
  'exercise_notes',
  'set_index',
  'set_type',
  'reps',
  'duration_seconds',
  'rpe',
] as const;

/**
 * Resolves `headerFields` (the CSV's first record) into column indices plus
 * which unit variant the file uses — 05 §7.2: "Accept both metric
 * (`weight_kg`/`distance_km`) and imperial (`weight_lbs`/`distance_miles`)
 * headers." Header name matching is case-insensitive and whitespace-
 * trimmed (a real-world CSV's header row is not guaranteed byte-identical
 * to this app's own encoder output — e.g. a hand-edited fixture with
 * trailing spaces — and there's no cost to tolerating it). Column *order*
 * is deliberately not required to match 05 §7.1's own export order: this
 * reader looks each name up by index rather than assuming position, so a
 * reordered-but-complete header still resolves correctly.
 */
export function resolveHevyHeader(
  headerFields: readonly string[],
): HevyHeaderResolution | HevyHeaderError {
  const normalized = headerFields.map((field) => field.trim().toLowerCase());
  const indexOf = (name: string): number => normalized.indexOf(name);

  const missing = REQUIRED_BASE_COLUMN_NAMES.filter((name) => indexOf(name) === -1);
  if (missing.length > 0) {
    return { error: `Missing required column(s): ${missing.join(', ')}.` };
  }

  const weightKgIndex = indexOf('weight_kg');
  const weightLbsIndex = indexOf('weight_lbs');
  if (weightKgIndex === -1 && weightLbsIndex === -1) {
    return { error: 'Missing weight column: expected "weight_kg" or "weight_lbs".' };
  }
  if (weightKgIndex !== -1 && weightLbsIndex !== -1) {
    return { error: 'Header has both "weight_kg" and "weight_lbs" columns — ambiguous unit.' };
  }

  const distanceKmIndex = indexOf('distance_km');
  const distanceMilesIndex = indexOf('distance_miles');
  if (distanceKmIndex === -1 && distanceMilesIndex === -1) {
    return { error: 'Missing distance column: expected "distance_km" or "distance_miles".' };
  }
  if (distanceKmIndex !== -1 && distanceMilesIndex !== -1) {
    return {
      error: 'Header has both "distance_km" and "distance_miles" columns — ambiguous unit.',
    };
  }

  return {
    units: {
      weightUnit: weightKgIndex !== -1 ? 'kg' : 'lbs',
      distanceUnit: distanceKmIndex !== -1 ? 'km' : 'miles',
    },
    columns: {
      title: indexOf('title'),
      startTime: indexOf('start_time'),
      endTime: indexOf('end_time'),
      description: indexOf('description'),
      exerciseTitle: indexOf('exercise_title'),
      supersetId: indexOf('superset_id'),
      exerciseNotes: indexOf('exercise_notes'),
      setIndex: indexOf('set_index'),
      setType: indexOf('set_type'),
      weight: weightKgIndex !== -1 ? weightKgIndex : weightLbsIndex,
      reps: indexOf('reps'),
      distance: distanceKmIndex !== -1 ? distanceKmIndex : distanceMilesIndex,
      durationSeconds: indexOf('duration_seconds'),
      rpe: indexOf('rpe'),
    },
  };
}

// ---------------------------------------------------------------------------
// Per-row parsing
// ---------------------------------------------------------------------------

export interface HevyParsedRow {
  line: number;
  title: string;
  startTime: number;
  endTime: number;
  description: string | null;
  exerciseTitle: string;
  supersetId: number | null;
  exerciseNotes: string | null;
  /** 0-based hint from the CSV's own `set_index` column — a sort key, not authoritative (see `buildWorkoutDraft`'s own doc comment). `null` when absent/unparseable. */
  setIndex: number | null;
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  rpe: Rpe | null;
}

/** A single fatally-unusable row (see file header, "Two-level error/skip model"). */
export interface HevyRowError {
  line: number;
  reason: string;
}

/** A non-fatal per-row anomaly (unknown `set_type`, out-of-enum RPE) — the row still imports, just with a defaulted/snapped value and a report entry. */
export interface HevyRowWarning {
  line: number;
  message: string;
}

function fieldAt(fields: readonly string[], index: number): string {
  return (fields[index] ?? '').trim();
}

/**
 * `''` -> `null`; otherwise `Number(raw)` if finite, else `null`. Garbled
 * numeric fields (a non-empty, non-numeric `weight_kg`/`reps`/`distance_km`/
 * `duration_seconds` value) are deliberately treated the same as an absent
 * value — silently `null`, never a fatal row error — because these are
 * measurement fields, not identity fields: 05 §7.2's "malformed row" rule
 * is worded around *identity* — "fatally missing a required field like
 * `start_time`" — and every value field in this schema is already nullable
 * by design (`sets.weight_kg REAL`, no `NOT NULL`, `05` §3.2) precisely
 * because "this set doesn't have this metric" is a legitimate, common state
 * (e.g. a `reps_only` exercise's `weight_kg` column is *always* empty).
 * Coercing "unparseable" to the same `null` a legitimately-absent value
 * already gets is the conservative choice — it never fabricates a wrong
 * number, and it never aborts an otherwise-good row over one noisy cell.
 */
function parseNumericOrNull(raw: string): number | null {
  if (raw === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function parseIntOrNull(raw: string): number | null {
  const value = parseNumericOrNull(raw);
  return value === null ? null : Math.round(value);
}

/** Nearest {@link RPE_VALUES} entry to `value` — ties (equidistant from two valid values, e.g. `6.5` between `6` and `7`) resolve to the **lower** value, a deliberate, documented tie-break (no spec guidance either way). */
export function snapRpe(value: number): Rpe {
  let best: Rpe = RPE_VALUES[0];
  let bestDistance = Math.abs(value - best);
  for (const candidate of RPE_VALUES) {
    const distance = Math.abs(value - candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * Parses one data record (`fields` + its 1-based source `line`) against an
 * already-{@link resolveHevyHeader}'d header. Returns either the parsed row
 * plus any non-fatal warnings, or a fatal {@link HevyRowError} — never both,
 * and never throws (see file header, "Two-level error/skip model").
 */
export function parseHevyRow(
  fields: readonly string[],
  header: HevyHeaderResolution,
  line: number,
): { row: HevyParsedRow; warnings: HevyRowWarning[] } | { error: HevyRowError } {
  const c = header.columns;

  const title = fieldAt(fields, c.title);
  if (title === '') {
    return { error: { line, reason: 'Missing title.' } };
  }

  const startTime = parseCsvDateTime(fieldAt(fields, c.startTime));
  if (startTime === null) {
    return { error: { line, reason: 'Missing or unparseable start_time.' } };
  }

  const endTime = parseCsvDateTime(fieldAt(fields, c.endTime));
  if (endTime === null) {
    return { error: { line, reason: 'Missing or unparseable end_time.' } };
  }

  const exerciseTitle = fieldAt(fields, c.exerciseTitle);
  if (exerciseTitle === '') {
    return { error: { line, reason: 'Missing exercise_title.' } };
  }

  const descriptionRaw = fieldAt(fields, c.description);
  const description = descriptionRaw === '' ? null : descriptionRaw;

  const supersetId = parseIntOrNull(fieldAt(fields, c.supersetId));

  const exerciseNotesRaw = fieldAt(fields, c.exerciseNotes);
  const exerciseNotes = exerciseNotesRaw === '' ? null : exerciseNotesRaw;

  const setIndex = parseIntOrNull(fieldAt(fields, c.setIndex));

  const warnings: HevyRowWarning[] = [];

  const setTypeRaw = fieldAt(fields, c.setType);
  let setType: SetType = 'normal';
  if (setTypeRaw !== '') {
    if ((SET_TYPE_VALUES as readonly string[]).includes(setTypeRaw)) {
      setType = setTypeRaw as SetType;
    } else {
      warnings.push({
        line,
        message: `Unrecognized set_type "${setTypeRaw}" — defaulted to "normal".`,
      });
    }
  }

  let weightKg = parseNumericOrNull(fieldAt(fields, c.weight));
  if (weightKg !== null && header.units.weightUnit === 'lbs') {
    weightKg = lbToKg(weightKg);
  }

  const reps = parseIntOrNull(fieldAt(fields, c.reps));

  let distanceMeters = parseNumericOrNull(fieldAt(fields, c.distance));
  if (distanceMeters !== null) {
    // `05` §7.2 accepts either a metric (`distance_km`) or imperial
    // (`distance_miles`) header — canonical storage is always meters
    // (`sets.distance_meters`, `05` §3.2), so *both* variants need
    // conversion here, not just the imperial one. Found via M5-08's own
    // `export(import(hevy.csv))` round-trip test: a `distance_km` value was
    // being stored as if it were already meters (e.g. "5" km silently
    // becoming 5 m instead of 5000 m) — no prior test asserted an exact
    // km-converted value, only `distance_miles`'s conversion was ever
    // checked (`domain/__tests__/hevy-import.test.ts`'s own "converts
    // imperial distance_miles to canonical meters" case), so this slipped
    // through M5-07's own review undetected until the round-trip check
    // could actually compare a km-based value against its canonical form.
    distanceMeters =
      header.units.distanceUnit === 'miles' ? milesToM(distanceMeters) : kmToM(distanceMeters);
  }

  const durationSeconds = parseIntOrNull(fieldAt(fields, c.durationSeconds));

  const rpeRaw = parseNumericOrNull(fieldAt(fields, c.rpe));
  let rpe: Rpe | null = null;
  if (rpeRaw !== null) {
    if ((RPE_VALUES as readonly number[]).includes(rpeRaw)) {
      rpe = rpeRaw as Rpe;
    } else {
      rpe = snapRpe(rpeRaw);
      warnings.push({
        line,
        message: `RPE ${rpeRaw} is outside the valid range (${RPE_VALUES.join(', ')}) — snapped to ${rpe}.`,
      });
    }
  }

  return {
    row: {
      line,
      title,
      startTime,
      endTime,
      description,
      exerciseTitle,
      supersetId,
      exerciseNotes,
      setIndex,
      setType,
      weightKg,
      reps,
      distanceMeters,
      durationSeconds,
      rpe,
    },
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Workout grouping (title, start_time)
// ---------------------------------------------------------------------------

export interface HevyWorkoutGroup {
  title: string;
  startTime: number;
  rows: HevyParsedRow[];
}

/** Groups already-row-validated `rows` by `(title, start_time)` — 05 §7.2's own workout-identity rule — preserving each group's first-seen order and each group's rows' original file order. */
export function groupHevyRows(rows: readonly HevyParsedRow[]): { groups: HevyWorkoutGroup[] } {
  const groupsByKey = new Map<string, HevyWorkoutGroup>();
  const order: string[] = [];

  for (const row of rows) {
    const key = `${row.title} ${row.startTime}`;
    let group = groupsByKey.get(key);
    if (!group) {
      group = { title: row.title, startTime: row.startTime, rows: [] };
      groupsByKey.set(key, group);
      order.push(key);
    }
    group.rows.push(row);
  }

  return { groups: order.map((key) => groupsByKey.get(key) as HevyWorkoutGroup) };
}

// ---------------------------------------------------------------------------
// Exercise-occurrence grouping + workout draft assembly
// ---------------------------------------------------------------------------

export interface ImportSetDraft {
  position: number;
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  rpe: Rpe | null;
}

export interface ImportExerciseOccurrenceDraft {
  position: number;
  exerciseTitle: string;
  supersetId: number | null;
  notes: string | null;
  sets: ImportSetDraft[];
}

export interface ImportWorkoutDraft {
  title: string;
  description: string | null;
  startTime: number;
  endTime: number;
  exercises: ImportExerciseOccurrenceDraft[];
}

/** A whole workout skipped per the "all-or-nothing" rule (see file header). */
export interface HevyWorkoutSkip {
  title: string;
  startTime: number;
  reason: string;
}

interface ExerciseBlock {
  exerciseTitle: string;
  supersetId: number | null;
  notes: string | null;
  rows: HevyParsedRow[];
}

/** See file header, "Exercise-occurrence grouping" — a contiguous run of same-`exerciseTitle` rows becomes one block; returns an error string (not thrown) on an internal `superset_id`/`exercise_notes` mismatch within one block. */
function buildExerciseBlocks(rows: readonly HevyParsedRow[]): { blocks: ExerciseBlock[] } | { error: string } {
  const blocks: ExerciseBlock[] = [];

  for (const row of rows) {
    const last = blocks[blocks.length - 1];
    if (last && last.exerciseTitle === row.exerciseTitle) {
      if (last.supersetId !== row.supersetId || last.notes !== row.exerciseNotes) {
        return {
          error: `Inconsistent superset_id/exercise_notes within one occurrence of exercise "${row.exerciseTitle}".`,
        };
      }
      last.rows.push(row);
    } else {
      blocks.push({
        exerciseTitle: row.exerciseTitle,
        supersetId: row.supersetId,
        notes: row.exerciseNotes,
        rows: [row],
      });
    }
  }

  return { blocks };
}

/** Stable sort by `setIndex` hint (missing hints sort last, in original relative order) — recovers intended set order even if the file's rows arrived out of order; `buildWorkoutDraft` still re-derives the actual 0-based `position` from this sorted order rather than trusting `setIndex` values directly (mirrors `csv-codec.ts`'s own encoder-side reasoning for why `set_index` in the *output* is a derived index, not a passed-through raw value). */
function sortBySetIndexHint(rows: readonly HevyParsedRow[]): HevyParsedRow[] {
  return rows
    .map((row, originalOrder) => ({ row, originalOrder }))
    .sort((a, b) => {
      const ai = a.row.setIndex ?? Number.MAX_SAFE_INTEGER;
      const bi = b.row.setIndex ?? Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.originalOrder - b.originalOrder;
    })
    .map(({ row }) => row);
}

/**
 * Validates one `(title, start_time)` group's internal consistency and, if
 * consistent, assembles it into an {@link ImportWorkoutDraft} ready for the
 * bulk-insert writer. Two consistency checks gate the whole group
 * (`end_time`/`description` must agree across every row — grouping is keyed
 * on `title`+`start_time` alone, so a real inconsistency here means a
 * genuinely malformed file, not a modeling gap) plus whatever
 * {@link buildExerciseBlocks} itself finds; any failure returns a
 * {@link HevyWorkoutSkip} instead of a draft (see file header).
 */
export function buildWorkoutDraft(
  group: HevyWorkoutGroup,
): { draft: ImportWorkoutDraft } | { skip: HevyWorkoutSkip } {
  const first = group.rows[0];

  for (const row of group.rows) {
    if (row.endTime !== first.endTime) {
      return {
        skip: {
          title: group.title,
          startTime: group.startTime,
          reason: 'Inconsistent end_time across rows sharing the same title/start_time.',
        },
      };
    }
    if (row.description !== first.description) {
      return {
        skip: {
          title: group.title,
          startTime: group.startTime,
          reason: 'Inconsistent description across rows sharing the same title/start_time.',
        },
      };
    }
  }

  const blocksResult = buildExerciseBlocks(group.rows);
  if ('error' in blocksResult) {
    return { skip: { title: group.title, startTime: group.startTime, reason: blocksResult.error } };
  }

  const exercises: ImportExerciseOccurrenceDraft[] = blocksResult.blocks.map((block, position) => ({
    position,
    exerciseTitle: block.exerciseTitle,
    supersetId: block.supersetId,
    notes: block.notes,
    sets: sortBySetIndexHint(block.rows).map((row, setPosition) => ({
      position: setPosition,
      setType: row.setType,
      weightKg: row.weightKg,
      reps: row.reps,
      distanceMeters: row.distanceMeters,
      durationSeconds: row.durationSeconds,
      rpe: row.rpe,
    })),
  }));

  return {
    draft: {
      title: group.title,
      description: first.description,
      startTime: group.startTime,
      endTime: first.endTime,
      exercises,
    },
  };
}

// ---------------------------------------------------------------------------
// Top-level pure parse entry point
// ---------------------------------------------------------------------------

export interface HevyImportParseResult {
  units: HevyCsvUnits;
  workouts: ImportWorkoutDraft[];
  skippedWorkouts: HevyWorkoutSkip[];
  malformedRows: HevyRowError[];
  warnings: HevyRowWarning[];
}

/** One already-CSV-parsed record — structurally identical to `lib/csv.ts`'s own `CsvRecord`, independently declared here (see file header, "Input shape"). */
export interface HevyCsvInputRecord {
  fields: string[];
  line: number;
}

/**
 * The pure core of `importHevy` (05 §7.2): `records[0]` is the header,
 * everything after is data. Returns a whole-file {@link HevyHeaderError}
 * only when the header itself can't be resolved (no per-row salvage is
 * possible without knowing which column is which) or the file has no
 * header row at all; otherwise always returns a full
 * {@link HevyImportParseResult}, even one whose `workouts` array is empty
 * (e.g. every row in the file turned out malformed) — never throws.
 */
export function parseHevyCsvRecords(
  records: readonly HevyCsvInputRecord[],
): HevyImportParseResult | HevyHeaderError {
  if (records.length === 0) {
    return { error: 'CSV file is empty — no header row found.' };
  }

  const [headerRecord, ...dataRecords] = records;
  const headerResolution = resolveHevyHeader(headerRecord.fields);
  if ('error' in headerResolution) {
    return headerResolution;
  }

  const parsedRows: HevyParsedRow[] = [];
  const malformedRows: HevyRowError[] = [];
  const warnings: HevyRowWarning[] = [];

  for (const record of dataRecords) {
    const result = parseHevyRow(record.fields, headerResolution, record.line);
    if ('error' in result) {
      malformedRows.push(result.error);
      continue;
    }
    parsedRows.push(result.row);
    warnings.push(...result.warnings);
  }

  const { groups } = groupHevyRows(parsedRows);
  const workouts: ImportWorkoutDraft[] = [];
  const skippedWorkouts: HevyWorkoutSkip[] = [];

  for (const group of groups) {
    const result = buildWorkoutDraft(group);
    if ('skip' in result) {
      skippedWorkouts.push(result.skip);
    } else {
      workouts.push(result.draft);
    }
  }

  return { units: headerResolution.units, workouts, skippedWorkouts, malformedRows, warnings };
}

// ---------------------------------------------------------------------------
// Exercise-type inference (05 §7.2's 6-rule table — see file header)
// ---------------------------------------------------------------------------

export interface ExerciseMetricFlags {
  hasWeight: boolean;
  hasReps: boolean;
  hasDistance: boolean;
  hasDuration: boolean;
}

export interface ExerciseTypeInference {
  exerciseType: ExerciseType;
  /** `true` when no exact 6-rule combination matched and a fallback priority guess was used (see file header) — the caller (`hevy-import-service.ts`) folds this into the auto-created-exercise report entry so a guessed type is never silently indistinguishable from a confident match. */
  ambiguous: boolean;
}

/** Every set drawn from `sets` across however many workouts/occurrences share `exerciseTitle` — the aggregation the caller performs once per unmatched exercise title before calling {@link inferExerciseType} (see file header for why aggregation happens across every occurrence in the file, not just the first). */
export function aggregateExerciseMetricFlags(
  workouts: readonly ImportWorkoutDraft[],
  exerciseTitle: string,
): ExerciseMetricFlags {
  const flags: ExerciseMetricFlags = {
    hasWeight: false,
    hasReps: false,
    hasDistance: false,
    hasDuration: false,
  };

  for (const workout of workouts) {
    for (const exercise of workout.exercises) {
      if (exercise.exerciseTitle !== exerciseTitle) continue;
      for (const set of exercise.sets) {
        if (set.weightKg !== null) flags.hasWeight = true;
        if (set.reps !== null) flags.hasReps = true;
        if (set.distanceMeters !== null) flags.hasDistance = true;
        if (set.durationSeconds !== null) flags.hasDuration = true;
      }
    }
  }

  return flags;
}

/** 05 §7.2's 6-rule table, exact-combination-first with a documented fallback (see file header). */
export function inferExerciseType(flags: ExerciseMetricFlags): ExerciseTypeInference {
  const { hasWeight, hasReps, hasDistance, hasDuration } = flags;

  if (hasWeight && hasReps && !hasDistance && !hasDuration) {
    return { exerciseType: 'weight_reps', ambiguous: false };
  }
  if (hasReps && !hasWeight && !hasDistance && !hasDuration) {
    return { exerciseType: 'reps_only', ambiguous: false };
  }
  if (hasDuration && !hasWeight && !hasReps && !hasDistance) {
    return { exerciseType: 'duration', ambiguous: false };
  }
  if (hasWeight && hasDuration && !hasReps && !hasDistance) {
    return { exerciseType: 'weight_duration', ambiguous: false };
  }
  if (hasDistance && hasDuration && !hasWeight && !hasReps) {
    return { exerciseType: 'distance_duration', ambiguous: false };
  }
  if (hasWeight && hasDistance && !hasReps && !hasDuration) {
    return { exerciseType: 'short_distance_weight', ambiguous: false };
  }

  // Fallback priority for a combination the 6-rule table doesn't name (see
  // file header) — always returns *something*, flagged ambiguous. Only
  // three ordered checks below are actually reachable: every "hasDistance
  // && hasDuration" / "hasWeight && hasDistance" / "hasDuration"-alone case
  // that *isn't* already an exact match above necessarily also has
  // `hasWeight` or `hasReps` true (there are only 4 flags total), which the
  // `hasWeight && hasReps` / `hasReps` / `hasWeight && hasDuration` checks
  // below already intercept first — verified by exhaustively enumerating
  // all 16 boolean combinations (`docs/plan/EXECUTION-LOG.md`'s M5-07 row).
  // The remaining unreachable combinations (`hasWeight` alone, `hasDistance`
  // alone, and everything-false) fall through to the final default.
  if (hasWeight && hasReps) return { exerciseType: 'weight_reps', ambiguous: true };
  if (hasReps) return { exerciseType: 'reps_only', ambiguous: true };
  if (hasWeight && hasDuration) return { exerciseType: 'weight_duration', ambiguous: true };
  return { exerciseType: 'weight_reps', ambiguous: true };
}
