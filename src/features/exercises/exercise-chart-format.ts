/**
 * `exercise-chart-format.ts` (M4-09) — display-unit formatting for
 * `domain/exercise-charts.ts`'s canonical `ChartDatePoint.value`s. Every
 * metric's canonical unit is fixed (kg for the four weight-based metrics,
 * whole reps, seconds for durations, meters for distance, seconds-per-meter
 * for pace) — this module is the one place that converts each to the
 * user's `weight_unit`/`distance_unit` setting and renders the unit-suffixed
 * string both the chart tooltip and the axis labels show. Reuses
 * `domain/units.ts`/`domain/volume.ts`'s existing display-rounding helpers
 * throughout, never reimplementing kg<->lb or mm:ss formatting.
 */
import type { DistanceUnit, WeightUnit } from '@/domain/enums';
import type { ChartMetric } from '@/domain/exercise-charts';
import { formatDistanceKm, formatDistanceMiles, formatDuration } from '@/domain/units';
import { formatVolumeDisplay } from '@/domain/volume';

export interface ChartValueUnits {
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
}

const METERS_PER_MILE = 1609.344;

/** Canonical `value` (whatever unit `metric` produces, see `domain/exercise-charts.ts`) -> a unit-suffixed display string, e.g. `"102.5 kg"`, `"8 reps"`, `"1:30"`, `"5.2 km"`, `"4:30/km"`. */
export function formatChartValue(metric: ChartMetric, value: number, units: ChartValueUnits): string {
  switch (metric) {
    case 'heaviest_weight':
    case 'best_1rm':
    case 'best_set_volume':
    case 'session_volume':
      return `${formatVolumeDisplay(value, units.weightUnit)} ${units.weightUnit}`;
    case 'total_reps':
      return `${Math.round(value)} reps`;
    case 'longest_duration':
    case 'total_duration':
      return formatDuration(value) ?? '0:00';
    case 'total_distance':
      return units.distanceUnit === 'km'
        ? `${formatDistanceKm(value)} km`
        : `${formatDistanceMiles(value)} mi`;
    case 'best_pace': {
      // `value` is canonical seconds-per-meter; convert to seconds-per-km
      // or seconds-per-mile (05 §5's distance-unit convention) before
      // handing off to `formatDuration`'s mm:ss rendering.
      const perDisplayUnit = units.distanceUnit === 'km' ? value * 1000 : value * METERS_PER_MILE;
      const suffix = units.distanceUnit === 'km' ? 'km' : 'mi';
      return `${formatDuration(perDisplayUnit) ?? '0:00'}/${suffix}`;
    }
    default: {
      const exhaustive: never = metric;
      throw new Error(`exercise-chart-format.formatChartValue: unhandled metric "${exhaustive as string}".`);
    }
  }
}

/** Compact axis-tick text (no unit suffix — 07 §7's `formatYLabel` ticks are already labeled by the card title, so repeating the unit 4x down the axis is unnecessary chrome) — everything but duration/pace renders as a plain rounded number; duration/pace keep their mm:ss shape (unitless numbers would be unreadable there). */
export function formatChartAxisValue(metric: ChartMetric, value: number, units: ChartValueUnits): string {
  switch (metric) {
    case 'heaviest_weight':
    case 'best_1rm':
    case 'best_set_volume':
    case 'session_volume':
      return `${formatVolumeDisplay(value, units.weightUnit)}`;
    case 'total_reps':
      return `${Math.round(value)}`;
    case 'longest_duration':
    case 'total_duration':
      return formatDuration(value) ?? '0:00';
    case 'total_distance':
      return units.distanceUnit === 'km' ? `${formatDistanceKm(value)}` : `${formatDistanceMiles(value)}`;
    case 'best_pace': {
      const perDisplayUnit = units.distanceUnit === 'km' ? value * 1000 : value * METERS_PER_MILE;
      return formatDuration(perDisplayUnit) ?? '0:00';
    }
    default: {
      const exhaustive: never = metric;
      throw new Error(`exercise-chart-format.formatChartAxisValue: unhandled metric "${exhaustive as string}".`);
    }
  }
}
