/**
 * `domain/set-check.ts` (M2-07) — the pure "check-commit" decision engine
 * behind 02 §4's check behavior / `00`'s decision P6: given a row's current
 * typed values and its PREVIOUS/target placeholder values, decide whether
 * tapping ✓ commits (and with which resolved canonical values) or blocks.
 * Pure TS, zero React/RN/Expo imports (06 §2 dependency rule) —
 * `src/features/workout/ConnectedSetRow.tsx` is the only caller, feeding it
 * the same canonical numbers `readCanonical`/`previousResult.autofill`
 * already produce (never re-parsing display text here, so this module never
 * duplicates `set-cell-values.ts`'s unit-conversion/rounding logic).
 *
 * ## The three-way per-column resolution (02 §4, verbatim)
 *
 * 1. "Any typed values are saved as-is" — a non-null `typedValue` always
 *    wins, required or not.
 * 2. "Any empty field that shows a placeholder commits the placeholder
 *    value. Exception: rep-range targets ... are not committable
 *    placeholders — reps must be typed." This module never needs to know
 *    *why* a placeholder is absent for the rep-range case: `previous-values
 *    .ts`'s own `autofillFrom` already nulls `reps` in the autofill payload
 *    whenever the source was a rep-range target (04 §2.3), so a rep-range
 *    row simply arrives here with `placeholderValue: null` on its `reps`
 *    column — indistinguishable from "no previous data at all," which is
 *    exactly the fall-through-to-required-check behavior 04 §2.3 wants
 *    (reps has no typed value and no usable placeholder → required → blocks
 *    until typed). No separate `isRepRange` flag needed on this module's
 *    own input shape.
 * 3. "Any empty field with no placeholder blocks the check for required
 *    fields ... Weight of 0 is valid" — required-ness is per exercise type
 *    ({@link requiredKeysForExerciseType}); a non-required, unresolved
 *    `'weight'` column silently defaults to `0` (the "empty bar/bodyweight"
 *    reading) rather than blocking or staying `null`. `'custom'` is the one
 *    other column kind this module ever sees that can be non-required +
 *    unresolved — it has no "0 is valid" analogue in the spec, so it simply
 *    stays `null` (an untouched optional metric), matching what a blur-only
 *    commit of an empty CUSTOM cell already does today (M2-06).
 *
 * `'rpe'` is deliberately never a column this module handles — RPE is
 * optional for every type and is written through its own picker sheet
 * (`ConnectedSetRow`'s RPE menu), never through the check-commit path.
 */
import type { ExerciseType } from './enums';

export type SetCheckColumnKey = 'weight' | 'reps' | 'distance' | 'duration' | 'custom';

export interface SetCheckColumnInput {
  key: SetCheckColumnKey;
  /** Canonical value already parsed from the row's current typed text, or `null` if the field is empty/unparsed. */
  typedValue: number | null;
  /** Canonical PREVIOUS/target value for this column, or `null` when there is none (including the rep-range case — see file header). */
  placeholderValue: number | null;
}

export interface SetCheckOkResult {
  ok: true;
  /** Resolved canonical value per column key, ready to hand to `writeCanonical`/`UpdateSetInput`. */
  values: Partial<Record<SetCheckColumnKey, number | null>>;
}

export interface SetCheckBlockedResult {
  ok: false;
  /** Which required columns had neither a typed value nor a usable placeholder — the row-shake target. */
  blockedKeys: SetCheckColumnKey[];
}

export type SetCheckResult = SetCheckOkResult | SetCheckBlockedResult;

/** 02 §4: "Required per type: reps for rep-types, duration for time-types, distance+duration for cardio, weight+distance for short_distance_weight." One switch arm per `ExerciseType` — a new type added to `enums.ts` without a case here fails `tsc --noEmit` (same exhaustiveness-guard pattern `set-table-columns.ts`'s `baseColumnsForType` already established). */
export function requiredKeysForExerciseType(exerciseType: ExerciseType): SetCheckColumnKey[] {
  switch (exerciseType) {
    case 'weight_reps':
    case 'reps_only':
    case 'bodyweight_reps':
    case 'bodyweight_assisted_reps':
      return ['reps'];
    case 'duration':
    case 'weight_duration':
      return ['duration'];
    case 'distance_duration':
      return ['distance', 'duration'];
    case 'short_distance_weight':
      return ['weight', 'distance'];
    default: {
      const exhaustive: never = exerciseType;
      throw new Error(`set-check.requiredKeysForExerciseType: unhandled exercise_type "${exhaustive as string}".`);
    }
  }
}

/**
 * Evaluate one row's check-commit decision. `columns` should be the row's
 * value columns only — never include an `'rpe'` entry (see file header).
 */
export function evaluateSetCheck(
  exerciseType: ExerciseType,
  columns: readonly SetCheckColumnInput[],
): SetCheckResult {
  const required = new Set(requiredKeysForExerciseType(exerciseType));
  const values: Partial<Record<SetCheckColumnKey, number | null>> = {};
  const blockedKeys: SetCheckColumnKey[] = [];

  for (const column of columns) {
    if (column.typedValue !== null) {
      values[column.key] = column.typedValue;
      continue;
    }
    if (column.placeholderValue !== null) {
      values[column.key] = column.placeholderValue;
      continue;
    }
    if (required.has(column.key)) {
      blockedKeys.push(column.key);
      continue;
    }
    // Optional + unresolved: weight defaults to 0 ("empty bar/bodyweight is
    // valid"); every other optional column (only 'custom' in practice)
    // stays null — no analogous "0 is valid" reading for it in 02 §4.
    values[column.key] = column.key === 'weight' ? 0 : null;
  }

  if (blockedKeys.length > 0) {
    return { ok: false, blockedKeys };
  }
  return { ok: true, values };
}
