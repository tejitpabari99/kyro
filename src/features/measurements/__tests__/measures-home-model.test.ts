/**
 * `measures-home-model.ts` unit tests (M5-02 acceptance gate) —
 * `buildMeasureHomeRow`'s latest/previous/delta derivation and the 90-day
 * sparkline slice, including the "sparse data, no zero-fill" acceptance
 * case (04 §6: gaps are just absent points, never interpolated/zero-filled
 * — `series()` already guarantees this shape at the repository layer,
 * M5-01; this module must not undo it while slicing to 90 days).
 */
import type { MeasurementPoint } from '@/data/measurements/types';

import { buildMeasureHomeRow } from '../measures-home-model';

const DAY_MS = 24 * 60 * 60 * 1000;
// Fixed "now" for deterministic date-window math.
const NOW = new Date(2026, 6, 26).getTime(); // 2026-07-26

describe('buildMeasureHomeRow', () => {
  it('returns all-null/empty for a field with zero points', () => {
    const row = buildMeasureHomeRow('weightKg', [], NOW);
    expect(row.latest).toBeNull();
    expect(row.previous).toBeNull();
    expect(row.delta).toBeNull();
    expect(row.sparklineData).toEqual([]);
  });

  it('treats a single point as latest with no previous/delta', () => {
    const points: MeasurementPoint[] = [{ date: '2026-07-20', value: 80 }];
    const row = buildMeasureHomeRow('weightKg', points, NOW);
    expect(row.latest).toEqual({ date: '2026-07-20', value: 80 });
    expect(row.previous).toBeNull();
    expect(row.delta).toBeNull();
  });

  it('computes latest, previous, and a signed delta from the last two ascending points', () => {
    const points: MeasurementPoint[] = [
      { date: '2026-06-01', value: 82 },
      { date: '2026-07-01', value: 80 },
      { date: '2026-07-20', value: 79.5 },
    ];
    const row = buildMeasureHomeRow('weightKg', points, NOW);
    expect(row.latest).toEqual({ date: '2026-07-20', value: 79.5 });
    expect(row.previous).toEqual({ date: '2026-07-01', value: 80 });
    expect(row.delta).toBeCloseTo(-0.5);
  });

  it('sparkline includes only points within the trailing 90 days of `now`, preserving sparse gaps (no zero-fill)', () => {
    // NOW is 2026-07-26; 90 days earlier is 2026-04-27.
    const points: MeasurementPoint[] = [
      { date: '2026-01-01', value: 85 }, // > 90 days before NOW — excluded
      { date: '2026-03-01', value: 82 }, // > 90 days before NOW — excluded
      { date: '2026-05-15', value: 81 }, // within 90 days (72 days back)
      { date: '2026-07-26', value: 79 }, // today
    ];
    const row = buildMeasureHomeRow('weightKg', points, NOW);

    expect(row.sparklineData).toHaveLength(2);
    expect(row.sparklineData.map((p) => p.y)).toEqual([81, 79]);
    // No synthetic zero/interpolated points for the missing days in between.
    expect(row.sparklineData.every((p) => p.y !== 0)).toBe(true);
  });

  it('a point exactly 90 days before `now` is included (inclusive lower bound)', () => {
    const boundaryDate = new Date(NOW - 90 * DAY_MS);
    const boundaryKey = `${boundaryDate.getFullYear()}-${String(boundaryDate.getMonth() + 1).padStart(2, '0')}-${String(boundaryDate.getDate()).padStart(2, '0')}`;
    const points: MeasurementPoint[] = [{ date: boundaryKey, value: 77 }];
    const row = buildMeasureHomeRow('weightKg', points, NOW);
    expect(row.sparklineData).toHaveLength(1);
  });

  it('carries the requested field through onto the row', () => {
    const row = buildMeasureHomeRow('waistCm', [], NOW);
    expect(row.field).toBe('waistCm');
  });
});
