/**
 * Shared public types for `src/ui/charts/*` (M4-07). Plain data-point
 * shapes only — these components are pure presentational wrappers around
 * `victory-native` (06 §7, 00 P4); no feature/domain types leak in here
 * (enforced by the `ui` ESLint import-boundary zone too, `06 §2`).
 *
 * `y: number | null` everywhere a series value appears is deliberate, not
 * an oversight: `null` is how a caller marks a genuine gap (no workout that
 * week, no session for that date) versus `0` (a real zero value). `04 §6`'s
 * chart rule ("gaps don't interpolate misleadingly — line connects existing
 * points, no zero-fill") only holds if the wrapper can tell those two cases
 * apart, so every chart here treats `null` as "skip this x", never as `0`.
 */
import type { ReactNode } from 'react';

/** A single `(x, y)` sample. `x` is always a plain number — callers convert
 * dates to epoch ms (or any other numeric domain) themselves and supply
 * `formatXLabel`/tooltip formatters to render it back out; keeps this
 * module domain-agnostic (reused by per-exercise date series in M4-09 and
 * weekly-bucket series in M4-08 alike).
 *
 * Deliberately a `type`, not an `interface`: `victory-native`'s
 * `CartesianChart` constrains its data generic to `Record<string, unknown>`,
 * and TS only treats a plain object type alias (not an `interface`, even
 * with an identical shape) as structurally satisfying that bound without an
 * explicit index signature — an `interface` here makes every
 * `<CartesianChart data={...}>` call site fail to infer with "Index
 * signature for type 'string' is missing", confirmed empirically while
 * building this file. */
export type ChartPoint = {
  x: number;
  y: number | null;
};

/** `BarChart` point — same shape as `ChartPoint` plus an optional
 * goal-met flag (07 §7: "muted variant accent.primary @ 30% for
 * non-goal-met bars"). Omitted/`true` renders the bar at full accent;
 * `false` renders it muted. The goal-vs-actual *decision* is the caller's
 * (M4-08 owns the `weekly_goal` setting) — this component only knows how
 * to paint the two variants. Also a `type` for the same reason as
 * `ChartPoint` above. */
export type BarChartPoint = ChartPoint & {
  goalMet?: boolean;
};

/** One stacked-bar series (07 §7: "stacked bars superset-palette + teal,
 * top-8 + Other"). The top-8-plus-Other *bucketing* is a domain concern
 * (`domain/stats-buckets.ts`, M4-08) — this component just draws however
 * many series it's given, cycling the default palette if more are passed
 * than the palette has colors for. */
export interface StackedBarSeries {
  /** Must match a key in every `StackedBarChartPoint['values']`. */
  key: string;
  /** Shown in the legend/tooltip surfaces a consumer builds around this chart. */
  label: string;
  /** Overrides the palette-cycled default color for this series. */
  color?: string;
}

/** One x-position's worth of stacked values, one entry per `StackedBarSeries.key`.
 * Missing keys are treated as `0` (a series absent for one bucket, e.g. no
 * "Calves" sets that week, still stacks correctly). */
export interface StackedBarChartPoint {
  x: number;
  values: Record<string, number>;
}

/** Card-header slot shared by `LineChart`/`BarChart`/`StackedBarChart` (07
 * §7: "Ranges as `SegmentedControl` ... right-aligned in the card header").
 * The wrapper only reserves the slot — range *state* belongs to the
 * feature screen composing it (M4-08/M4-09), keeping this generic across
 * both. */
export interface ChartCardHeaderProps {
  /** Card title (e.g. "Workouts per week", "Est. 1RM"). Omit for a bare, untitled card. */
  title?: string;
  /** Typically a `SegmentedControl` for range switching (3M/1Y/All); right-aligned next to the title. */
  headerRight?: ReactNode;
}
