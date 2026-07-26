/**
 * `domain/stats-buckets.ts` tests (M4-08 acceptance gate, 08 §4.8: "stats
 * bucketing: week boundaries, All-range monthly switch"; 04 §4 acceptance:
 * bodyweight +10x8 -> 80 kg volume, assisted/reps-only -> 0; warm-up
 * gating; first-day-of-week re-bucketing).
 */
import {
  bucketAggregateTrend,
  bucketSetsPerMuscleGroupPerWeek,
  bucketWorkoutsPerWeek,
  buildBucketStarts,
  chooseTrendGranularity,
  computeMuscleDistribution,
  computeSummaryTotals,
  displayRangeBounds,
  OTHER_MUSCLE_SERIES_KEY,
  rangeQueryBounds,
  type DashboardRangeKey,
  type StatsFeedRow,
} from '../stats-buckets';

function d(y: number, m: number, day: number, h = 0, min = 0): Date {
  return new Date(y, m - 1, day, h, min);
}

function row(overrides: Partial<StatsFeedRow> = {}): StatsFeedRow {
  return {
    workoutId: 'w1',
    workoutStartTime: d(2026, 1, 5).getTime(),
    workoutEndTime: d(2026, 1, 5).getTime() + 3_600_000,
    exerciseId: 'bench-press',
    exerciseType: 'weight_reps',
    primaryMuscleGroup: 'chest',
    secondaryMuscleGroups: [],
    setType: 'normal',
    weightKg: 100,
    reps: 5,
    isCompleted: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// rangeQueryBounds / displayRangeBounds
// ---------------------------------------------------------------------------

describe('rangeQueryBounds', () => {
  const now = d(2026, 7, 25, 12, 0);

  it("'all' has no bound at all", () => {
    expect(rangeQueryBounds('all', now)).toEqual({});
  });

  it('7d / 30d / 3m / 1y compute start via calendar-correct Date arithmetic', () => {
    expect(rangeQueryBounds('7d', now)).toEqual({ start: d(2026, 7, 18, 12, 0).getTime(), end: now.getTime() });
    expect(rangeQueryBounds('30d', now)).toEqual({ start: d(2026, 6, 25, 12, 0).getTime(), end: now.getTime() });
    expect(rangeQueryBounds('3m', now)).toEqual({ start: d(2026, 4, 25, 12, 0).getTime(), end: now.getTime() });
    expect(rangeQueryBounds('1y', now)).toEqual({ start: d(2025, 7, 25, 12, 0).getTime(), end: now.getTime() });
  });

  it('throws on an unrecognized range (exhaustiveness guard, defensive against schema drift — M4-12 exit-gate coverage gap closed)', () => {
    expect(() => rangeQueryBounds('bogus' as DashboardRangeKey, now)).toThrow(/unhandled range/);
  });

  it('defaults `now` to the real clock when omitted (M4-12 exit-gate coverage gap closed)', () => {
    const before = Date.now();
    const result = rangeQueryBounds('7d');
    const after = Date.now();
    expect(result.end).toBeGreaterThanOrEqual(before);
    expect(result.end).toBeLessThanOrEqual(after);
  });
});

describe('displayRangeBounds', () => {
  const now = d(2026, 7, 25, 12, 0);

  it('matches rangeQueryBounds for a bounded range', () => {
    expect(displayRangeBounds('3m', [], now)).toEqual({
      start: d(2026, 4, 25, 12, 0).getTime(),
      end: now.getTime(),
    });
  });

  it("'all' falls back to the earliest row's own workoutStartTime", () => {
    const rows = [row({ workoutStartTime: d(2024, 3, 1).getTime() }), row({ workoutStartTime: d(2025, 1, 1).getTime() })];
    expect(displayRangeBounds('all', rows, now)).toEqual({ start: d(2024, 3, 1).getTime(), end: now.getTime() });
  });

  it("'all' with no rows collapses to {start: now, end: now} (zero buckets)", () => {
    expect(displayRangeBounds('all', [], now)).toEqual({ start: now.getTime(), end: now.getTime() });
  });

  it('defaults `now` to the real clock when omitted (M4-12 exit-gate coverage gap closed)', () => {
    const before = Date.now();
    const result = displayRangeBounds('7d', []);
    const after = Date.now();
    expect(result.end).toBeGreaterThanOrEqual(before);
    expect(result.end).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// buildBucketStarts + week boundaries (08 §4.8)
// ---------------------------------------------------------------------------

describe('buildBucketStarts — week boundaries respect first-day-of-week', () => {
  it('Monday-first: a Sun Jan 4 -> Sun Jan 11 2026 span produces two Monday-anchored weeks', () => {
    const bounds = { start: d(2026, 1, 4).getTime(), end: d(2026, 1, 11).getTime() };
    const starts = buildBucketStarts(bounds, 'week', 'monday');
    // Jan 4 2026 is a Sunday -> its Monday-first week starts Dec 29 2025.
    // Jan 11 2026 is a Sunday -> its Monday-first week also starts Jan 5 2026.
    expect(starts.map((s) => new Date(s).toDateString())).toEqual([
      new Date(2025, 11, 29).toDateString(),
      new Date(2026, 0, 5).toDateString(),
    ]);
  });

  it('Sunday-first: the same span buckets differently', () => {
    const bounds = { start: d(2026, 1, 4).getTime(), end: d(2026, 1, 11).getTime() };
    const starts = buildBucketStarts(bounds, 'week', 'sunday');
    expect(starts.map((s) => new Date(s).toDateString())).toEqual([
      new Date(2026, 0, 4).toDateString(),
      new Date(2026, 0, 11).toDateString(),
    ]);
  });

  it('a single-day range produces exactly one bucket', () => {
    const bounds = { start: d(2026, 1, 5).getTime(), end: d(2026, 1, 5).getTime() };
    expect(buildBucketStarts(bounds, 'week', 'monday')).toHaveLength(1);
  });

  it('month granularity buckets by calendar month start', () => {
    const bounds = { start: d(2026, 1, 15).getTime(), end: d(2026, 3, 3).getTime() };
    const starts = buildBucketStarts(bounds, 'month', 'monday');
    expect(starts).toEqual([d(2026, 1, 1).getTime(), d(2026, 2, 1).getTime(), d(2026, 3, 1).getTime()]);
  });
});

// ---------------------------------------------------------------------------
// All-range monthly switch (08 §4.8)
// ---------------------------------------------------------------------------

describe('chooseTrendGranularity — All-range monthly switch', () => {
  it("stays weekly for any range other than 'all', regardless of span", () => {
    const rows = [row({ workoutStartTime: d(2020, 1, 1).getTime() }), row({ workoutStartTime: d(2026, 1, 1).getTime() })];
    expect(chooseTrendGranularity('1y', rows)).toBe('week');
    expect(chooseTrendGranularity('3m', rows)).toBe('week');
  });

  it("'all' with a span <= 2 years stays weekly", () => {
    const rows = [row({ workoutStartTime: d(2025, 1, 1).getTime() }), row({ workoutStartTime: d(2026, 6, 1).getTime() })];
    expect(chooseTrendGranularity('all', rows)).toBe('week');
  });

  it("'all' with a span > 2 years switches to monthly", () => {
    const rows = [row({ workoutStartTime: d(2023, 1, 1).getTime() }), row({ workoutStartTime: d(2026, 6, 1).getTime() })];
    expect(chooseTrendGranularity('all', rows)).toBe('month');
  });

  it("'all' with a span of exactly 2 years (boundary) stays weekly (> comparison, not >=)", () => {
    const rows = [row({ workoutStartTime: d(2024, 1, 1).getTime() }), row({ workoutStartTime: d(2026, 1, 1).getTime() })];
    expect(chooseTrendGranularity('all', rows)).toBe('week');
  });

  it('empty rows stays weekly', () => {
    expect(chooseTrendGranularity('all', [])).toBe('week');
  });

  it('finds min/max correctly when rows are not pre-sorted (a later array entry is chronologically earliest — M4-12 exit-gate coverage gap closed)', () => {
    const rows = [
      // First array element, but only ~1 year before the max below — if the
      // loop's "a later-processed row beats the running min" branch never
      // ran (every other fixture in this describe block has rows already
      // in ascending order, so it never does), `min` would incorrectly
      // stay pinned to this row and the span would read as <= 2 years.
      row({ workoutStartTime: d(2025, 6, 1).getTime() }),
      row({ workoutStartTime: d(2026, 6, 1).getTime() }),
      // Chronologically earliest, but last in the array.
      row({ workoutStartTime: d(2020, 1, 1).getTime() }),
    ];
    // The true span is 2020 -> 2026 (> 2 years) — only reads as "monthly"
    // if the unsorted-earliest row was genuinely folded into `min`.
    expect(chooseTrendGranularity('all', rows)).toBe('month');
  });
});

// ---------------------------------------------------------------------------
// Card 1 — workouts per week
// ---------------------------------------------------------------------------

describe('bucketWorkoutsPerWeek', () => {
  it('counts distinct workouts per week bucket, gap-filling zero weeks', () => {
    const bounds = { start: d(2026, 1, 5).getTime(), end: d(2026, 1, 19).getTime() };
    const rows = [
      row({ workoutId: 'w1', workoutStartTime: d(2026, 1, 5).getTime() }),
      row({ workoutId: 'w2', workoutStartTime: d(2026, 1, 6).getTime() }),
      // Jan 12-18 week: no workouts.
      row({ workoutId: 'w3', workoutStartTime: d(2026, 1, 19).getTime() }),
    ];

    const bars = bucketWorkoutsPerWeek(rows, bounds, 'monday');

    expect(bars.map((b) => b.count)).toEqual([2, 0, 1]);
  });

  it('multiple sets in the same workout only count that workout once', () => {
    const bounds = { start: d(2026, 1, 5).getTime(), end: d(2026, 1, 5).getTime() };
    const rows = [
      row({ workoutId: 'w1', workoutStartTime: d(2026, 1, 5).getTime() }),
      row({ workoutId: 'w1', workoutStartTime: d(2026, 1, 5).getTime() }),
      row({ workoutId: 'w1', workoutStartTime: d(2026, 1, 5).getTime() }),
    ];
    expect(bucketWorkoutsPerWeek(rows, bounds, 'monday')[0]!.count).toBe(1);
  });

  it('goalMet reflects count >= weeklyGoal; undefined when no goal set', () => {
    const bounds = { start: d(2026, 1, 5).getTime(), end: d(2026, 1, 5).getTime() };
    const rows = [row({ workoutId: 'w1' }), row({ workoutId: 'w2' })];

    expect(bucketWorkoutsPerWeek(rows, bounds, 'monday', 2)[0]!.goalMet).toBe(true);
    expect(bucketWorkoutsPerWeek(rows, bounds, 'monday', 3)[0]!.goalMet).toBe(false);
    expect(bucketWorkoutsPerWeek(rows, bounds, 'monday', null)[0]!.goalMet).toBeUndefined();
    expect(bucketWorkoutsPerWeek(rows, bounds, 'monday')[0]!.goalMet).toBeUndefined();
  });

  it('a row outside bounds (query returned more than the display range asked for) is filtered out, not counted (M4-12 exit-gate coverage gap closed)', () => {
    const bounds = { start: d(2026, 1, 5).getTime(), end: d(2026, 1, 5).getTime() };
    const rows = [
      row({ workoutId: 'w1', workoutStartTime: d(2026, 1, 5).getTime() }),
      row({ workoutId: 'w-out-of-range', workoutStartTime: d(2026, 2, 1).getTime() }),
    ];
    expect(bucketWorkoutsPerWeek(rows, bounds, 'monday')[0]!.count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Card 2 — aggregate trend (Duration | Volume | Reps) — reuses domain/volume.ts
// ---------------------------------------------------------------------------

describe('bucketAggregateTrend — volume (04 §4 acceptance: P7 reuse)', () => {
  const bounds = { start: d(2026, 1, 5).getTime(), end: d(2026, 1, 5).getTime() };

  it('bodyweight_reps +10kg x 8 reps contributes 80 kg volume', () => {
    const rows = [row({ exerciseType: 'bodyweight_reps', weightKg: 10, reps: 8 })];
    const result = bucketAggregateTrend(rows, bounds, 'monday', 'week', 'volume', false);
    expect(result[0]!.value).toBe(80);
  });

  it('bodyweight_assisted_reps and reps_only contribute 0 volume', () => {
    const rows = [
      row({ exerciseType: 'bodyweight_assisted_reps', weightKg: 20, reps: 12 }),
      row({ exerciseType: 'reps_only', weightKg: null, reps: 15 }),
    ];
    const result = bucketAggregateTrend(rows, bounds, 'monday', 'week', 'volume', false);
    expect(result[0]!.value).toBe(0);
  });

  it('weight_reps: weight x reps', () => {
    const rows = [row({ exerciseType: 'weight_reps', weightKg: 100, reps: 5 })];
    expect(bucketAggregateTrend(rows, bounds, 'monday', 'week', 'volume', false)[0]!.value).toBe(500);
  });

  it('warm-up sets excluded from volume unless warmupInStats is true', () => {
    const rows = [row({ setType: 'warmup', weightKg: 40, reps: 10 })];
    expect(bucketAggregateTrend(rows, bounds, 'monday', 'week', 'volume', false)[0]!.value).toBe(0);
    expect(bucketAggregateTrend(rows, bounds, 'monday', 'week', 'volume', true)[0]!.value).toBe(400);
  });

  it('unchecked sets never contribute regardless of warmupInStats', () => {
    const rows = [row({ isCompleted: false, weightKg: 999, reps: 99 })];
    expect(bucketAggregateTrend(rows, bounds, 'monday', 'week', 'volume', true)[0]!.value).toBe(0);
  });

  it('reps metric sums reps across eligible sets', () => {
    const rows = [row({ reps: 5 }), row({ reps: 8 }), row({ setType: 'warmup', reps: 20 })];
    expect(bucketAggregateTrend(rows, bounds, 'monday', 'week', 'reps', false)[0]!.value).toBe(13);
  });

  it('reps metric treats a null reps value as 0, not a dropped row (M4-12 exit-gate coverage gap closed)', () => {
    const rows = [row({ reps: 5 }), row({ reps: null })];
    expect(bucketAggregateTrend(rows, bounds, 'monday', 'week', 'reps', false)[0]!.value).toBe(5);
  });

  it('volume/reps metrics filter out a row outside bounds (M4-12 exit-gate coverage gap closed)', () => {
    const rows = [
      row({ weightKg: 100, reps: 5 }),
      row({ weightKg: 999, reps: 99, workoutStartTime: d(2026, 2, 1).getTime() }),
    ];
    expect(bucketAggregateTrend(rows, bounds, 'monday', 'week', 'volume', false)[0]!.value).toBe(500);
  });

  it('duration metric sums each distinct workout end-start once, never once-per-set', () => {
    const wideBounds = { start: d(2026, 1, 5).getTime(), end: d(2026, 1, 5).getTime() };
    const start = d(2026, 1, 5).getTime();
    const rows = [
      row({ workoutId: 'w1', workoutStartTime: start, workoutEndTime: start + 3_600_000 }),
      row({ workoutId: 'w1', workoutStartTime: start, workoutEndTime: start + 3_600_000 }),
      row({ workoutId: 'w1', workoutStartTime: start, workoutEndTime: start + 3_600_000 }),
    ];
    expect(bucketAggregateTrend(rows, wideBounds, 'monday', 'week', 'duration', false)[0]!.value).toBe(3_600);
  });

  it('duration metric skips a row with a null workoutEndTime (defensive — 05 §6 says statsFeed never actually returns one, M4-12 exit-gate coverage gap closed)', () => {
    const start = d(2026, 1, 5).getTime();
    const rows = [
      row({ workoutId: 'w1', workoutStartTime: start, workoutEndTime: null }),
      row({ workoutId: 'w2', workoutStartTime: start, workoutEndTime: start + 1_800_000 }),
    ];
    expect(bucketAggregateTrend(rows, bounds, 'monday', 'week', 'duration', false)[0]!.value).toBe(1_800);
  });

  it('duration metric filters out a distinct workout outside bounds (M4-12 exit-gate coverage gap closed)', () => {
    const start = d(2026, 1, 5).getTime();
    const rows = [
      row({ workoutId: 'w1', workoutStartTime: start, workoutEndTime: start + 1_800_000 }),
      row({
        workoutId: 'w-out-of-range',
        workoutStartTime: d(2026, 2, 1).getTime(),
        workoutEndTime: d(2026, 2, 1).getTime() + 9_999_000,
      }),
    ];
    expect(bucketAggregateTrend(rows, bounds, 'monday', 'week', 'duration', false)[0]!.value).toBe(1_800);
  });

  it('gap-fills buckets with 0 for every metric', () => {
    const widerBounds = { start: d(2026, 1, 5).getTime(), end: d(2026, 1, 19).getTime() };
    const result = bucketAggregateTrend([], widerBounds, 'monday', 'week', 'volume', false);
    expect(result.map((b) => b.value)).toEqual([0, 0, 0]);
  });

  it('monthly granularity buckets by calendar month', () => {
    const wideBounds = { start: d(2026, 1, 1).getTime(), end: d(2026, 2, 15).getTime() };
    const rows = [
      row({ workoutStartTime: d(2026, 1, 10).getTime(), reps: 5, weightKg: 10 }),
      row({ workoutStartTime: d(2026, 2, 5).getTime(), reps: 5, weightKg: 20 }),
    ];
    const result = bucketAggregateTrend(rows, wideBounds, 'monday', 'month', 'volume', false);
    expect(result.map((b) => b.value)).toEqual([50, 100]);
  });
});

// ---------------------------------------------------------------------------
// Card 3 — muscle distribution weighting
// ---------------------------------------------------------------------------

describe('computeMuscleDistribution — primary 1, secondary 0.5 each', () => {
  it('primary muscle counts 1 per eligible set', () => {
    const rows = [row({ primaryMuscleGroup: 'chest', secondaryMuscleGroups: [] })];
    expect(computeMuscleDistribution(rows, false)).toEqual([{ muscleGroup: 'chest', weight: 1 }]);
  });

  it('secondary muscles each count 0.5', () => {
    const rows = [row({ primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['triceps', 'shoulders'] })];
    const result = computeMuscleDistribution(rows, false);
    expect(result).toEqual(
      expect.arrayContaining([
        { muscleGroup: 'chest', weight: 1 },
        { muscleGroup: 'triceps', weight: 0.5 },
        { muscleGroup: 'shoulders', weight: 0.5 },
      ]),
    );
  });

  it('sums across multiple sets and sorts descending by weight', () => {
    const rows = [
      row({ primaryMuscleGroup: 'chest', secondaryMuscleGroups: [] }),
      row({ primaryMuscleGroup: 'chest', secondaryMuscleGroups: [] }),
      row({ primaryMuscleGroup: 'triceps', secondaryMuscleGroups: [] }),
    ];
    expect(computeMuscleDistribution(rows, false)).toEqual([
      { muscleGroup: 'chest', weight: 2 },
      { muscleGroup: 'triceps', weight: 1 },
    ]);
  });

  it('excludes warm-up sets unless warmupInStats, and unchecked sets always', () => {
    const rows = [
      row({ setType: 'warmup', primaryMuscleGroup: 'chest' }),
      row({ isCompleted: false, primaryMuscleGroup: 'chest' }),
    ];
    expect(computeMuscleDistribution(rows, false)).toEqual([]);
    expect(computeMuscleDistribution(rows, true)).toEqual([{ muscleGroup: 'chest', weight: 1 }]);
  });

  it('a muscle group with zero contribution is absent, never a zero entry', () => {
    const rows = [row({ primaryMuscleGroup: 'chest', secondaryMuscleGroups: [] })];
    const result = computeMuscleDistribution(rows, false);
    expect(result.find((entry) => entry.muscleGroup === 'quadriceps')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Card 4 — sets per muscle group per week, top-8 + Other
// ---------------------------------------------------------------------------

describe('bucketSetsPerMuscleGroupPerWeek — top-8 + Other', () => {
  const bounds = { start: d(2026, 1, 5).getTime(), end: d(2026, 1, 5).getTime() };

  it('more than 8 muscle groups collapses the rest into "other"', () => {
    const muscleGroups = [
      'chest', 'shoulders', 'biceps', 'triceps', 'forearms', 'quadriceps', 'hamstrings', 'calves', 'glutes',
    ] as const;
    // 9 distinct primary muscle groups, descending weight by insertion count so ordering is deterministic.
    const rows = muscleGroups.flatMap((muscleGroup, index) =>
      Array.from({ length: muscleGroups.length - index }, () => row({ primaryMuscleGroup: muscleGroup, secondaryMuscleGroups: [] })),
    );

    const { topMuscleGroups, points } = bucketSetsPerMuscleGroupPerWeek(rows, bounds, 'monday', false);

    expect(topMuscleGroups).toHaveLength(8);
    expect(topMuscleGroups).not.toContain('glutes'); // the 9th, lowest-weight group
    expect(points[0]!.values[OTHER_MUSCLE_SERIES_KEY]).toBe(1); // glutes' single set
  });

  it('gap-fills weeks with no data to an empty values object', () => {
    const widerBounds = { start: d(2026, 1, 5).getTime(), end: d(2026, 1, 19).getTime() };
    const rows = [row({ workoutStartTime: d(2026, 1, 5).getTime(), primaryMuscleGroup: 'chest', secondaryMuscleGroups: [] })];

    const { points } = bucketSetsPerMuscleGroupPerWeek(rows, widerBounds, 'monday', false);

    expect(points).toHaveLength(3);
    expect(points[1]!.values).toEqual({});
  });

  it('respects warm-up gating identically to computeMuscleDistribution', () => {
    const rows = [row({ setType: 'warmup', primaryMuscleGroup: 'chest', secondaryMuscleGroups: [] })];
    const { points } = bucketSetsPerMuscleGroupPerWeek(rows, bounds, 'monday', false);
    expect(points[0]!.values).toEqual({});
  });

  it('filters out a row outside bounds (M4-12 exit-gate coverage gap closed)', () => {
    const rows = [
      row({ primaryMuscleGroup: 'chest', secondaryMuscleGroups: [] }),
      row({ primaryMuscleGroup: 'biceps', secondaryMuscleGroups: [], workoutStartTime: d(2026, 2, 1).getTime() }),
    ];
    const { points } = bucketSetsPerMuscleGroupPerWeek(rows, bounds, 'monday', false);
    expect(points[0]!.values).toEqual({ chest: 1 });
  });

  it('an explicit precomputedDistribution (M4-11 perf-budget review fix) produces the identical result as recomputing internally', () => {
    const muscleGroups = [
      'chest', 'shoulders', 'biceps', 'triceps', 'forearms', 'quadriceps', 'hamstrings', 'calves', 'glutes',
    ] as const;
    const rows = muscleGroups.flatMap((muscleGroup, index) =>
      Array.from({ length: muscleGroups.length - index }, () => row({ primaryMuscleGroup: muscleGroup, secondaryMuscleGroups: [] })),
    );

    const recomputed = bucketSetsPerMuscleGroupPerWeek(rows, bounds, 'monday', false);
    const precomputed = bucketSetsPerMuscleGroupPerWeek(
      rows,
      bounds,
      'monday',
      false,
      computeMuscleDistribution(rows, false),
    );

    expect(precomputed).toEqual(recomputed);
  });

  it('a mismatched precomputedDistribution is trusted verbatim for top-8 selection (caller contract, not re-derived)', () => {
    const rows = [row({ primaryMuscleGroup: 'chest', secondaryMuscleGroups: [] })];
    const { topMuscleGroups } = bucketSetsPerMuscleGroupPerWeek(rows, bounds, 'monday', false, [
      { muscleGroup: 'quadriceps', weight: 99 },
    ]);
    expect(topMuscleGroups).toEqual(['quadriceps']);
  });
});

// ---------------------------------------------------------------------------
// Summary totals
// ---------------------------------------------------------------------------

describe('computeSummaryTotals', () => {
  it('sums volume across eligible sets and dedupes duration per distinct workout', () => {
    const start = d(2026, 1, 5).getTime();
    const rows = [
      row({ workoutId: 'w1', workoutStartTime: start, workoutEndTime: start + 3_600_000, weightKg: 100, reps: 5 }),
      row({ workoutId: 'w1', workoutStartTime: start, workoutEndTime: start + 3_600_000, weightKg: 105, reps: 3 }),
      row({ workoutId: 'w2', workoutStartTime: start, workoutEndTime: start + 1_800_000, weightKg: 50, reps: 10 }),
    ];

    const totals = computeSummaryTotals(rows, false);

    expect(totals.totalVolumeKg).toBe(100 * 5 + 105 * 3 + 50 * 10);
    expect(totals.totalDurationSeconds).toBe(3_600 + 1_800);
  });

  it('an empty feed totals to zero', () => {
    expect(computeSummaryTotals([], false)).toEqual({ totalVolumeKg: 0, totalDurationSeconds: 0 });
  });

  it('bodyweight +10x8 acceptance line holds inside the summary total too', () => {
    const rows = [row({ exerciseType: 'bodyweight_reps', weightKg: 10, reps: 8 })];
    expect(computeSummaryTotals(rows, false).totalVolumeKg).toBe(80);
  });

  it('a workout with a null workoutEndTime contributes 0 duration, not NaN (defensive — 05 §6 says statsFeed never actually returns one, M4-12 exit-gate coverage gap closed)', () => {
    const start = d(2026, 1, 5).getTime();
    const rows = [
      row({ workoutId: 'w1', workoutStartTime: start, workoutEndTime: null, weightKg: 100, reps: 5 }),
      row({ workoutId: 'w2', workoutStartTime: start, workoutEndTime: start + 1_800_000, weightKg: 50, reps: 10 }),
    ];
    const totals = computeSummaryTotals(rows, false);
    expect(totals.totalDurationSeconds).toBe(1_800);
  });
});
