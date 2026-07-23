/**
 * `domain/volume.ts` tests (M2-04 acceptance gate, 08 §4.2 — every named
 * case implemented as its own `it`).
 */
import type { ExerciseType } from '../enums';
import { formatVolumeDisplay, setVolumeKg, totalVolumeKg, type VolumeSetInput } from '../volume';

function set(overrides: Partial<VolumeSetInput> = {}): VolumeSetInput {
  return {
    exerciseType: 'weight_reps',
    setType: 'normal',
    weightKg: 0,
    reps: 0,
    isCompleted: true,
    ...overrides,
  };
}

describe('domain/volume — setVolumeKg (08 §4.2)', () => {
  it('weight_reps 80×8=640', () => {
    expect(setVolumeKg(set({ exerciseType: 'weight_reps', weightKg: 80, reps: 8 }), false)).toBe(640);
  });

  it('bodyweight_reps +10×8=80 (added weight × reps, not max(reps,1))', () => {
    expect(setVolumeKg(set({ exerciseType: 'bodyweight_reps', weightKg: 10, reps: 8 }), false)).toBe(80);
  });

  it('bodyweight_reps with 0 reps contributes 0 (no max(reps,1) floor for this type)', () => {
    expect(setVolumeKg(set({ exerciseType: 'bodyweight_reps', weightKg: 10, reps: 0 }), false)).toBe(0);
  });

  it('bodyweight_assisted_reps 20×12=0 (always excluded)', () => {
    expect(
      setVolumeKg(set({ exerciseType: 'bodyweight_assisted_reps', weightKg: 20, reps: 12 }), false),
    ).toBe(0);
  });

  it('reps_only=0', () => {
    expect(setVolumeKg(set({ exerciseType: 'reps_only', reps: 15 }), false)).toBe(0);
  });

  it('duration=0', () => {
    expect(setVolumeKg(set({ exerciseType: 'duration' }), false)).toBe(0);
  });

  it('distance_duration=0', () => {
    expect(setVolumeKg(set({ exerciseType: 'distance_duration' }), false)).toBe(0);
  });

  it('weight_duration 20 kg 60 s=20 (weight × max(reps,1), reps always null for this type)', () => {
    expect(setVolumeKg(set({ exerciseType: 'weight_duration', weightKg: 20, reps: null }), false)).toBe(
      20,
    );
  });

  it('short_distance_weight 60 kg 20 m=60 (weight × max(reps,1), reps always null for this type)', () => {
    expect(
      setVolumeKg(set({ exerciseType: 'short_distance_weight', weightKg: 60, reps: null }), false),
    ).toBe(60);
  });

  it('weight_reps floors reps at 1 when reps is null/0 (max(reps,1))', () => {
    expect(setVolumeKg(set({ exerciseType: 'weight_reps', weightKg: 45, reps: null }), false)).toBe(45);
    expect(setVolumeKg(set({ exerciseType: 'weight_reps', weightKg: 45, reps: 0 }), false)).toBe(45);
  });

  it('null weightKg is treated as 0, not NaN', () => {
    expect(setVolumeKg(set({ exerciseType: 'weight_reps', weightKg: null, reps: 8 }), false)).toBe(0);
  });

  describe('warm-up included iff the setting is on', () => {
    it('a warm-up set contributes 0 when warmupInStats is false', () => {
      expect(
        setVolumeKg(set({ exerciseType: 'weight_reps', setType: 'warmup', weightKg: 40, reps: 10 }), false),
      ).toBe(0);
    });

    it('a warm-up set contributes its full volume when warmupInStats is true', () => {
      expect(
        setVolumeKg(set({ exerciseType: 'weight_reps', setType: 'warmup', weightKg: 40, reps: 10 }), true),
      ).toBe(400);
    });

    it('a non-warmup set is unaffected by warmupInStats either way', () => {
      const s = set({ exerciseType: 'weight_reps', setType: 'normal', weightKg: 40, reps: 10 });
      expect(setVolumeKg(s, false)).toBe(400);
      expect(setVolumeKg(s, true)).toBe(400);
    });
  });

  describe('unchecked rows always contribute 0', () => {
    it('an unchecked weight_reps set contributes 0 regardless of values', () => {
      expect(
        setVolumeKg(set({ exerciseType: 'weight_reps', weightKg: 100, reps: 10, isCompleted: false }), false),
      ).toBe(0);
    });

    it('an unchecked set contributes 0 even when warmupInStats is true and it is a warm-up', () => {
      expect(
        setVolumeKg(
          set({
            exerciseType: 'weight_reps',
            setType: 'warmup',
            weightKg: 100,
            reps: 10,
            isCompleted: false,
          }),
          true,
        ),
      ).toBe(0);
    });
  });

  it('throws on an unrecognized exercise_type (exhaustiveness guard, defensive against schema drift)', () => {
    const bogus = set({ exerciseType: 'not_a_real_type' as ExerciseType });
    expect(() => setVolumeKg(bogus, false)).toThrow(/unhandled exercise_type/);
  });
});

describe('domain/volume — totalVolumeKg (workout volume = Σ)', () => {
  it('sums every set’s contribution, mixing contributing and non-contributing types/states', () => {
    const sets: VolumeSetInput[] = [
      set({ exerciseType: 'weight_reps', weightKg: 80, reps: 8 }), // 640
      set({ exerciseType: 'bodyweight_reps', weightKg: 10, reps: 8 }), // 80
      set({ exerciseType: 'reps_only', reps: 20 }), // 0
      set({ exerciseType: 'weight_reps', weightKg: 999, reps: 1, isCompleted: false }), // 0 (unchecked)
      set({ exerciseType: 'weight_reps', setType: 'warmup', weightKg: 40, reps: 10 }), // 0 (warm-up, setting off)
    ];
    expect(totalVolumeKg(sets, false)).toBe(720);
  });

  it('an empty set list sums to 0', () => {
    expect(totalVolumeKg([], false)).toBe(0);
  });
});

describe('domain/volume — formatVolumeDisplay (display converts kg->lb correctly)', () => {
  it('kg is returned unconverted', () => {
    expect(formatVolumeDisplay(640, 'kg')).toBe(640);
  });

  it('lbs reuses domain/units.ts’s formatWeightLb (nearest 0.5 lb at/above 10 lb)', () => {
    // 640 kg -> 640 * 2.2046226218 = 1410.958... -> nearest 0.5 lb = 1411.
    expect(formatVolumeDisplay(640, 'lbs')).toBeCloseTo(1411, 5);
  });

  it('small lbs volumes round to the nearest 0.1 lb (below the 10 lb threshold)', () => {
    // 1 kg -> 2.2046226218 lb -> nearest 0.1 = 2.2
    expect(formatVolumeDisplay(1, 'lbs')).toBeCloseTo(2.2, 5);
  });

  it('0 volume formats as 0 in both units', () => {
    expect(formatVolumeDisplay(0, 'kg')).toBe(0);
    expect(formatVolumeDisplay(0, 'lbs')).toBe(0);
  });
});
