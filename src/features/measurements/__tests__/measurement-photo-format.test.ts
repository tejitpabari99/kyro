/**
 * `measurement-photo-format` unit tests (M5-03) — pure formatting logic
 * `PhotoPagerScreen`'s weight overlay and `PhotoCompareScreen`'s deltas
 * depend on. No native/React imports in the module under test, so this runs
 * fast and asserts every unit-conversion/rounding edge directly.
 */
import {
  formatMeasurementDateLabel,
  formatMeasurementDelta,
  formatMeasurementValue,
  measurementFieldUnitLabel,
} from '../measurement-photo-format';

describe('formatMeasurementDateLabel', () => {
  it('formats a YYYY-MM-DD key as "<day> <Mon> <year>"', () => {
    expect(formatMeasurementDateLabel('2026-07-26')).toBe('26 Jul 2026');
  });

  it('formats a single-digit day correctly', () => {
    expect(formatMeasurementDateLabel('2026-01-05')).toBe('5 Jan 2026');
  });
});

describe('measurementFieldUnitLabel', () => {
  it('weightKg is kg (metric) / lb (imperial)', () => {
    expect(measurementFieldUnitLabel('weightKg', 'metric')).toBe('kg');
    expect(measurementFieldUnitLabel('weightKg', 'imperial')).toBe('lb');
  });

  it('waistCm is cm (metric) / in (imperial)', () => {
    expect(measurementFieldUnitLabel('waistCm', 'metric')).toBe('cm');
    expect(measurementFieldUnitLabel('waistCm', 'imperial')).toBe('in');
  });

  it('fatPercent is always % regardless of unit setting', () => {
    expect(measurementFieldUnitLabel('fatPercent', 'metric')).toBe('%');
    expect(measurementFieldUnitLabel('fatPercent', 'imperial')).toBe('%');
  });
});

describe('formatMeasurementValue', () => {
  it('returns null for a null canonical value (no entry for this field)', () => {
    expect(formatMeasurementValue('weightKg', null, 'metric')).toBeNull();
  });

  it('formats weight in kg (metric, 1 decimal)', () => {
    expect(formatMeasurementValue('weightKg', 82.34, 'metric')).toBe('82.3 kg');
  });

  it('formats weight in lb (imperial, 05 §5 rounding: nearest 0.5 lb >= 10 lb)', () => {
    // 82.34 kg -> ~181.53 lb -> nearest 0.5 -> 181.5
    expect(formatMeasurementValue('weightKg', 82.34, 'imperial')).toBe('181.5 lb');
  });

  it('formats a cm-family field in cm (metric)', () => {
    expect(formatMeasurementValue('waistCm', 81.2, 'metric')).toBe('81.2 cm');
  });

  it('formats a cm-family field in inches (imperial, 1 decimal)', () => {
    // 81.2 cm / 2.54 = 31.968... -> 32.0
    expect(formatMeasurementValue('waistCm', 81.2, 'imperial')).toBe('32 in');
  });

  it('never converts fatPercent regardless of unit setting', () => {
    expect(formatMeasurementValue('fatPercent', 18.456, 'imperial')).toBe('18.5 %');
    expect(formatMeasurementValue('fatPercent', 18.456, 'metric')).toBe('18.5 %');
  });
});

describe('formatMeasurementDelta', () => {
  it('returns null when either side is null (no delta computable)', () => {
    expect(formatMeasurementDelta('weightKg', null, 80, 'metric')).toBeNull();
    expect(formatMeasurementDelta('weightKg', 80, null, 'metric')).toBeNull();
  });

  it('formats a positive delta with an explicit "+" sign', () => {
    expect(formatMeasurementDelta('weightKg', 80, 82, 'metric')).toBe('+2 kg');
  });

  it('formats a negative delta with its own "-" sign (no double sign)', () => {
    expect(formatMeasurementDelta('weightKg', 82, 80, 'metric')).toBe('-2 kg');
  });

  it('formats a zero delta with no sign', () => {
    expect(formatMeasurementDelta('waistCm', 81, 81, 'metric')).toBe('0 cm');
  });

  it('delta agrees exactly with the difference of the two independently-displayed (already-rounded) values, in imperial', () => {
    const before = formatMeasurementValue('weightKg', 80, 'imperial');
    const after = formatMeasurementValue('weightKg', 82, 'imperial');
    const delta = formatMeasurementDelta('weightKg', 80, 82, 'imperial');

    expect(before).toBe('176.5 lb');
    expect(after).toBe('181 lb');
    expect(delta).toBe('+4.5 lb');
  });
});
