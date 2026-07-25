/**
 * `domain/history-summary.ts` tests (M4-03) — `bestSetForExercise` per
 * exercise-type comparison rule + eligibility gate, and
 * `formatBestSetSummary`'s unit-aware display strings, one `it` per type
 * (mirrors `domain/volume.test.ts`/`domain/records.test.ts`'s own per-type
 * coverage convention).
 */
import type { ExerciseType } from '../enums';
import {
  bestSetForExercise,
  formatBestSetSummary,
  type HistoryCardSetInput,
} from '../history-summary';

function set(overrides: Partial<HistoryCardSetInput> = {}): HistoryCardSetInput {
  return {
    setType: 'normal',
    isCompleted: true,
    weightKg: null,
    reps: null,
    distanceMeters: null,
    durationSeconds: null,
    ...overrides,
  };
}

const KG_UNITS = { weightUnit: 'kg' as const, distanceUnit: 'km' as const };
const LBS_UNITS = { weightUnit: 'lbs' as const, distanceUnit: 'miles' as const };

describe('domain/history-summary — bestSetForExercise', () => {
  it('weight_reps: picks the heaviest set, tie-broken by higher reps', () => {
    const sets = [
      set({ weightKg: 60, reps: 8 }),
      set({ weightKg: 80, reps: 5 }),
      set({ weightKg: 80, reps: 8 }),
    ];
    expect(bestSetForExercise('weight_reps', sets)).toEqual(set({ weightKg: 80, reps: 8 }));
  });

  it('bodyweight_reps: heaviest added weight wins', () => {
    const sets = [set({ weightKg: 0, reps: 12 }), set({ weightKg: 10, reps: 8 })];
    expect(bestSetForExercise('bodyweight_reps', sets)).toEqual(set({ weightKg: 10, reps: 8 }));
  });

  it('bodyweight_assisted_reps: LEAST assistance wins (smaller weight is better)', () => {
    const sets = [set({ weightKg: 20, reps: 8 }), set({ weightKg: 10, reps: 8 })];
    expect(bestSetForExercise('bodyweight_assisted_reps', sets)).toEqual(
      set({ weightKg: 10, reps: 8 }),
    );
  });

  it('reps_only: most reps wins', () => {
    const sets = [set({ reps: 8 }), set({ reps: 15 }), set({ reps: 12 })];
    expect(bestSetForExercise('reps_only', sets)).toEqual(set({ reps: 15 }));
  });

  it('duration: longest duration wins', () => {
    const sets = [set({ durationSeconds: 30 }), set({ durationSeconds: 90 })];
    expect(bestSetForExercise('duration', sets)).toEqual(set({ durationSeconds: 90 }));
  });

  it('weight_duration: heaviest weight wins, tie-broken by longer duration', () => {
    const sets = [
      set({ weightKg: 20, durationSeconds: 60 }),
      set({ weightKg: 20, durationSeconds: 90 }),
    ];
    expect(bestSetForExercise('weight_duration', sets)).toEqual(
      set({ weightKg: 20, durationSeconds: 90 }),
    );
  });

  it('distance_duration: farthest distance wins', () => {
    const sets = [
      set({ distanceMeters: 3_000, durationSeconds: 900 }),
      set({ distanceMeters: 5_000, durationSeconds: 1_500 }),
    ];
    expect(bestSetForExercise('distance_duration', sets)).toEqual(
      set({ distanceMeters: 5_000, durationSeconds: 1_500 }),
    );
  });

  it('short_distance_weight: heaviest weight wins, tie-broken by farther distance', () => {
    const sets = [
      set({ weightKg: 60, distanceMeters: 15 }),
      set({ weightKg: 60, distanceMeters: 20 }),
    ];
    expect(bestSetForExercise('short_distance_weight', sets)).toEqual(
      set({ weightKg: 60, distanceMeters: 20 }),
    );
  });

  it('excludes unchecked sets', () => {
    const sets = [set({ weightKg: 100, reps: 1, isCompleted: false }), set({ weightKg: 60, reps: 8 })];
    expect(bestSetForExercise('weight_reps', sets)).toEqual(set({ weightKg: 60, reps: 8 }));
  });

  it('excludes warm-up sets even when heavier than every working set', () => {
    const sets = [
      set({ weightKg: 200, reps: 1, setType: 'warmup' }),
      set({ weightKg: 60, reps: 8 }),
    ];
    expect(bestSetForExercise('weight_reps', sets)).toEqual(set({ weightKg: 60, reps: 8 }));
  });

  it('a null primary field never becomes the candidate', () => {
    const sets = [set({ weightKg: null, reps: 8 }), set({ weightKg: 60, reps: 5 })];
    expect(bestSetForExercise('weight_reps', sets)).toEqual(set({ weightKg: 60, reps: 5 }));
  });

  it('returns null when nothing is eligible', () => {
    expect(bestSetForExercise('weight_reps', [set({ setType: 'warmup', weightKg: 100, reps: 5 })])).toBeNull();
    expect(bestSetForExercise('weight_reps', [])).toBeNull();
  });

  it('an unhandled exercise_type throws (exhaustiveness guard)', () => {
    expect(() => bestSetForExercise('bogus' as ExerciseType, [set()])).toThrow(/unhandled exercise_type/);
  });

  it('a tie where the secondary field is null on one side still resolves (nullish fallback)', () => {
    const nullReps = set({ weightKg: 60, reps: null });
    const withReps = set({ weightKg: 60, reps: 8 });
    expect(bestSetForExercise('weight_reps', [nullReps, withReps])).toEqual(withReps);
    expect(bestSetForExercise('weight_reps', [withReps, nullReps])).toEqual(withReps);
  });
});

describe('domain/history-summary — formatBestSetSummary', () => {
  it('weight_reps in kg: "80kg × 8"', () => {
    expect(formatBestSetSummary('weight_reps', set({ weightKg: 80, reps: 8 }), KG_UNITS)).toBe(
      '80kg × 8',
    );
  });

  it('weight_reps in lbs converts + formats the weight', () => {
    expect(formatBestSetSummary('weight_reps', set({ weightKg: 100, reps: 5 }), LBS_UNITS)).toBe(
      '220.5lbs × 5',
    );
  });

  it('reps_only: "12 reps"', () => {
    expect(formatBestSetSummary('reps_only', set({ reps: 12 }), KG_UNITS)).toBe('12 reps');
  });

  it('duration: mm:ss, no unit suffix needed', () => {
    expect(formatBestSetSummary('duration', set({ durationSeconds: 150 }), KG_UNITS)).toBe('2:30');
  });

  it('weight_duration: "40kg × 2:30"', () => {
    expect(
      formatBestSetSummary('weight_duration', set({ weightKg: 40, durationSeconds: 150 }), KG_UNITS),
    ).toBe('40kg × 2:30');
  });

  it('distance_duration: "5km × 25:00"', () => {
    expect(
      formatBestSetSummary(
        'distance_duration',
        set({ distanceMeters: 5_000, durationSeconds: 1_500 }),
        KG_UNITS,
      ),
    ).toBe('5km × 25:00');
  });

  it('short_distance_weight metric: meters, whole number', () => {
    expect(
      formatBestSetSummary('short_distance_weight', set({ weightKg: 60, distanceMeters: 20.4 }), KG_UNITS),
    ).toBe('60kg × 20m');
  });

  it('short_distance_weight imperial: feet', () => {
    expect(
      formatBestSetSummary(
        'short_distance_weight',
        set({ weightKg: 60, distanceMeters: 20 }),
        LBS_UNITS,
      ),
    ).toBe(`${Math.round(60 * 2.2046226218 * 2) / 2}lbs × 66ft`);
  });

  it('distance_duration in miles', () => {
    expect(
      formatBestSetSummary(
        'distance_duration',
        set({ distanceMeters: 5_000, durationSeconds: 1_500 }),
        LBS_UNITS,
      ),
    ).toBe(`${Math.round((5_000 / 1609.344) * 100) / 100}mi × 25:00`);
  });

  it('returns null when the type\'s own required field(s) are missing', () => {
    expect(formatBestSetSummary('weight_reps', set({ weightKg: null, reps: 8 }), KG_UNITS)).toBeNull();
    expect(formatBestSetSummary('duration', set({ durationSeconds: null }), KG_UNITS)).toBeNull();
    expect(
      formatBestSetSummary('weight_duration', set({ weightKg: null, durationSeconds: 90 }), KG_UNITS),
    ).toBeNull();
    expect(
      formatBestSetSummary(
        'short_distance_weight',
        set({ weightKg: 60, distanceMeters: null }),
        KG_UNITS,
      ),
    ).toBeNull();
    expect(formatBestSetSummary('reps_only', set({ reps: null }), KG_UNITS)).toBeNull();
    expect(
      formatBestSetSummary(
        'distance_duration',
        set({ distanceMeters: 5_000, durationSeconds: null }),
        KG_UNITS,
      ),
    ).toBeNull();
  });

  it('an unhandled exercise_type throws (exhaustiveness guard)', () => {
    expect(() => formatBestSetSummary('bogus' as ExerciseType, set(), KG_UNITS)).toThrow(
      /unhandled exercise_type/,
    );
  });
});
