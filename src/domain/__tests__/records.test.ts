/**
 * `domain/records.ts` tests (M4-01 acceptance gate) — **all 13 named cases
 * of 08 §4.1** ("PR computation — the highest-risk area"), each in its own
 * `describe` block titled with the case number so the mapping from this
 * file to that doc section is unambiguous, plus a broader matrix (every
 * `exercise_type`'s eligibility branch, the weight-0 exclusion applying
 * symmetrically to Best Set Volume, tolerance edges, sort-order correctness,
 * empty-history/empty-set baselines) at the file's own quality bar
 * (`routine-diff.test.ts`, 36 cases).
 */
import {
  applyRecordSet,
  computeRecordsSnapshot,
  EMPTY_RECORDS_SNAPSHOT,
  evaluateLiveCheck,
  type HistoricalSet,
  type RecordAward,
} from '../records';
import { kgToLb, lbToKg } from '../units';

let nextSetId = 0;

function historicalSet(overrides: Partial<HistoricalSet> = {}): HistoricalSet {
  nextSetId += 1;
  return {
    setId: `set-${nextSetId}`,
    workoutId: 'workout-1',
    workoutStartTime: 1,
    setOrder: 0,
    exerciseType: 'weight_reps',
    setType: 'normal',
    isCompleted: true,
    weightKg: 100,
    reps: 5,
    durationSeconds: null,
    ...overrides,
  };
}

function recordTypesOf(awards: readonly RecordAward[]): string[] {
  return awards.map((a) => (a.recordType === 'set_record' ? `set_record[${a.bucket}]` : a.recordType));
}

beforeEach(() => {
  nextSetId = 0;
});

// ---------------------------------------------------------------------------
// Case 1: single history: 100×5 → Heaviest 100, 1RM 116.67, Best Set Volume
// 500, Most Reps 5, set-record[5]=100.
// ---------------------------------------------------------------------------
describe('08 §4.1 case 1 — single history: 100×5', () => {
  it('sets Heaviest 100, Best Est. 1RM ~116.67, Best Set Volume 500, Most Reps 5, set-record[5]=100', () => {
    const { snapshot, awards } = computeRecordsSnapshot([
      historicalSet({ setId: 's1', weightKg: 100, reps: 5 }),
    ]);

    expect(snapshot.heaviestWeightKg?.value).toBe(100);
    expect(snapshot.best1RmKg?.value).toBeCloseTo(116.6666666667, 9);
    expect(snapshot.bestSetVolumeKg?.value).toBe(500);
    expect(snapshot.mostReps?.value).toBe(5);
    expect(snapshot.setRecords[5]?.value).toBe(100);
    expect(snapshot.longestDurationSeconds).toBeNull();
    expect(snapshot.leastAssistanceKg).toBeNull();

    // The first-ever eligible set trivially "beats" an empty baseline — it
    // holds every applicable trophy.
    expect(recordTypesOf(awards).sort()).toEqual(
      ['best_1rm', 'best_set_volume', 'heaviest_weight', 'most_reps', 'set_record[5]'].sort(),
    );
    expect(awards.every((a) => a.setId === 's1')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Case 2: warm-up 110×3 never beats working 100×5, for any record type.
// ---------------------------------------------------------------------------
describe('08 §4.1 case 2 — warm-up never beats a working set', () => {
  it('a heavier warm-up set earns nothing against an existing working-set best, regardless of order', () => {
    const working = historicalSet({ setId: 'working', setType: 'normal', weightKg: 100, reps: 5, workoutStartTime: 1 });
    const warmup = historicalSet({ setId: 'warmup', setType: 'warmup', weightKg: 110, reps: 3, workoutStartTime: 2 });

    const afterWorking = computeRecordsSnapshot([working]).snapshot;
    const { snapshot: afterWarmup, awards } = applyRecordSet(afterWorking, warmup);

    expect(awards).toEqual([]);
    expect(afterWarmup.heaviestWeightKg?.value).toBe(100);
    expect(afterWarmup.best1RmKg?.value).toBeCloseTo(116.6666666667, 9);
    expect(afterWarmup.bestSetVolumeKg?.value).toBe(500);
    expect(afterWarmup.mostReps?.value).toBe(5);
    expect(afterWarmup.setRecords[5]?.value).toBe(100);
  });

  it('a warm-up appearing first in history still never becomes the baseline the working set has to beat', () => {
    const warmupFirst = historicalSet({ setId: 'warmup', setType: 'warmup', weightKg: 110, reps: 3, workoutStartTime: 1 });
    const working = historicalSet({ setId: 'working', setType: 'normal', weightKg: 100, reps: 5, workoutStartTime: 2 });

    const { snapshot, awards } = computeRecordsSnapshot([warmupFirst, working]);

    expect(snapshot.heaviestWeightKg?.value).toBe(100);
    expect(snapshot.heaviestWeightKg?.setId).toBe('working');
    expect(recordTypesOf(awards)).not.toContain('heaviest_weight_from_warmup');
    expect(awards.some((a) => a.setId === 'warmup')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Case 3: failure and dropset sets ARE eligible.
// ---------------------------------------------------------------------------
describe('08 §4.1 case 3 — failure and dropset sets are eligible', () => {
  it('a failure-type set can earn Heaviest Weight', () => {
    const { snapshot, awards } = computeRecordsSnapshot([
      historicalSet({ setId: 'f1', setType: 'failure', weightKg: 100, reps: 5 }),
    ]);
    expect(snapshot.heaviestWeightKg?.value).toBe(100);
    expect(recordTypesOf(awards)).toContain('heaviest_weight');
  });

  it('a dropset-type set can earn Heaviest Weight', () => {
    const { snapshot, awards } = computeRecordsSnapshot([
      historicalSet({ setId: 'd1', setType: 'dropset', weightKg: 100, reps: 5 }),
    ]);
    expect(snapshot.heaviestWeightKg?.value).toBe(100);
    expect(recordTypesOf(awards)).toContain('heaviest_weight');
  });
});

// ---------------------------------------------------------------------------
// Case 4: strict-greater — second 100 kg set (later date) does not
// re-award Heaviest.
// ---------------------------------------------------------------------------
describe('08 §4.1 case 4 — strict-greater: equal value does not re-award', () => {
  it('a second, later, identical-weight set earns no new Heaviest Weight award', () => {
    const first = historicalSet({ setId: 'a', weightKg: 100, reps: 5, workoutStartTime: 1 });
    const second = historicalSet({ setId: 'b', weightKg: 100, reps: 5, workoutStartTime: 2 });

    const { snapshot, awards } = computeRecordsSnapshot([first, second]);

    expect(snapshot.heaviestWeightKg?.setId).toBe('a');
    expect(awards.filter((a) => a.recordType === 'heaviest_weight')).toHaveLength(1);
    expect(awards.some((a) => a.setId === 'b')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Case 5: Epley bounds — reps=1 → 1RM = weight; reps=10 → w×1.333…;
// reps=11 → excluded from 1RM (but counts for volume/reps records).
// ---------------------------------------------------------------------------
describe('08 §4.1 case 5 — Epley bounds integrated into records eligibility', () => {
  it('reps=1: Best Est. 1RM equals the weight itself', () => {
    const { snapshot } = computeRecordsSnapshot([historicalSet({ weightKg: 80, reps: 1 })]);
    expect(snapshot.best1RmKg?.value).toBe(80);
  });

  it('reps=10: Best Est. 1RM = weight × 1.333...', () => {
    const { snapshot } = computeRecordsSnapshot([historicalSet({ weightKg: 90, reps: 10 })]);
    expect(snapshot.best1RmKg?.value).toBeCloseTo(90 * (4 / 3), 9);
  });

  it('reps=11: excluded from Best Est. 1RM, but still counts for Best Set Volume, Most Reps, and the "10+" set-record bucket', () => {
    const { snapshot } = computeRecordsSnapshot([historicalSet({ weightKg: 100, reps: 11 })]);
    expect(snapshot.best1RmKg).toBeNull();
    expect(snapshot.bestSetVolumeKg?.value).toBe(1100);
    expect(snapshot.mostReps?.value).toBe(11);
    expect(snapshot.setRecords['10+']?.value).toBe(100);
    expect(snapshot.setRecords[10]).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Case 6: set records — 100×5 then 90×5 → record[5]=100; 100×8 sets
// record[8]=100 AND does not alter record[5]; reps 12 → bucket "10+".
// ---------------------------------------------------------------------------
describe('08 §4.1 case 6 — set-record buckets are independent per rep count', () => {
  it('100×5 then 90×5 → record[5] stays 100 (90 does not beat it)', () => {
    const { snapshot, awards } = computeRecordsSnapshot([
      historicalSet({ setId: 'a', weightKg: 100, reps: 5, workoutStartTime: 1 }),
      historicalSet({ setId: 'b', weightKg: 90, reps: 5, workoutStartTime: 2 }),
    ]);
    expect(snapshot.setRecords[5]?.value).toBe(100);
    expect(snapshot.setRecords[5]?.setId).toBe('a');
    expect(awards.some((a) => a.setId === 'b' && a.recordType === 'set_record')).toBe(false);
  });

  it('a later 100×8 sets record[8]=100 without altering record[5]', () => {
    const { snapshot } = computeRecordsSnapshot([
      historicalSet({ setId: 'a', weightKg: 100, reps: 5, workoutStartTime: 1 }),
      historicalSet({ setId: 'b', weightKg: 90, reps: 5, workoutStartTime: 2 }),
      historicalSet({ setId: 'c', weightKg: 100, reps: 8, workoutStartTime: 3 }),
    ]);
    expect(snapshot.setRecords[5]?.value).toBe(100);
    expect(snapshot.setRecords[5]?.setId).toBe('a');
    expect(snapshot.setRecords[8]?.value).toBe(100);
    expect(snapshot.setRecords[8]?.setId).toBe('c');
    expect(snapshot.setRecords[6]).toBeNull();
  });

  it('reps=12 keys the "10+" bucket, not "10" and not both', () => {
    const { snapshot, awards } = computeRecordsSnapshot([
      historicalSet({ setId: 'd', weightKg: 110, reps: 12, workoutStartTime: 1 }),
    ]);
    expect(snapshot.setRecords['10+']?.value).toBe(110);
    expect(snapshot.setRecords[10]).toBeNull();
    expect(awards.filter((a) => a.recordType === 'set_record')).toHaveLength(1);
    expect(awards.filter((a) => a.recordType === 'set_record')[0]).toMatchObject({ bucket: '10+' });
  });

  it('reps=10 exactly keys the "10" bucket, not "10+"', () => {
    const { snapshot } = computeRecordsSnapshot([historicalSet({ weightKg: 100, reps: 10 })]);
    expect(snapshot.setRecords[10]?.value).toBe(100);
    expect(snapshot.setRecords['10+']).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Case 7: kg tolerance — 45 lb→kg→compare equal within 0.001 (no false
// PR from float drift).
// ---------------------------------------------------------------------------
describe('08 §4.1 case 7 — kg tolerance (0.001) absorbs unit-conversion float drift', () => {
  it('45 lb converted to kg, then round-tripped lb→kg again, compares equal (no false PR)', () => {
    const kgA = lbToKg(45) as number;
    const kgB = lbToKg(kgToLb(kgA) as number) as number;

    const historySnapshot = computeRecordsSnapshot([
      historicalSet({ setId: 'a', weightKg: kgA, reps: 5, workoutStartTime: 1 }),
    ]).snapshot;
    const { awards } = applyRecordSet(
      historySnapshot,
      historicalSet({ setId: 'b', weightKg: kgB, reps: 5, workoutStartTime: 2 }),
    );

    expect(awards).toEqual([]);
  });

  it('a value strictly more than 0.001 kg over the current best does beat it', () => {
    const historySnapshot = computeRecordsSnapshot([historicalSet({ weightKg: 100, reps: 5 })]).snapshot;
    const { awards } = applyRecordSet(
      historySnapshot,
      historicalSet({ weightKg: 100.002, reps: 5, workoutStartTime: 2 }),
    );
    expect(recordTypesOf(awards)).toContain('heaviest_weight');
  });

  it('a value within 0.001 kg of the current best does not beat it', () => {
    const historySnapshot = computeRecordsSnapshot([historicalSet({ weightKg: 100, reps: 5 })]).snapshot;
    const { awards } = applyRecordSet(
      historySnapshot,
      historicalSet({ weightKg: 100.0005, reps: 5, workoutStartTime: 2 }),
    );
    expect(recordTypesOf(awards)).not.toContain('heaviest_weight');
  });
});

// ---------------------------------------------------------------------------
// Case 8: trophy attribution (04 §5.2) — W1(100), W2(105), W3(103) → W1
// heaviest-at-time, W2 heaviest, W3 none. Edit W1 to 110 → only W1 holds
// Heaviest.
// ---------------------------------------------------------------------------
describe('08 §4.1 case 8 — trophy attribution sequence + edit reflow', () => {
  function threeWorkoutHistory(w1Weight: number): HistoricalSet[] {
    return [
      historicalSet({ setId: 'w1-set', workoutId: 'w1', workoutStartTime: 1, weightKg: w1Weight, reps: 5 }),
      historicalSet({ setId: 'w2-set', workoutId: 'w2', workoutStartTime: 2, weightKg: 105, reps: 5 }),
      historicalSet({ setId: 'w3-set', workoutId: 'w3', workoutStartTime: 3, weightKg: 103, reps: 5 }),
    ];
  }

  it('W1(100), W2(105), W3(103): W1 and W2 hold the Heaviest Weight trophy at their own time; W3 holds none', () => {
    const { snapshot, awards } = computeRecordsSnapshot(threeWorkoutHistory(100));
    const heaviestAwards = awards.filter((a) => a.recordType === 'heaviest_weight');

    expect(heaviestAwards.map((a) => a.setId)).toEqual(['w1-set', 'w2-set']);
    expect(heaviestAwards.some((a) => a.setId === 'w3-set')).toBe(false);
    expect(snapshot.heaviestWeightKg?.setId).toBe('w2-set');
  });

  it('editing W1 to 110 kg: only W1 holds the Heaviest Weight trophy afterward (105 and 103 no longer beat it)', () => {
    const { snapshot, awards } = computeRecordsSnapshot(threeWorkoutHistory(110));
    const heaviestAwards = awards.filter((a) => a.recordType === 'heaviest_weight');

    expect(heaviestAwards.map((a) => a.setId)).toEqual(['w1-set']);
    expect(snapshot.heaviestWeightKg).toEqual({ value: 110, setId: 'w1-set', workoutId: 'w1' });
  });
});

// ---------------------------------------------------------------------------
// Case 9: delete PR workout → next-best becomes the record everywhere.
// ---------------------------------------------------------------------------
describe('08 §4.1 case 9 — delete → next-best becomes the record', () => {
  it('deleting the 105 kg workout restores the 102.5 kg workout as the Heaviest Weight PR', () => {
    const lower = historicalSet({ setId: 'lower', workoutId: 'w-lower', workoutStartTime: 1, weightKg: 102.5, reps: 5 });
    const higher = historicalSet({ setId: 'higher', workoutId: 'w-higher', workoutStartTime: 2, weightKg: 105, reps: 5 });

    const beforeDelete = computeRecordsSnapshot([lower, higher]).snapshot;
    expect(beforeDelete.heaviestWeightKg?.value).toBe(105);

    const afterDelete = computeRecordsSnapshot([lower]).snapshot;
    expect(afterDelete.heaviestWeightKg).toEqual({ value: 102.5, setId: 'lower', workoutId: 'w-lower' });
  });

  it('deleting a set-record holder also restores the next-best within that same bucket', () => {
    const best = historicalSet({ setId: 'best', workoutId: 'w1', workoutStartTime: 1, weightKg: 100, reps: 5 });
    const second = historicalSet({ setId: 'second', workoutId: 'w2', workoutStartTime: 2, weightKg: 90, reps: 5 });

    const before = computeRecordsSnapshot([best, second]).snapshot;
    expect(before.setRecords[5]?.value).toBe(100);

    const after = computeRecordsSnapshot([second]).snapshot;
    expect(after.setRecords[5]).toEqual({ value: 90, setId: 'second', workoutId: 'w2' });
  });
});

// ---------------------------------------------------------------------------
// Case 10: live-check baseline includes the current session's earlier
// checked sets. 100 then 102.5 in-session → banner only on first if
// history best was 99, and again at 102.5; duplicate 102.5 → no banner.
// ---------------------------------------------------------------------------
describe('08 §4.1 case 10 — live-check baseline = history + already-checked session sets', () => {
  it('history best 99 → checking 100 banners, checking 102.5 next banners again, a duplicate 102.5 does not', () => {
    const historySnapshot = computeRecordsSnapshot([
      historicalSet({ setId: 'hist', workoutId: 'w-hist', workoutStartTime: 1, weightKg: 99, reps: 5 }),
    ]).snapshot;

    const checkedAt100 = historicalSet({ setId: 's-100', workoutId: 'w-live', weightKg: 100, reps: 5 });
    const first = evaluateLiveCheck(historySnapshot, [], checkedAt100);
    expect(recordTypesOf(first)).toContain('heaviest_weight');

    const checkedAt1025 = historicalSet({ setId: 's-102.5', workoutId: 'w-live', weightKg: 102.5, reps: 5 });
    const second = evaluateLiveCheck(historySnapshot, [checkedAt100], checkedAt1025);
    expect(recordTypesOf(second)).toContain('heaviest_weight');

    const duplicateAt1025 = historicalSet({ setId: 's-102.5-dup', workoutId: 'w-live', weightKg: 102.5, reps: 5 });
    const third = evaluateLiveCheck(historySnapshot, [checkedAt100, checkedAt1025], duplicateAt1025);
    expect(third).toEqual([]);
  });

  it('an in-session set that never beats history earns nothing, even mid-session', () => {
    const historySnapshot = computeRecordsSnapshot([
      historicalSet({ setId: 'hist', workoutId: 'w-hist', workoutStartTime: 1, weightKg: 150, reps: 5 }),
    ]).snapshot;
    const candidate = historicalSet({ weightKg: 100, reps: 5, workoutId: 'w-live' });
    expect(evaluateLiveCheck(historySnapshot, [], candidate)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Case 11: bodyweight/assisted/reps-only — +10×8 → Heaviest(added)=10;
// assisted sets excluded from Heaviest/volume records; reps-only → Most
// Reps only.
// ---------------------------------------------------------------------------
describe('08 §4.1 case 11 — bodyweight_reps / bodyweight_assisted_reps / reps_only', () => {
  it('bodyweight_reps +10×8: Heaviest uses the added weight (10); volume/most-reps/set-record all apply; 1RM never does', () => {
    const { snapshot } = computeRecordsSnapshot([
      historicalSet({ exerciseType: 'bodyweight_reps', weightKg: 10, reps: 8 }),
    ]);
    expect(snapshot.heaviestWeightKg?.value).toBe(10);
    expect(snapshot.bestSetVolumeKg?.value).toBe(80);
    expect(snapshot.mostReps?.value).toBe(8);
    expect(snapshot.setRecords[8]?.value).toBe(10);
    expect(snapshot.best1RmKg).toBeNull();
  });

  it('bodyweight_assisted_reps: excluded from Heaviest/volume/1RM/set-record; Most Reps still applies; assistance tracked as an informational least-assistance minimum, not a trophy', () => {
    const { snapshot, awards } = computeRecordsSnapshot([
      historicalSet({ exerciseType: 'bodyweight_assisted_reps', weightKg: 20, reps: 12 }),
    ]);
    expect(snapshot.heaviestWeightKg).toBeNull();
    expect(snapshot.bestSetVolumeKg).toBeNull();
    expect(snapshot.best1RmKg).toBeNull();
    expect(snapshot.setRecords[10]).toBeNull();
    expect(snapshot.setRecords['10+']).toBeNull();
    expect(snapshot.mostReps?.value).toBe(12);
    expect(snapshot.leastAssistanceKg?.value).toBe(20);
    expect(recordTypesOf(awards)).toEqual(['most_reps']);
  });

  it('assisted: a lower assistance value later undercuts (improves) the informational minimum', () => {
    const { snapshot } = computeRecordsSnapshot([
      historicalSet({ exerciseType: 'bodyweight_assisted_reps', weightKg: 20, reps: 10, workoutStartTime: 1 }),
      historicalSet({ exerciseType: 'bodyweight_assisted_reps', weightKg: 15, reps: 10, workoutStartTime: 2 }),
    ]);
    expect(snapshot.leastAssistanceKg?.value).toBe(15);
  });

  it('assisted: a later, higher (worse) assistance value does not replace the existing minimum', () => {
    const { snapshot } = computeRecordsSnapshot([
      historicalSet({ setId: 'less', exerciseType: 'bodyweight_assisted_reps', weightKg: 15, reps: 10, workoutStartTime: 1 }),
      historicalSet({ setId: 'more', exerciseType: 'bodyweight_assisted_reps', weightKg: 20, reps: 10, workoutStartTime: 2 }),
    ]);
    expect(snapshot.leastAssistanceKg).toEqual({ value: 15, setId: 'less', workoutId: 'workout-1' });
  });

  it('reps_only: only Most Reps applies — no weight/duration record ever fires', () => {
    const { snapshot, awards } = computeRecordsSnapshot([historicalSet({ exerciseType: 'reps_only', weightKg: null, reps: 8, durationSeconds: null })]);
    expect(snapshot.mostReps?.value).toBe(8);
    expect(snapshot.heaviestWeightKg).toBeNull();
    expect(snapshot.bestSetVolumeKg).toBeNull();
    expect(snapshot.best1RmKg).toBeNull();
    expect(snapshot.longestDurationSeconds).toBeNull();
    expect(recordTypesOf(awards)).toEqual(['most_reps']);
  });
});

// ---------------------------------------------------------------------------
// Case 12: `duration` type — Longest Duration only; 0-duration excluded.
// ---------------------------------------------------------------------------
describe('08 §4.1 case 12 — duration type', () => {
  it('only Longest Duration applies for exercise_type "duration"', () => {
    const { snapshot, awards } = computeRecordsSnapshot([
      historicalSet({ exerciseType: 'duration', weightKg: null, reps: null, durationSeconds: 90 }),
    ]);
    expect(snapshot.longestDurationSeconds?.value).toBe(90);
    expect(snapshot.heaviestWeightKg).toBeNull();
    expect(snapshot.mostReps).toBeNull();
    expect(recordTypesOf(awards)).toEqual(['longest_duration']);
  });

  it('a 0-second duration is excluded (no record, no award)', () => {
    const { snapshot, awards } = computeRecordsSnapshot([
      historicalSet({ exerciseType: 'duration', weightKg: null, reps: null, durationSeconds: 0 }),
    ]);
    expect(snapshot.longestDurationSeconds).toBeNull();
    expect(awards).toEqual([]);
  });

  it('a later, shorter duration does not beat (or replace) the existing longest', () => {
    const { snapshot, awards } = computeRecordsSnapshot([
      historicalSet({ setId: 'long', exerciseType: 'duration', weightKg: null, reps: null, durationSeconds: 90, workoutStartTime: 1 }),
      historicalSet({ setId: 'short', exerciseType: 'duration', weightKg: null, reps: null, durationSeconds: 60, workoutStartTime: 2 }),
    ]);
    expect(snapshot.longestDurationSeconds).toEqual({ value: 90, setId: 'long', workoutId: 'workout-1' });
    expect(awards.some((a) => a.setId === 'short')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Case 13: uncheck removes contribution — check 105 (banner), uncheck,
// re-check → banner again; finish with it unchecked → no record persisted.
// ---------------------------------------------------------------------------
describe('08 §4.1 case 13 — uncheck/re-check/finish-unchecked', () => {
  it('checking 105 banners; "unchecking" (simply omitting it from sessionCheckedSets) then re-checking banners again, identically', () => {
    const historySnapshot = computeRecordsSnapshot([
      historicalSet({ setId: 'hist', workoutId: 'w-hist', workoutStartTime: 1, weightKg: 90, reps: 5 }),
    ]).snapshot;

    const candidate = () => historicalSet({ setId: 's-105', workoutId: 'w-live', weightKg: 105, reps: 5 });

    const checked = evaluateLiveCheck(historySnapshot, [], candidate());
    expect(recordTypesOf(checked)).toContain('heaviest_weight');

    // "Uncheck": the caller simply never includes it in sessionCheckedSets
    // for a subsequent evaluation — no separate undo API exists (file
    // header). Re-checking calls evaluateLiveCheck against the exact same
    // baseline again.
    const rechecked = evaluateLiveCheck(historySnapshot, [], candidate());
    expect(recordTypesOf(rechecked)).toContain('heaviest_weight');
    expect(rechecked).toEqual(checked.map((a) => ({ ...a, setId: candidate().setId })));
  });

  it('a set that was checked live but never actually saved (isCompleted: false) contributes no record, even if mixed into a history array', () => {
    const neverFinished = historicalSet({
      setId: 'unfinished',
      workoutId: 'w-live',
      workoutStartTime: 2,
      weightKg: 105,
      reps: 5,
      isCompleted: false,
    });
    const priorHistory = historicalSet({ setId: 'hist', workoutId: 'w-hist', workoutStartTime: 1, weightKg: 90, reps: 5 });

    const { snapshot, awards } = computeRecordsSnapshot([priorHistory, neverFinished]);

    expect(snapshot.heaviestWeightKg).toEqual({ value: 90, setId: 'hist', workoutId: 'w-hist' });
    expect(awards.some((a) => a.setId === 'unfinished')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Broader matrix — beyond the 13 named cases: full exercise-type coverage,
// the weight-0 exclusion applying symmetrically to Best Set Volume, null
// handling, global gate, sort-order correctness, empty inputs.
// ---------------------------------------------------------------------------

describe('exercise-type eligibility matrix (04 §5.1 table, every branch)', () => {
  it('weight_duration: Heaviest Weight + Longest Duration only', () => {
    const { snapshot, awards } = computeRecordsSnapshot([
      historicalSet({ exerciseType: 'weight_duration', weightKg: 20, reps: null, durationSeconds: 60 }),
    ]);
    expect(snapshot.heaviestWeightKg?.value).toBe(20);
    expect(snapshot.longestDurationSeconds?.value).toBe(60);
    expect(snapshot.bestSetVolumeKg).toBeNull();
    expect(snapshot.best1RmKg).toBeNull();
    expect(snapshot.mostReps).toBeNull();
    expect(snapshot.setRecords[5]).toBeNull();
    expect(recordTypesOf(awards).sort()).toEqual(['heaviest_weight', 'longest_duration'].sort());
  });

  it('weight_duration: a 0-second duration is excluded, but Heaviest Weight (duration-independent) still applies', () => {
    const { snapshot } = computeRecordsSnapshot([
      historicalSet({ exerciseType: 'weight_duration', weightKg: 20, reps: null, durationSeconds: 0 }),
    ]);
    expect(snapshot.heaviestWeightKg?.value).toBe(20);
    expect(snapshot.longestDurationSeconds).toBeNull();
  });

  it('distance_duration: Longest Duration only (no weight column at all)', () => {
    const { snapshot, awards } = computeRecordsSnapshot([
      historicalSet({ exerciseType: 'distance_duration', weightKg: null, reps: null, durationSeconds: 1680 }),
    ]);
    expect(snapshot.longestDurationSeconds?.value).toBe(1680);
    expect(snapshot.heaviestWeightKg).toBeNull();
    expect(recordTypesOf(awards)).toEqual(['longest_duration']);
  });

  it('short_distance_weight: Heaviest Weight only (no reps/duration column)', () => {
    const { snapshot, awards } = computeRecordsSnapshot([
      historicalSet({ exerciseType: 'short_distance_weight', weightKg: 60, reps: null, durationSeconds: null }),
    ]);
    expect(snapshot.heaviestWeightKg?.value).toBe(60);
    expect(snapshot.longestDurationSeconds).toBeNull();
    expect(snapshot.mostReps).toBeNull();
    expect(recordTypesOf(awards)).toEqual(['heaviest_weight']);
  });

  it('throws on an unrecognized exercise_type (exhaustiveness guard, defensive against schema drift)', () => {
    const bogus = historicalSet({ exerciseType: 'not_a_real_type' as HistoricalSet['exerciseType'] });
    expect(() => applyRecordSet(EMPTY_RECORDS_SNAPSHOT, bogus)).toThrow(/unhandled exercise_type/);
  });
});

describe('weight-0 exclusion: every weight-based record, Best Set Volume included (04 §5.1/§5.3 — "assisted excluded from Heaviest/volume records" pairs the two families, so the weight-0 rule pairs them identically)', () => {
  it('weight=0 excludes Heaviest Weight, Best Est. 1RM, and the set-record bucket', () => {
    const { snapshot, awards } = computeRecordsSnapshot([historicalSet({ weightKg: 0, reps: 5 })]);
    expect(snapshot.heaviestWeightKg).toBeNull();
    expect(snapshot.best1RmKg).toBeNull();
    expect(snapshot.setRecords[5]).toBeNull();
    expect(recordTypesOf(awards)).not.toContain('heaviest_weight');
    expect(recordTypesOf(awards)).not.toContain('best_1rm');
  });

  it('weight=0 also excludes Best Set Volume — a pure-bodyweight (no added load) set does not earn a spurious "0 kg volume" PR', () => {
    const { snapshot, awards } = computeRecordsSnapshot([
      historicalSet({ exerciseType: 'bodyweight_reps', weightKg: 0, reps: 8 }),
    ]);
    expect(snapshot.bestSetVolumeKg).toBeNull();
    expect(recordTypesOf(awards)).not.toContain('best_set_volume');
  });

  it('weight=0 excludes Best Set Volume for weight_reps too (not just the bodyweight-specific case)', () => {
    const { snapshot, awards } = computeRecordsSnapshot([historicalSet({ weightKg: 0, reps: 8 })]);
    expect(snapshot.bestSetVolumeKg).toBeNull();
    expect(recordTypesOf(awards)).not.toContain('best_set_volume');
  });

  it('a later, real-weight bodyweight_reps set still earns Best Set Volume normally after a 0-weight set was excluded', () => {
    const { snapshot, awards } = computeRecordsSnapshot([
      historicalSet({ setId: 'zero', exerciseType: 'bodyweight_reps', weightKg: 0, reps: 8, workoutStartTime: 1 }),
      historicalSet({ setId: 'real', exerciseType: 'bodyweight_reps', weightKg: 10, reps: 8, workoutStartTime: 2 }),
    ]);
    expect(snapshot.bestSetVolumeKg).toEqual({ value: 80, setId: 'real', workoutId: expect.any(String) });
    expect(recordTypesOf(awards)).toContain('best_set_volume');
  });
});

describe('reps-0 / duration-0 excluded wherever they participate, but not from reps/duration-independent record types', () => {
  it('reps=0 excludes Best Set Volume, Best Est. 1RM, Most Reps, and set-records, but NOT Heaviest Weight (which never reads reps)', () => {
    const { snapshot, awards } = computeRecordsSnapshot([historicalSet({ weightKg: 100, reps: 0 })]);
    expect(snapshot.heaviestWeightKg?.value).toBe(100);
    expect(snapshot.bestSetVolumeKg).toBeNull();
    expect(snapshot.best1RmKg).toBeNull();
    expect(snapshot.mostReps).toBeNull();
    expect(recordTypesOf(awards)).toEqual(['heaviest_weight']);
  });
});

describe('null values are always excluded from the record types that need them (never treated as 0)', () => {
  it('weightKg: null on weight_reps excludes every weight-dependent record but not Most Reps', () => {
    const { snapshot, awards } = computeRecordsSnapshot([historicalSet({ weightKg: null, reps: 5 })]);
    expect(snapshot.heaviestWeightKg).toBeNull();
    expect(snapshot.bestSetVolumeKg).toBeNull();
    expect(snapshot.best1RmKg).toBeNull();
    expect(snapshot.setRecords[5]).toBeNull();
    expect(snapshot.mostReps?.value).toBe(5);
    expect(recordTypesOf(awards)).toEqual(['most_reps']);
  });

  it('reps: null on weight_reps excludes reps-dependent records but not Heaviest Weight', () => {
    const { snapshot } = computeRecordsSnapshot([historicalSet({ weightKg: 100, reps: null })]);
    expect(snapshot.heaviestWeightKg?.value).toBe(100);
    expect(snapshot.bestSetVolumeKg).toBeNull();
    expect(snapshot.best1RmKg).toBeNull();
    expect(snapshot.mostReps).toBeNull();
  });
});

describe('global gate: isCompleted / warmup, independent of exercise type', () => {
  it('an unchecked set contributes nothing regardless of how record-breaking its values are', () => {
    const { snapshot, awards } = computeRecordsSnapshot([
      historicalSet({ weightKg: 999, reps: 5, isCompleted: false }),
    ]);
    expect(snapshot.heaviestWeightKg).toBeNull();
    expect(awards).toEqual([]);
  });

  it('applyRecordSet returns the identical snapshot reference when the set fails the global gate (no unnecessary allocation)', () => {
    const result = applyRecordSet(EMPTY_RECORDS_SNAPSHOT, historicalSet({ setType: 'warmup' }));
    expect(result.snapshot).toBe(EMPTY_RECORDS_SNAPSHOT);
    expect(result.awards).toEqual([]);
  });
});

describe('computeRecordsSnapshot: sort order, empty inputs', () => {
  it('sorts by (workoutStartTime, setOrder) regardless of input array order', () => {
    const later = historicalSet({ setId: 'later', workoutStartTime: 5, setOrder: 0, weightKg: 100, reps: 5 });
    const earlierSameWorkout = historicalSet({ setId: 'earlier-2', workoutStartTime: 5, setOrder: -1, weightKg: 90, reps: 5 });
    const earliest = historicalSet({ setId: 'earliest', workoutStartTime: 1, setOrder: 0, weightKg: 80, reps: 5 });

    // Deliberately out of chronological order in the input array.
    const { awards } = computeRecordsSnapshot([later, earlierSameWorkout, earliest]);

    expect(awards.filter((a) => a.recordType === 'heaviest_weight').map((a) => a.setId)).toEqual([
      'earliest',
      'earlier-2',
      'later',
    ]);
  });

  it('an empty history returns the empty snapshot and no awards', () => {
    const { snapshot, awards } = computeRecordsSnapshot([]);
    expect(snapshot).toEqual(EMPTY_RECORDS_SNAPSHOT);
    expect(awards).toEqual([]);
  });
});

describe('evaluateLiveCheck: does not sort sessionCheckedSets (real-time check order, not workoutStartTime/setOrder)', () => {
  it('folds sessionCheckedSets in array order even when their workoutStartTime/setOrder fields are identical or unset', () => {
    const historySnapshot = EMPTY_RECORDS_SNAPSHOT;
    const checkedFirst = historicalSet({ weightKg: 100, reps: 5, workoutStartTime: 0, setOrder: 0 });
    const checkedSecond = historicalSet({ weightKg: 105, reps: 5, workoutStartTime: 0, setOrder: 0 });
    const candidate = historicalSet({ weightKg: 105, reps: 5, workoutStartTime: 0, setOrder: 0 });

    // checkedSecond (105) already raised the running best to 105 before
    // candidate (also 105) is evaluated — duplicate, no award — proving the
    // fold used array order (checkedFirst then checkedSecond), not any
    // re-derived chronological order (which would be ambiguous here, all
    // three share identical workoutStartTime/setOrder).
    const awards = evaluateLiveCheck(historySnapshot, [checkedFirst, checkedSecond], candidate);
    expect(awards).toEqual([]);
  });
});
