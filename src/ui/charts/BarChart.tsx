/**
 * `BarChart` — 07 §7: radius-top 3 bars, accent fill; muted variant
 * (`accent.primary` @ 30%) for non-goal-met bars; dashed goal reference
 * line (`text.secondary`). Wraps `victory-native`'s `CartesianChart` + `Bar`
 * (06 §7, 00 P4) — features never import `victory-native` directly.
 *
 * Two-layer coloring trick for the goal-met/muted split: `data` is fed to
 * `CartesianChart` with *two* derived y-keys (`yMet`/`yMuted`), each null
 * everywhere the other applies — `victory-native`'s bar-path builder skips
 * points with a `null` y (confirmed against `useBarPath`'s
 * `getVerticalBarRect`, which returns `null` — and is skipped — for any
 * non-finite/`null` y), so stacking two `Bar` layers over the same mutually
 * exclusive key pair paints each bar exactly one color without ever
 * touching per-point color props (which `Bar` doesn't expose — it's one
 * fill color per `<Bar>` element).
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DashPathEffect, Line as SkiaLine, vec } from '@shopify/react-native-skia';
import { Bar, CartesianChart, useChartPressState, type ChartPressState } from 'victory-native';

import { useTheme } from '../theme-provider';
import { alphaOverlayToRgba } from '../tokens';
import { ChartEmptyState } from './ChartEmptyState';
import { ChartTooltip } from './ChartTooltip';
import { useChartSelection } from './useChartSelection';
import { useAxisCaptionFont } from './useAxisCaptionFont';
import { hasRenderableData, defaultFormatNumber } from './chart-utils';
import type { BarChartPoint, ChartCardHeaderProps } from './types';
import { Card } from '../Card';

const Y_AXIS_MAX_GRIDLINES = 4;
const MUTED_OPACITY = 0.3;
const BAR_RADIUS_TOP = 3;

/** See `LineChart`'s identical `LineChartPressState` — same controlled/
 * uncontrolled convention, shaped for this chart's two internal y-keys. */
export type BarChartPressState = ChartPressState<{ x: number; y: { yMet: number; yMuted: number } }>;

export interface BarChartProps extends ChartCardHeaderProps {
  data: BarChartPoint[];
  /** Plot canvas height. */
  height: number;
  /** Plot canvas width — see `LineChartProps.width`'s doc for the explicitSize/layout-measurement tradeoff. */
  width?: number;
  /** Dashed reference line at this y value (07 §7 — e.g. the weekly workout goal). Omit for no goal line. */
  goalValue?: number;
  formatXLabel?: (x: number) => string;
  formatYLabel?: (y: number) => string;
  formatTooltipValue?: (point: BarChartPoint) => string;
  formatTooltipDate?: (point: BarChartPoint) => string;
  /** Controlled press/selection state — see `BarChartPressState`. Uncontrolled (internal) by default. */
  chartPressState?: BarChartPressState;
  emptyStateLabel?: string;
  testID?: string;
}

// `type`, not `interface` — see `ChartPoint`'s header comment in `./types`
// for why `CartesianChart`'s generic inference needs this.
type BarChartDatum = {
  x: number;
  yMet: number | null;
  yMuted: number | null;
};

export function BarChart({
  data,
  height,
  width,
  title,
  headerRight,
  goalValue,
  formatXLabel = defaultFormatNumber,
  formatYLabel = defaultFormatNumber,
  formatTooltipValue,
  formatTooltipDate,
  chartPressState,
  emptyStateLabel,
  testID,
}: BarChartProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  const font = useAxisCaptionFont(typography.caption.fontSize);

  const chartData: BarChartDatum[] = useMemo(
    () =>
      data.map((point) => ({
        x: point.x,
        yMet: point.goalMet === false ? null : point.y,
        yMuted: point.goalMet === false ? point.y : null,
      })),
    [data],
  );

  const { state: internalPressState } = useChartPressState({ x: 0, y: { yMet: 0, yMuted: 0 } });
  const state = chartPressState ?? internalPressState;
  const { isActive, point: selectedPoint } = useChartSelection(state, data);

  const resolveTooltipValue = formatTooltipValue ?? ((point: BarChartPoint) => formatYLabel(point.y ?? 0));
  const resolveTooltipDate = formatTooltipDate ?? ((point: BarChartPoint) => formatXLabel(point.x));

  const showHeader = title != null || headerRight != null;
  const dataHasValues = hasRenderableData(data);

  const mutedColor = alphaOverlayToRgba({ hex: colors.accent.primary, opacity: MUTED_OPACITY });
  const tooltipYPosition = selectedPoint?.goalMet === false ? state.y.yMuted.position : state.y.yMet.position;

  // See `LineChart`'s identical shim for why this is needed — `yMet`/`yMuted`
  // are `number | null` per point (the mutually-exclusive split), so
  // `formatYLabel`'s inferred `label` type carries `| null` too even though
  // real axis ticks are always numbers.
  const axisFormatYLabel = (y: number | null) => formatYLabel(y ?? 0);

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
            yKeys={['yMet', 'yMuted']}
            chartPressState={state}
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
                formatYLabel: axisFormatYLabel,
                linePathEffect: <DashPathEffect intervals={[4, 4]} />,
              },
            ]}
          >
            {({ points, chartBounds, yScale }) => (
              <>
                <Bar
                  points={points.yMet}
                  chartBounds={chartBounds}
                  color={colors.accent.primary}
                  roundedCorners={{ topLeft: BAR_RADIUS_TOP, topRight: BAR_RADIUS_TOP }}
                />
                <Bar
                  points={points.yMuted}
                  chartBounds={chartBounds}
                  color={mutedColor}
                  roundedCorners={{ topLeft: BAR_RADIUS_TOP, topRight: BAR_RADIUS_TOP }}
                />
                {goalValue != null ? (
                  <SkiaLine
                    p1={vec(chartBounds.left, yScale(goalValue))}
                    p2={vec(chartBounds.right, yScale(goalValue))}
                    color={colors.text.secondary}
                    strokeWidth={StyleSheet.hairlineWidth * 2}
                  >
                    <DashPathEffect intervals={[4, 4]} />
                  </SkiaLine>
                ) : null}
              </>
            )}
          </CartesianChart>
          {isActive && selectedPoint != null ? (
            <ChartTooltip
              testID={testID ? `${testID}-tooltip` : undefined}
              visible
              xPosition={state.x.position}
              yPosition={tooltipYPosition}
              valueText={resolveTooltipValue(selectedPoint)}
              dateText={resolveTooltipDate(selectedPoint)}
            />
          ) : null}
        </View>
      )}
    </Card>
  );
}
