/**
 * `measurement-units.ts` (M5-02) — display-unit conversion/labeling for the
 * 17 `MeasurementFields` (`src/data/measurements/types.ts`, 05 §3.4 / 04
 * §6.1), bridging their canonical kg/cm storage to the
 * `body_measurement_unit` setting (`'metric'` kg/cm | `'imperial'` lb/in —
 * independent from the workout `weight_unit`/`distance_unit` settings, 04
 * §6.1's own note).
 *
 * Two conversion tiers, mirroring `domain/units.ts`'s own documented split
 * and the same `toDisplay`/`toCanonicalKg`-shaped precedent for an
 * *editable* field used elsewhere in this codebase:
 *  - {@link toEditableDisplayValue} / {@link toCanonicalFromDisplay}: raw,
 *    full-precision, round-trip-safe conversion for the log-entry sheet's
 *    editable `NumericInput`s — a rounded pre-fill would silently discard
 *    precision the user never gets to see (same rationale an editable
 *    field's display-conversion helper should always give). 04 §6
 *    acceptance: "imperial entry stores canonical kg/cm exactly and
 *    round-trips display" — kg<->lb and cm<->in are both pure linear
 *    (through-the-origin) conversions, so converting the same typed value
 *    out and back via these two functions reproduces the exact original
 *    float (verified: `kgToLb(lbToKg(180)) === 180`).
 *  - {@link formatReadOnlyValue}: display-rounded value for read-only
 *    render contexts (Measures home latest/delta, chart axis/tooltip,
 *    detail entry list) — identity in the field's *native* canonical unit
 *    (metric mode never rounds at all, since nothing was converted),
 *    `domain/units.ts`'s `format*` helpers only when actually converting to
 *    the non-canonical (imperial) unit — same "identity for the native
 *    unit, format* for the converted one" convention `history-summary.ts`'s
 *    own weight formatting already uses.
 *
 * `fatPercent` is a dimensionless percentage — both tiers are the identity
 * function for it regardless of `body_measurement_unit`.
 */
import type { MeasurementFields } from '@/data/measurements/types';
import type { BodyMeasurementUnit } from '@/domain/enums';
import {
  cmToIn,
  formatLengthIn,
  formatWeightLb,
  inToCm,
  kgToLb,
  lbToKg,
} from '@/domain/units';

export type MeasurementFieldKey = keyof MeasurementFields;

type MeasurementUnitKind = 'weight' | 'percent' | 'length';

const FIELD_UNIT_KIND: Record<MeasurementFieldKey, MeasurementUnitKind> = {
  weightKg: 'weight',
  fatPercent: 'percent',
  leanMassKg: 'weight',
  neckCm: 'length',
  shouldersCm: 'length',
  chestCm: 'length',
  leftBicepCm: 'length',
  rightBicepCm: 'length',
  leftForearmCm: 'length',
  rightForearmCm: 'length',
  abdomenCm: 'length',
  waistCm: 'length',
  hipsCm: 'length',
  leftThighCm: 'length',
  rightThighCm: 'length',
  leftCalfCm: 'length',
  rightCalfCm: 'length',
};

/** Human labels for the 17 fields (04 §6.1's own list), used for row/field titles across the Measures surface. */
export const MEASUREMENT_FIELD_LABELS: Record<MeasurementFieldKey, string> = {
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

/** Unit suffix shown next to a field's label/value for the current `body_measurement_unit` setting — `'%'` for `fatPercent` regardless of the setting. */
export function measurementUnitSuffix(field: MeasurementFieldKey, unit: BodyMeasurementUnit): string {
  const kind = FIELD_UNIT_KIND[field];
  if (kind === 'percent') return '%';
  if (kind === 'weight') return unit === 'metric' ? 'kg' : 'lb';
  return unit === 'metric' ? 'cm' : 'in';
}

/** Canonical (kg/cm) -> editable display value, full precision — see file header ("no display rounding here"). `null` in, `null` out. */
export function toEditableDisplayValue(
  field: MeasurementFieldKey,
  canonical: number | null,
  unit: BodyMeasurementUnit,
): number | null {
  if (canonical === null) return null;
  if (unit === 'metric') return canonical;
  const kind = FIELD_UNIT_KIND[field];
  if (kind === 'percent') return canonical;
  return kind === 'weight' ? kgToLb(canonical) : cmToIn(canonical);
}

/** Editable display value -> canonical (kg/cm) — the exact inverse of {@link toEditableDisplayValue}. */
export function toCanonicalFromDisplay(
  field: MeasurementFieldKey,
  display: number | null,
  unit: BodyMeasurementUnit,
): number | null {
  if (display === null) return null;
  if (unit === 'metric') return display;
  const kind = FIELD_UNIT_KIND[field];
  if (kind === 'percent') return display;
  return kind === 'weight' ? lbToKg(display) : inToCm(display);
}

/** Canonical -> display-rounded value for read-only rendering (Measures home, chart axis/tooltip, detail entry list) — 05 §5's per-field rounding; identity in the native unit. */
export function formatReadOnlyValue(
  field: MeasurementFieldKey,
  canonical: number | null,
  unit: BodyMeasurementUnit,
): number | null {
  if (canonical === null) return null;
  if (unit === 'metric') return canonical;
  const kind = FIELD_UNIT_KIND[field];
  if (kind === 'percent') return canonical;
  return kind === 'weight' ? formatWeightLb(canonical) : formatLengthIn(canonical);
}
