/**
 * `domain/set-cell-values.ts` tests (M2-06): format/parse round-trips per
 * column kind + unit, and the 02 §16.7 clamps.
 */
import { formatCellValue, parseCellValue, type SetCellUnits } from '../set-cell-values';

const KG_KM: SetCellUnits = { weightUnit: 'kg', distanceUnit: 'km' };
const LBS_MILES: SetCellUnits = { weightUnit: 'lbs', distanceUnit: 'miles' };

describe('formatCellValue', () => {
  it('formats null as an empty string for every kind', () => {
    for (const kind of ['weight', 'reps', 'time', 'distance', 'short_distance', 'custom', 'rpe'] as const) {
      expect(formatCellValue(kind, null, KG_KM)).toBe('');
    }
  });

  it('weight: kg passes through unrounded', () => {
    expect(formatCellValue('weight', 80, KG_KM)).toBe('80');
  });

  it('weight: lbs converts+rounds via formatWeightLb', () => {
    // 80kg -> 176.37 lb -> nearest 0.5 (>=10lb) = 176.5
    expect(formatCellValue('weight', 80, LBS_MILES)).toBe('176.5');
  });

  it('weight_added/weight_assisted use the same weight formatting (sign is a UI-layer prefix, not part of this value)', () => {
    expect(formatCellValue('weight_added', 10, KG_KM)).toBe('10');
    expect(formatCellValue('weight_assisted', 20, KG_KM)).toBe('20');
  });

  it('reps/custom/rpe format as bare numbers', () => {
    expect(formatCellValue('reps', 9, KG_KM)).toBe('9');
    expect(formatCellValue('custom', 12.5, KG_KM)).toBe('12.5');
    expect(formatCellValue('rpe', 8.5, KG_KM)).toBe('8.5');
  });

  it('time formats seconds as mm:ss', () => {
    expect(formatCellValue('time', 90, KG_KM)).toBe('1:30');
  });

  it('distance: km formats to 2 decimals, miles converts', () => {
    expect(formatCellValue('distance', 5000, KG_KM)).toBe('5');
    expect(formatCellValue('distance', 1609.344, LBS_MILES)).toBe('1');
  });

  it('short_distance: meters (km unit) rounds to whole; feet (miles unit) converts', () => {
    expect(formatCellValue('short_distance', 20.4, KG_KM)).toBe('20');
    expect(formatCellValue('short_distance', 1, LBS_MILES)).toBe('3');
  });
});

describe('parseCellValue', () => {
  it('empty/whitespace text parses to null for every kind', () => {
    for (const kind of ['weight', 'reps', 'time', 'distance', 'short_distance', 'custom', 'rpe'] as const) {
      expect(parseCellValue(kind, '', KG_KM)).toBeNull();
      expect(parseCellValue(kind, '   ', KG_KM)).toBeNull();
    }
  });

  it('weight: kg passes through', () => {
    expect(parseCellValue('weight', '80', KG_KM)).toBe(80);
  });

  it('weight: lbs converts to canonical kg', () => {
    const kg = parseCellValue('weight', '176.5', LBS_MILES)!;
    expect(kg).toBeCloseTo(80.06, 1);
  });

  it('reps parses as an integer', () => {
    expect(parseCellValue('reps', '9', KG_KM)).toBe(9);
    expect(parseCellValue('reps', '9.7', KG_KM)).toBe(9);
  });

  it('time: "130" -> 90 seconds (digit-fill parsing, 08 §4.5)', () => {
    expect(parseCellValue('time', '130', KG_KM)).toBe(90);
  });

  it('time: an already-formatted "1:30" also parses to 90 (colon stripped)', () => {
    expect(parseCellValue('time', '1:30', KG_KM)).toBe(90);
  });

  it('distance: km converts to meters; miles converts to meters', () => {
    expect(parseCellValue('distance', '5', KG_KM)).toBe(5000);
    expect(parseCellValue('distance', '1', LBS_MILES)).toBeCloseTo(1609.344, 3);
  });

  it('short_distance: km unit is already meters; miles unit is feet -> meters', () => {
    expect(parseCellValue('short_distance', '20', KG_KM)).toBe(20);
    expect(parseCellValue('short_distance', '3', LBS_MILES)).toBeCloseTo(0.9144, 3);
  });

  it('custom/rpe parse as plain floats, unclamped', () => {
    expect(parseCellValue('custom', '12.5', KG_KM)).toBe(12.5);
    expect(parseCellValue('rpe', '8.5', KG_KM)).toBe(8.5);
  });

  it('unparseable text (e.g. bare "-") returns null rather than NaN', () => {
    expect(parseCellValue('weight', '-', KG_KM)).toBeNull();
    expect(parseCellValue('reps', 'abc', KG_KM)).toBeNull();
    expect(parseCellValue('distance', '-', KG_KM)).toBeNull();
    expect(parseCellValue('short_distance', '-', KG_KM)).toBeNull();
  });
});

describe('parseCellValue — 02 §16.7 clamps', () => {
  it('weight clamps at 1000 kg canonical', () => {
    expect(parseCellValue('weight', '1500', KG_KM)).toBe(1000);
  });

  it('weight floors at 0 (never negative)', () => {
    expect(parseCellValue('weight', '-50', KG_KM)).toBe(0);
  });

  it('reps clamps at 1000', () => {
    expect(parseCellValue('reps', '5000', KG_KM)).toBe(1000);
  });

  it('duration clamps at 24h (86400s)', () => {
    expect(parseCellValue('time', '999999', KG_KM)).toBeLessThanOrEqual(86400);
  });

  it('distance clamps at 1000km canonical (1,000,000 m)', () => {
    expect(parseCellValue('distance', '5000', KG_KM)).toBe(1_000_000);
  });

  it('short_distance also respects the 1000km-equivalent canonical ceiling', () => {
    expect(parseCellValue('short_distance', '2000000', KG_KM)).toBe(1_000_000);
  });
});
