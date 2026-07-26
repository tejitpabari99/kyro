/**
 * `measurement-units.ts` unit tests (M5-02 acceptance gate) — 04 §6
 * acceptance: "imperial entry stores canonical kg/cm exactly and
 * round-trips display." Covers all three `MeasurementUnitKind`s (weight,
 * percent, length) across both `body_measurement_unit` settings, plus the
 * label/suffix maps.
 */
import { MEASUREMENT_FIELD_KEYS } from '@/data/measurements/types';

import {
  MEASUREMENT_FIELD_LABELS,
  formatReadOnlyValue,
  measurementUnitSuffix,
  toCanonicalFromDisplay,
  toEditableDisplayValue,
} from '../measurement-units';

describe('measurementUnitSuffix', () => {
  it('is kg/lb for weight-kind fields', () => {
    expect(measurementUnitSuffix('weightKg', 'metric')).toBe('kg');
    expect(measurementUnitSuffix('weightKg', 'imperial')).toBe('lb');
    expect(measurementUnitSuffix('leanMassKg', 'metric')).toBe('kg');
    expect(measurementUnitSuffix('leanMassKg', 'imperial')).toBe('lb');
  });

  it('is cm/in for length-kind (cm-family) fields', () => {
    expect(measurementUnitSuffix('waistCm', 'metric')).toBe('cm');
    expect(measurementUnitSuffix('waistCm', 'imperial')).toBe('in');
  });

  it('is always "%" for fatPercent, regardless of the unit setting', () => {
    expect(measurementUnitSuffix('fatPercent', 'metric')).toBe('%');
    expect(measurementUnitSuffix('fatPercent', 'imperial')).toBe('%');
  });
});

describe('toEditableDisplayValue / toCanonicalFromDisplay — round trip (04 §6 acceptance)', () => {
  it('metric mode is always the identity (no conversion at all)', () => {
    for (const field of MEASUREMENT_FIELD_KEYS) {
      expect(toEditableDisplayValue(field, 81.6, 'metric')).toBe(81.6);
      expect(toCanonicalFromDisplay(field, 81.6, 'metric')).toBe(81.6);
    }
  });

  it('null passes through untouched in both directions, both units', () => {
    for (const unit of ['metric', 'imperial'] as const) {
      expect(toEditableDisplayValue('weightKg', null, unit)).toBeNull();
      expect(toCanonicalFromDisplay('weightKg', null, unit)).toBeNull();
    }
  });

  it('weight-kind: a typed imperial (lb) value stores canonical kg exactly and round-trips back to the same lb value', () => {
    const typedLb = 180;
    const canonicalKg = toCanonicalFromDisplay('weightKg', typedLb, 'imperial');
    expect(canonicalKg).not.toBeNull();
    // Canonical storage is real, converted kg — not the bare typed number.
    expect(canonicalKg).not.toBe(typedLb);
    const roundTripped = toEditableDisplayValue('weightKg', canonicalKg, 'imperial');
    expect(roundTripped).toBe(typedLb);
  });

  it('length-kind (cm-family): a typed imperial (in) value stores canonical cm exactly and round-trips back', () => {
    const typedIn = 38.5;
    const canonicalCm = toCanonicalFromDisplay('waistCm', typedIn, 'imperial');
    expect(canonicalCm).not.toBeNull();
    expect(canonicalCm).not.toBe(typedIn);
    const roundTripped = toEditableDisplayValue('waistCm', canonicalCm, 'imperial');
    expect(roundTripped).toBe(typedIn);
  });

  it('percent has no conversion in imperial mode either', () => {
    expect(toEditableDisplayValue('fatPercent', 22.5, 'imperial')).toBe(22.5);
    expect(toCanonicalFromDisplay('fatPercent', 22.5, 'imperial')).toBe(22.5);
  });
});

describe('formatReadOnlyValue — display rounding (05 §5)', () => {
  it('is the identity in metric (native) mode for every kind', () => {
    expect(formatReadOnlyValue('weightKg', 81.649, 'metric')).toBe(81.649);
    expect(formatReadOnlyValue('waistCm', 90.3, 'metric')).toBe(90.3);
    expect(formatReadOnlyValue('fatPercent', 22.5, 'metric')).toBe(22.5);
  });

  it('rounds weight-kind to the nearest 0.5 lb at/above 10 lb converted magnitude', () => {
    // 81.6466 kg ~= 180 lb exactly, already on a 0.5 increment.
    const kg = 81.64662660180637;
    expect(formatReadOnlyValue('weightKg', kg, 'imperial')).toBe(180);
  });

  it('rounds length-kind to the nearest 0.1 in', () => {
    // 97.79 cm == 38.5 in exactly.
    expect(formatReadOnlyValue('waistCm', 97.79, 'imperial')).toBe(38.5);
  });

  it('null in, null out', () => {
    expect(formatReadOnlyValue('weightKg', null, 'imperial')).toBeNull();
  });
});

describe('MEASUREMENT_FIELD_LABELS', () => {
  it('has a human label for every one of the 17 canonical field keys', () => {
    for (const field of MEASUREMENT_FIELD_KEYS) {
      expect(MEASUREMENT_FIELD_LABELS[field]).toEqual(expect.any(String));
      expect(MEASUREMENT_FIELD_LABELS[field].length).toBeGreaterThan(0);
    }
  });
});
