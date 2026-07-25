/**
 * `StackedBarChart` — 07 §7: stacked bars using the superset palette (§2.5)
 * + teal, radius-top 3 on the topmost segment of each stack only. Wraps
 * `victory-native`'s `CartesianChart` + `StackedBar` (06 §7, 00 P4) —
 * features never import `victory-native` directly.
 *
 * The "top-8 + Other" bucketing (07 §7) is a domain concern
 * (`domain/stats-buckets.ts`, M4-08) — this component draws exactly the
 * `series` it's given, cycling the default palette (superset colors + teal)
 * if more series are passed than the palette has entries for.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DashPathEffect } from '@shopify/react-native-skia';
import { CartesianChart, StackedBar } from 'victory-native';

import { useTheme } from '../theme-provider';
import { ChartEmptyState } from './ChartEmptyState';
import { useAxisCaptionFont } from './useAxisCaptionFont';
import { paletteColorForIndex, defaultFormatNumber } from './chart-utils';
import type { ChartCardHeaderProps, StackedBarChartPoint, StackedBarSeries } from './types';
import { Card } from '../Card';

const Y_AXIS_MAX_GRIDLINES = 4;
const BAR_RADIUS_TOP = 3;

export interface StackedBarChartProps extends ChartCardHeaderProps {
  data: StackedBarChartPoint[];
  series: StackedBarSeries[];
  /** Plot canvas height. */
  height: number;
  /** Plot canvas width — see `LineChartProps.width`'s doc for the explicitSize/layout-measurement tradeoff. */
  width?: number;
  formatXLabel?: (x: number) => string;
  formatYLabel?: (y: number) => string;
  emptyStateLabel?: string;
  testID?: string;
}

export function StackedBarChart({
  data,
  series,
  height,
  width,
  title,
  headerRight,
  formatXLabel = defaultFormatNumber,
  formatYLabel = defaultFormatNumber,
  emptyStateLabel,
  testID,
}: StackedBarChartProps): React.JSX.Element {
  const { colors, typography, spacing, supersetPalette } = useTheme();
  const font = useAxisCaptionFont(typography.caption.fontSize);

  const seriesKeys = useMemo(() => series.map((s) => s.key), [series]);
  const seriesColors = useMemo(
    () =>
      series.map(
        (s, index) => s.color ?? paletteColorForIndex(index, supersetPalette, colors.semantic.chartSecondary),
      ),
    [series, supersetPalette, colors.semantic.chartSecondary],
  );

  const chartData = useMemo(
    () =>
      data.map((point) => {
        const row: Record<string, number> = { x: point.x };
        for (const key of seriesKeys) {
          row[key] = point.values[key] ?? 0;
        }
        return row;
      }),
    [data, seriesKeys],
  );

  const maxStackedTotal = useMemo(
    () =>
      data.reduce((max, point) => {
        const total = seriesKeys.reduce((sum, key) => sum + (point.values[key] ?? 0), 0);
        return Math.max(max, total);
      }, 0),
    [data, seriesKeys],
  );

  const showHeader = title != null || headerRight != null;
  const dataHasValues = data.length > 0 && maxStackedTotal > 0;

  return (
    <Card testID={testID}>
      {showHeader ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: spacing['3'],
          }}
        >
          {title != null ? (
            <Text style={[typography.headline, { color: colors.text.primary }]}>{title}</Text>
          ) : (
            <View />
          )}
          {headerRight}
        </View>
      ) : null}
      {!dataHasValues ? (
        <ChartEmptyState
          height={height}
          label={emptyStateLabel}
          testID={testID ? `${testID}-empty` : undefined}
        />
      ) : (
        <View testID={testID ? `${testID}-plot` : undefined} style={{ height, width }}>
          <CartesianChart
            data={chartData}
            xKey="x"
            yKeys={seriesKeys}
            domain={{ y: [0, maxStackedTotal] }}
            explicitSize={width != null ? { width, height } : undefined}
            domainPadding={{ top: 16, bottom: 0, left: 16, right: 16 }}
            xAxis={{
              lineWidth: 0,
              labelColor: colors.text.tertiary,
              font,
              formatXLabel,
            }}
            yAxis={[
              {
                tickCount: Y_AXIS_MAX_GRIDLINES,
                lineColor: colors.text.tertiary,
                lineWidth: StyleSheet.hairlineWidth,
                labelColor: colors.text.tertiary,
                font,
                formatYLabel,
                linePathEffect: <DashPathEffect intervals={[4, 4]} />,
              },
            ]}
          >
            {({ points, chartBounds }) => (
              <StackedBar
                points={seriesKeys.map((key) => points[key])}
                chartBounds={chartBounds}
                colors={seriesColors}
                innerPadding={0.25}
                barOptions={({ isTop }) =>
                  isTop ? { roundedCorners: { topLeft: BAR_RADIUS_TOP, topRight: BAR_RADIUS_TOP } } : {}
                }
              />
            )}
          </CartesianChart>
        </View>
      )}
    </Card>
  );
}
