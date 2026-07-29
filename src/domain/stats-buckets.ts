/**
 * `domain/stats-buckets.ts` (M4-08, 04 §4.1-4.2, 05 §4/§6) — pure
 * aggregation logic for the Profile → Statistics dashboard: range ->
 * query-bound resolution, weekly/monthly bucketing (first-day-of-week
 * aware, with the "All range, > 2 y span -> monthly" switch, 08 §4.8),
 * volume/duration/reps trend aggregation (reusing `domain/volume.ts`,
 * M2-04 — never reimplemented here), and the muscle-group weighting rule
 * (primary muscle counts 1, each secondary counts 0.5) both the muscle-
 * distribution card and the per-muscle-group weekly stack share.
 *
 * Pure TS, zero React/RN/Expo/`src/data` imports (06 §2 dependency rule,
 * same posture `domain/streaks.ts`/`domain/volume.ts` already establish) —
 * every input here is a plain value or a {@link StatsFeedRow}, never a
 * repository call. `src/data/workouts/types.ts` imports {@link
 * StatsFeedRow} from here and re-exports it (mirrors that file's existing
 * `HistoricalSet` re-export from `domain/records` and `WorkoutDateCount`
 * re-export from `domain/streaks`) — this module owns the shape,
 * `WorkoutRepositoryImpl.statsFeed` produces it.
 *
 * ## The feed: one row per set, carrying its own workout + exercise context
 *
 * 05 §4's query-performance note is exact: "Stats buckets: computed in TS
 * from a single ranged query of `(workout start_time, exercise_id,
 * primary_muscle_group, set fields)`; avoid N+1." {@link StatsFeedRow} is
 * that row shape — `WorkoutRepositoryImpl.statsFeed` joins `sets` ->
 * `workout_exercises` -> `workouts` -> `exercises` in one indexed query
 * (`idx_workouts_start`) so every set already carries its own workout's
 * `start_time`/`end_time` and its exercise's `primary_muscle_group`/
 * `secondary_muscle_groups` inline — no per-exercise lookup loop the way a
 * naive per-exercise `setsForExercise` fan-out would need. Every bucketing
 * function below operates purely over an already-fetched `StatsFeedRow[]`
 * for exactly this reason.
 *
 * Multiple rows share one `workoutId` (one per set) — any aggregate that is
 * inherently **per-workout** (workout count, session duration) dedupes by
 * `workoutId` before folding; anything **per-set** (volume, reps, muscle
 * weight) sums every eligible row directly. Getting this dedupe wrong
 * would double-count a workout's duration once per set it logged — every
 * function below that touches `workoutEndTime` documents its own dedupe
 * step explicitly.
 *
 * ## Warm-up / checked-set gating — reuses `domain/volume.ts`, never reimplemented
 *
 * "Only checked sets of completed workouts count anywhere" + "warm-up sets
 * excluded from volume/sets/reps stats when the setting is off" (04 §4.2)
 * is *exactly* {@link isStatsEligibleSet}'s own contract (`domain/volume.ts`,
 * M2-04) — every aggregate here (trend volume/reps, muscle distribution,
 * the per-muscle-group weekly stack) gates through that one function
 * rather than re-deriving the rule, and every volume number specifically
 * reuses {@link setVolumeKg} (same file) for the per-type formula (P7:
 * bodyweight `+10x8=80`, assisted/reps-only `=0`, 04 §4's own acceptance
 * line). **Records are untouched by any of this** — `domain/records.ts`'s
 * own PR engine already always excludes warm-ups regardless of this
 * setting (04 §4.2: "always excluded from PRs and set records") and never
 * imports anything from this file, so flipping `warmup_in_stats` can only
 * ever move dashboard numbers, never a Records tab value (04 §4.3's own
 * acceptance line, "warm-up toggle flips dashboard live but never Records").
 *
 * ## Bucket-fill, not just bucket-group — charts must show zero weeks too
 *
 * A bar/line chart over "the last 3 months" that only plots weeks with at
 * least one workout would silently compress a genuinely sparse history
 * into a shorter-looking chart (missing weeks just... don't appear,
 * visually indistinguishable from "the range is shorter than it is").
 * Every per-bucket function here therefore first builds the *complete*
 * ordered list of bucket start timestamps spanning the resolved display
 * range ({@link buildBucketStarts}), then fills each with whatever real
 * data lands in it (defaulting to `0`/count `0`) — the same "default
 * missing keys to 0" convention `calendar-month-model.ts`'s `buildMonthGrid`
 * already established for the calendar grid.
 *
 * ## Range resolution: query bounds vs. display-fill bounds
 *
 * Two distinct concerns, both handled here so the feature screen never has
 * to reason about date math itself:
 *
 *  - {@link rangeQueryBounds} — what to pass to `WorkoutRepository.statsFeed`
 *    for a given `DashboardRangeKey`: `{start, end}` computed back from
 *    "now" via `Date` accessors (never raw ms offsets — DST-safe, same
 *    posture `domain/streaks.ts`'s file header establishes) for every
 *    bounded range; `{}` (no bound at all) for `'all'`, since "All" means
 *    the caller's entire history and there's no natural lower bound to
 *    guess before the data comes back.
 *  - {@link displayRangeBounds} — the bounds bucket-filling actually spans.
 *    For a bounded range this is identical to the query bounds. For `'all'`
 *    there is no a-priori start, so it falls back to the *earliest row's*
 *    own `workoutStartTime` in the just-fetched `rows` (an empty history
 *    collapses to `{start: now, end: now}` — zero buckets, correctly empty).
 *
 * ## All-range monthly switch (08 §4.8's own bucketing-suite line)
 *
 * 04 §4.1's aggregate-trend card is explicit: "weekly buckets (monthly when
 * range = All and span > 2 y)". {@link chooseTrendGranularity} is that
 * decision, and it is the *only* place this module switches granularity —
 * the "Workouts per week" bar card and the "Sets per muscle group per week"
 * stack are both spelled "per week" verbatim in 04 §4.1 items 1/4 with no
 * monthly-switch language attached to either, so {@link
 * bucketWorkoutsPerWeek} / {@link bucketSetsPerMuscleGroupPerWeek} always
 * bucket weekly regardless of range — a deliberate, spec-literal reading,
 * not an oversight. "Span" is computed off the actual fetched rows' min/max
 * `workoutStartTime` (not `now - firstEverWorkout`), via calendar-correct
 * `Date#setFullYear` arithmetic (same "add years the exact way `Date`
 * itself defines a year" posture as everywhere else in this module) rather
 * than a flat `2 * 365.25 * 86_400_000` ms constant.
 *
 * ## Muscle-group weighting: one shared rule, two consumers
 *
 * 04 §4.1 item 3 states the weighting rule explicitly for the muscle-
 * distribution card ("primary muscle of the exercise; secondary muscles
 * count 0.5") but is silent on whether item 4's "sets per muscle group per
 * week" stack uses the same weighting or a plain per-set primary-only
 * count. Judgment call, made explicitly here rather than silently: both
 * charts answer the same underlying question ("how much of this
 * range's training landed on muscle group X"), so {@link
 * bucketSetsPerMuscleGroupPerWeek} reuses the identical primary=1/
 * secondary=0.5 rule ({@link accumulateMuscleWeights}) rather than
 * inventing a second, inconsistent scheme — and it picks its own top-8
 * muscle groups from {@link computeMuscleDistribution}'s own range-wide
 * totals, so the weekly stack's top-8 selection and the distribution
 * card's own bar order agree by construction whenever both are showing the
 * same range.
 */
import type { ExerciseType, FirstDayOfWeek, MuscleGroup, SetType } from './enums';
import { isStatsEligibleSet, setVolumeKg, type VolumeSetInput } from './volume';
import { startOfWeek } from './streaks';

// ---------------------------------------------------------------------------
// Feed row shape (05 §4's "single ranged query" contract)
// ---------------------------------------------------------------------------

/**
 * One `sets` row joined with its owning workout's `start_time`/`end_time`
 * and its exercise's `exercise_type`/`primary_muscle_group`/
 * `secondary_muscle_groups` — `WorkoutRepository.statsFeed`'s own row shape
 * (05 §6). Structurally compatible with `domain/volume.ts`'s
 * {@link VolumeSetInput} (same `exerciseType`/`setType`/`weightKg`/`reps`/
 * `isCompleted` fields) so every volume/eligibility helper in that module
 * applies directly with no adapter.
 */
export interface StatsFeedRow {
  workoutId: string;
  workoutStartTime: number;
  /** `null` only for an active workout's own sets — never actually returned by `statsFeed` (05 §6: completed workouts only), kept nullable defensively so a caller narrowing this type doesn't have to assume otherwise. */
  workoutEndTime: number | null;
  exerciseId: string;
  exerciseType: ExerciseType;
  primaryMuscleGroup: MuscleGroup;
  secondaryMuscleGroups: readonly MuscleGroup[];
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  isCompleted: boolean;
}

// ---------------------------------------------------------------------------
// Range keys + query-bound resolution
// ---------------------------------------------------------------------------

/** Every range key any dashboard card ever offers — see `DASHBOARD_CHART_RANGES`/`MUSCLE_DISTRIBUTION_RANGES` below for which subset each card actually shows. */
export type DashboardRangeKey = '7d' | '30d' | '3m' | '1y' | 'all';

/** 04 §4.1's own range list for the "Workouts per week" / "Aggregate trend" / "Sets per muscle group per week" cards. */
export const DASHBOARD_CHART_RANGES: readonly DashboardRangeKey[] = ['3m', '1y', 'all'];

/** 04 §4.1 item 3's own, wider range list for the muscle-distribution card specifically. */
export const MUSCLE_DISTRIBUTION_RANGES: readonly DashboardRangeKey[] = ['7d', '30d', '3m', '1y', 'all'];

/** `WorkoutRepository.statsFeed`'s own range input shape — structurally identical to `WorkoutDatesRange` (`data/workouts/types.ts`), defined independently here since `src/domain` may not import from `src/data` (06 §2). */
export interface RangeQueryBounds {
  start?: number;
  end?: number;
}

/**
 * What to pass to `WorkoutRepository.statsFeed` for `range` — see file
 * header ("Range resolution"). Every bounded range computes `start` back
 * from `now` via `Date` accessors (DST-safe calendar arithmetic, never a
 * flat ms offset); `'all'` returns `{}` (no bound — the caller's entire
 * history).
 */
export function rangeQueryBounds(range: DashboardRangeKey, now: Date = new Date()): RangeQueryBounds {
  if (range === 'all') {
    return {};
  }

  const start = new Date(now);
  switch (range) {
    case '7d':
      start.setDate(start.getDate() - 7);
      break;
    case '30d':
      start.setDate(start.getDate() - 30);
      break;
    case '3m':
      start.setMonth(start.getMonth() - 3);
      break;
    case '1y':
      start.setFullYear(start.getFullYear() - 1);
      break;
    default: {
      const exhaustive: never = range;
      throw new Error(`stats-buckets.rangeQueryBounds: unhandled range "${exhaustive as string}".`);
    }
  }
  return { start: start.getTime(), end: now.getTime() };
}

/**
 * The bounds bucket-filling actually spans — see file header ("Range
 * resolution"). Identical to {@link rangeQueryBounds} for a bounded range;
 * for `'all'`, falls back to the earliest fetched row's own
 * `workoutStartTime` (an empty `rows` collapses to `{start: now, end:
 * now}`, i.e. zero buckets — correctly empty, never a crash on `Math.min()`
 * of an empty array).
 */
export function displayRangeBounds(
  range: DashboardRangeKey,
  rows: readonly Pick<StatsFeedRow, 'workoutStartTime'>[],
  now: Date = new Date(),
): { start: number; end: number } {
  const queried = rangeQueryBounds(range, now);
  if (queried.start !== undefined) {
    return { start: queried.start, end: queried.end ?? now.getTime() };
  }

  const nowMs = now.getTime();
  const earliest = rows.reduce((min, row) => Math.min(min, row.workoutStartTime), nowMs);
  return { start: earliest, end: nowMs };
}

// ---------------------------------------------------------------------------
// Bucket-grid construction (week/month, first-day-of-week aware)
// ---------------------------------------------------------------------------

export type BucketGranularity = 'week' | 'month';

function weekBucketStart(epochMs: number, firstDayOfWeek: FirstDayOfWeek): number {
  return startOfWeek(new Date(epochMs), firstDayOfWeek).getTime();
}

function monthBucketStart(epochMs: number): number {
  const date = new Date(epochMs);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

function bucketStart(epochMs: number, granularity: BucketGranularity, firstDayOfWeek: FirstDayOfWeek): number {
  return granularity === 'week' ? weekBucketStart(epochMs, firstDayOfWeek) : monthBucketStart(epochMs);
}

function nextBucketStart(epochMs: number, granularity: BucketGranularity): number {
  const date = new Date(epochMs);
  if (granularity === 'week') {
    date.setDate(date.getDate() + 7);
  } else {
    date.setMonth(date.getMonth() + 1);
  }
  return date.getTime();
}

/**
 * The complete, gap-free, ordered list of bucket-start timestamps spanning
 * `bounds` — see file header ("Bucket-fill, not just bucket-group"). Every
 * per-bucket aggregator below fills exactly this list, defaulting an
 * unrepresented bucket to its own zero value.
 */
export function buildBucketStarts(
  bounds: { start: number; end: number },
  granularity: BucketGranularity,
  firstDayOfWeek: FirstDayOfWeek,
): number[] {
  const starts: number[] = [];
  const endBucket = bucketStart(bounds.end, granularity, firstDayOfWeek);
  let cursor = bucketStart(bounds.start, granularity, firstDayOfWeek);

  // Defensive iteration cap: a caller-supplied `bounds` spanning an
  // absurd range (corrupt data, a `start` far in the future of `end`)
  // must not spin forever — 10 000 buckets is far beyond any realistic
  // multi-decade weekly span (10 000 weeks ~= 192 years) and comfortably
  // covers "All" for any real workout history.
  const ITERATION_CAP = 10_000;
  for (let i = 0; cursor <= endBucket && i < ITERATION_CAP; i += 1) {
    starts.push(cursor);
    cursor = nextBucketStart(cursor, granularity);
  }
  return starts;
}

const MONTHLY_SWITCH_THRESHOLD_YEARS = 2;

/**
 * "Monthly when range = All and span > 2 y" (04 §4.1 item 2) — see file
 * header for why this is the *only* granularity switch in this module.
 * Span is measured off `rows`' own min/max `workoutStartTime` (calendar-
 * correct `Date#setFullYear`, not a flat ms constant); an empty or
 * non-`'all'` input always stays `'week'`.
 */
export function chooseTrendGranularity(
  range: DashboardRangeKey,
  rows: readonly Pick<StatsFeedRow, 'workoutStartTime'>[],
): BucketGranularity {
  if (range !== 'all' || rows.length === 0) {
    return 'week';
  }

  let min = rows[0]!.workoutStartTime;
  let max = rows[0]!.workoutStartTime;
  for (const row of rows) {
    if (row.workoutStartTime < min) min = row.workoutStartTime;
    if (row.workoutStartTime > max) max = row.workoutStartTime;
  }

  const threshold = new Date(min);
  threshold.setFullYear(threshold.getFullYear() + MONTHLY_SWITCH_THRESHOLD_YEARS);
  return max > threshold.getTime() ? 'month' : 'week';
}

function withinBounds(epochMs: number, bounds: { start: number; end: number }): boolean {
  return epochMs >= bounds.start && epochMs <= bounds.end;
}

// ---------------------------------------------------------------------------
// Card 1 — Workouts per week (bars, optional weekly-goal line)
// ---------------------------------------------------------------------------

export interface WeekWorkoutBar {
  bucketStart: number;
  count: number;
  /** `undefined` when no `weeklyGoal` was supplied (settings: no goal set, 04 §4.1 "default off") — `true`/`false` otherwise, per whether `count >= weeklyGoal`. Mirrors `BarChartPoint.goalMet`'s own optional-means-"no goal" convention. */
  goalMet?: boolean;
}

/**
 * "Workouts per week" bar data (04 §4.1 item 1) — always weekly (see file
 * header), one distinct-`workoutId` count per bucket, gap-filled to `0`.
 * `weeklyGoal` is the live `weekly_goal` setting (`null` = no goal set,
 * `SETTINGS_DEFAULTS.weekly_goal`'s own default) — `undefined`/`null` both
 * mean "no goal line," matching {@link WeekWorkoutBar.goalMet}'s contract.
 */
export function bucketWorkoutsPerWeek(
  rows: readonly Pick<StatsFeedRow, 'workoutId' | 'workoutStartTime'>[],
  bounds: { start: number; end: number },
  firstDayOfWeek: FirstDayOfWeek,
  weeklyGoal?: number | null,
): WeekWorkoutBar[] {
  const starts = buildBucketStarts(bounds, 'week', firstDayOfWeek);
  const workoutIdsByBucket = new Map<number, Set<string>>();

  for (const row of rows) {
    if (!withinBounds(row.workoutStartTime, bounds)) continue;
    const bucket = weekBucketStart(row.workoutStartTime, firstDayOfWeek);
    const bucketSet = workoutIdsByBucket.get(bucket);
    if (bucketSet) {
      bucketSet.add(row.workoutId);
    } else {
      workoutIdsByBucket.set(bucket, new Set([row.workoutId]));
    }
  }

  return starts.map((start) => {
    const count = workoutIdsByBucket.get(start)?.size ?? 0;
    return {
      bucketStart: start,
      count,
      goalMet: weeklyGoal != null ? count >= weeklyGoal : undefined,
    };
  });
}

// ---------------------------------------------------------------------------
// Card 2 — Aggregate trend (Duration | Volume | Reps)
// ---------------------------------------------------------------------------

export type AggregateMetric = 'duration' | 'volume' | 'reps';

export interface AggregateTrendBucket {
  bucketStart: number;
  value: number;
}

/**
 * Aggregate trend data (04 §4.1 item 2), one of three metrics:
 *
 *  - `'duration'` — sum of each **distinct workout's** own `end_time -
 *    start_time` (04 §4.2's own "Duration stat" formula) whose bucket it
 *    falls in; deduped by `workoutId` first (file header's "one row per
 *    set" dedupe note) so a multi-set, multi-exercise workout's duration
 *    isn't counted once per set.
 *  - `'volume'` — sum of {@link setVolumeKg} (`domain/volume.ts`, M2-04)
 *    over every stats-eligible set (warm-up-gated per `warmupInStats`).
 *  - `'reps'` — sum of `reps ?? 0` over the same eligible-set population.
 *
 * `granularity` is resolved by the caller via {@link chooseTrendGranularity}
 * — this function just buckets at whichever granularity it's given.
 */
export function bucketAggregateTrend(
  rows: readonly StatsFeedRow[],
  bounds: { start: number; end: number },
  firstDayOfWeek: FirstDayOfWeek,
  granularity: BucketGranularity,
  metric: AggregateMetric,
  warmupInStats: boolean,
): AggregateTrendBucket[] {
  const starts = buildBucketStarts(bounds, granularity, firstDayOfWeek);
  const valueByBucket = new Map<number, number>();

  if (metric === 'duration') {
    const seenWorkouts = new Set<string>();
    for (const row of rows) {
      if (seenWorkouts.has(row.workoutId)) continue;
      seenWorkouts.add(row.workoutId);
      if (row.workoutEndTime == null) continue;
      if (!withinBounds(row.workoutStartTime, bounds)) continue;

      const bucket = bucketStart(row.workoutStartTime, granularity, firstDayOfWeek);
      const durationSeconds = (row.workoutEndTime - row.workoutStartTime) / 1000;
      valueByBucket.set(bucket, (valueByBucket.get(bucket) ?? 0) + durationSeconds);
    }
  } else {
    for (const row of rows) {
      if (!withinBounds(row.workoutStartTime, bounds)) continue;
      if (!isStatsEligibleSet(row, warmupInStats)) continue;

      const bucket = bucketStart(row.workoutStartTime, granularity, firstDayOfWeek);
      const contribution = metric === 'volume' ? setVolumeKg(row, warmupInStats) : (row.reps ?? 0);
      valueByBucket.set(bucket, (valueByBucket.get(bucket) ?? 0) + contribution);
    }
  }

  return starts.map((start) => ({ bucketStart: start, value: valueByBucket.get(start) ?? 0 }));
}

// ---------------------------------------------------------------------------
// Muscle-group weighting (shared by cards 3 + 4) — primary 1, secondary 0.5
// ---------------------------------------------------------------------------

export interface MuscleWeight {
  muscleGroup: MuscleGroup;
  weight: number;
}

/** One eligible set's own muscle-group contributions — `[primary, 1]` plus `[secondary, 0.5]` for each secondary muscle (04 §4.1 item 3's weighting rule, reused by both consumers — file header's "Muscle-group weighting" note). */
function muscleContributionsForRow(row: StatsFeedRow): [MuscleGroup, number][] {
  const contributions: [MuscleGroup, number][] = [[row.primaryMuscleGroup, 1]];
  for (const secondary of row.secondaryMuscleGroups) {
    contributions.push([secondary, 0.5]);
  }
  return contributions;
}

function accumulateMuscleWeights(
  rows: readonly StatsFeedRow[],
  warmupInStats: boolean,
  bounds?: { start: number; end: number },
): Map<MuscleGroup, number> {
  const totals = new Map<MuscleGroup, number>();
  for (const row of rows) {
    if (bounds && !withinBounds(row.workoutStartTime, bounds)) continue;
    if (!isStatsEligibleSet(row, warmupInStats)) continue;

    for (const [muscleGroup, weight] of muscleContributionsForRow(row)) {
      totals.set(muscleGroup, (totals.get(muscleGroup) ?? 0) + weight);
    }
  }
  return totals;
}

// ---------------------------------------------------------------------------
// Card 3 — Muscle distribution (horizontal bars, whole-range totals)
// ---------------------------------------------------------------------------

/**
 * "Muscle distribution" data (04 §4.1 item 3) — one entry per muscle group
 * with any weighted eligible-set contribution in `rows`, sorted descending
 * by weight (the horizontal-bar-chart's own natural top-to-bottom order).
 * A muscle group with zero contribution across the whole range is simply
 * absent, never a `weight: 0` entry — mirrors `WorkoutDateCount`'s own
 * "absent means zero" convention.
 */
export function computeMuscleDistribution(
  rows: readonly StatsFeedRow[],
  warmupInStats: boolean,
): MuscleWeight[] {
  const totals = accumulateMuscleWeights(rows, warmupInStats);
  return Array.from(totals.entries())
    .map(([muscleGroup, weight]) => ({ muscleGroup, weight }))
    .sort((a, b) => b.weight - a.weight);
}

// ---------------------------------------------------------------------------
// Card 4 — Sets per muscle group per week (stacked, top-8 + Other)
// ---------------------------------------------------------------------------

export const STACKED_MUSCLE_TOP_N = 8;
/** The stacked chart's own catch-all series key for every muscle group outside the range's own top 8 (04 §4.1 item 4: "top-8 muscle groups + Other"). */
export const OTHER_MUSCLE_SERIES_KEY = 'other';

export interface MuscleWeekPoint {
  bucketStart: number;
  /** Keyed by `MuscleGroup` value for a top-8 series, or {@link OTHER_MUSCLE_SERIES_KEY} for everything else. A bucket with no contribution for a given key simply omits it (`StackedBarChartPoint`'s own "missing key = 0" convention). */
  values: Record<string, number>;
}

export interface MuscleWeekSeries {
  /** The range's own top-8 muscle groups by total weighted contribution (descending) — reused verbatim from {@link computeMuscleDistribution} so this chart's series order agrees with the distribution card's own bar order for the same range (file header's "Muscle-group weighting" note). */
  topMuscleGroups: MuscleGroup[];
  points: MuscleWeekPoint[];
}

/**
 * "Sets per muscle group per week" stacked data (04 §4.1 item 4) — always
 * weekly (file header). Selects the top 8 muscle groups by whole-range
 * weighted contribution, then re-walks `rows` bucketing each eligible set's
 * own primary/secondary contributions into either its own top-8 key or
 * {@link OTHER_MUSCLE_SERIES_KEY}.
 *
 * M4-11 perf-budget review fix: top-8 selection needs exactly
 * {@link computeMuscleDistribution}'s own whole-range totals (file header,
 * "Muscle-group weighting") — computed here internally by default, but a
 * caller that has *already* computed the identical `(rows, warmupInStats)`
 * distribution for its own muscle-distribution card (`StatisticsScreen.tsx`
 * does exactly this whenever `dashboardRange === muscleRange`, and the
 * `perf-budgets.test.ts` "all"-range case always does, per its own doc
 * comment's "one query+compute unit per range") can pass it in via
 * `precomputedDistribution` to skip a second full `O(rows)` pass — measured
 * as a double-digit-ms redundant cost at the 15.7k-row "all"-range scale,
 * enough to leave that range's 06 §8 300 ms budget uncomfortably tight.
 * Optional and backward compatible: omitted (or the ranges/warmup flag
 * genuinely differ), this recomputes exactly as before.
 */
export function bucketSetsPerMuscleGroupPerWeek(
  rows: readonly StatsFeedRow[],
  bounds: { start: number; end: number },
  firstDayOfWeek: FirstDayOfWeek,
  warmupInStats: boolean,
  precomputedDistribution?: readonly MuscleWeight[],
): MuscleWeekSeries {
  const totals = precomputedDistribution ?? computeMuscleDistribution(rows, warmupInStats);
  const topMuscleGroups = totals.slice(0, STACKED_MUSCLE_TOP_N).map((entry) => entry.muscleGroup);
  const topSet = new Set<MuscleGroup>(topMuscleGroups);

  const starts = buildBucketStarts(bounds, 'week', firstDayOfWeek);
  const valuesByBucket = new Map<number, Record<string, number>>();
  for (const start of starts) {
    valuesByBucket.set(start, {});
  }

  for (const row of rows) {
    if (!withinBounds(row.workoutStartTime, bounds)) continue;
    if (!isStatsEligibleSet(row, warmupInStats)) continue;

    const bucket = weekBucketStart(row.workoutStartTime, firstDayOfWeek);
    const bucketValues = valuesByBucket.get(bucket);
    // Defensive — every row is already range-filtered by the caller's own
    // `statsFeed(range)` query, so this should always hit; guards against a
    // caller passing a `bounds` narrower than `rows` was actually fetched
    // with (the fill grid above wouldn't have a slot for it).
    if (!bucketValues) continue;

    for (const [muscleGroup, weight] of muscleContributionsForRow(row)) {
      const key = topSet.has(muscleGroup) ? muscleGroup : OTHER_MUSCLE_SERIES_KEY;
      bucketValues[key] = (bucketValues[key] ?? 0) + weight;
    }
  }

  const points = starts.map((start) => ({ bucketStart: start, values: valuesByBucket.get(start) ?? {} }));
  return { topMuscleGroups, points };
}

// ---------------------------------------------------------------------------
// Summary tiles — total volume / total time (all-time, unranged feed)
// ---------------------------------------------------------------------------

export interface SummaryTotals {
  totalVolumeKg: number;
  totalDurationSeconds: number;
}

/**
 * Summary-tile totals (04 §4.1: "total volume, total time" — "total
 * workouts" and "current streak" are deliberately **not** computed here,
 * see below) over whatever `rows` were fetched (the screen passes an
 * unranged `statsFeed()` result for "all-time" totals). `totalVolumeKg`
 * sums {@link setVolumeKg} per eligible set; `totalDurationSeconds` sums
 * each **distinct workout's** own `end_time - start_time` exactly once
 * (file header's per-workout dedupe note) — a workout contributes to this
 * total exactly once no matter how many sets/exercises it logged.
 *
 * **Scope note on "total workouts":** deliberately left off this return
 * shape. `rows` is a `sets`-grain feed (05 §4/§6) — a hypothetical
 * completed workout with zero logged sets (every exercise removed before
 * finishing) would have no row here at all, silently undercounting a
 * plain `COUNT(DISTINCT workoutId)` over this feed. `WorkoutRepository
 * .workoutDates()` (already fetched for the streak tile, `domain/
 * streaks.ts`) is workout-grain and doesn't have this gap — the feature
 * screen sums its own already-fetched `WorkoutDateCount[]` counts for the
 * "total workouts" tile instead of asking this module to (re-)derive it
 * from a feed that can't represent a set-less workout at all.
 */
export function computeSummaryTotals(rows: readonly StatsFeedRow[], warmupInStats: boolean): SummaryTotals {
  const workoutTimes = new Map<string, { start: number; end: number | null }>();
  let totalVolumeKg = 0;

  for (const row of rows) {
    if (!workoutTimes.has(row.workoutId)) {
      workoutTimes.set(row.workoutId, { start: row.workoutStartTime, end: row.workoutEndTime });
    }
    totalVolumeKg += setVolumeKg(row, warmupInStats);
  }

  let totalDurationSeconds = 0;
  for (const { start, end } of workoutTimes.values()) {
    if (end != null) {
      totalDurationSeconds += (end - start) / 1000;
    }
  }

  return { totalVolumeKg, totalDurationSeconds };
}

// Re-exported so a caller building a `VolumeSetInput` view over a
// `StatsFeedRow` (or vice versa) has a name for it — not otherwise used in
// this file beyond structural compatibility (TS structural typing needs no
// explicit cast).
export type { VolumeSetInput };
