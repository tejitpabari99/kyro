/**
 * `domain/previous-values.ts` tests (M2-04 acceptance gate, 08 §4.8's
 * previous-values bullets — see that file's header for the exact split of
 * responsibility between this suite and `workout-repository.mutators
 * .test.ts` (M2-02)) plus 02 §4's per-type PREVIOUS label formats.
 */
import type { ExerciseType } from '../enums';
import {
  computeCurrentRowBuckets,
  computePreviousValues,
  type CurrentRowLike,
  type PreviousSetLike,
  type PreviousValueDisplayOptions,
} from '../previous-values';

const KG_KM: PreviousValueDisplayOptions = { weightUnit: 'kg', distanceUnit: 'km' };

function previousSet(overrides: Partial<PreviousSetLike> = {}): PreviousSetLike {
  return {
    bucketIndex: 0,
    isWarmup: false,
    setType: 'normal',
    weightKg: null,
    reps: null,
    distanceMeters: null,
    durationSeconds: null,
    rpe: null,
    customMetric: null,
    ...overrides,
  };
}

function row(overrides: Partial<CurrentRowLike> = {}): CurrentRowLike {
  return { id: 'row-1', setType: 'normal', ...overrides };
}

describe('domain/previous-values — computeCurrentRowBuckets (warm-up/working independently numbered, 02 §6)', () => {
  it('numbers warm-up and working rows in two independent, position-order counters', () => {
    const rows: CurrentRowLike[] = [
      row({ id: 'w1', setType: 'warmup' }),
      row({ id: 'n1', setType: 'normal' }),
      row({ id: 'n2', setType: 'failure' }), // failure still counts as a "working" row for numbering
      row({ id: 'w2', setType: 'warmup' }),
      row({ id: 'n3', setType: 'dropset' }),
    ];

    expect(computeCurrentRowBuckets(rows)).toEqual([
      { isWarmup: true, bucketIndex: 0 }, // w1
      { isWarmup: false, bucketIndex: 0 }, // n1
      { isWarmup: false, bucketIndex: 1 }, // n2
      { isWarmup: true, bucketIndex: 1 }, // w2
      { isWarmup: false, bucketIndex: 2 }, // n3
    ]);
  });

  it('an empty row list produces an empty bucket list', () => {
    expect(computeCurrentRowBuckets([])).toEqual([]);
  });
});

describe('domain/previous-values — computePreviousValues: bucket matching', () => {
  it('matches a working row to the previous session’s i-th non-warm-up set (warm-ups excluded from that count)', () => {
    const rows = [row({ setType: 'normal' })];
    const previous = [
      previousSet({ isWarmup: true, bucketIndex: 0, weightKg: 20, reps: 12 }), // a warm-up — must not match
      previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 45, reps: 9 }),
    ];

    const [result] = computePreviousValues('weight_reps', rows, previous, KG_KM);

    expect(result!.label).toBe('45kg × 9');
    expect(result!.source).toBe('previous');
  });

  it('matches a warm-up row to the previous session’s i-th warm-up set by its own warm-up index', () => {
    const rows = [row({ setType: 'warmup' })];
    const previous = [
      previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 100, reps: 5 }), // a working set — must not match
      previousSet({ isWarmup: true, bucketIndex: 0, weightKg: 20, reps: 12 }),
    ];

    const [result] = computePreviousValues('weight_reps', rows, previous, KG_KM);

    expect(result!.label).toBe('20kg × 12');
  });

  it('W,1,2,W,3 current rows each match their own bucket-relative previous set (02 §4 numbering example)', () => {
    const rows: CurrentRowLike[] = [
      row({ id: 'w1', setType: 'warmup' }),
      row({ id: 'n1', setType: 'normal' }),
      row({ id: 'n2', setType: 'normal' }),
      row({ id: 'w2', setType: 'warmup' }),
      row({ id: 'n3', setType: 'normal' }),
    ];
    const previous = [
      previousSet({ isWarmup: true, bucketIndex: 0, weightKg: 20, reps: 15 }),
      previousSet({ isWarmup: true, bucketIndex: 1, weightKg: 30, reps: 10 }),
      previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 80, reps: 8 }),
      previousSet({ isWarmup: false, bucketIndex: 1, weightKg: 85, reps: 6 }),
      previousSet({ isWarmup: false, bucketIndex: 2, weightKg: 87.5, reps: 5 }),
    ];

    const results = computePreviousValues('weight_reps', rows, previous, KG_KM);

    expect(results.map((r) => r.label)).toEqual([
      '20kg × 15', // w1
      '80kg × 8', // n1
      '85kg × 6', // n2
      '30kg × 10', // w2
      '87.5kg × 5', // n3
    ]);
  });
});

describe('domain/previous-values — "fewer-previous-sets -> —" (08 §4.8, this module’s own concern)', () => {
  it('current rows beyond the previous session’s set count show — (no routine target)', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' }), row({ id: 'c' })];
    const previous = [previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 60, reps: 10 })];

    const results = computePreviousValues('weight_reps', rows, previous, KG_KM);

    expect(results[0]!.label).toBe('60kg × 10');
    expect(results[1]).toMatchObject({ label: null, autofill: null, source: 'none' });
    expect(results[2]).toMatchObject({ label: null, autofill: null, source: 'none' });
  });

  it('a fewer-previous-sets row still falls back to its own routineTarget before showing —', () => {
    const rows = [
      row({ id: 'a' }),
      row({ id: 'b', routineTarget: { weightKg: 50, reps: 10 } }),
    ];
    const previous = [previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 60, reps: 10 })];

    const results = computePreviousValues('weight_reps', rows, previous, KG_KM);

    expect(results[0]!.label).toBe('60kg × 10');
    expect(results[1]).toMatchObject({ label: '50kg × 10', source: 'routine_target' });
  });

  it('no previous sets at all and no routine targets -> every row shows —', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' })];

    const results = computePreviousValues('weight_reps', rows, [], KG_KM);

    expect(results).toEqual([
      { label: null, autofill: null, source: 'none', isRepRange: false },
      { label: null, autofill: null, source: 'none', isRepRange: false },
    ]);
  });
});

describe('domain/previous-values — mode-agnosticism (08 §4.8: "any_workout vs same_routine")', () => {
  // The mode/routine restriction itself is resolved upstream by
  // `WorkoutRepository.previousSets({routineId})` (M2-02, integration
  // tested there) — this module just maps whichever array it's handed.
  // These two arrays stand in for "what an any_workout-mode query
  // returned" vs. "what a same_routine-mode query returned" for the same
  // exercise/row, proving both are mapped correctly.
  const rows = [row()];

  it('maps an any_workout-mode result correctly', () => {
    const anyWorkoutResult = [previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 70, reps: 8 })];
    expect(computePreviousValues('weight_reps', rows, anyWorkoutResult, KG_KM)[0]!.label).toBe('70kg × 8');
  });

  it('maps a same_routine-mode result correctly (different value for the identical row shape)', () => {
    const sameRoutineResult = [previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 90, reps: 6 })];
    expect(computePreviousValues('weight_reps', rows, sameRoutineResult, KG_KM)[0]!.label).toBe('90kg × 6');
  });
});

describe('domain/previous-values — occurrence matching for a duplicated exercise (08 §4.8, 02 §16.6)', () => {
  // `occurrenceIndex` is resolved upstream too (`previousSets`'s own
  // option, M2-02) — the two calls below stand in for "the 1st card's
  // previousSets() call" vs. "the 2nd card's previousSets() call" for the
  // same exercise appearing twice in one workout, each already restricted
  // to its own occurrence before reaching this module.
  const rows = [row()];

  it('the first occurrence’s previousSets array maps to its own card', () => {
    const firstOccurrence = [previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 60, reps: 10 })];
    expect(computePreviousValues('weight_reps', rows, firstOccurrence, KG_KM)[0]!.label).toBe('60kg × 10');
  });

  it('the second occurrence’s previousSets array maps to its own card, independently', () => {
    const secondOccurrence = [previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 40, reps: 15 })];
    expect(computePreviousValues('weight_reps', rows, secondOccurrence, KG_KM)[0]!.label).toBe('40kg × 15');
  });
});

describe('domain/previous-values — autofill payload (02 §4: "tap autofills current row’s inputs")', () => {
  it('autofill mirrors the matched previous set’s canonical values', () => {
    const rows = [row()];
    const previous = [
      previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 80, reps: 8, rpe: 8.5, customMetric: 3 }),
    ];

    const [result] = computePreviousValues('weight_reps', rows, previous, KG_KM);

    expect(result!.autofill).toEqual({
      weightKg: 80,
      reps: 8,
      distanceMeters: null,
      durationSeconds: null,
      customMetric: null,
    });
  });

  it('a rep-range routine target autofills weight but leaves reps null (04 §2.3: never a committable number)', () => {
    const rows = [row({ routineTarget: { weightKg: 60, repRangeLabel: '6-8' } })];

    const [result] = computePreviousValues('weight_reps', rows, [], KG_KM);

    expect(result!.label).toBe('60kg × 6-8');
    expect(result!.isRepRange).toBe(true);
    expect(result!.autofill).toMatchObject({ weightKg: 60, reps: null });
  });
});

describe('domain/previous-values — per-type PREVIOUS label formats (02 §4 examples)', () => {
  it('weight_reps -> "45kg × 9"', () => {
    const previous = [previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 45, reps: 9 })];
    expect(computePreviousValues('weight_reps', [row()], previous, KG_KM)[0]!.label).toBe('45kg × 9');
  });

  it('bodyweight_reps -> "+10kg × 8"', () => {
    const previous = [previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 10, reps: 8 })];
    expect(computePreviousValues('bodyweight_reps', [row()], previous, KG_KM)[0]!.label).toBe('+10kg × 8');
  });

  it('bodyweight_reps with no added weight logged (0) -> "+0kg × 8"', () => {
    const previous = [previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 0, reps: 8 })];
    expect(computePreviousValues('bodyweight_reps', [row()], previous, KG_KM)[0]!.label).toBe('+0kg × 8');
  });

  it('bodyweight_assisted_reps -> "−20kg × 12"', () => {
    const previous = [previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 20, reps: 12 })];
    expect(computePreviousValues('bodyweight_assisted_reps', [row()], previous, KG_KM)[0]!.label).toBe(
      '−20kg × 12',
    );
  });

  it('duration -> "1:30"', () => {
    const previous = [previousSet({ isWarmup: false, bucketIndex: 0, durationSeconds: 90 })];
    expect(computePreviousValues('duration', [row()], previous, KG_KM)[0]!.label).toBe('1:30');
  });

  it('weight_duration -> "20kg / 1:00"', () => {
    const previous = [previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 20, durationSeconds: 60 })];
    expect(computePreviousValues('weight_duration', [row()], previous, KG_KM)[0]!.label).toBe('20kg / 1:00');
  });

  it('distance_duration -> "5km / 28:00"', () => {
    const previous = [
      previousSet({ isWarmup: false, bucketIndex: 0, distanceMeters: 5000, durationSeconds: 1680 }),
    ];
    expect(computePreviousValues('distance_duration', [row()], previous, KG_KM)[0]!.label).toBe(
      '5km / 28:00',
    );
  });

  it('distance_duration in miles -> converts via domain/units.ts', () => {
    const previous = [
      previousSet({ isWarmup: false, bucketIndex: 0, distanceMeters: 5000, durationSeconds: 1680 }),
    ];
    const miles: PreviousValueDisplayOptions = { weightUnit: 'kg', distanceUnit: 'miles' };
    // 5000 m -> 3.106855... mi -> round2 -> 3.11
    expect(computePreviousValues('distance_duration', [row()], previous, miles)[0]!.label).toBe(
      '3.11mi / 28:00',
    );
  });

  it('short_distance_weight -> "60kg / 20m"', () => {
    const previous = [
      previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 60, distanceMeters: 20 }),
    ];
    expect(computePreviousValues('short_distance_weight', [row()], previous, KG_KM)[0]!.label).toBe(
      '60kg / 20m',
    );
  });

  it('short_distance_weight in the imperial system displays feet, not miles (05 §5)', () => {
    const previous = [
      previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 60, distanceMeters: 20 }),
    ];
    const imperial: PreviousValueDisplayOptions = { weightUnit: 'lbs', distanceUnit: 'miles' };
    // 60 kg -> 132.28 lb (nearest 0.5 at >=10lb); 20 m -> 65.6168 ft -> round whole -> 66 ft.
    expect(computePreviousValues('short_distance_weight', [row()], previous, imperial)[0]!.label).toBe(
      '132.5lb / 66ft',
    );
  });

  it('reps_only -> bare reps number', () => {
    const previous = [previousSet({ isWarmup: false, bucketIndex: 0, reps: 15 })];
    expect(computePreviousValues('reps_only', [row()], previous, KG_KM)[0]!.label).toBe('15');
  });

  it('weight in lbs converts via domain/units.ts’s formatWeightLb', () => {
    const previous = [previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 100, reps: 5 })];
    const lbs: PreviousValueDisplayOptions = { weightUnit: 'lbs', distanceUnit: 'km' };
    // 100 kg -> 220.46226218 lb -> nearest 0.5 -> 220.5
    expect(computePreviousValues('weight_reps', [row()], previous, lbs)[0]!.label).toBe('220.5lb × 5');
  });
});

describe('domain/previous-values — a matched previous set with a missing required field renders — for that row', () => {
  it('weight_reps previous set missing reps (defensively malformed data) -> null label, no crash', () => {
    const previous = [previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 80, reps: null })];
    const [result] = computePreviousValues('weight_reps', [row()], previous, KG_KM);
    expect(result!.label).toBeNull();
    expect(result!.source).toBe('previous');
  });

  it('reps_only missing reps -> null label', () => {
    const previous = [previousSet({ isWarmup: false, bucketIndex: 0, reps: null })];
    expect(computePreviousValues('reps_only', [row()], previous, KG_KM)[0]!.label).toBeNull();
  });

  it('bodyweight_reps missing reps -> null label', () => {
    const previous = [previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 10, reps: null })];
    expect(computePreviousValues('bodyweight_reps', [row()], previous, KG_KM)[0]!.label).toBeNull();
  });

  it('bodyweight_assisted_reps missing reps -> null label', () => {
    const previous = [previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 20, reps: null })];
    expect(computePreviousValues('bodyweight_assisted_reps', [row()], previous, KG_KM)[0]!.label).toBeNull();
  });

  it('duration missing durationSeconds -> null label', () => {
    const previous = [previousSet({ isWarmup: false, bucketIndex: 0, durationSeconds: null })];
    expect(computePreviousValues('duration', [row()], previous, KG_KM)[0]!.label).toBeNull();
  });

  it('weight_duration missing either weight or duration -> null label', () => {
    const missingWeight = [previousSet({ isWarmup: false, bucketIndex: 0, weightKg: null, durationSeconds: 60 })];
    const missingDuration = [previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 20, durationSeconds: null })];
    expect(computePreviousValues('weight_duration', [row()], missingWeight, KG_KM)[0]!.label).toBeNull();
    expect(computePreviousValues('weight_duration', [row()], missingDuration, KG_KM)[0]!.label).toBeNull();
  });

  it('distance_duration missing either distance or duration -> null label', () => {
    const missingDistance = [
      previousSet({ isWarmup: false, bucketIndex: 0, distanceMeters: null, durationSeconds: 1680 }),
    ];
    const missingDuration = [
      previousSet({ isWarmup: false, bucketIndex: 0, distanceMeters: 5000, durationSeconds: null }),
    ];
    expect(computePreviousValues('distance_duration', [row()], missingDistance, KG_KM)[0]!.label).toBeNull();
    expect(computePreviousValues('distance_duration', [row()], missingDuration, KG_KM)[0]!.label).toBeNull();
  });

  it('short_distance_weight missing either weight or distance -> null label', () => {
    const missingWeight = [
      previousSet({ isWarmup: false, bucketIndex: 0, weightKg: null, distanceMeters: 20 }),
    ];
    const missingDistance = [
      previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 60, distanceMeters: null }),
    ];
    expect(computePreviousValues('short_distance_weight', [row()], missingWeight, KG_KM)[0]!.label).toBeNull();
    expect(computePreviousValues('short_distance_weight', [row()], missingDistance, KG_KM)[0]!.label).toBeNull();
  });
});

describe('domain/previous-values — "??" default-value branches (no weightKg logged/targeted)', () => {
  it('bodyweight_reps previous set with weightKg null defaults the added-weight display to 0', () => {
    const previous = [previousSet({ isWarmup: false, bucketIndex: 0, weightKg: null, reps: 8 })];
    expect(computePreviousValues('bodyweight_reps', [row()], previous, KG_KM)[0]!.label).toBe('+0kg × 8');
  });

  it('bodyweight_assisted_reps previous set with weightKg null defaults the assistance display to 0', () => {
    const previous = [previousSet({ isWarmup: false, bucketIndex: 0, weightKg: null, reps: 12 })];
    expect(computePreviousValues('bodyweight_assisted_reps', [row()], previous, KG_KM)[0]!.label).toBe(
      '−0kg × 12',
    );
  });

  it('a routineTarget with no weightKg/reps set falls back to null for each (defensive — no crash)', () => {
    const rows = [row({ routineTarget: {} })];
    const [result] = computePreviousValues('weight_reps', rows, [], KG_KM);
    expect(result!.label).toBeNull();
    expect(result!.source).toBe('routine_target');
  });
});

describe('domain/previous-values — exhaustiveness guard', () => {
  it('throws on an unrecognized exercise_type (defensive against schema drift)', () => {
    const previous = [previousSet({ isWarmup: false, bucketIndex: 0, weightKg: 1, reps: 1 })];
    expect(() =>
      computePreviousValues('not_a_real_type' as ExerciseType, [row()], previous, KG_KM),
    ).toThrow(/unhandled exercise_type/);
  });
});
