/**
 * `exercise-form-prefill` unit tests (M1-10) — the Duplicate-as-Custom
 * hand-off store: set-then-consume returns the value, consuming clears the
 * slot so a second, unrelated read (e.g. a later, non-duplicate visit to
 * `/exercise/new`) never resurfaces a stale prefill.
 */
import {
  __resetExerciseFormPrefillForTests,
  consumeExerciseFormPrefill,
  setExerciseFormPrefill,
  type ExerciseFormPrefill,
} from '../exercise-form-prefill';

const SAMPLE: ExerciseFormPrefill = {
  name: 'Barbell Bench Press - Medium Grip (Copy)',
  exerciseType: 'weight_reps',
  primaryMuscleGroup: 'chest',
  secondaryMuscleGroups: ['shoulders', 'triceps'],
  equipment: 'barbell',
  instructions: ['Step one.'],
  usesCustomMetric: false,
};

afterEach(() => {
  __resetExerciseFormPrefillForTests();
});

describe('exercise-form-prefill', () => {
  it('returns null when nothing has been set', () => {
    expect(consumeExerciseFormPrefill()).toBeNull();
  });

  it('returns the exact value that was set', () => {
    setExerciseFormPrefill(SAMPLE);
    expect(consumeExerciseFormPrefill()).toEqual(SAMPLE);
  });

  it('clears the slot on consume — a second consume returns null', () => {
    setExerciseFormPrefill(SAMPLE);
    consumeExerciseFormPrefill();
    expect(consumeExerciseFormPrefill()).toBeNull();
  });

  it('a later set overwrites an unconsumed earlier one', () => {
    const first = { ...SAMPLE, name: 'First (Copy)' };
    const second = { ...SAMPLE, name: 'Second (Copy)' };
    setExerciseFormPrefill(first);
    setExerciseFormPrefill(second);
    expect(consumeExerciseFormPrefill()).toEqual(second);
  });
});
