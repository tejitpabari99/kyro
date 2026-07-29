/**
 * `domain/set-table-columns.ts` (M2-06) — the pure "type-driven column
 * engine" 02 §4's table describes: exactly which value columns a set table
 * shows, in order, for a given `exercise_type` + the `uses_custom_metric`/
 * RPE-enabled modifiers. Pure TS, zero React/RN/Expo imports (06 §2
 * dependency rule) — deliberately kept here rather than inside
 * `src/ui/SetTable.tsx` because `src/ui/**` may depend on its own tokens
 * only, never `src/domain` (06 §2's lint-enforced boundary,
 * `eslint.config.js`'s "ui: design-system components; tokens only" zone).
 * `src/features/workout/` is what bridges the two: it calls
 * {@link columnsForExerciseType} here, then maps the result into
 * `src/ui/SetRow.tsx`'s own local (not-imported-from-here, structurally
 * mirrored) `SetRowColumn` shape — the same "mirror a type across the
 * boundary instead of importing it" pattern `domain/previous-values.ts`'s
 * `PreviousSetLike` already established for `src/data/workouts/types.ts`'s
 * `PreviousSet`.
 *
 * ## Column set, per 02 §4's table (verbatim)
 *
 * | `exercise_type` | Columns after SET, PREVIOUS |
 * |---|---|
 * | `weight_reps` | KG (or LBS) · REPS |
 * | `reps_only` | REPS |
 * | `bodyweight_reps` | +KG (optional added weight) · REPS |
 * | `bodyweight_assisted_reps` | −KG (assistance, entered positive) · REPS |
 * | `duration` | TIME (mm:ss) |
 * | `weight_duration` | KG · TIME |
 * | `distance_duration` | KM (or MILES) · TIME |
 * | `short_distance_weight` | KG · METERS |
 *
 * Plus: a **CUSTOM** column appended whenever `usesCustomMetric` (any type);
 * an **RPE** column appended whenever `rpeEnabled` **and** the type is one
 * of the four rep-based types (02 §5: "RPE column appears for the 4
 * rep-based types only" — `weight_reps`, `reps_only`, `bodyweight_reps`,
 * `bodyweight_assisted_reps`). Both always sort after the type's own
 * columns, CUSTOM before RPE (arbitrary but fixed ordering — the doc doesn't
 * specify a relative order between the two, so one is picked and applied
 * consistently).
 *
 * `short_distance_weight`'s distance column displays meters (metric) or
 * feet (imperial) per 05 §5 — **not** km/mi like `distance_duration`'s own
 * distance column — so it gets its own `'short_distance'` `kind` distinct
 * from `distance_duration`'s `'distance'`, even though both are ultimately
 * "a distance number": `src/features/workout/`'s formatting step needs to
 * know which unit family applies, and folding them into one `kind` would
 * lose that distinction at the boundary.
 */
import type { ExerciseType, WeightUnit, DistanceUnit } from './enums';

/**
 * What *kind* of numeric input a column is — drives which parse/format
 * rules and which `NumericInput` mode (`decimal` vs `integer`) the
 * feature/ui layers use. Mirrored (not imported) by `src/ui/SetRow.tsx`'s
 * own `SetRowColumnKind` — see file header.
 */
export type SetColumnKind =
  | 'weight'
  | 'weight_added'
  | 'weight_assisted'
  | 'reps'
  | 'time'
  | 'distance'
  | 'short_distance'
  | 'custom'
  | 'rpe';

export interface SetColumnSpec {
  /** Stable key — also the field this column reads/writes on a `sets` row (`weight`, `reps`, `distance`, `duration`, `custom`, `rpe`). */
  key: 'weight' | 'reps' | 'distance' | 'duration' | 'custom' | 'rpe';
  kind: SetColumnKind;
  /** Uppercase column-header text (07 §10: column headers are the one uppercase exception to sentence case), e.g. `'KG'`, `'+KG'`, `'−KG'`, `'REPS'`, `'TIME'`, `'KM'`, `'M'`, `'CUSTOM'`, `'RPE'`. */
  label: string;
}

export interface SetColumnOptions {
  usesCustomMetric: boolean;
  /** 02 §5 / Settings → RPE Tracking. */
  rpeEnabled: boolean;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
}

/** 02 §5: "RPE column appears for the 4 rep-based types only." */
const REP_BASED_TYPES: readonly ExerciseType[] = [
  'weight_reps',
  'reps_only',
  'bodyweight_reps',
  'bodyweight_assisted_reps',
];

function weightLabel(unit: WeightUnit): string {
  return unit === 'kg' ? 'KG' : 'LBS';
}

function distanceLabel(unit: DistanceUnit): string {
  return unit === 'km' ? 'KM' : 'MILES';
}

/** `short_distance_weight`'s METERS column — meters (metric) or feet (imperial), 05 §5; not km/mi. */
function shortDistanceLabel(unit: DistanceUnit): string {
  return unit === 'km' ? 'M' : 'FT';
}

/** The type's own base columns (before CUSTOM/RPE are appended) — one `switch` arm per 02 §4 table row. */
function baseColumnsForType(exerciseType: ExerciseType, options: SetColumnOptions): SetColumnSpec[] {
  switch (exerciseType) {
    case 'weight_reps':
      return [
        { key: 'weight', kind: 'weight', label: weightLabel(options.weightUnit) },
        { key: 'reps', kind: 'reps', label: 'REPS' },
      ];
    case 'reps_only':
      return [{ key: 'reps', kind: 'reps', label: 'REPS' }];
    case 'bodyweight_reps':
      return [
        { key: 'weight', kind: 'weight_added', label: `+${weightLabel(options.weightUnit)}` },
        { key: 'reps', kind: 'reps', label: 'REPS' },
      ];
    case 'bodyweight_assisted_reps':
      return [
        { key: 'weight', kind: 'weight_assisted', label: `−${weightLabel(options.weightUnit)}` },
        { key: 'reps', kind: 'reps', label: 'REPS' },
      ];
    case 'duration':
      return [{ key: 'duration', kind: 'time', label: 'TIME' }];
    case 'weight_duration':
      return [
        { key: 'weight', kind: 'weight', label: weightLabel(options.weightUnit) },
        { key: 'duration', kind: 'time', label: 'TIME' },
      ];
    case 'distance_duration':
      return [
        { key: 'distance', kind: 'distance', label: distanceLabel(options.distanceUnit) },
        { key: 'duration', kind: 'time', label: 'TIME' },
      ];
    case 'short_distance_weight':
      return [
        { key: 'weight', kind: 'weight', label: weightLabel(options.weightUnit) },
        {
          key: 'distance',
          kind: 'short_distance',
          label: shortDistanceLabel(options.distanceUnit),
        },
      ];
    default: {
      // Exhaustiveness guard — a new ExerciseType added to enums.ts without
      // a case here fails `tsc --noEmit`, not just a missed test (same
      // pattern `domain/volume.ts`'s `setVolumeKg` already established).
      const exhaustive: never = exerciseType;
      throw new Error(`set-table-columns: unhandled exercise_type "${exhaustive as string}".`);
    }
  }
}

/**
 * The full column list for one exercise-card's set table: the type's own
 * columns (02 §4), plus CUSTOM (whenever `usesCustomMetric`), plus RPE
 * (whenever `rpeEnabled` and the type is rep-based). SET/PREVIOUS/✓ are not
 * part of this list — they're fixed chrome every row always has,
 * independent of exercise type (`src/ui/SetRow.tsx` renders them
 * unconditionally).
 */
export function columnsForExerciseType(
  exerciseType: ExerciseType,
  options: SetColumnOptions,
): SetColumnSpec[] {
  const columns = baseColumnsForType(exerciseType, options);

  if (options.usesCustomMetric) {
    columns.push({ key: 'custom', kind: 'custom', label: 'CUSTOM' });
  }
  if (options.rpeEnabled && REP_BASED_TYPES.includes(exerciseType)) {
    columns.push({ key: 'rpe', kind: 'rpe', label: 'RPE' });
  }

  return columns;
}
