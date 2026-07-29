/**
 * `exercise-history-format.ts` tests (M4-09) — one case per `exercise_type`
 * (03 §3's own worked example for `weight_reps`, generalized to the other
 * seven), unit-respecting formatting (kg/lbs, km/mi), RPE/CUSTOM suffixing,
 * and the empty-line case.
 */
import type { ExerciseHistorySet } from '@/data/workouts/types';

import { formatHistorySetLine, type HistorySetLineUnits } from '../exercise-history-format';

function historySet(overrides: Partial<ExerciseHistorySet> = {}): Pick<
  ExerciseHistorySet,
  'weightKg' | 'reps' | 'distanceMeters' | 'durationSeconds' | 'rpe' | 'customMetric'
> {
  return {
    weightKg: null,
    reps: null,
    distanceMeters: null,
    durationSeconds: null,
    rpe: null,
    customMetric: null,
    ...overrides,
  };
}

const KG_UNITS: HistorySetLineUnits = { weightUnit: 'kg', distanceUnit: 'km', rpeEnabled: false };

describe('formatHistorySetLine', () => {
  it("weight_reps: 03 §3's own worked example, '80kg × 8'", () => {
    const line = formatHistorySetLine(
      historySet({ weightKg: 80, reps: 8 }),
      { exerciseType: 'weight_reps', usesCustomMetric: false },
      KG_UNITS,
    );
    expect(line).toBe('80kg × 8');
  });

  it('weight_reps + RPE enabled appends "@9"', () => {
    const line = formatHistorySetLine(
      historySet({ weightKg: 80, reps: 8, rpe: 9 }),
      { exerciseType: 'weight_reps', usesCustomMetric: false },
      { ...KG_UNITS, rpeEnabled: true },
    );
    expect(line).toBe('80kg × 8 @9');
  });

  it('weight_reps in lbs converts the weight column', () => {
    const line = formatHistorySetLine(
      historySet({ weightKg: 100, reps: 5 }),
      { exerciseType: 'weight_reps', usesCustomMetric: false },
      { ...KG_UNITS, weightUnit: 'lbs' },
    );
    // 100 kg -> ~220.5 lb (formatCellValue rounds to nearest 0.5 lb at >= 10 lb).
    expect(line).toBe('220.5lbs × 5');
  });

  it('reps_only: bare rep count, no weight/unit', () => {
    const line = formatHistorySetLine(
      historySet({ reps: 12 }),
      { exerciseType: 'reps_only', usesCustomMetric: false },
      KG_UNITS,
    );
    expect(line).toBe('12');
  });

  it('bodyweight_reps: "+" prefix on the added-weight column', () => {
    const line = formatHistorySetLine(
      historySet({ weightKg: 10, reps: 8 }),
      { exerciseType: 'bodyweight_reps', usesCustomMetric: false },
      KG_UNITS,
    );
    expect(line).toBe('+10kg × 8');
  });

  it('bodyweight_assisted_reps: "−" prefix on the assistance column', () => {
    const line = formatHistorySetLine(
      historySet({ weightKg: 15, reps: 6 }),
      { exerciseType: 'bodyweight_assisted_reps', usesCustomMetric: false },
      KG_UNITS,
    );
    expect(line).toBe('−15kg × 6');
  });

  it('duration: mm:ss, no weight, no × separator', () => {
    const line = formatHistorySetLine(
      historySet({ durationSeconds: 90 }),
      { exerciseType: 'duration', usesCustomMetric: false },
      KG_UNITS,
    );
    expect(line).toBe('1:30');
  });

  it('weight_duration: weight · time (dot separator, not multiplication)', () => {
    const line = formatHistorySetLine(
      historySet({ weightKg: 20, durationSeconds: 60 }),
      { exerciseType: 'weight_duration', usesCustomMetric: false },
      KG_UNITS,
    );
    expect(line).toBe('20kg · 1:00');
  });

  it('distance_duration: km · time', () => {
    const line = formatHistorySetLine(
      historySet({ distanceMeters: 5200, durationSeconds: 1920 }),
      { exerciseType: 'distance_duration', usesCustomMetric: false },
      KG_UNITS,
    );
    expect(line).toBe('5.2km · 32:00');
  });

  it('distance_duration in miles converts the distance column', () => {
    const line = formatHistorySetLine(
      historySet({ distanceMeters: 1609.344, durationSeconds: 300 }),
      { exerciseType: 'distance_duration', usesCustomMetric: false },
      { ...KG_UNITS, distanceUnit: 'miles' },
    );
    expect(line).toBe('1mi · 5:00');
  });

  it('short_distance_weight: weight · meters', () => {
    const line = formatHistorySetLine(
      historySet({ weightKg: 60, distanceMeters: 20 }),
      { exerciseType: 'short_distance_weight', usesCustomMetric: false },
      KG_UNITS,
    );
    expect(line).toBe('60kg · 20m');
  });

  it('appends CUSTOM metric when the exercise uses it', () => {
    const line = formatHistorySetLine(
      historySet({ weightKg: 80, reps: 8, customMetric: 4 }),
      { exerciseType: 'weight_reps', usesCustomMetric: true },
      KG_UNITS,
    );
    expect(line).toBe('80kg × 8 · 4');
  });

  it('RPE not shown when rpeEnabled is false, even if the set has a value', () => {
    const line = formatHistorySetLine(
      historySet({ weightKg: 80, reps: 8, rpe: 9 }),
      { exerciseType: 'weight_reps', usesCustomMetric: false },
      KG_UNITS,
    );
    expect(line).toBe('80kg × 8');
  });

  it('RPE not shown for non-rep-based types even if rpeEnabled', () => {
    const line = formatHistorySetLine(
      historySet({ durationSeconds: 30, rpe: 9 }),
      { exerciseType: 'duration', usesCustomMetric: false },
      { ...KG_UNITS, rpeEnabled: true },
    );
    expect(line).toBe('0:30');
  });

  it('an entirely empty row (bare unfilled set) formats as an empty string', () => {
    const line = formatHistorySetLine(
      historySet(),
      { exerciseType: 'weight_reps', usesCustomMetric: false },
      KG_UNITS,
    );
    expect(line).toBe('');
  });
});
