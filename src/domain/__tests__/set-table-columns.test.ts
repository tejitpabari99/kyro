/**
 * `domain/set-table-columns.ts` tests (M2-06 acceptance gate): "each of the
 * 8 types renders exactly its expected columns" + the CUSTOM/RPE modifier
 * rules, verified directly against the pure engine (the RNTL-level version
 * of this same acceptance criterion lives in
 * `src/features/workout/__tests__/ExerciseSetTableSection.test.tsx`, which
 * asserts the rendered header text; this file is the exhaustive per-type
 * unit-level proof).
 */
import { EXERCISE_TYPE_VALUES, type ExerciseType } from '../enums';
import { columnsForExerciseType, type SetColumnOptions } from '../set-table-columns';

const BASE_OPTIONS: SetColumnOptions = {
  usesCustomMetric: false,
  rpeEnabled: false,
  weightUnit: 'kg',
  distanceUnit: 'km',
};

function keys(exerciseType: ExerciseType, options: Partial<SetColumnOptions> = {}): string[] {
  return columnsForExerciseType(exerciseType, { ...BASE_OPTIONS, ...options }).map((c) => c.key);
}

describe('columnsForExerciseType — 02 §4 table, one case per type', () => {
  it('weight_reps -> KG, REPS', () => {
    const columns = columnsForExerciseType('weight_reps', BASE_OPTIONS);
    expect(columns).toEqual([
      { key: 'weight', kind: 'weight', label: 'KG' },
      { key: 'reps', kind: 'reps', label: 'REPS' },
    ]);
  });

  it('weight_reps in lbs -> LBS label', () => {
    expect(columnsForExerciseType('weight_reps', { ...BASE_OPTIONS, weightUnit: 'lbs' })[0]).toEqual({
      key: 'weight',
      kind: 'weight',
      label: 'LBS',
    });
  });

  it('reps_only -> REPS only', () => {
    expect(keys('reps_only')).toEqual(['reps']);
  });

  it('bodyweight_reps -> +KG, REPS', () => {
    const columns = columnsForExerciseType('bodyweight_reps', BASE_OPTIONS);
    expect(columns).toEqual([
      { key: 'weight', kind: 'weight_added', label: '+KG' },
      { key: 'reps', kind: 'reps', label: 'REPS' },
    ]);
  });

  it('bodyweight_assisted_reps -> −KG, REPS', () => {
    const columns = columnsForExerciseType('bodyweight_assisted_reps', BASE_OPTIONS);
    expect(columns).toEqual([
      { key: 'weight', kind: 'weight_assisted', label: '−KG' },
      { key: 'reps', kind: 'reps', label: 'REPS' },
    ]);
  });

  it('duration -> TIME only', () => {
    expect(keys('duration')).toEqual(['duration']);
  });

  it('weight_duration -> KG, TIME', () => {
    expect(keys('weight_duration')).toEqual(['weight', 'duration']);
  });

  it('distance_duration -> KM, TIME (km unit)', () => {
    const columns = columnsForExerciseType('distance_duration', BASE_OPTIONS);
    expect(columns).toEqual([
      { key: 'distance', kind: 'distance', label: 'KM' },
      { key: 'duration', kind: 'time', label: 'TIME' },
    ]);
  });

  it('distance_duration in miles -> MILES label', () => {
    expect(
      columnsForExerciseType('distance_duration', { ...BASE_OPTIONS, distanceUnit: 'miles' })[0],
    ).toEqual({ key: 'distance', kind: 'distance', label: 'MILES' });
  });

  it('short_distance_weight -> KG, M (metric)', () => {
    const columns = columnsForExerciseType('short_distance_weight', BASE_OPTIONS);
    expect(columns).toEqual([
      { key: 'weight', kind: 'weight', label: 'KG' },
      { key: 'distance', kind: 'short_distance', label: 'M' },
    ]);
  });

  it('short_distance_weight -> KG, FT (imperial) — not MILES, per 05 §5’s meters/feet pairing', () => {
    expect(
      columnsForExerciseType('short_distance_weight', { ...BASE_OPTIONS, distanceUnit: 'miles' })[1],
    ).toEqual({ key: 'distance', kind: 'short_distance', label: 'FT' });
  });

  it('every exercise_type value is handled (exhaustiveness)', () => {
    for (const exerciseType of EXERCISE_TYPE_VALUES) {
      expect(() => columnsForExerciseType(exerciseType, BASE_OPTIONS)).not.toThrow();
    }
  });

  it('an unhandled type throws (exhaustiveness guard fires at runtime too)', () => {
    expect(() => columnsForExerciseType('not_a_type' as ExerciseType, BASE_OPTIONS)).toThrow(
      /unhandled exercise_type/,
    );
  });
});

describe('columnsForExerciseType — CUSTOM column (uses_custom_metric)', () => {
  it('appends CUSTOM after the type’s own columns when usesCustomMetric is true', () => {
    expect(keys('weight_reps', { usesCustomMetric: true })).toEqual(['weight', 'reps', 'custom']);
  });

  it('CUSTOM applies to every type, including single-column ones', () => {
    expect(keys('duration', { usesCustomMetric: true })).toEqual(['duration', 'custom']);
  });

  it('no CUSTOM column when usesCustomMetric is false', () => {
    expect(keys('weight_reps', { usesCustomMetric: false })).toEqual(['weight', 'reps']);
  });
});

describe('columnsForExerciseType — RPE column (rep-based types only, 02 §5)', () => {
  const REP_BASED: ExerciseType[] = [
    'weight_reps',
    'reps_only',
    'bodyweight_reps',
    'bodyweight_assisted_reps',
  ];
  const NOT_REP_BASED: ExerciseType[] = [
    'duration',
    'weight_duration',
    'distance_duration',
    'short_distance_weight',
  ];

  it.each(REP_BASED)('%s gets an RPE column when rpeEnabled', (exerciseType) => {
    expect(keys(exerciseType, { rpeEnabled: true })).toContain('rpe');
  });

  it.each(NOT_REP_BASED)('%s never gets an RPE column, even when rpeEnabled', (exerciseType) => {
    expect(keys(exerciseType, { rpeEnabled: true })).not.toContain('rpe');
  });

  it('no RPE column when rpeEnabled is false, even for rep-based types', () => {
    expect(keys('weight_reps', { rpeEnabled: false })).not.toContain('rpe');
  });

  it('CUSTOM sorts before RPE when both apply', () => {
    expect(keys('weight_reps', { usesCustomMetric: true, rpeEnabled: true })).toEqual([
      'weight',
      'reps',
      'custom',
      'rpe',
    ]);
  });
});
