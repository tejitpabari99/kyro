/**
 * `domain/routine-diff.ts` tests (M3-06 acceptance gate, 08 §4.9's
 * "routine-diff computed correctly (fixtures: unchanged / value change /
 * structural change)" + this task's own broader matrix: superset changed,
 * rest timer changed, in-range vs out-of-range rep-range achieved values,
 * a `replaceExercise`d identity, notes-not-material).
 */
import {
  computeRoutineDiff,
  matchWorkoutToRoutineExercises,
  repsWithinRoutineRange,
  type FinishedWorkoutLike,
  type RoutineDiffAchievedSetLike,
  type RoutineDiffRoutineExerciseLike,
  type RoutineDiffTargetSetLike,
  type RoutineDiffWorkoutExerciseLike,
  type SourceRoutineLike,
} from '../routine-diff';

function achievedSet(overrides: Partial<RoutineDiffAchievedSetLike> = {}): RoutineDiffAchievedSetLike {
  return {
    weightKg: 60,
    reps: 8,
    distanceMeters: null,
    durationSeconds: null,
    customMetric: null,
    ...overrides,
  };
}

function targetSet(overrides: Partial<RoutineDiffTargetSetLike> = {}): RoutineDiffTargetSetLike {
  return {
    weightKg: 60,
    reps: 8,
    repRangeStart: null,
    repRangeEnd: null,
    distanceMeters: null,
    durationSeconds: null,
    customMetric: null,
    ...overrides,
  };
}

function workoutExercise(overrides: Partial<RoutineDiffWorkoutExerciseLike> = {}): RoutineDiffWorkoutExerciseLike {
  return {
    exerciseId: 'bench',
    routineOccurrenceIndex: 0,
    supersetId: null,
    restSeconds: 90,
    sets: [achievedSet()],
    ...overrides,
  };
}

function routineExercise(overrides: Partial<RoutineDiffRoutineExerciseLike> = {}): RoutineDiffRoutineExerciseLike {
  return {
    exerciseId: 'bench',
    supersetId: null,
    restSeconds: 90,
    sets: [targetSet()],
    ...overrides,
  };
}

function workout(exercises: RoutineDiffWorkoutExerciseLike[]): FinishedWorkoutLike {
  return { exercises };
}

function routine(exercises: RoutineDiffRoutineExerciseLike[]): SourceRoutineLike {
  return { exercises };
}

describe('domain/routine-diff — computeRoutineDiff (02 §14.4)', () => {
  it('unchanged workout vs. routine -> not material, no reasons', () => {
    const result = computeRoutineDiff(workout([workoutExercise()]), routine([routineExercise()]));
    expect(result).toEqual({ material: false, reasons: [] });
  });

  it('an unrelated field (free-text notes) is not compared at all — notes are not part of these shapes', () => {
    // Sanity: RoutineDiffWorkoutExerciseLike/RoutineDiffRoutineExerciseLike
    // intentionally carry no `notes` field, so a notes-only change can never
    // be represented as a diff input in the first place (file header).
    const result = computeRoutineDiff(workout([workoutExercise()]), routine([routineExercise()]));
    expect(result.material).toBe(false);
  });

  describe('value change', () => {
    it('achieved weight differs from target -> material (target_value_changed)', () => {
      const result = computeRoutineDiff(
        workout([workoutExercise({ sets: [achievedSet({ weightKg: 65 })] })]),
        routine([routineExercise()]),
      );
      expect(result.material).toBe(true);
      expect(result.reasons).toEqual([{ kind: 'target_value_changed', exerciseId: 'bench' }]);
    });

    it('achieved reps differ from a fixed-reps target -> material', () => {
      const result = computeRoutineDiff(
        workout([workoutExercise({ sets: [achievedSet({ reps: 9 })] })]),
        routine([routineExercise({ sets: [targetSet({ reps: 8 })] })]),
      );
      expect(result.material).toBe(true);
      expect(result.reasons).toEqual([{ kind: 'target_value_changed', exerciseId: 'bench' }]);
    });

    it('achieved distance differs from target -> material (distance_duration-shaped exercise)', () => {
      const result = computeRoutineDiff(
        workout([
          workoutExercise({
            sets: [achievedSet({ weightKg: null, reps: null, distanceMeters: 5200, durationSeconds: 1800 })],
          }),
        ]),
        routine([
          routineExercise({
            sets: [targetSet({ weightKg: null, reps: null, distanceMeters: 5000, durationSeconds: 1800 })],
          }),
        ]),
      );
      expect(result.material).toBe(true);
    });

    it('achieved duration differs from target -> material', () => {
      const result = computeRoutineDiff(
        workout([
          workoutExercise({ sets: [achievedSet({ weightKg: null, reps: null, durationSeconds: 45 })] }),
        ]),
        routine([
          routineExercise({ sets: [targetSet({ weightKg: null, reps: null, durationSeconds: 60 })] }),
        ]),
      );
      expect(result.material).toBe(true);
    });

    it('achieved customMetric differs from target -> material (judgment call, file header)', () => {
      const result = computeRoutineDiff(
        workout([workoutExercise({ sets: [achievedSet({ customMetric: 5 })] })]),
        routine([routineExercise({ sets: [targetSet({ customMetric: 3 })] })]),
      );
      expect(result.material).toBe(true);
    });
  });

  describe('in-range vs. out-of-range rep-range targets (04 §2.4)', () => {
    it('achieved reps within an existing rep-range target -> NOT material', () => {
      const result = computeRoutineDiff(
        workout([workoutExercise({ sets: [achievedSet({ reps: 7 })] })]),
        routine([routineExercise({ sets: [targetSet({ reps: null, repRangeStart: 6, repRangeEnd: 8 })] })]),
      );
      expect(result.material).toBe(false);
    });

    it('achieved reps at the inclusive lower/upper bound of the range -> NOT material', () => {
      for (const reps of [6, 8]) {
        const result = computeRoutineDiff(
          workout([workoutExercise({ sets: [achievedSet({ reps })] })]),
          routine([routineExercise({ sets: [targetSet({ reps: null, repRangeStart: 6, repRangeEnd: 8 })] })]),
        );
        expect(result.material).toBe(false);
      }
    });

    it('achieved reps outside the range -> material', () => {
      const result = computeRoutineDiff(
        workout([workoutExercise({ sets: [achievedSet({ reps: 9 })] })]),
        routine([routineExercise({ sets: [targetSet({ reps: null, repRangeStart: 6, repRangeEnd: 8 })] })]),
      );
      expect(result.material).toBe(true);
      expect(result.reasons).toEqual([{ kind: 'target_value_changed', exerciseId: 'bench' }]);
    });

    it('a null achieved reps against a range target -> material', () => {
      const result = computeRoutineDiff(
        workout([workoutExercise({ sets: [achievedSet({ reps: null })] })]),
        routine([routineExercise({ sets: [targetSet({ reps: null, repRangeStart: 6, repRangeEnd: 8 })] })]),
      );
      expect(result.material).toBe(true);
    });
  });

  describe('structural change', () => {
    it('a set added on an exercise -> material (set_added_or_removed)', () => {
      const result = computeRoutineDiff(
        workout([workoutExercise({ sets: [achievedSet(), achievedSet()] })]),
        routine([routineExercise({ sets: [targetSet()] })]),
      );
      expect(result.material).toBe(true);
      expect(result.reasons).toEqual([{ kind: 'set_added_or_removed', exerciseId: 'bench' }]);
    });

    it('a set removed on an exercise -> material', () => {
      const result = computeRoutineDiff(
        workout([workoutExercise({ sets: [achievedSet()] })]),
        routine([routineExercise({ sets: [targetSet(), targetSet()] })]),
      );
      expect(result.material).toBe(true);
      expect(result.reasons).toEqual([{ kind: 'set_added_or_removed', exerciseId: 'bench' }]);
    });

    it('an exercise added mid-workout (routineOccurrenceIndex null) -> material (exercise_added)', () => {
      const result = computeRoutineDiff(
        workout([
          workoutExercise(),
          workoutExercise({ exerciseId: 'curl', routineOccurrenceIndex: null }),
        ]),
        routine([routineExercise()]),
      );
      expect(result.material).toBe(true);
      expect(result.reasons).toEqual([{ kind: 'exercise_added', exerciseId: 'curl' }]);
    });

    it('an exercise removed from the workout (present in routine, absent from workout) -> material (exercise_removed)', () => {
      const result = computeRoutineDiff(
        workout([workoutExercise()]),
        routine([routineExercise(), routineExercise({ exerciseId: 'squat' })]),
      );
      expect(result.material).toBe(true);
      expect(result.reasons).toEqual([{ kind: 'exercise_removed', exerciseId: 'squat' }]);
    });

    it('two routine-linked exercises reordered in the workout -> material (exercise_reordered)', () => {
      const result = computeRoutineDiff(
        workout([
          workoutExercise({ exerciseId: 'squat', routineOccurrenceIndex: 0 }),
          workoutExercise({ exerciseId: 'bench', routineOccurrenceIndex: 0 }),
        ]),
        routine([
          routineExercise({ exerciseId: 'bench' }),
          routineExercise({ exerciseId: 'squat' }),
        ]),
      );
      expect(result.material).toBe(true);
      expect(result.reasons).toEqual([{ kind: 'exercise_reordered' }]);
    });

    it('a duplicated exercise reordered relative to its own other occurrence -> material (exercise_reordered, occurrence-index correct)', () => {
      const result = computeRoutineDiff(
        workout([
          workoutExercise({ exerciseId: 'bench', routineOccurrenceIndex: 1 }),
          workoutExercise({ exerciseId: 'bench', routineOccurrenceIndex: 0 }),
        ]),
        routine([
          routineExercise({ exerciseId: 'bench' }), // occurrence 0
          routineExercise({ exerciseId: 'bench' }), // occurrence 1
        ]),
      );
      expect(result.material).toBe(true);
      expect(result.reasons).toEqual([{ kind: 'exercise_reordered' }]);
    });

    it('a replaced exercise (replaceExercise nulls routineOccurrenceIndex) reports as added+removed -> material (documented judgment call)', () => {
      const result = computeRoutineDiff(
        workout([workoutExercise({ exerciseId: 'incline-press', routineOccurrenceIndex: null })]),
        routine([routineExercise({ exerciseId: 'bench' })]),
      );
      expect(result.material).toBe(true);
      expect(result.reasons).toEqual(
        expect.arrayContaining([
          { kind: 'exercise_added', exerciseId: 'incline-press' },
          { kind: 'exercise_removed', exerciseId: 'bench' },
        ]),
      );
      expect(result.reasons).toHaveLength(2);
    });

    it('the routine was edited since the workout started (occurrence no longer exists live) -> treated as added, not crashing', () => {
      const result = computeRoutineDiff(
        workout([workoutExercise({ exerciseId: 'bench', routineOccurrenceIndex: 3 })]),
        routine([routineExercise({ exerciseId: 'bench' })]), // only occurrence 0 exists now
      );
      expect(result.material).toBe(true);
      expect(result.reasons).toEqual(
        expect.arrayContaining([
          { kind: 'exercise_added', exerciseId: 'bench' },
          { kind: 'exercise_removed', exerciseId: 'bench' },
        ]),
      );
    });
  });

  describe('superset changed', () => {
    it('an exercise moved from ungrouped to a superset -> material (superset_changed)', () => {
      const result = computeRoutineDiff(
        workout([
          workoutExercise({ exerciseId: 'bench', supersetId: 0 }),
          workoutExercise({ exerciseId: 'squat', supersetId: 0, restSeconds: 120 }),
        ]),
        routine([
          routineExercise({ exerciseId: 'bench', supersetId: null }),
          routineExercise({ exerciseId: 'squat', supersetId: null, restSeconds: 120 }),
        ]),
      );
      expect(result.material).toBe(true);
      expect(result.reasons).toEqual(expect.arrayContaining([{ kind: 'superset_changed' }]));
    });

    it('a superset partner swapped for a different one -> material', () => {
      const result = computeRoutineDiff(
        workout([
          workoutExercise({ exerciseId: 'bench', supersetId: 0 }),
          workoutExercise({ exerciseId: 'row', supersetId: 0, restSeconds: 120 }),
          workoutExercise({ exerciseId: 'squat', supersetId: null, restSeconds: 90 }),
        ]),
        routine([
          routineExercise({ exerciseId: 'bench', supersetId: 0 }),
          routineExercise({ exerciseId: 'row', supersetId: null, restSeconds: 120 }),
          routineExercise({ exerciseId: 'squat', supersetId: 0, restSeconds: 90 }),
        ]),
      );
      expect(result.material).toBe(true);
      expect(result.reasons).toEqual(expect.arrayContaining([{ kind: 'superset_changed' }]));
    });

    it('the same superset grouping preserved (different raw ids, same partner set) -> NOT material', () => {
      // Workout supersetId numbering differs from the routine's own (both
      // schemes are locally-scoped "lowest position in group" ids, per
      // `supersets.ts`) but the *membership* is identical -> unchanged.
      const result = computeRoutineDiff(
        workout([
          workoutExercise({ exerciseId: 'bench', supersetId: 0 }),
          workoutExercise({ exerciseId: 'row', supersetId: 0, restSeconds: 120 }),
        ]),
        routine([
          routineExercise({ exerciseId: 'bench', supersetId: 4 }),
          routineExercise({ exerciseId: 'row', supersetId: 4, restSeconds: 120 }),
        ]),
      );
      expect(result.material).toBe(false);
    });
  });

  describe('rest timer changed', () => {
    it('rest_seconds differs on a matched exercise -> material', () => {
      const result = computeRoutineDiff(
        workout([workoutExercise({ restSeconds: 60 })]),
        routine([routineExercise({ restSeconds: 90 })]),
      );
      expect(result.material).toBe(true);
      expect(result.reasons).toEqual([{ kind: 'rest_timer_changed', exerciseId: 'bench' }]);
    });

    it('both null -> not material', () => {
      const result = computeRoutineDiff(
        workout([workoutExercise({ restSeconds: null })]),
        routine([routineExercise({ restSeconds: null })]),
      );
      expect(result.material).toBe(false);
    });
  });

  it('an empty workout vs. an empty routine -> not material', () => {
    expect(computeRoutineDiff(workout([]), routine([]))).toEqual({ material: false, reasons: [] });
  });
});

describe('domain/routine-diff — matchWorkoutToRoutineExercises', () => {
  it('matches by (exerciseId, routineOccurrenceIndex) against the routine\'s own occurrence order', () => {
    const matches = matchWorkoutToRoutineExercises(
      [
        { exerciseId: 'bench', routineOccurrenceIndex: 1 },
        { exerciseId: 'bench', routineOccurrenceIndex: 0 },
        { exerciseId: 'curl', routineOccurrenceIndex: null },
      ],
      [{ exerciseId: 'bench' }, { exerciseId: 'bench' }],
    );
    expect(matches).toEqual([
      { workoutExerciseIndex: 0, routineExerciseIndex: 1 },
      { workoutExerciseIndex: 1, routineExerciseIndex: 0 },
    ]);
  });

  it('an occurrence index with no live routine counterpart is simply unmatched', () => {
    const matches = matchWorkoutToRoutineExercises(
      [{ exerciseId: 'bench', routineOccurrenceIndex: 5 }],
      [{ exerciseId: 'bench' }],
    );
    expect(matches).toEqual([]);
  });
});

describe('domain/routine-diff — repsWithinRoutineRange', () => {
  it('inclusive of both endpoints', () => {
    expect(repsWithinRoutineRange(6, { repRangeStart: 6, repRangeEnd: 8 })).toBe(true);
    expect(repsWithinRoutineRange(8, { repRangeStart: 6, repRangeEnd: 8 })).toBe(true);
    expect(repsWithinRoutineRange(7, { repRangeStart: 6, repRangeEnd: 8 })).toBe(true);
  });

  it('outside the range is false', () => {
    expect(repsWithinRoutineRange(5, { repRangeStart: 6, repRangeEnd: 8 })).toBe(false);
    expect(repsWithinRoutineRange(9, { repRangeStart: 6, repRangeEnd: 8 })).toBe(false);
  });

  it('not a range target (both bounds null) is false regardless of reps', () => {
    expect(repsWithinRoutineRange(7, { repRangeStart: null, repRangeEnd: null })).toBe(false);
  });

  it('null reps against a real range is false', () => {
    expect(repsWithinRoutineRange(null, { repRangeStart: 6, repRangeEnd: 8 })).toBe(false);
  });
});
