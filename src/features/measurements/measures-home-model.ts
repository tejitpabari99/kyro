/**
 * `measures-home-model.ts` (M5-02, 04 §6.1) — pure "latest value + delta vs
 * previous + 90-day sparkline" derivation for one Measures-home row, from a
 * field's all-time `MeasurementRepository.series()` points
 * (`MeasuresHomeScreen.tsx` fetches those via `useQueries`, one per field,
 * and hands each result here). Kept pure/feature-local (no React/RN
 * imports) so it's directly unit-testable without rendering anything.
 *
 * `series()` already returns ascending, non-null-only points (M5-01, "gaps
 * in sparse data are preserved as genuine gaps ... never interpolated or
 * zero-filled") — this module trusts that shape rather than re-deriving it,
 * and preserves the same guarantee for the 90-day sparkline slice (a plain
 * filter over the same already-gap-correct array, never a zero-fill).
 */
import { parseLocalDateKey } from '@/domain/streaks';
import type { MeasurementPoint } from '@/data/measurements/types';
import type { ChartPoint } from '@/ui/charts';

import type { MeasurementFieldKey } from './measurement-units';

/** One Measures-home row's derived data for a single field. */
export interface MeasureHomeRow {
  field: MeasurementFieldKey;
  /** The most recent point (canonical units), or `null` if this field has never been logged. */
  latest: MeasurementPoint | null;
  /** The point immediately before `latest` chronologically, or `null` with fewer than two points. */
  previous: MeasurementPoint | null;
  /** `latest.value - previous.value` (canonical units) — `null` unless both exist. */
  delta: number | null;
  /** `{x: epochMs, y: canonical value}` points within the trailing 90 days of `now`, for the row's `Sparkline`. */
  sparklineData: ChartPoint[];
}

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

/** Builds one Measures-home row from `field`'s all-time, ascending `series()` points. `now` is injectable for deterministic tests; real call sites omit it (defaults to `Date.now()`). */
export function buildMeasureHomeRow(
  field: MeasurementFieldKey,
  points: readonly MeasurementPoint[],
  now: number = Date.now(),
): MeasureHomeRow {
  const latest = points.length > 0 ? points[points.length - 1]! : null;
  const previous = points.length > 1 ? points[points.length - 2]! : null;
  const delta = latest !== null && previous !== null ? latest.value - previous.value : null;

  const sparklineStart = now - NINETY_DAYS_MS;
  const sparklineData: ChartPoint[] = points
    .filter((point) => parseLocalDateKey(point.date).getTime() >= sparklineStart)
    .map((point) => ({ x: parseLocalDateKey(point.date).getTime(), y: point.value }));

  return { field, latest, previous, delta, sparklineData };
}
