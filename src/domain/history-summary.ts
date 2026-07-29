/**
 * `domain/history-summary.ts` (M4-03) — 04 §3.1's per-exercise summary line
 * on a History card ("3 × Bench Press (Barbell) — best 80kg × 8"): the pure
 * "which set is this workout-exercise's best" business rule plus its
 * unit-aware display string. Deliberately split from `domain/records.ts`:
 * records.ts answers "does this set beat ALL of history" (04 §5); this
 * module answers a narrower, session-local question — "which of THIS
 * workout's own sets for this exercise is the standout one to show on its
 * history card" — that has nothing to do with lifetime PRs (a workout's own
 * best set here might not be a record at all). No I/O, zero React/RN
 * imports (06 §2), mirrors `domain/volume.ts`/`domain/set-table-columns.ts`'s
 * per-`exercise_type` exhaustive-switch convention.
 *
 * ## Eligibility
 *
 * Same global gate `domain/records.ts` uses (04 §5.1's table header):
 * checked (`isCompleted`) and non-warm-up. A warm-up can never be a
 * workout's own "best" set for the same reason it can never earn a trophy.
 *
 * ## "Best" per type
 *
 * Every type has one primary comparison field and (for two-field types) a
 * secondary tie-break/display field, chosen to match the *first* two
 * columns `domain/set-table-columns.ts` already shows for that type (02
 * §4) — the same pair the spec's own worked example pairs ("80kg × 8" is
 * `weight_reps`'s KG then REPS columns). Higher wins except
 * `bodyweight_assisted_reps`, whose "best" is the *least* assistance
 * (04 §5.1's own "least-assistance" framing, mirrored from
 * `domain/records.ts`'s identical carve-out for that one type).
 */
import type { DistanceUnit, ExerciseType, SetType, WeightUnit } from './enums';
import {
  formatDistanceFeet,
  formatDistanceKm,
  formatDistanceMiles,
  formatDuration,
  formatWeightLb,
} from './units';

/** One set's fields this module needs — structurally compatible with (never importing) `src/data/workouts/types.ts`'s `WorkoutSet`, same "mirror, don't import" convention `domain/previous-values.ts`/`domain/volume.ts` already use. */
export interface HistoryCardSetInput {
  setType: SetType;
  isCompleted: boolean;
  weightKg: number | null;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
}

type NumericField = 'weightKg' | 'reps' | 'distanceMeters' | 'durationSeconds';

interface FieldSpec {
  primary: NumericField;
  direction: 'max' | 'min';
  secondary: NumericField | null;
}

function fieldSpecFor(exerciseType: ExerciseType): FieldSpec {
  switch (exerciseType) {
    case 'weight_reps':
    case 'bodyweight_reps':
      return { primary: 'weightKg', direction: 'max', secondary: 'reps' };
    case 'bodyweight_assisted_reps':
      // 04 §5.1: least assistance is "best" — the one type where a lower
      // value wins (matches `domain/records.ts`'s `leastAssistanceKg`).
      return { primary: 'weightKg', direction: 'min', secondary: 'reps' };
    case 'weight_duration':
      return { primary: 'weightKg', direction: 'max', secondary: 'durationSeconds' };
    case 'short_distance_weight':
      return { primary: 'weightKg', direction: 'max', secondary: 'distanceMeters' };
    case 'reps_only':
      return { primary: 'reps', direction: 'max', secondary: null };
    case 'duration':
      return { primary: 'durationSeconds', direction: 'max', secondary: null };
    case 'distance_duration':
      return { primary: 'distanceMeters', direction: 'max', secondary: 'durationSeconds' };
    default: {
      const exhaustive: never = exerciseType;
      throw new Error(`history-summary.fieldSpecFor: unhandled exercise_type "${exhaustive as string}".`);
    }
  }
}

function isEligible(set: HistoryCardSetInput): boolean {
  return set.isCompleted && set.setType !== 'warmup';
}

/**
 * The standout eligible set for one workout-exercise's own history card
 * line, or `null` when no set is eligible (every set warm-up/unchecked — in
 * practice never happens for a *saved* workout, since `finish()` already
 * discards unchecked rows, but a workout whose only sets are warm-ups is a
 * real, legitimate case). A set missing its type's own primary field
 * (`null`) is never considered a candidate — "no value entered," same as
 * `domain/records.ts`'s null handling.
 */
export function bestSetForExercise(
  exerciseType: ExerciseType,
  sets: readonly HistoryCardSetInput[],
): HistoryCardSetInput | null {
  const spec = fieldSpecFor(exerciseType);
  let best: HistoryCardSetInput | null = null;

  for (const set of sets) {
    if (!isEligible(set)) continue;
    const value = set[spec.primary];
    if (value === null) continue;

    if (best === null) {
      best = set;
      continue;
    }

    const bestValue = best[spec.primary] as number;
    const better = spec.direction === 'max' ? value > bestValue : value < bestValue;
    if (better) {
      best = set;
      continue;
    }

    if (value === bestValue && spec.secondary) {
      const candidateSecondary = set[spec.secondary] ?? -Infinity;
      const bestSecondary = best[spec.secondary] ?? -Infinity;
      if (candidateSecondary > bestSecondary) {
        best = set;
      }
    }
  }

  return best;
}

export interface HistoryCardUnits {
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
}

function weightText(kg: number, unit: WeightUnit): string {
  const display = unit === 'kg' ? kg : (formatWeightLb(kg) as number);
  return `${display}${unit}`;
}

function distanceText(meters: number, unit: DistanceUnit): string {
  const display = unit === 'km' ? (formatDistanceKm(meters) as number) : (formatDistanceMiles(meters) as number);
  return `${display}${unit === 'km' ? 'km' : 'mi'}`;
}

/** `short_distance_weight`'s own METERS column — meters (metric) or feet (imperial), 05 §5; not km/mi like {@link distanceText}. Mirrors `set-table-columns.ts`'s `shortDistanceLabel`. */
function shortDistanceText(meters: number, unit: DistanceUnit): string {
  const display = unit === 'km' ? Math.round(meters) : (formatDistanceFeet(meters) as number);
  return `${display}${unit === 'km' ? 'm' : 'ft'}`;
}

/**
 * The display string for `best` (a set {@link bestSetForExercise} already
 * chose) — "80kg × 8" for `weight_reps`, "2:30" for `duration`, etc. `null`
 * when `best` is somehow missing the field(s) its own type requires (should
 * not happen for a set {@link bestSetForExercise} itself selected, since
 * that function only ever picks a set with a non-null primary field, but a
 * two-field type also needs its secondary field to render the "× …" half —
 * this guards that rather than rendering "undefined").
 */
export function formatBestSetSummary(
  exerciseType: ExerciseType,
  best: HistoryCardSetInput,
  units: HistoryCardUnits,
): string | null {
  switch (exerciseType) {
    case 'weight_reps':
    case 'bodyweight_reps':
    case 'bodyweight_assisted_reps':
      if (best.weightKg === null || best.reps === null) return null;
      return `${weightText(best.weightKg, units.weightUnit)} × ${best.reps}`;
    case 'weight_duration':
      if (best.weightKg === null || best.durationSeconds === null) return null;
      return `${weightText(best.weightKg, units.weightUnit)} × ${formatDuration(best.durationSeconds)}`;
    case 'short_distance_weight':
      if (best.weightKg === null || best.distanceMeters === null) return null;
      return `${weightText(best.weightKg, units.weightUnit)} × ${shortDistanceText(best.distanceMeters, units.distanceUnit)}`;
    case 'reps_only':
      return best.reps === null ? null : `${best.reps} reps`;
    case 'duration':
      return best.durationSeconds === null ? null : formatDuration(best.durationSeconds);
    case 'distance_duration':
      if (best.distanceMeters === null || best.durationSeconds === null) return null;
      return `${distanceText(best.distanceMeters, units.distanceUnit)} × ${formatDuration(best.durationSeconds)}`;
    default: {
      const exhaustive: never = exerciseType;
      throw new Error(`history-summary.formatBestSetSummary: unhandled exercise_type "${exhaustive as string}".`);
    }
  }
}
