/**
 * `exercise-chart-format.ts` tests (M4-09) — unit conversion/rounding per
 * metric, both the tooltip (unit-suffixed) and axis (compact) formatters.
 */
import { formatChartAxisValue, formatChartValue, type ChartValueUnits } from '../exercise-chart-format';

const KG: ChartValueUnits = { weightUnit: 'kg', distanceUnit: 'km' };
const LBS: ChartValueUnits = { weightUnit: 'lbs', distanceUnit: 'km' };
const MILES: ChartValueUnits = { weightUnit: 'kg', distanceUnit: 'miles' };

describe('formatChartValue', () => {
  it('heaviest_weight in kg', () => {
    expect(formatChartValue('heaviest_weight', 100, KG)).toBe('100 kg');
  });

  it('heaviest_weight in lbs converts', () => {
    expect(formatChartValue('heaviest_weight', 100, LBS)).toBe('220.5 lbs');
  });

  it('total_reps rounds to a whole number', () => {
    expect(formatChartValue('total_reps', 42, KG)).toBe('42 reps');
  });

  it('longest_duration renders mm:ss', () => {
    expect(formatChartValue('longest_duration', 90, KG)).toBe('1:30');
  });

  it('total_distance in km', () => {
    expect(formatChartValue('total_distance', 5200, KG)).toBe('5.2 km');
  });

  it('total_distance in miles', () => {
    expect(formatChartValue('total_distance', 1609.344, MILES)).toBe('1 mi');
  });

  it('best_pace converts seconds-per-meter to mm:ss/km', () => {
    // 0.3 s/m * 1000 = 300 s/km = 5:00/km.
    expect(formatChartValue('best_pace', 0.3, KG)).toBe('5:00/km');
  });

  it('best_pace converts seconds-per-meter to mm:ss/mi', () => {
    // 0.3 s/m * 1609.344 = 482.8032 s/mi ≈ 8:03/mi.
    expect(formatChartValue('best_pace', 0.3, MILES)).toBe('8:03/mi');
  });
});

describe('formatChartAxisValue', () => {
  it('drops the unit suffix for weight metrics', () => {
    expect(formatChartAxisValue('heaviest_weight', 100, KG)).toBe('100');
  });

  it('drops the "reps" suffix for total_reps', () => {
    expect(formatChartAxisValue('total_reps', 8, KG)).toBe('8');
  });

  it('keeps mm:ss shape for durations (unitless would be unreadable)', () => {
    expect(formatChartAxisValue('total_duration', 90, KG)).toBe('1:30');
  });
});
