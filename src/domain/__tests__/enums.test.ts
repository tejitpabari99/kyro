/**
 * `domain/enums.ts` unit tests (M1-01) — 05 §2: every enum's value list and
 * count matches the doc verbatim, muscle_group/equipment labels match, and
 * the rpe numeric domain is exact. This is also the first test to actually
 * `require` the module (nothing at runtime does yet — `schema.ts` is only
 * consumed by drizzle-kit's static codegen, never imported by a live test),
 * which is what activates the `src/domain/**` Jest coverage glob (08 §3)
 * rather than leaving it uncollected.
 */
import {
  BODY_MEASUREMENT_UNIT_VALUES,
  DISTANCE_UNIT_VALUES,
  EQUIPMENT_LABELS,
  EQUIPMENT_OPTIONS,
  EQUIPMENT_VALUES,
  EXERCISE_TYPE_VALUES,
  FIRST_DAY_OF_WEEK_VALUES,
  MUSCLE_GROUP_LABELS,
  MUSCLE_GROUP_OPTIONS,
  MUSCLE_GROUP_VALUES,
  PREVIOUS_VALUES_MODE_VALUES,
  RPE_VALUES,
  SET_TYPE_VALUES,
  THEME_VALUES,
  WEIGHT_UNIT_VALUES,
  WORKOUT_STATE_VALUES,
} from '../enums';

describe('exercise_type (05 §2.1)', () => {
  it('has exactly 8 values, in doc order', () => {
    expect(EXERCISE_TYPE_VALUES).toEqual([
      'weight_reps',
      'reps_only',
      'bodyweight_reps',
      'bodyweight_assisted_reps',
      'duration',
      'weight_duration',
      'distance_duration',
      'short_distance_weight',
    ]);
  });
});

describe('set_type (05 §2.2)', () => {
  it('has exactly 4 values, in doc order', () => {
    expect(SET_TYPE_VALUES).toEqual(['normal', 'warmup', 'failure', 'dropset']);
  });
});

describe('muscle_group (05 §2.3)', () => {
  it('has exactly 20 values, in doc order', () => {
    expect(MUSCLE_GROUP_VALUES).toHaveLength(20);
    expect(MUSCLE_GROUP_VALUES).toEqual([
      'abdominals',
      'shoulders',
      'biceps',
      'triceps',
      'forearms',
      'quadriceps',
      'hamstrings',
      'calves',
      'glutes',
      'abductors',
      'adductors',
      'lats',
      'upper_back',
      'traps',
      'lower_back',
      'chest',
      'cardio',
      'neck',
      'full_body',
      'other',
    ]);
  });

  it('has a UI label for every value, matching 05 §2.3 verbatim', () => {
    expect(MUSCLE_GROUP_LABELS).toEqual({
      abdominals: 'Abdominals',
      shoulders: 'Shoulders',
      biceps: 'Biceps',
      triceps: 'Triceps',
      forearms: 'Forearms',
      quadriceps: 'Quadriceps',
      hamstrings: 'Hamstrings',
      calves: 'Calves',
      glutes: 'Glutes',
      abductors: 'Abductors',
      adductors: 'Adductors',
      lats: 'Lats',
      upper_back: 'Upper Back',
      traps: 'Traps',
      lower_back: 'Lower Back',
      chest: 'Chest',
      cardio: 'Cardio',
      neck: 'Neck',
      full_body: 'Full Body',
      other: 'Other',
    });
  });

  it('OPTIONS mirrors VALUES order with the matching label attached', () => {
    expect(MUSCLE_GROUP_OPTIONS).toHaveLength(MUSCLE_GROUP_VALUES.length);
    MUSCLE_GROUP_OPTIONS.forEach((option, index) => {
      expect(option.value).toBe(MUSCLE_GROUP_VALUES[index]);
      expect(option.label).toBe(MUSCLE_GROUP_LABELS[option.value]);
    });
  });
});

describe('equipment (05 §2.4)', () => {
  it('has exactly 9 values, in doc order', () => {
    expect(EQUIPMENT_VALUES).toEqual([
      'none',
      'barbell',
      'dumbbell',
      'kettlebell',
      'machine',
      'plate',
      'resistance_band',
      'suspension',
      'other',
    ]);
  });

  it('has a UI label for every value, matching 05 §2.4 verbatim', () => {
    expect(EQUIPMENT_LABELS).toEqual({
      none: 'None/Bodyweight',
      barbell: 'Barbell',
      dumbbell: 'Dumbbell',
      kettlebell: 'Kettlebell',
      machine: 'Machine',
      plate: 'Plate',
      resistance_band: 'Resistance Band',
      suspension: 'Suspension',
      other: 'Other',
    });
  });

  it('OPTIONS mirrors VALUES order with the matching label attached', () => {
    expect(EQUIPMENT_OPTIONS).toHaveLength(EQUIPMENT_VALUES.length);
    EQUIPMENT_OPTIONS.forEach((option, index) => {
      expect(option.value).toBe(EQUIPMENT_VALUES[index]);
      expect(option.label).toBe(EQUIPMENT_LABELS[option.value]);
    });
  });
});

describe('rpe (05 §2.5)', () => {
  it('is exactly the 8-value numeric domain', () => {
    expect(RPE_VALUES).toEqual([6, 7, 7.5, 8, 8.5, 9, 9.5, 10]);
  });
});

describe('settings enums (05 §2.6)', () => {
  it('weight_unit: kg|lbs', () => {
    expect(WEIGHT_UNIT_VALUES).toEqual(['kg', 'lbs']);
  });

  it('distance_unit: km|miles', () => {
    expect(DISTANCE_UNIT_VALUES).toEqual(['km', 'miles']);
  });

  it('body_measurement_unit: metric|imperial', () => {
    expect(BODY_MEASUREMENT_UNIT_VALUES).toEqual(['metric', 'imperial']);
  });

  it('theme: system|light|dark', () => {
    expect(THEME_VALUES).toEqual(['system', 'light', 'dark']);
  });

  it('first_day_of_week: monday|sunday|saturday', () => {
    expect(FIRST_DAY_OF_WEEK_VALUES).toEqual(['monday', 'sunday', 'saturday']);
  });

  it('previous_values_mode: any_workout|same_routine', () => {
    expect(PREVIOUS_VALUES_MODE_VALUES).toEqual(['any_workout', 'same_routine']);
  });

  it('workout_state: active|completed', () => {
    expect(WORKOUT_STATE_VALUES).toEqual(['active', 'completed']);
  });
});
