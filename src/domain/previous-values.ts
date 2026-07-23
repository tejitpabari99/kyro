/**
 * `domain/previous-values.ts` (M2-04) — 02 §6/§16.6, 04 §2.3: pure mapping
 * from a previous-session's logged sets + the current exercise card's row
 * list to a per-row PREVIOUS display (grey compact label + tap-to-autofill
 * payload). No I/O — the repository query (`WorkoutRepository.previousSets`,
 * M2-02) and the settings read (`previous_values_mode`,
 * `src/data/settings/settings-schema.ts`) both happen upstream; this module
 * only knows how to turn their outputs into what one exercise card's rows
 * should show.
 *
 * ## Division of responsibility (read before adding a test here)
 *
 * 08 §4.8 names three previous-values cases: "any_workout vs same_routine",
 * "occurrence matching for duplicated exercise (02 §16.6)", and
 * "fewer-previous-sets -> `—`". The **first two are resolved upstream**, at
 * the repository call site — `previousSets(exerciseId, {routineId?,
 * occurrenceIndex?})`'s own options (already integration-tested against a
 * real DB in `workout-repository.mutators.test.ts`, M2-02, exactly per that
 * file's own "previousSets: any_workout / same_routine / occurrence /
 * fewer-previous-sets" scope note) — by the time a `PreviousSetLike[]`
 * array reaches this module, "which mode" and "which occurrence" have
 * already been baked into *which array* was fetched. This module is
 * intentionally **mode-agnostic**: it maps whatever array it is handed,
 * correctly, every time — the tests below exercise that mode-agnosticism
 * directly (two different arrays representing an any_workout-mode result
 * vs. a same_routine-mode result for the same exercise, both mapped
 * correctly) rather than re-testing the SQL query logic that already has
 * its own integration coverage. **"fewer-previous-sets -> `—`"** *is* this
 * module's own concern (a genuine per-row mapping decision) and is tested
 * directly here.
 *
 * ## Bucketing (02 §6: "warm-up rows reference the previous session's
 * warm-up sets by warm-up index")
 *
 * `previousSets` (M2-02) already splits its results into two
 * independently-numbered buckets — warm-up and non-warm-up — each
 * 0-indexed in the previous session's own row order (`PreviousSet
 * .bucketIndex`/`.isWarmup`, `src/data/workouts/types.ts`). This module
 * mirrors that exact bucketing scheme for the **current** row list
 * ({@link computeCurrentRowBuckets}) so a current row's own
 * warm-up-relative or working-set-relative position can be matched against
 * `PreviousSet.bucketIndex` — "the i-th checked non-warm-up set" and "the
 * i-th warm-up set" are two independent counters, exactly like the
 * repository side.
 *
 * ## Display units
 *
 * Weight/distance formatting reuses `domain/units.ts` (M1-02) —
 * `formatWeightLb`, `formatDistanceKm`/`formatDistanceMiles`,
 * `formatDistanceFeet`, `formatDuration` — never reimplemented here. Per 05
 * §5's own accounting, `short_distance_weight`'s METERS column is the one
 * exception that does *not* follow `distance_unit`'s km/miles split: it
 * displays meters (metric) or feet (imperial), the same "short distance"
 * pairing `formatDistanceFeet`'s own doc comment already describes.
 */
import type { ExerciseType, Rpe, SetType } from './enums';
import { formatDistanceFeet, formatDistanceKm, formatDistanceMiles, formatDuration, formatWeightLb } from './units';

// ---------------------------------------------------------------------------
// Input shapes — structurally compatible with (never importing, 06 §2:
// src/domain must not depend on src/data) the data-layer shapes they mirror.
// ---------------------------------------------------------------------------

/** Mirrors `src/data/workouts/types.ts`'s `PreviousSet` — the shape `WorkoutRepository.previousSets()` (M2-02) returns. */
export interface PreviousSetLike {
  bucketIndex: number;
  isWarmup: boolean;
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  rpe: Rpe | null;
  customMetric: number | null;
}

/**
 * A routine's per-row target (02 §6: "No match -> routine targets (if any)
 * -> `—`"; 04 §2.3's rep-range exception). Routines themselves don't exist
 * until M3 — this shape is the forward-compatible fallback input, provided
 * per-row by the caller whenever the active workout was started from a
 * routine and has a target for that row; `undefined`/`null` when there is
 * none (the common case pre-M3, and for any non-routine workout always).
 */
export interface RoutineTargetLike {
  weightKg?: number | null;
  reps?: number | null;
  /**
   * A rep-**range** label, e.g. `"6-8"` (04 §2.3). When present, `reps`
   * above should be omitted/`null` — the range is shown as PREVIOUS text
   * but never autofills a concrete `reps` value (04 §2.3: "not committable
   * placeholders — reps must be typed").
   */
  repRangeLabel?: string | null;
  distanceMeters?: number | null;
  durationSeconds?: number | null;
  customMetric?: number | null;
}

/** One current exercise card row — just enough to bucket it (warm-up vs. working, and its index within that bucket) and to know its own routine-target fallback. Rows must be passed **in on-screen (position) order** — the same ordering `previousSets`' own bucketing assumes on the previous-session side. */
export interface CurrentRowLike {
  id: string;
  setType: SetType;
  routineTarget?: RoutineTargetLike | null;
}

export interface PreviousValueDisplayOptions {
  weightUnit: 'kg' | 'lbs';
  distanceUnit: 'km' | 'miles';
}

/** The autofill payload PREVIOUS-tap writes into a row's inputs (02 §4: "Tap autofills current row's inputs with those values (editable after)") — canonical units, ready to hand to `WorkoutRepository.updateSet`/the store's `updateSet` action. `reps: null` when the only available source is a rep-range target (never autofills a range as a concrete number, 04 §2.3). */
export interface PreviousAutofill {
  weightKg: number | null;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  customMetric: number | null;
}

export interface PreviousValueResult {
  /** The grey compact PREVIOUS-cell text (02 §4's examples: `45kg × 9`, `+10kg × 8`, …), or `null` — render as `—`. */
  label: string | null;
  /** Tap-to-autofill payload, or `null` when {@link label} is `null`. */
  autofill: PreviousAutofill | null;
  /** Where `label` came from — `'none'` when both a real previous set and a routine target are absent. */
  source: 'previous' | 'routine_target' | 'none';
  /** `true` when the label came from a rep-**range** routine target (04 §2.3) — the row's check-flow (M2-07) must not auto-commit `reps` from this placeholder even though a label is shown. */
  isRepRange: boolean;
}

// ---------------------------------------------------------------------------
// Bucketing — mirrors `WorkoutRepositoryImpl.previousSets`'s own scheme.
// ---------------------------------------------------------------------------

/** For each row (in position order), its `{isWarmup, bucketIndex}` — warm-up and non-warm-up rows are counted independently, exactly like `previousSets`' own two buckets (see file header). */
export function computeCurrentRowBuckets(
  rows: readonly CurrentRowLike[],
): { isWarmup: boolean; bucketIndex: number }[] {
  let warmupCount = 0;
  let workingCount = 0;
  return rows.map((row) => {
    const isWarmup = row.setType === 'warmup';
    const bucketIndex = isWarmup ? warmupCount : workingCount;
    if (isWarmup) {
      warmupCount += 1;
    } else {
      workingCount += 1;
    }
    return { isWarmup, bucketIndex };
  });
}

// ---------------------------------------------------------------------------
// Formatting — row-type (exercise_type) aware, 02 §4's examples.
// ---------------------------------------------------------------------------

function weightSuffix(unit: 'kg' | 'lbs'): string {
  return unit === 'kg' ? 'kg' : 'lb';
}

function displayWeight(weightKg: number, unit: 'kg' | 'lbs'): number {
  return unit === 'kg' ? weightKg : (formatWeightLb(weightKg) as number);
}

function displayDistanceKmMi(distanceMeters: number, unit: 'km' | 'miles'): { value: number; suffix: string } {
  return unit === 'km'
    ? { value: formatDistanceKm(distanceMeters) as number, suffix: 'km' }
    : { value: formatDistanceMiles(distanceMeters) as number, suffix: 'mi' };
}

/** `short_distance_weight`'s METERS column — meters (metric) or feet (imperial), per 05 §5; does not follow `distance_unit`'s km/mi split. */
function displayShortDistance(distanceMeters: number, unit: 'km' | 'miles'): { value: number; suffix: string } {
  return unit === 'km'
    ? { value: Math.round(distanceMeters), suffix: 'm' }
    : { value: formatDistanceFeet(distanceMeters) as number, suffix: 'ft' };
}

/** A normalized value bag both `PreviousSetLike` and `RoutineTargetLike` reduce to before formatting — keeps {@link formatLabel} a single implementation for both sources. */
interface ValueBag {
  weightKg: number | null;
  reps: number | null;
  repRangeLabel: string | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
}

function formatLabel(exerciseType: ExerciseType, values: ValueBag, options: PreviousValueDisplayOptions): string | null {
  const weightUnit = options.weightUnit;
  const distanceUnit = options.distanceUnit;

  switch (exerciseType) {
    case 'weight_reps': {
      if (values.weightKg === null || (values.reps === null && values.repRangeLabel === null)) {
        return null;
      }
      const repsText = values.repRangeLabel ?? String(values.reps);
      return `${displayWeight(values.weightKg, weightUnit)}${weightSuffix(weightUnit)} × ${repsText}`;
    }
    case 'reps_only': {
      if (values.reps === null && values.repRangeLabel === null) {
        return null;
      }
      return values.repRangeLabel ?? String(values.reps);
    }
    case 'bodyweight_reps': {
      if (values.reps === null && values.repRangeLabel === null) {
        return null;
      }
      const repsText = values.repRangeLabel ?? String(values.reps);
      const weight = values.weightKg ?? 0;
      return `+${displayWeight(weight, weightUnit)}${weightSuffix(weightUnit)} × ${repsText}`;
    }
    case 'bodyweight_assisted_reps': {
      if (values.reps === null && values.repRangeLabel === null) {
        return null;
      }
      const repsText = values.repRangeLabel ?? String(values.reps);
      const weight = values.weightKg ?? 0;
      return `−${displayWeight(weight, weightUnit)}${weightSuffix(weightUnit)} × ${repsText}`;
    }
    case 'duration': {
      if (values.durationSeconds === null) {
        return null;
      }
      return formatDuration(values.durationSeconds) as string;
    }
    case 'weight_duration': {
      if (values.weightKg === null || values.durationSeconds === null) {
        return null;
      }
      return `${displayWeight(values.weightKg, weightUnit)}${weightSuffix(weightUnit)} / ${formatDuration(values.durationSeconds)}`;
    }
    case 'distance_duration': {
      if (values.distanceMeters === null || values.durationSeconds === null) {
        return null;
      }
      const { value, suffix } = displayDistanceKmMi(values.distanceMeters, distanceUnit);
      return `${value}${suffix} / ${formatDuration(values.durationSeconds)}`;
    }
    case 'short_distance_weight': {
      if (values.weightKg === null || values.distanceMeters === null) {
        return null;
      }
      const { value, suffix } = displayShortDistance(values.distanceMeters, distanceUnit);
      return `${displayWeight(values.weightKg, weightUnit)}${weightSuffix(weightUnit)} / ${value}${suffix}`;
    }
    default: {
      const exhaustive: never = exerciseType;
      throw new Error(`previous-values.formatLabel: unhandled exercise_type "${exhaustive as string}".`);
    }
  }
}

function previousSetToValueBag(previous: PreviousSetLike): ValueBag {
  return {
    weightKg: previous.weightKg,
    reps: previous.reps,
    repRangeLabel: null,
    distanceMeters: previous.distanceMeters,
    durationSeconds: previous.durationSeconds,
  };
}

function routineTargetToValueBag(target: RoutineTargetLike): ValueBag {
  return {
    weightKg: target.weightKg ?? null,
    reps: target.repRangeLabel ? null : (target.reps ?? null),
    repRangeLabel: target.repRangeLabel ?? null,
    distanceMeters: target.distanceMeters ?? null,
    durationSeconds: target.durationSeconds ?? null,
  };
}

function autofillFrom(values: ValueBag): PreviousAutofill {
  return {
    weightKg: values.weightKg,
    // A rep-range never autofills a concrete number (04 §2.3) — the field
    // stays empty (grey placeholder text only) even though a label shows.
    reps: values.repRangeLabel !== null ? null : values.reps,
    distanceMeters: values.distanceMeters,
    durationSeconds: values.durationSeconds,
    customMetric: null,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Map one exercise card's current rows to their PREVIOUS display, in the
 * same order as `currentRows`. `previousSets` is whatever
 * `WorkoutRepository.previousSets(exerciseId, {...})` already resolved
 * (mode/occurrence baked in upstream — see file header); a row whose own
 * `{isWarmup, bucketIndex}` has no match there falls back to that row's own
 * `routineTarget`, and finally to `—` (`label: null`).
 */
export function computePreviousValues(
  exerciseType: ExerciseType,
  currentRows: readonly CurrentRowLike[],
  previousSets: readonly PreviousSetLike[],
  options: PreviousValueDisplayOptions,
): PreviousValueResult[] {
  const buckets = computeCurrentRowBuckets(currentRows);

  return currentRows.map((row, index) => {
    const { isWarmup, bucketIndex } = buckets[index]!;
    const match = previousSets.find((p) => p.isWarmup === isWarmup && p.bucketIndex === bucketIndex);

    if (match) {
      const values = previousSetToValueBag(match);
      return {
        label: formatLabel(exerciseType, values, options),
        autofill: autofillFrom(values),
        source: 'previous',
        isRepRange: false,
      };
    }

    if (row.routineTarget) {
      const values = routineTargetToValueBag(row.routineTarget);
      return {
        label: formatLabel(exerciseType, values, options),
        autofill: autofillFrom(values),
        source: 'routine_target',
        isRepRange: values.repRangeLabel !== null,
      };
    }

    return { label: null, autofill: null, source: 'none', isRepRange: false };
  });
}
