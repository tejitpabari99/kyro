/**
 * `exercise-history-format.ts` (M4-09, 03 §3) — the History tab's own
 * per-set value line: `"80kg × 8 @9"` (03 §3's own worked example, weight/
 * reps types), generalized to every `exercise_type` by reusing
 * `domain/set-table-columns.ts`'s `columnsForExerciseType` (the exact same
 * type-driven column engine the set table itself uses, M2-06) +
 * `domain/set-cell-values.ts`'s `formatCellValue` for the actual unit-
 * respecting number formatting — this module never reimplements kg<->lb or
 * duration formatting itself, only the "how these columns join into one
 * line of text" layer `SetRow`'s own table-cell layout doesn't need (a
 * History card is prose, not a table).
 *
 * Join rule: a rep-based type's WEIGHT and REPS columns join with `" × "`
 * (03 §3's own example reads as a multiplication, "weight for N reps");
 * every other pair of base columns (TIME+KG, KM+TIME, KG+METERS) joins with
 * `" · "` (matches `set-table-columns.ts`'s own column-label separator,
 * `"KG · TIME"` etc. — these aren't a multiplicative relationship, so a
 * different separator is deliberate, not an oversight). RPE always appends
 * last as `" @9"` (rep-based types only, `columnsForExerciseType`'s own
 * `rpeEnabled` gate); CUSTOM appends after that as `" · {value}"` when
 * present.
 */
import type { Exercise } from '@/data/exercises/types';
import type { ExerciseHistorySet } from '@/data/workouts/types';
import type { DistanceUnit, WeightUnit } from '@/domain/enums';
import { formatCellValue } from '@/domain/set-cell-values';
import { columnsForExerciseType, type SetColumnKind } from '@/domain/set-table-columns';

export interface HistorySetLineUnits {
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  rpeEnabled: boolean;
}

const REPS_KIND: readonly SetColumnKind[] = ['reps'];

function unitSuffix(kind: SetColumnKind, units: HistorySetLineUnits): string {
  switch (kind) {
    case 'weight':
    case 'weight_added':
    case 'weight_assisted':
      return units.weightUnit === 'kg' ? 'kg' : 'lbs';
    case 'distance':
      return units.distanceUnit === 'km' ? 'km' : 'mi';
    case 'short_distance':
      return units.distanceUnit === 'km' ? 'm' : 'ft';
    case 'reps':
    case 'time':
    case 'custom':
    case 'rpe':
      return '';
    default: {
      const exhaustive: never = kind;
      throw new Error(`exercise-history-format.unitSuffix: unhandled kind "${exhaustive as string}".`);
    }
  }
}

/**
 * Builds one History-card set line's value text (everything after the
 * leading `SetTypeBadge` glyph, see `ExerciseHistoryTab.tsx`) — e.g.
 * `"80kg × 8 @9"`, `"1:30"`, `"5.2km · 32:00"`, `"+10kg × 8"`,
 * `"−15kg × 6"`. Returns `''` for a bare row with no value entered at all
 * (every column empty) — the caller still renders the leading badge.
 */
export function formatHistorySetLine(
  set: Pick<ExerciseHistorySet, 'weightKg' | 'reps' | 'distanceMeters' | 'durationSeconds' | 'rpe' | 'customMetric'>,
  exercise: Pick<Exercise, 'exerciseType' | 'usesCustomMetric'>,
  units: HistorySetLineUnits,
): string {
  const columns = columnsForExerciseType(exercise.exerciseType, {
    usesCustomMetric: exercise.usesCustomMetric,
    rpeEnabled: units.rpeEnabled,
    weightUnit: units.weightUnit,
    distanceUnit: units.distanceUnit,
  });

  const cellUnits = { weightUnit: units.weightUnit, distanceUnit: units.distanceUnit };

  const valueFor = (key: 'weight' | 'reps' | 'distance' | 'duration' | 'custom' | 'rpe'): number | null => {
    switch (key) {
      case 'weight':
        return set.weightKg;
      case 'reps':
        return set.reps;
      case 'distance':
        return set.distanceMeters;
      case 'duration':
        return set.durationSeconds;
      case 'custom':
        return set.customMetric;
      case 'rpe':
        return set.rpe;
    }
  };

  const baseColumns = columns.filter((c) => c.key !== 'custom' && c.key !== 'rpe');
  const hasReps = baseColumns.some((c) => c.kind === REPS_KIND[0]);
  const joiner = hasReps ? ' × ' : ' · ';

  const baseParts = baseColumns
    .map((column) => {
      const value = valueFor(column.key);
      if (value === null) return null;
      const formatted = formatCellValue(column.kind, value, cellUnits);
      const sign = column.kind === 'weight_added' ? '+' : column.kind === 'weight_assisted' ? '−' : '';
      return `${sign}${formatted}${unitSuffix(column.kind, units)}`;
    })
    .filter((part): part is string => part !== null);

  let line = baseParts.join(joiner);

  const rpeColumn = columns.find((c) => c.key === 'rpe');
  if (rpeColumn && set.rpe !== null) {
    const rpeText = formatCellValue('rpe', set.rpe, cellUnits);
    line = line.length > 0 ? `${line} @${rpeText}` : `@${rpeText}`;
  }

  const customColumn = columns.find((c) => c.key === 'custom');
  if (customColumn && set.customMetric !== null) {
    const customText = formatCellValue('custom', set.customMetric, cellUnits);
    line = line.length > 0 ? `${line} · ${customText}` : customText;
  }

  return line;
}
