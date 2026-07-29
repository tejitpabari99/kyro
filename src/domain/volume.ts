/**
 * `domain/volume.ts` (M2-04) — 04 §4.2 (P7): pure per-set/per-workout
 * volume math. No I/O — every input is a plain value, every output a
 * `number`; callers (the store, stats screens, M4) own fetching the sets
 * and reading the `warmup_in_stats` setting.
 *
 * ## Formula (04 §4.2 / 08 §4.2, verbatim)
 *
 * Per set, canonical kg, by `exercise_type`:
 *  - `weight_reps` / `weight_duration` / `short_distance_weight`:
 *    `weight_kg × max(reps, 1)`. The latter two types have no `reps`
 *    column at all (02 §4's table: `weight_duration` is KG·TIME,
 *    `short_distance_weight` is KG·METERS) — their `reps` input is always
 *    `null`/absent, so `max(reps, 1)` collapses to `weight_kg × 1`, exactly
 *    matching 08 §4.2's own worked examples (`weight_duration 20 kg 60
 *    s=20`, `short_distance_weight 60 kg 20 m=60`) without a type-specific
 *    branch.
 *  - `bodyweight_reps`: `weight_kg (added) × reps` — **not** `max(reps, 1)`;
 *    08 §4.2's own example is `+10×8=80`, and this type's `reps` column is
 *    always populated (rep-based type), so the `max(…,1)` guard that exists
 *    only to no-op the two reps-less types above doesn't apply here.
 *  - `bodyweight_assisted_reps` / `reps_only` / `duration` /
 *    `distance_duration`: always `0` (08 §4.2: `assisted 20×12=0`,
 *    `reps_only=0`, `duration=0`, `distance_duration=0`).
 *
 * A `null` `weight_kg`/`reps` is treated as `0` before the formula runs
 * (an unfilled numeric cell), never as `NaN`.
 *
 * ## Unchecked / warm-up gating (task text, 04 §4.2)
 *
 * - An unchecked (`isCompleted: false`) set always contributes `0`,
 *   regardless of type — "Only checked sets of completed workouts count
 *   anywhere."
 * - A warm-up set (`setType === 'warmup'`) contributes `0` unless the
 *   caller passes `warmupInStats: true` (mirrors the `warmup_in_stats`
 *   settings key, `src/data/settings/settings-schema.ts`, default `false`)
 *   — 04 §4.2: "excluded from volume/sets/reps stats when 'Warm Up Sets in
 *   stats' is off (default off)."
 *
 * ## Display conversion
 *
 * Volume is just an aggregate weight — {@link formatVolumeDisplay} reuses
 * `domain/units.ts` (M1-02) rather than reimplementing kg->lb rounding.
 */
import type { ExerciseType, SetType, WeightUnit } from './enums';
import { formatWeightLb } from './units';

/** The subset of a logged set's fields volume math needs. Structurally compatible with (but not importing — `src/domain` may not depend on `src/data`, 06 §2) `src/data/workouts/types.ts`'s `WorkoutSet`. */
export interface VolumeSetInput {
  exerciseType: ExerciseType;
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  isCompleted: boolean;
}

/**
 * `true` when `set` counts toward any checked-sets-only, warm-up-gated
 * statistic — the exact same "checked, and not a warm-up unless
 * `warmupInStats`" test {@link setVolumeKg} applies before its per-type
 * formula runs. Exported (M2-05) so the logger's meta-row **Sets** counter
 * (02 §2: "count of checked sets... respect the warm-up-in-stats setting")
 * can reuse the identical gating rule instead of re-deriving it — the doc's
 * two counters (Volume, Sets) share one eligibility test, they just differ
 * in what they do with an eligible set (sum a formula vs. count it).
 */
export function isStatsEligibleSet(
  set: Pick<VolumeSetInput, 'isCompleted' | 'setType'>,
  warmupInStats: boolean,
): boolean {
  if (!set.isCompleted) {
    return false;
  }
  if (set.setType === 'warmup' && !warmupInStats) {
    return false;
  }
  return true;
}

/**
 * Volume in canonical kg for one set, or `0` if it doesn't contribute
 * (unchecked; a gated-out warm-up; or a type that never contributes). See
 * file header for the exact per-type formula.
 */
export function setVolumeKg(set: VolumeSetInput, warmupInStats: boolean): number {
  if (!isStatsEligibleSet(set, warmupInStats)) {
    return 0;
  }

  const weightKg = set.weightKg ?? 0;
  const reps = set.reps ?? 0;

  switch (set.exerciseType) {
    case 'weight_reps':
    case 'weight_duration':
    case 'short_distance_weight':
      return weightKg * Math.max(reps, 1);
    case 'bodyweight_reps':
      return weightKg * reps;
    case 'bodyweight_assisted_reps':
    case 'reps_only':
    case 'duration':
    case 'distance_duration':
      return 0;
    default: {
      // Exhaustiveness guard — a new ExerciseType added to enums.ts without
      // a case here fails `tsc --noEmit`, not just a missed test.
      const exhaustive: never = set.exerciseType;
      throw new Error(`volume.setVolumeKg: unhandled exercise_type "${exhaustive as string}".`);
    }
  }
}

/** Sum of {@link setVolumeKg} across every set — "workout volume = Σ" (08 §4.2). Also the right function to call for one exercise's own volume (pass just that exercise's sets) or a whole workout's (pass every set across every exercise). */
export function totalVolumeKg(sets: readonly VolumeSetInput[], warmupInStats: boolean): number {
  return sets.reduce((sum, set) => sum + setVolumeKg(set, warmupInStats), 0);
}

/**
 * Display-rounded volume in the given `unit` — "display converts kg->lb
 * correctly" (08 §4.2). `'kg'` is the canonical unit already (no
 * conversion, returned as-is); `'lbs'` reuses `formatWeightLb`
 * (`domain/units.ts`, M1-02) rather than reimplementing kg->lb rounding.
 */
export function formatVolumeDisplay(volumeKg: number, unit: WeightUnit): number {
  if (unit === 'kg') {
    return volumeKg;
  }
  return formatWeightLb(volumeKg) as number;
}
