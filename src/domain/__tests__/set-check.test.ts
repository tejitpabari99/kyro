/**
 * `domain/set-check.ts` tests (M2-07 acceptance gate): the pure
 * check-commit decision engine — typed-as-is, placeholder-commit (and the
 * rep-range non-commit case), required-field blocking per type, and the
 * weight-defaults-to-0 / custom-stays-null optional-field readings.
 */
import { EXERCISE_TYPE_VALUES, type ExerciseType } from '../enums';
import { evaluateSetCheck, requiredKeysForExerciseType, type SetCheckColumnInput } from '../set-check';

describe('requiredKeysForExerciseType — 02 §4, one case per type', () => {
  it.each<[ExerciseType, string[]]>([
    ['weight_reps', ['reps']],
    ['reps_only', ['reps']],
    ['bodyweight_reps', ['reps']],
    ['bodyweight_assisted_reps', ['reps']],
    ['duration', ['duration']],
    ['weight_duration', ['duration']],
    ['distance_duration', ['distance', 'duration']],
    ['short_distance_weight', ['weight', 'distance']],
  ])('%s -> %j', (type, expected) => {
    expect(requiredKeysForExerciseType(type)).toEqual(expected);
  });

  it('covers every ExerciseType (exhaustiveness)', () => {
    for (const type of EXERCISE_TYPE_VALUES) {
      expect(() => requiredKeysForExerciseType(type)).not.toThrow();
    }
  });

  it('throws for an unrecognized exercise_type (exhaustiveness guard, unreachable via the real closed union)', () => {
    expect(() =>
      requiredKeysForExerciseType('not_a_real_type' as unknown as ExerciseType),
    ).toThrow(/unhandled exercise_type/);
  });
});

describe('evaluateSetCheck — typed values save as-is', () => {
  it('uses the typed value even when a placeholder is also present', () => {
    const columns: SetCheckColumnInput[] = [
      { key: 'weight', typedValue: 60, placeholderValue: 45 },
      { key: 'reps', typedValue: 8, placeholderValue: 9 },
    ];
    const result = evaluateSetCheck('weight_reps', columns);
    expect(result).toEqual({ ok: true, values: { weight: 60, reps: 8 } });
  });
});

describe('evaluateSetCheck — empty-with-placeholder commits the placeholder', () => {
  it('commits weight+reps placeholders when both fields are empty', () => {
    const columns: SetCheckColumnInput[] = [
      { key: 'weight', typedValue: null, placeholderValue: 45 },
      { key: 'reps', typedValue: null, placeholderValue: 9 },
    ];
    const result = evaluateSetCheck('weight_reps', columns);
    expect(result).toEqual({ ok: true, values: { weight: 45, reps: 9 } });
  });
});

describe('evaluateSetCheck — rep-range targets never auto-commit (04 §2.3)', () => {
  it('blocks the check when reps is empty and the only "placeholder" is a rep-range (already null per file header)', () => {
    // A rep-range placeholder arrives here as `placeholderValue: null` on
    // 'reps' — `previous-values.ts`'s `autofillFrom` already nulls it —
    // so it's indistinguishable from "no previous data" and falls through
    // to the required-field block, exactly as 04 §2.3 requires.
    const columns: SetCheckColumnInput[] = [
      { key: 'reps', typedValue: null, placeholderValue: null },
    ];
    const result = evaluateSetCheck('reps_only', columns);
    expect(result).toEqual({ ok: false, blockedKeys: ['reps'] });
  });

  it('still commits once reps is actually typed, even though the row shows a rep-range label', () => {
    const columns: SetCheckColumnInput[] = [
      { key: 'reps', typedValue: 7, placeholderValue: null },
    ];
    const result = evaluateSetCheck('reps_only', columns);
    expect(result).toEqual({ ok: true, values: { reps: 7 } });
  });
});

describe('evaluateSetCheck — required-field blocking', () => {
  it('blocks weight_reps when reps has neither a typed value nor a placeholder', () => {
    const columns: SetCheckColumnInput[] = [
      { key: 'weight', typedValue: 60, placeholderValue: null },
      { key: 'reps', typedValue: null, placeholderValue: null },
    ];
    expect(evaluateSetCheck('weight_reps', columns)).toEqual({ ok: false, blockedKeys: ['reps'] });
  });

  it('blocks distance_duration on both distance and duration when neither resolves', () => {
    const columns: SetCheckColumnInput[] = [
      { key: 'distance', typedValue: null, placeholderValue: null },
      { key: 'duration', typedValue: null, placeholderValue: null },
    ];
    expect(evaluateSetCheck('distance_duration', columns)).toEqual({
      ok: false,
      blockedKeys: ['distance', 'duration'],
    });
  });

  it('blocks short_distance_weight on weight (required for this type, unlike weight_reps)', () => {
    const columns: SetCheckColumnInput[] = [
      { key: 'weight', typedValue: null, placeholderValue: null },
      { key: 'distance', typedValue: 20, placeholderValue: null },
    ];
    expect(evaluateSetCheck('short_distance_weight', columns)).toEqual({
      ok: false,
      blockedKeys: ['weight'],
    });
  });
});

describe('evaluateSetCheck — optional-field defaults', () => {
  it('defaults an unresolved, non-required weight to 0 ("empty bar/bodyweight is valid")', () => {
    const columns: SetCheckColumnInput[] = [
      { key: 'weight', typedValue: null, placeholderValue: null },
      { key: 'reps', typedValue: 10, placeholderValue: null },
    ];
    expect(evaluateSetCheck('weight_reps', columns)).toEqual({
      ok: true,
      values: { weight: 0, reps: 10 },
    });
  });

  it('leaves an unresolved custom metric as null (never required, never defaults to 0)', () => {
    const columns: SetCheckColumnInput[] = [
      { key: 'reps', typedValue: 10, placeholderValue: null },
      { key: 'custom', typedValue: null, placeholderValue: null },
    ];
    expect(evaluateSetCheck('reps_only', columns)).toEqual({
      ok: true,
      values: { reps: 10, custom: null },
    });
  });

  it('a typed 0 weight is treated as a real typed value, not the "unresolved" default path', () => {
    const columns: SetCheckColumnInput[] = [
      { key: 'weight', typedValue: 0, placeholderValue: null },
      { key: 'reps', typedValue: 10, placeholderValue: null },
    ];
    expect(evaluateSetCheck('weight_reps', columns)).toEqual({
      ok: true,
      values: { weight: 0, reps: 10 },
    });
  });
});
