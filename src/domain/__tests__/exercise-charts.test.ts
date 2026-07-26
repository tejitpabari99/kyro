/**
 * `domain/exercise-charts.ts` tests (M4-09 acceptance gate) — per-type
 * metric applicability (04 §4.3's table), the best-of vs. aggregate warm-up
 * split, per-metric value formulas (including the two "min wins"/"best
 * pace" and division-by-zero edges), date bucketing (one point per workout
 * date, multi-workout-same-day folding), and the 3M/1Y/All range-cutoff
 * helper.
 */
import {
  chartMetricsForExerciseType,
  chartRangeStartMs,
  computeChartSeries,
  type ChartMetric,
  type ChartRange,
  type ChartSetInput,
} from '../exercise-charts';
import type { ExerciseType } from '../enums';

function set(overrides: Partial<ChartSetInput> = {}): ChartSetInput {
  return {
    workoutStartTime: 1_000,
    exerciseType: 'weight_reps',
    setType: 'normal',
    isCompleted: true,
    weightKg: 100,
    reps: 5,
    durationSeconds: null,
    distanceMeters: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// chartMetricsForExerciseType — 04 §4.3's table, verbatim
// ---------------------------------------------------------------------------

describe('chartMetricsForExerciseType', () => {
  const expected: Record<ExerciseType, ChartMetric[]> = {
    weight_reps: ['heaviest_weight', 'best_1rm', 'best_set_volume', 'session_volume', 'total_reps'],
    bodyweight_reps: ['heaviest_weight', 'best_set_volume', 'session_volume', 'total_reps'],
    bodyweight_assisted_reps: ['total_reps'],
    reps_only: ['total_reps'],
    duration: ['longest_duration', 'total_duration'],
    weight_duration: ['longest_duration', 'total_duration', 'heaviest_weight'],
    distance_duration: ['total_distance', 'total_duration', 'best_pace'],
    short_distance_weight: ['heaviest_weight', 'total_distance'],
  };

  for (const [exerciseType, metrics] of Object.entries(expected) as [ExerciseType, ChartMetric[]][]) {
    it(`${exerciseType} -> ${metrics.join(', ')}`, () => {
      expect(chartMetricsForExerciseType(exerciseType)).toEqual(metrics);
    });
  }

  it('throws on an unrecognized exercise_type (exhaustiveness guard, defensive against schema drift — M4-12 exit-gate coverage gap closed)', () => {
    expect(() => chartMetricsForExerciseType('not_a_real_type' as ExerciseType)).toThrow(
      /unhandled exercise_type/,
    );
  });
});

// ---------------------------------------------------------------------------
// computeChartSeries — per-metric formulas + warm-up rules + date bucketing
// ---------------------------------------------------------------------------

describe('computeChartSeries', () => {
  describe('heaviest_weight (best-of, unconditional warm-up exclusion)', () => {
    it('takes the max weight per date, ignoring a lower same-date set', () => {
      const sets = [
        set({ workoutStartTime: 1_000, weightKg: 80 }),
        set({ workoutStartTime: 1_000 + 60_000, weightKg: 100 }),
      ];
      const series = computeChartSeries(sets, 'heaviest_weight', false);
      expect(series).toHaveLength(1);
      expect(series[0]!.value).toBe(100);
    });

    it('excludes warm-up sets regardless of warmupInStats=true', () => {
      const sets = [set({ setType: 'warmup', weightKg: 999 }), set({ weightKg: 80 })];
      expect(computeChartSeries(sets, 'heaviest_weight', true)[0]!.value).toBe(80);
    });

    it('excludes weight <= 0 and null weight', () => {
      const sets = [set({ weightKg: 0 }), set({ weightKg: null })];
      expect(computeChartSeries(sets, 'heaviest_weight', false)).toEqual([]);
    });

    it('excludes unchecked sets', () => {
      expect(computeChartSeries([set({ isCompleted: false })], 'heaviest_weight', false)).toEqual([]);
    });
  });

  describe('best_1rm (best-of, Epley, reps 1-10 only)', () => {
    it('computes the max Epley estimate per date', () => {
      const sets = [set({ weightKg: 100, reps: 5 }), set({ weightKg: 90, reps: 10 })];
      const series = computeChartSeries(sets, 'best_1rm', false);
      // Epley(100, 5) = 100 * (1 + 5/30) ≈ 116.67; Epley(90, 10) = 120.
      expect(series[0]!.value).toBeCloseTo(120, 5);
    });

    it('excludes reps > 10 (no estimate)', () => {
      expect(computeChartSeries([set({ reps: 11 })], 'best_1rm', false)).toEqual([]);
    });

    it('excludes weight <= 0', () => {
      expect(computeChartSeries([set({ weightKg: 0 })], 'best_1rm', false)).toEqual([]);
    });
  });

  describe('best_set_volume (best-of)', () => {
    it('max weight*reps per date', () => {
      const sets = [set({ weightKg: 50, reps: 10 }), set({ weightKg: 80, reps: 8 })];
      // 500 vs 640 -> 640 wins.
      expect(computeChartSeries(sets, 'best_set_volume', false)[0]!.value).toBe(640);
    });

    it('excludes weight 0 (symmetric with records.ts)', () => {
      expect(computeChartSeries([set({ weightKg: 0, reps: 10 })], 'best_set_volume', false)).toEqual([]);
    });

    it('excludes reps 0', () => {
      expect(computeChartSeries([set({ reps: 0 })], 'best_set_volume', false)).toEqual([]);
    });
  });

  describe('session_volume (aggregate, respects warmup_in_stats)', () => {
    it('sums weight*reps across all eligible sets on one date', () => {
      const sets = [set({ weightKg: 50, reps: 10 }), set({ weightKg: 80, reps: 8 })];
      expect(computeChartSeries(sets, 'session_volume', false)[0]!.value).toBe(500 + 640);
    });

    it('excludes warm-ups when warmupInStats=false', () => {
      const sets = [set({ setType: 'warmup', weightKg: 50, reps: 10 }), set({ weightKg: 80, reps: 8 })];
      expect(computeChartSeries(sets, 'session_volume', false)[0]!.value).toBe(640);
    });

    it('includes warm-ups when warmupInStats=true', () => {
      const sets = [set({ setType: 'warmup', weightKg: 50, reps: 10 }), set({ weightKg: 80, reps: 8 })];
      expect(computeChartSeries(sets, 'session_volume', true)[0]!.value).toBe(500 + 640);
    });
  });

  describe('total_reps (aggregate)', () => {
    it('sums reps across a date, excluding unchecked/zero', () => {
      const sets = [set({ reps: 8 }), set({ reps: 6 }), set({ reps: 0 }), set({ isCompleted: false, reps: 100 })];
      expect(computeChartSeries(sets, 'total_reps', false)[0]!.value).toBe(14);
    });
  });

  describe('longest_duration (best-of)', () => {
    it('takes the max duration per date', () => {
      const sets = [
        set({ exerciseType: 'duration', durationSeconds: 30, weightKg: null, reps: null }),
        set({ exerciseType: 'duration', durationSeconds: 45, weightKg: null, reps: null }),
      ];
      expect(computeChartSeries(sets, 'longest_duration', false)[0]!.value).toBe(45);
    });

    it('excludes warm-ups unconditionally', () => {
      const sets = [
        set({ exerciseType: 'duration', setType: 'warmup', durationSeconds: 999, weightKg: null, reps: null }),
        set({ exerciseType: 'duration', durationSeconds: 30, weightKg: null, reps: null }),
      ];
      expect(computeChartSeries(sets, 'longest_duration', true)[0]!.value).toBe(30);
    });
  });

  describe('total_duration (aggregate)', () => {
    it('sums durations across a date', () => {
      const sets = [
        set({ exerciseType: 'duration', durationSeconds: 30, weightKg: null, reps: null }),
        set({ exerciseType: 'duration', durationSeconds: 45, weightKg: null, reps: null }),
      ];
      expect(computeChartSeries(sets, 'total_duration', false)[0]!.value).toBe(75);
    });
  });

  describe('total_distance (aggregate)', () => {
    it('sums distance across a date', () => {
      const sets = [
        set({ exerciseType: 'distance_duration', distanceMeters: 1000, durationSeconds: 300, weightKg: null, reps: null }),
        set({ exerciseType: 'distance_duration', distanceMeters: 2000, durationSeconds: 600, weightKg: null, reps: null }),
      ];
      expect(computeChartSeries(sets, 'total_distance', false)[0]!.value).toBe(3000);
    });

    it('excludes zero/null distance', () => {
      const sets = [set({ exerciseType: 'distance_duration', distanceMeters: 0, weightKg: null, reps: null })];
      expect(computeChartSeries(sets, 'total_distance', false)).toEqual([]);
    });
  });

  describe('best_pace (best-of, min seconds/meter wins — "best" = fastest)', () => {
    it('picks the lowest seconds-per-meter (fastest) among the date\'s sets', () => {
      const sets = [
        // 300s / 1000m = 0.3 s/m
        set({ exerciseType: 'distance_duration', distanceMeters: 1000, durationSeconds: 300, weightKg: null, reps: null }),
        // 240s / 1000m = 0.24 s/m — faster, should win.
        set({ exerciseType: 'distance_duration', distanceMeters: 1000, durationSeconds: 240, weightKg: null, reps: null }),
      ];
      expect(computeChartSeries(sets, 'best_pace', false)[0]!.value).toBeCloseTo(0.24, 5);
    });

    it('excludes zero distance (division-by-zero guard)', () => {
      const sets = [
        set({ exerciseType: 'distance_duration', distanceMeters: 0, durationSeconds: 300, weightKg: null, reps: null }),
      ];
      expect(computeChartSeries(sets, 'best_pace', false)).toEqual([]);
    });

    it('excludes zero/null duration', () => {
      const sets = [
        set({ exerciseType: 'distance_duration', distanceMeters: 1000, durationSeconds: 0, weightKg: null, reps: null }),
      ];
      expect(computeChartSeries(sets, 'best_pace', false)).toEqual([]);
    });
  });

  describe('date bucketing (one point per workout date)', () => {
    it('folds two workouts on the same local date into one point', () => {
      const morning = new Date(2024, 5, 1, 8, 0, 0).getTime();
      const evening = new Date(2024, 5, 1, 18, 0, 0).getTime();
      const sets = [
        set({ workoutStartTime: morning, weightKg: 80 }),
        set({ workoutStartTime: evening, weightKg: 90 }),
      ];
      const series = computeChartSeries(sets, 'heaviest_weight', false);
      expect(series).toHaveLength(1);
      expect(series[0]!.value).toBe(90);
    });

    it('produces one sorted point per distinct date, ascending', () => {
      const day1 = new Date(2024, 0, 1, 12).getTime();
      const day2 = new Date(2024, 0, 3, 12).getTime();
      const sets = [set({ workoutStartTime: day2, weightKg: 100 }), set({ workoutStartTime: day1, weightKg: 80 })];
      const series = computeChartSeries(sets, 'heaviest_weight', false);
      expect(series.map((p) => p.value)).toEqual([80, 100]);
      expect(series[0]!.epochMs).toBeLessThan(series[1]!.epochMs);
    });

    it('empty input -> empty series', () => {
      expect(computeChartSeries([], 'heaviest_weight', false)).toEqual([]);
    });

    it('throws on an unrecognized metric (exhaustiveness guard, defensive against schema drift — M4-12 exit-gate coverage gap closed)', () => {
      // `computeChartSeries` resolves `isBestOfMetric(metric)` once, up
      // front, before ever looking at `sets` (`exercise-charts.ts`'s own
      // header) — so a bogus metric throws there regardless of input,
      // exercising `isBestOfMetric`'s own exhaustiveness guard specifically
      // (not `candidateValue`'s sibling guard, which this call graph never
      // reaches with an already-invalid metric).
      expect(() => computeChartSeries([set()], 'not_a_real_metric' as ChartMetric, false)).toThrow(
        /unhandled metric/,
      );
    });
  });
});

// ---------------------------------------------------------------------------
// chartRangeStartMs
// ---------------------------------------------------------------------------

describe('chartRangeStartMs', () => {
  const now = new Date(2024, 5, 15).getTime();

  it("'All' has no lower bound", () => {
    expect(chartRangeStartMs('All', now)).toBeNull();
  });

  it("'3M' is ~91 days before now", () => {
    const start = chartRangeStartMs('3M', now)!;
    expect(now - start).toBe(91 * 24 * 60 * 60 * 1000);
  });

  it("'1Y' is ~365 days before now", () => {
    const start = chartRangeStartMs('1Y', now)!;
    expect(now - start).toBe(365 * 24 * 60 * 60 * 1000);
  });

  it('throws on an unrecognized range (exhaustiveness guard, defensive against schema drift — M4-12 exit-gate coverage gap closed)', () => {
    expect(() => chartRangeStartMs('Bogus' as ChartRange, now)).toThrow(/unhandled range/);
  });
});
