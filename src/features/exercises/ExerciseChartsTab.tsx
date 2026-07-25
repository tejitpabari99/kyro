/**
 * `ExerciseChartsTab` (M4-09, 03 §3 / 04 §4.3): metric selector (per exercise
 * type) + 3M/1Y/All range selector + a `LineChart` (`src/ui/charts/`, M4-07)
 * of `domain/exercise-charts.ts`'s computed date series. One point per
 * workout date; tap point -> `LineChart`'s own built-in tooltip (value +
 * date). Metric selection uses a horizontally-scrollable `Chip` row rather
 * than `SegmentedControl` — `weight_reps` alone has 5 applicable metrics
 * (04 §4.3's table), too many for a fixed-width segmented track to lay out
 * legibly; `Chip`'s active/inactive pair (already used for the About tab's
 * muscle-group selection) is the established "pick one of several" pattern
 * for a variable-length option list in this codebase. Range selection
 * *is* `07 §7`'s own named component (`SegmentedControl`, 3M/1Y/All,
 * right-aligned in the chart card header).
 */
import React, { useMemo, useState } from 'react';
import { ScrollView, Text } from 'react-native';

import type { Exercise } from '@/data/exercises/types';
import type { ExerciseHistorySet } from '@/data/workouts/types';
import type { DistanceUnit, WeightUnit } from '@/domain/enums';
import {
  chartMetricsForExerciseType,
  chartRangeStartMs,
  computeChartSeries,
  CHART_METRIC_LABELS,
  CHART_RANGE_VALUES,
  type ChartDatePoint,
  type ChartMetric,
  type ChartRange,
} from '@/domain/exercise-charts';
import { Chip } from '@/ui/Chip';
import { LineChart, type ChartPoint } from '@/ui/charts';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { useTheme } from '@/ui/theme-provider';

import { formatChartAxisValue, formatChartValue } from './exercise-chart-format';

const CHART_HEIGHT = 220;

const RANGE_OPTIONS = CHART_RANGE_VALUES.map((value) => ({ value, label: value }));

export interface ExerciseChartsTabProps {
  historicalSets: readonly ExerciseHistorySet[];
  exercise: Pick<Exercise, 'exerciseType'>;
  weightUnit: WeightUnit;
  distanceUnit: DistanceUnit;
  warmupInStats: boolean;
  testID?: string;
}

function toChartPoints(points: readonly ChartDatePoint[]): ChartPoint[] {
  return points.map((point) => ({ x: point.epochMs, y: point.value }));
}

function formatXLabel(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function ExerciseChartsTab({
  historicalSets,
  exercise,
  weightUnit,
  distanceUnit,
  warmupInStats,
  testID = 'exercise-charts-tab',
}: ExerciseChartsTabProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  const availableMetrics = useMemo(
    () => chartMetricsForExerciseType(exercise.exerciseType),
    [exercise.exerciseType],
  );
  const [metric, setMetric] = useState<ChartMetric>(availableMetrics[0]!);
  const [range, setRange] = useState<ChartRange>('3M');

  // Guard against a metric left over from a previous exercise type (e.g.
  // this tab staying mounted across an exercise switch in a picker context)
  // — always fall back to the first applicable metric rather than reading
  // out of `availableMetrics` bounds.
  const activeMetric = availableMetrics.includes(metric) ? metric : availableMetrics[0]!;

  const units = useMemo(() => ({ weightUnit, distanceUnit }), [weightUnit, distanceUnit]);

  const chartInput = useMemo(
    () =>
      historicalSets.map((set) => ({
        workoutStartTime: set.workoutStartTime,
        exerciseType: exercise.exerciseType,
        setType: set.setType,
        isCompleted: set.isCompleted,
        weightKg: set.weightKg,
        reps: set.reps,
        durationSeconds: set.durationSeconds,
        distanceMeters: set.distanceMeters,
      })),
    [historicalSets, exercise.exerciseType],
  );

  const series = useMemo(
    () => computeChartSeries(chartInput, activeMetric, warmupInStats),
    [chartInput, activeMetric, warmupInStats],
  );

  const rangeStart = useMemo(() => chartRangeStartMs(range), [range]);
  const rangedSeries = useMemo(
    () => (rangeStart === null ? series : series.filter((point) => point.epochMs >= rangeStart)),
    [series, rangeStart],
  );

  const data = useMemo(() => toChartPoints(rangedSeries), [rangedSeries]);

  return (
    <ScrollView testID={testID} contentContainerStyle={{ padding: spacing['4'] }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: spacing['2'], paddingBottom: spacing['3'] }}
      >
        {availableMetrics.map((option) => (
          <Chip
            key={option}
            testID={`${testID}-metric-${option}`}
            label={CHART_METRIC_LABELS[option]}
            active={option === activeMetric}
            showCaret={false}
            onPress={() => setMetric(option)}
          />
        ))}
      </ScrollView>

      <LineChart
        testID={`${testID}-chart`}
        data={data}
        height={CHART_HEIGHT}
        title={CHART_METRIC_LABELS[activeMetric]}
        headerRight={
          <SegmentedControl
            testID={`${testID}-range`}
            options={RANGE_OPTIONS}
            value={range}
            onChange={setRange}
          />
        }
        formatXLabel={formatXLabel}
        formatYLabel={(y) => formatChartAxisValue(activeMetric, y, units)}
        formatTooltipValue={(point) => formatChartValue(activeMetric, point.y ?? 0, units)}
        formatTooltipDate={(point) => formatXLabel(point.x)}
        emptyStateLabel="No data yet"
      />

      {data.length === 0 ? (
        <Text
          testID={`${testID}-no-range-data`}
          style={[typography.footnote, { color: colors.text.tertiary, marginTop: spacing['3'] }]}
        >
          No sessions in this range.
        </Text>
      ) : null}
    </ScrollView>
  );
}
