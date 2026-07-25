/**
 * Small pure helpers shared by `LineChart`/`BarChart`/`StackedBarChart`/
 * `Sparkline` — kept here instead of duplicated per-file so the four stay
 * visually consistent (07 §7) without becoming a speculative shared base
 * class. Each function is independent and trivially unit-testable; they're
 * exercised indirectly through the component tests rather than in
 * isolation, matching how the rest of `src/ui/` tests its helpers.
 */
import type { ChartPoint } from './types';

/** True iff at least one point has a real (non-null) `y` — drives the
 * empty-state branch (07 §7: "dashed baseline + caption 'No data yet'"). */
export function hasRenderableData(points: readonly ChartPoint[]): boolean {
  return points.some((point) => point.y != null);
}

/** Cycles a series index through the superset palette + teal (07 §7:
 * "stacked bars superset-palette + teal, ... capped at 8 + Other" — the
 * cap/bucketing itself is `stats-buckets.ts`'s job, M4-08; this just picks
 * a color for whatever index it's given, wrapping if there are more
 * series than palette entries). */
export function paletteColorForIndex(
  index: number,
  supersetPalette: readonly string[],
  chartSecondary: string,
): string {
  const palette = [...supersetPalette, chartSecondary];
  return palette[index % palette.length] as string;
}

/** Default `x` label/tooltip formatter — callers pass their own for date
 * formatting (epoch ms domain, `05`/`04` don't mandate a display format
 * here); this is just a safe fallback so every chart works unconfigured. */
export function defaultFormatNumber(value: number): string {
  return String(value);
}
