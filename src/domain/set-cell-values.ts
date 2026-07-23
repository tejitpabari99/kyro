/**
 * `domain/set-cell-values.ts` (M2-06) — the round-trip glue between a set
 * table's editable text cells and canonical storage values: format a
 * canonical number for display in the user's chosen unit, and parse
 * user-typed text back to canonical, applying 02 §16.7's input clamps along
 * the way. Pure TS, zero React/RN/Expo imports (06 §2 dependency rule) —
 * `src/features/workout/ConnectedSetRow.tsx` is the only caller, mapping
 * `SetColumnSpec.key` ('weight'/'reps'/'distance'/'duration'/'custom'/
 * 'rpe') to the matching `WorkoutSet` field.
 *
 * Reuses `domain/units.ts` (M1-02) for every actual conversion/rounding —
 * this module only adds the "which `SetColumnKind` maps to which
 * conversion" dispatch + the clamp step, never reimplementing kg<->lb or
 * mm:ss math itself.
 *
 * ## Clamps (02 §16.7, verbatim)
 *
 * "Inputs clamp weight ≤ 1000 kg, reps ≤ 1000, duration ≤ 24 h, distance ≤
 * 1000 km." Applied to the **canonical** value after unit conversion (so a
 * 1000 lb entry, which converts to ~453.6 kg, is untouched, while a
 * 2205 lb entry — ~1000 kg exactly at the boundary — clamps at 1000 kg
 * canonical, not at a separately-clamped display number). `short_distance`
 * (meters/feet) shares the same 1000 km canonical ceiling — 05 §5 doesn't
 * give it its own cap, and "1000 km" is already expressed in the canonical
 * unit that column's own values live in.
 */
import type { DistanceUnit, WeightUnit } from './enums';
import type { SetColumnKind } from './set-table-columns';
import {
  feetToM,
  formatDistanceFeet,
  formatDistanceKm,
  formatDistanceMiles,
  formatDuration,
  formatWeightLb,
  kmToM,
  lbToKg,
  milesToM,
  parseTimeInput,
} from './units';

export interface SetCellUnits {
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
}

const MAX_WEIGHT_KG = 1000;
const MAX_REPS = 1000;
const MAX_DURATION_SECONDS = 24 * 60 * 60;
const MAX_DISTANCE_METERS = 1000 * 1000; // 1000 km, also this module's short_distance ceiling

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** A type predicate (not just `boolean`) so `tsc` actually narrows `kind` out of the `switch` below in both call sites — a bare `boolean` return left the exhaustiveness `never` guard unable to prove the three weight kinds were already handled. */
function isWeightKind(
  kind: SetColumnKind,
): kind is 'weight' | 'weight_added' | 'weight_assisted' {
  return kind === 'weight' || kind === 'weight_added' || kind === 'weight_assisted';
}

/**
 * Format a canonical value for display in `units`, per `kind`. `null` (no
 * value) formats as `''` (an empty editable cell) — callers show the grey
 * placeholder text separately, this function never returns placeholder
 * copy itself.
 */
export function formatCellValue(
  kind: SetColumnKind,
  canonical: number | null,
  units: SetCellUnits,
): string {
  if (canonical === null) {
    return '';
  }

  if (isWeightKind(kind)) {
    const display = units.weightUnit === 'kg' ? canonical : (formatWeightLb(canonical) as number);
    return String(display);
  }

  switch (kind) {
    case 'reps':
    case 'custom':
    case 'rpe':
      return String(canonical);
    case 'time':
      return formatDuration(canonical) ?? '';
    case 'distance':
      return String(
        units.distanceUnit === 'km'
          ? (formatDistanceKm(canonical) as number)
          : (formatDistanceMiles(canonical) as number),
      );
    case 'short_distance':
      return String(
        units.distanceUnit === 'km'
          ? Math.round(canonical)
          : (formatDistanceFeet(canonical) as number),
      );
    default: {
      const exhaustive: never = kind;
      throw new Error(`set-cell-values.formatCellValue: unhandled kind "${exhaustive as string}".`);
    }
  }
}

/**
 * Parse user-typed `text` (already display-unit) into a canonical value,
 * clamped per 02 §16.7. Empty/unparseable text returns `null` (an emptied
 * cell — the caller writes `null` for that field, per `UpdateSetInput`'s
 * undefined-vs-null convention: an explicit `null` here means "the user
 * cleared this field", not "leave unchanged").
 */
export function parseCellValue(
  kind: SetColumnKind,
  text: string,
  units: SetCellUnits,
): number | null {
  const trimmed = text.trim();
  if (trimmed === '') {
    return null;
  }

  if (isWeightKind(kind)) {
    const typed = parseFloat(trimmed);
    if (Number.isNaN(typed)) {
      return null;
    }
    const kg = units.weightUnit === 'kg' ? typed : (lbToKg(typed) as number);
    return clamp(kg, 0, MAX_WEIGHT_KG);
  }

  switch (kind) {
    case 'reps': {
      const parsed = parseInt(trimmed, 10);
      return Number.isNaN(parsed) ? null : clamp(parsed, 0, MAX_REPS);
    }
    case 'custom':
    case 'rpe': {
      const parsed = parseFloat(trimmed);
      return Number.isNaN(parsed) ? null : parsed;
    }
    case 'time': {
      // parseTimeInput strips non-digits itself — safe to pass the
      // formatted "m:ss" text straight through (02 §4 digit-fill parsing,
      // M1-02).
      const seconds = parseTimeInput(trimmed) ?? 0;
      return clamp(seconds, 0, MAX_DURATION_SECONDS);
    }
    case 'distance': {
      const typed = parseFloat(trimmed);
      if (Number.isNaN(typed)) {
        return null;
      }
      const meters = units.distanceUnit === 'km' ? (kmToM(typed) as number) : (milesToM(typed) as number);
      return clamp(meters, 0, MAX_DISTANCE_METERS);
    }
    case 'short_distance': {
      const typed = parseFloat(trimmed);
      if (Number.isNaN(typed)) {
        return null;
      }
      const meters = units.distanceUnit === 'km' ? typed : (feetToM(typed) as number);
      return clamp(meters, 0, MAX_DISTANCE_METERS);
    }
    default: {
      const exhaustive: never = kind;
      throw new Error(`set-cell-values.parseCellValue: unhandled kind "${exhaustive as string}".`);
    }
  }
}
