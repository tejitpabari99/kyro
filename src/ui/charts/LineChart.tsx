/**
 * `LineChart` — 07 §7: 2 pt accent stroke, gradient area fill accent
 * 20%→0%, selection-only dot (6 pt accent) + tooltip card, ≤ 4 dashed
 * y-gridlines, no x-gridlines, caption axes. Wraps `victory-native`'s
 * `CartesianChart` + `Line`/`Area` (06 §7, 00 P4) — features never import
 * `victory-native` directly.
 *
 * Gap handling (04 §6's chart rule, "applies globally"): `Line`/`Area` are
 * both rendered with `connectMissingData` so a `null` `y` in `data` is
 * skipped rather than drawn as `0` — the line connects the surrounding
 * real points instead (see `victory-native`'s own `useLinePath`: without
 * this flag it *breaks* the line into separate segments at each gap
 * instead of zero-filling, which would be equally wrong for this app's
 * data — connecting through is what 04 §6 asks for).
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Circle, DashPathEffect, vec, LinearGradient } from '@shopify/react-native-skia';
import { Area, CartesianChart, Line, useChartPressState, type ChartPressState } from 'victory-native';

import { useTheme } from '../theme-provider';
import { alphaOverlayToRgba } from '../tokens';
import { ChartEmptyState } from './ChartEmptyState';
import { ChartTooltip } from './ChartTooltip';
import { useChartSelection } from './useChartSelection';
import { useAxisCaptionFont } from './useAxisCaptionFont';
import { hasRenderableData, defaultFormatNumber } from './chart-utils';
import type { ChartCardHeaderProps, ChartPoint } from './types';
import { Card } from '../Card';

const Y_AXIS_MAX_GRIDLINES = 4;
const LINE_STROKE_WIDTH = 2;
const SELECTION_DOT_RADIUS = 6;

/** The press-state shape this chart drives internally — exposed so a
 * caller (or a test) can create one via `victory-native`'s own
 * `useChartPressState` and pass it in as a controlled `chartPressState`,
 * mirroring the controlled/uncontrolled convention `ThemeProvider` already
 * uses in this codebase. Optional: most call sites don't need it, since
 * `LineChart` creates its own when omitted. */
export type LineChartPressState = ChartPressState<{ x: number; y: { y: number } }>;

export interface LineChartProps extends ChartCardHeaderProps {
  data: ChartPoint[];
  /** Plot canvas height. */
  height: number;
  /** Plot canvas width — omit to fill the parent width via layout measurement (real device usage, since `Card` grows to its parent); pass an explicit number for deterministic sizing (fixed-width layouts, tests) — this skips `CartesianChart`'s `onLayout` measurement entirely (`victory-native`'s `explicitSize`). */
  width?: number;
  formatXLabel?: (x: number) => string;
  formatYLabel?: (y: number) => string;
  /** Tooltip value line (statSmall). Defaults to `formatYLabel(point.y)`. */
  formatTooltipValue?: (point: ChartPoint) => string;
  /** Tooltip caption line (typically a date). Defaults to `formatXLabel(point.x)`. */
  formatTooltipDate?: (point: ChartPoint) => string;
  /** Controlled press/selection state — see `LineChartPressState`. Uncontrolled (internal) by default. */
  chartPressState?: LineChartPressState;
  emptyStateLabel?: string;
  testID?: string;
}

export function LineChart({
  data,
  height,
  width,
  title,
  headerRight,
  formatXLabel = defaultFormatNumber,
  formatYLabel = defaultFormatNumber,
  formatTooltipValue,
  formatTooltipDate,
  chartPressState,
  emptyStateLabel,
  testID,
}: LineChartProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  const font = useAxisCaptionFont(typography.caption.fontSize);
  const { state: internalPressState } = useChartPressState({ x: 0, y: { y: 0 } });
  const state = chartPressState ?? internalPressState;
  const { isActive, point: selectedPoint } = useChartSelection(state, data);

  const resolveTooltipValue = formatTooltipValue ?? ((point: ChartPoint) => formatYLabel(point.y ?? 0));
  const resolveTooltipDate = formatTooltipDate ?? ((point: ChartPoint) => formatXLabel(point.x));

  const showHeader = title != null || headerRight != null;
  const dataHasValues = hasRenderableData(data);

  const gradientTop = alphaOverlayToRgba({ hex: colors.accent.primary, opacity: 0.2 });
  const gradientBottom = alphaOverlayToRgba({ hex: colors.accent.primary, opacity: 0 });

  // `victory-native`'s `formatYLabel` types its `label` param as
  // `RawData[YK]` — `number | null` here, since `ChartPoint['y']` allows
  // `null` for gaps (04 §6) — even though axis *tick* values are always
  // real numbers at runtime. Shim the nullability away so the public
  // `formatYLabel` prop can stay a plain `(y: number) => string`.
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
            data={data}
            xKey="x"
            yKeys={['y']}
            chartPressState={state}
            explicitSize={width != null ? { width, height } : undefined}
            domainPadding={{ top: 16, bottom: 8 }}
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
            {({ points, chartBounds }) => (
              <>
                <Area points={points.y} y0={chartBounds.bottom} connectMissingData curveType="linear">
                  <LinearGradient
                    start={vec(0, chartBounds.top)}
                    end={vec(0, chartBounds.bottom)}
                    colors={[gradientTop, gradientBottom]}
                  />
                </Area>
                <Line
                  points={points.y}
                  color={colors.accent.primary}
                  strokeWidth={LINE_STROKE_WIDTH}
                  connectMissingData
                  curveType="linear"
                />
                {isActive ? (
                  <Circle
                    cx={state.x.position}
                    cy={state.y.y.position}
                    r={SELECTION_DOT_RADIUS}
                    color={colors.accent.primary}
                  />
                ) : null}
              </>
            )}
          </CartesianChart>
          {isActive && selectedPoint != null ? (
            <ChartTooltip
              testID={testID ? `${testID}-tooltip` : undefined}
              visible
              xPosition={state.x.position}
              yPosition={state.y.y.position}
              valueText={resolveTooltipValue(selectedPoint)}
              dateText={resolveTooltipDate(selectedPoint)}
            />
          ) : null}
        </View>
      )}
    </Card>
  );
}
