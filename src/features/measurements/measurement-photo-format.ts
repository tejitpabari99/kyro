/**
 * Display formatting for `PhotoPagerScreen`'s date/weight overlay and
 * `PhotoCompareScreen`'s side-by-side deltas (M5-03, 04 §6.2: "date + that
 * date's weight overlay" / "weight/measurement deltas between them"). Pure
 * TS, unit-tested standalone (no React/native imports) — mirrors
 * `src/features/history/date-format.ts`'s "local to this feature, not yet
 * promoted to `domain/`" posture for the date label, and layers unit
 * conversion on top of `domain/units.ts` (M1-02) for the value/delta
 * formatting `05` §5 requires (canonical storage, display conversion only
 * at this boundary).
 *
 * `MEASUREMENT_FIELD_LABELS` here is this file's own minimal label set for
 * the 17 fields — the parallel M5-02 task (Measures home/log-entry/detail
 * charts, its own worktree) may independently need the same kind of label
 * map for its own screens; that duplication is expected and reconciled at
 * integration time (same "two call sites, two instances" posture this
 * milestone's task brief calls out for repository construction), not
 * something this file should try to avoid by reaching into M5-02's
 * not-yet-existing code.
 */
import type { MeasurementFields } from '@/data/measurements/types';
import type { Settings } from '@/data/settings/settings-schema';
import { formatLengthIn, formatWeightLb } from '@/domain/units';
import { parseLocalDateKey } from '@/domain/streaks';

export type BodyMeasurementUnit = Settings['body_measurement_unit'];

/** Human-readable label per measurement field, canonical order (`MEASUREMENT_FIELD_KEYS`, `src/data/measurements/types.ts`). */
export const MEASUREMENT_FIELD_LABELS: Record<keyof MeasurementFields, string> = {
  weightKg: 'Weight',
  fatPercent: 'Body Fat %',
  leanMassKg: 'Lean Mass',
  neckCm: 'Neck',
  shouldersCm: 'Shoulders',
  chestCm: 'Chest',
  leftBicepCm: 'Left Bicep',
  rightBicepCm: 'Right Bicep',
  leftForearmCm: 'Left Forearm',
  rightForearmCm: 'Right Forearm',
  abdomenCm: 'Abdomen',
  waistCm: 'Waist',
  hipsCm: 'Hips',
  leftThighCm: 'Left Thigh',
  rightThighCm: 'Right Thigh',
  leftCalfCm: 'Left Calf',
  rightCalfCm: 'Right Calf',
};

/** Fields with no unit at all (already a ratio) — never converted regardless of `body_measurement_unit`. */
const UNITLESS_FIELDS: ReadonlySet<keyof MeasurementFields> = new Set(['fatPercent']);
/** Weight-family fields (kg <-> lb) — everything else that isn't unitless is a cm-family length field (cm <-> in). */
const WEIGHT_FIELDS: ReadonlySet<keyof MeasurementFields> = new Set(['weightKg', 'leanMassKg']);

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** English month abbreviations — hand-rolled rather than `toLocaleDateString` for a deterministic, locale-independent label, same precedent `domain/csv-codec.ts`'s `formatCsvDateTime` already established (that file's header explains why: `toLocaleDateString`'s output shape varies by ICU data/locale — `"Jul 26, 2026"` vs. `"26 Jul 2026"` — which is fine for a CSV field a spreadsheet re-parses, but not for pinning down a single stable in-app label this file's own tests need to assert exactly). */
const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** `'YYYY-MM-DD'` -> `"26 Jul 2026"`-shaped label (weekday omitted — a single photo/measurement date, not a relative "Today"/"Yesterday" card like `formatRelativeWorkoutDate`, which needs "now" context this overlay doesn't have). */
export function formatMeasurementDateLabel(dateKey: string): string {
  const date = parseLocalDateKey(dateKey);
  return `${date.getDate()} ${MONTH_ABBREVIATIONS[date.getMonth()]} ${date.getFullYear()}`;
}

/** The unit suffix a field renders with, given the `body_measurement_unit` setting. */
export function measurementFieldUnitLabel(
  field: keyof MeasurementFields,
  unit: BodyMeasurementUnit,
): string {
  if (UNITLESS_FIELDS.has(field)) return '%';
  if (WEIGHT_FIELDS.has(field)) return unit === 'imperial' ? 'lb' : 'kg';
  return unit === 'imperial' ? 'in' : 'cm';
}

/** Converts a canonical (kg/cm) field value to its display-rounded number in the current `body_measurement_unit` — `null` in, `null` out. */
export function toDisplayMeasurementValue(
  field: keyof MeasurementFields,
  canonicalValue: number | null,
  unit: BodyMeasurementUnit,
): number | null {
  if (canonicalValue === null) return null;
  if (UNITLESS_FIELDS.has(field)) return roundTo(canonicalValue, 1);
  if (unit !== 'imperial') return roundTo(canonicalValue, 1);
  return WEIGHT_FIELDS.has(field) ? formatWeightLb(canonicalValue) : formatLengthIn(canonicalValue);
}

/** `toDisplayMeasurementValue` + its unit suffix, joined into one string (e.g. `"82.3 kg"`), or `null` when the canonical value is `null` ("no entry for this field on this date"). */
export function formatMeasurementValue(
  field: keyof MeasurementFields,
  canonicalValue: number | null,
  unit: BodyMeasurementUnit,
): string | null {
  const displayValue = toDisplayMeasurementValue(field, canonicalValue, unit);
  if (displayValue === null) return null;
  return `${displayValue} ${measurementFieldUnitLabel(field, unit)}`;
}

/**
 * Signed delta string between two canonical field values (`after - before`),
 * in display units — `null` when either side is `null` (no delta is
 * computable without both endpoints, 04 §6.2's compare view only shows
 * deltas for fields both photos' dates actually have a value for). Computed
 * from the two already-display-rounded endpoint values (not a raw-then-
 * rounded canonical delta) so the shown delta always agrees exactly with
 * "displayed after minus displayed before" — the number a user can verify
 * by eye against the two side-by-side values.
 */
export function formatMeasurementDelta(
  field: keyof MeasurementFields,
  beforeCanonical: number | null,
  afterCanonical: number | null,
  unit: BodyMeasurementUnit,
): string | null {
  const before = toDisplayMeasurementValue(field, beforeCanonical, unit);
  const after = toDisplayMeasurementValue(field, afterCanonical, unit);
  if (before === null || after === null) return null;

  const delta = roundTo(after - before, 1);
  const sign = delta > 0 ? '+' : '';
  return `${sign}${delta} ${measurementFieldUnitLabel(field, unit)}`;
}
