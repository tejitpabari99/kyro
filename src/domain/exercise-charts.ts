/**
 * `domain/exercise-charts.ts` (M4-09) — 04 §4.3: the per-exercise Charts
 * tab's metric list + one-point-per-workout-date series computation. Pure
 * TS, zero I/O (06 §2 dependency rule) — the feature layer
 * (`src/features/exercises/ExerciseChartsTab.tsx`) owns fetching
 * `WorkoutRepository.exerciseHistory(exerciseId)`, reading the
 * `warmup_in_stats` setting, converting canonical values to display units,
 * and building `src/ui/charts/*`'s `ChartPoint[]` from this module's output.
 *
 * ## Metric applicability per `exercise_type` (04 §4.3, verbatim table)
 *
 * | `exercise_type` | Metrics |
 * |---|---|
 * | `weight_reps` | Heaviest, Est 1RM, Best Set Volume, Session Volume, Total Reps |
 * | `bodyweight_reps` | Heaviest, Best Set Volume, Session Volume, Total Reps |
 * | `bodyweight_assisted_reps` | Total Reps |
 * | `reps_only` | Total Reps |
 * | `duration` | Longest Duration, Total Duration |
 * | `weight_duration` | Longest Duration, Total Duration, Heaviest ("+ Heaviest Weight for weighted") |
 * | `distance_duration` | Total Distance, Total Duration, Best Pace |
 * | `short_distance_weight` | Heaviest, Total Distance |
 *
 * `bodyweight_reps` drops Est 1RM and `bodyweight_assisted_reps`/`reps_only`
 * drop every weight-based metric — this mirrors `domain/records.ts`'s own
 * per-type PR eligibility table (04 §5.1: Best Est. 1RM applies to
 * `weight_reps` only; assisted is excluded from Heaviest/volume) rather than
 * reading 04 §4.3's "Rep/weight types" umbrella phrase as "identical metric
 * set for all four rep-based types" — a chart literally titled "Heaviest
 * Weight" or "Estimated 1RM" for a type that can never produce one (assisted
 * has no positive working weight; `reps_only` has no weight column at all)
 * would be a chart of nothing, not a real feature.
 *
 * ## Two metric families, two warm-up rules (deliberate, documented split)
 *
 * - **"Best-of" metrics** (Heaviest Weight, Est 1RM, Best Set Volume,
 *   Longest Duration, Best Pace) are literally the same named quantities as
 *   04 §5.1's PR record types (or, for Best Pace, the same "best single
 *   value this workout produced" shape) — these apply the *exact* same
 *   unconditional non-warm-up-set gate `domain/records.ts`'s
 *   `applyRecordSet` does (04 §5.1's table header: "checked, non-warm-up
 *   sets"), independent of the `warmup_in_stats` toggle. This is also this
 *   task's own acceptance text ("Charts... respect... warm-up exclusion
 *   rules") read together with 04 §4.2's "always excluded from PRs" line —
 *   a Heaviest-Weight *chart* is a trend of the same PR-eligible values the
 *   Records tab shows, so it can't disagree with Records about which sets
 *   count.
 * - **Aggregate/sum metrics** (Session Volume, Total Reps, Total Duration,
 *   Total Distance) are not named anywhere in 04 §5.1's PR table — they are
 *   genuinely dashboard-style stats aggregates (same family as 04 §4.1's
 *   "Aggregate trend" dashboard cards), so they respect the
 *   `warmup_in_stats` setting exactly like `domain/volume.ts`'s
 *   `isStatsEligibleSet`/`setVolumeKg` already do for every other
 *   stats-facing sum in this codebase.
 *
 * ## One point per workout date (04 §4.3)
 *
 * Sets are bucketed by `domain/streaks.ts`'s `localDateKey` (the same local-
 * calendar-day key the calendar/streak feature already established) — the
 * rare "two workouts containing this exercise on the same local day"
 * doesn't need special-casing: every eligible set on that date folds into
 * one running best/sum exactly like a single workout's sets would, which is
 * the correct generalization of "one point per workout" when "workout" is
 * read as "this date's session(s)."
 */
import type { ExerciseType, SetType } from './enums';
import { epley1RM } from './epley';
import { localDateKey } from './streaks';

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export const CHART_METRIC_VALUES = [
  'heaviest_weight',
  'best_1rm',
  'best_set_volume',
  'session_volume',
  'total_reps',
  'longest_duration',
  'total_duration',
  'total_distance',
  'best_pace',
] as const;

export type ChartMetric = (typeof CHART_METRIC_VALUES)[number];

/** Display label per metric (04 §4.3's own names, verbatim). */
export const CHART_METRIC_LABELS: Record<ChartMetric, string> = {
  heaviest_weight: 'Heaviest Weight',
  best_1rm: 'Estimated 1RM',
  best_set_volume: 'Best Set Volume',
  session_volume: 'Session Volume',
  total_reps: 'Total Reps',
  longest_duration: 'Longest Duration',
  total_duration: 'Total Duration',
  total_distance: 'Total Distance',
  best_pace: 'Best Pace',
};

/** `true` for the "best-of" family (unconditional non-warm-up gate) — see file header. `false` (aggregate/sum) respects `warmup_in_stats`. */
function isBestOfMetric(metric: ChartMetric): boolean {
  switch (metric) {
    case 'heaviest_weight':
    case 'best_1rm':
    case 'best_set_volume':
    case 'longest_duration':
    case 'best_pace':
      return true;
    case 'session_volume':
    case 'total_reps':
    case 'total_duration':
    case 'total_distance':
      return false;
    default: {
      const exhaustive: never = metric;
      throw new Error(`exercise-charts.isBestOfMetric: unhandled metric "${exhaustive as string}".`);
    }
  }
}

/** The ordered metric list for one `exercise_type` (04 §4.3's table, file header) — order here is display order (left-to-right in the metric selector). */
export function chartMetricsForExerciseType(exerciseType: ExerciseType): ChartMetric[] {
  switch (exerciseType) {
    case 'weight_reps':
      return ['heaviest_weight', 'best_1rm', 'best_set_volume', 'session_volume', 'total_reps'];
    case 'bodyweight_reps':
      return ['heaviest_weight', 'best_set_volume', 'session_volume', 'total_reps'];
    case 'bodyweight_assisted_reps':
    case 'reps_only':
      return ['total_reps'];
    case 'duration':
      return ['longest_duration', 'total_duration'];
    case 'weight_duration':
      return ['longest_duration', 'total_duration', 'heaviest_weight'];
    case 'distance_duration':
      return ['total_distance', 'total_duration', 'best_pace'];
    case 'short_distance_weight':
      return ['heaviest_weight', 'total_distance'];
    default: {
      const exhaustive: never = exerciseType;
      throw new Error(`exercise-charts.chartMetricsForExerciseType: unhandled exercise_type "${exhaustive as string}".`);
    }
  }
}

// ---------------------------------------------------------------------------
// Range
// ---------------------------------------------------------------------------

export const CHART_RANGE_VALUES = ['3M', '1Y', 'All'] as const;
export type ChartRange = (typeof CHART_RANGE_VALUES)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

/** The inclusive lower epoch-ms bound for `range` relative to `now` (defaults `Date.now()`, injectable for deterministic tests) — `'All'` has no lower bound (`null`). Approximates "3 months"/"1 year" as 91/365 days (calendar-month-accurate bucketing isn't needed for a range *filter*, only for weekly-bucket dashboards elsewhere). */
export function chartRangeStartMs(range: ChartRange, now: number = Date.now()): number | null {
  switch (range) {
    case '3M':
      return now - 91 * DAY_MS;
    case '1Y':
      return now - 365 * DAY_MS;
    case 'All':
      return null;
    default: {
      const exhaustive: never = range;
      throw new Error(`exercise-charts.chartRangeStartMs: unhandled range "${exhaustive as string}".`);
    }
  }
}

// ---------------------------------------------------------------------------
// Input shape
// ---------------------------------------------------------------------------

/** The subset of `ExerciseHistorySet` (`src/data/workouts/types.ts`) chart computation needs — structurally compatible with (not importing, 06 §2) that type. */
export interface ChartSetInput {
  workoutStartTime: number;
  exerciseType: ExerciseType;
  setType: SetType;
  isCompleted: boolean;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceMeters: number | null;
}

/** One computed chart point — `dateKey` is the local calendar date this point aggregates (`domain/streaks.ts`'s `localDateKey`); `epochMs` is the first eligible set's own `workoutStartTime` on that date (always falls within the local day `dateKey` identifies), used for x-axis positioning/range filtering. */
export interface ChartDatePoint {
  dateKey: string;
  epochMs: number;
  value: number;
}

// ---------------------------------------------------------------------------
// Eligibility gates (mirrors `domain/records.ts` / `domain/volume.ts` — see
// file header for why these are deliberately two different gates).
// ---------------------------------------------------------------------------

function isBestOfEligible(set: ChartSetInput): boolean {
  return set.isCompleted && set.setType !== 'warmup';
}

function isAggregateEligible(set: ChartSetInput, warmupInStats: boolean): boolean {
  if (!set.isCompleted) return false;
  if (set.setType === 'warmup' && !warmupInStats) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Per-set candidate value for one metric — `null` when this set doesn't
// contribute (wrong type for this metric, missing/zero value, etc; see
// `domain/records.ts`'s own value-level exclusions, mirrored here for the
// "best-of" family).
// ---------------------------------------------------------------------------

function candidateValue(set: ChartSetInput, metric: ChartMetric): number | null {
  const { weightKg, reps, durationSeconds, distanceMeters } = set;

  switch (metric) {
    case 'heaviest_weight':
      return weightKg !== null && weightKg > 0 ? weightKg : null;
    case 'best_1rm': {
      if (weightKg === null || weightKg <= 0 || reps === null) return null;
      return epley1RM(weightKg, reps);
    }
    case 'best_set_volume':
    case 'session_volume': {
      if (weightKg === null || weightKg <= 0 || reps === null || reps <= 0) return null;
      return weightKg * reps;
    }
    case 'total_reps':
      return reps !== null && reps > 0 ? reps : null;
    case 'longest_duration':
    case 'total_duration':
      return durationSeconds !== null && durationSeconds > 0 ? durationSeconds : null;
    case 'total_distance':
      return distanceMeters !== null && distanceMeters > 0 ? distanceMeters : null;
    case 'best_pace': {
      // Pace = seconds per meter, canonical; "best" = lowest (fastest).
      // Excludes zero/missing distance (division-by-zero guard) and
      // zero/missing duration (no useful pace from an instantaneous split).
      if (
        distanceMeters === null ||
        distanceMeters <= 0 ||
        durationSeconds === null ||
        durationSeconds <= 0
      ) {
        return null;
      }
      return durationSeconds / distanceMeters;
    }
    default: {
      const exhaustive: never = metric;
      throw new Error(`exercise-charts.candidateValue: unhandled metric "${exhaustive as string}".`);
    }
  }
}

/** `true` when a new candidate improves over the running bucket value for `metric` — "best-of" metrics keep the max, except `best_pace` which keeps the min (lower = faster); aggregate metrics always fold via `+=` (handled by the caller, not this predicate). */
function improves(metric: ChartMetric, candidate: number, current: number): boolean {
  return metric === 'best_pace' ? candidate < current : candidate > current;
}

/**
 * The full date series for one `metric` over `sets` (unsorted input is
 * fine — this function sorts internally), 04 §4.3's "one point per workout
 * date." `sets` should already be scoped to one exercise (the caller's
 * `WorkoutRepository.exerciseHistory(exerciseId)` result) — this function
 * doesn't filter by exercise itself. Returns points sorted ascending by
 * `epochMs`; a date with no eligible set for `metric` simply has no point
 * (never a `0`-valued one) — `src/ui/charts/*`'s own gap convention (`04
 * §6`) is a *feature-layer* concern for weekly-bucket dashboards with fixed
 * x-positions; a per-exercise date series has no fixed x-grid to begin
 * with, so there is nothing to gap-fill here.
 */
export function computeChartSeries(
  sets: readonly ChartSetInput[],
  metric: ChartMetric,
  warmupInStats: boolean,
): ChartDatePoint[] {
  const isBestOf = isBestOfMetric(metric);
  const buckets = new Map<string, { epochMs: number; value: number }>();

  for (const set of sets) {
    const eligible = isBestOf ? isBestOfEligible(set) : isAggregateEligible(set, warmupInStats);
    if (!eligible) continue;

    const candidate = candidateValue(set, metric);
    if (candidate === null) continue;

    const dateKey = localDateKey(set.workoutStartTime);
    const existing = buckets.get(dateKey);

    if (!existing) {
      buckets.set(dateKey, { epochMs: set.workoutStartTime, value: candidate });
      continue;
    }

    if (isBestOf) {
      if (improves(metric, candidate, existing.value)) {
        existing.value = candidate;
      }
    } else {
      existing.value += candidate;
    }
  }

  return Array.from(buckets.entries())
    .map(([dateKey, { epochMs, value }]) => ({ dateKey, epochMs, value }))
    .sort((a, b) => a.epochMs - b.epochMs);
}
