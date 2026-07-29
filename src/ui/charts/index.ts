/**
 * `src/ui/charts/` public surface (M4-07). Everything downstream (M4-08
 * dashboard, M4-09 per-exercise charts) imports chart primitives from here
 * — never from `victory-native` directly (06 §7).
 */
export { LineChart, type LineChartProps, type LineChartPressState } from './LineChart';
export { BarChart, type BarChartProps, type BarChartPressState } from './BarChart';
export { StackedBarChart, type StackedBarChartProps } from './StackedBarChart';
export { Sparkline, type SparklineProps } from './Sparkline';
// `ChartEmptyState` isn't a `victory-native` wrap (no canvas at all — see
// its own header), but M4-08's `MuscleDistributionBars` (a non-Skia
// horizontal bar list, `src/features/stats/`) still needs 07 §7's own
// "dashed baseline + No data yet" empty state for visual consistency with
// the three real chart wrappers above — exported here rather than reached
// into via its file path directly.
export { ChartEmptyState, type ChartEmptyStateProps } from './ChartEmptyState';
export type {
  ChartPoint,
  BarChartPoint,
  StackedBarSeries,
  StackedBarChartPoint,
  ChartCardHeaderProps,
} from './types';
