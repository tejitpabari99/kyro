/**
 * `Sparkline` — 07 §7: 1.5 pt accent line, no axes. The minimal, inline
 * chart primitive (table rows, stat tiles) — no `Card`, no header slot, no
 * gridlines/labels, no tooltip; just the line. Wraps `victory-native`'s
 * `CartesianChart` + `Line` (06 §7, 00 P4) — features never import
 * `victory-native` directly.
 *
 * Same gap-handling rule as `LineChart` (04 §6, "applies globally"):
 * rendered with `connectMissingData` so a `null` `y` is skipped rather than
 * zero-filled — the line connects the surrounding real points.
 */
import React from 'react';
import { CartesianChart, Line } from 'victory-native';

import { useTheme } from '../theme-provider';
import { ChartEmptyState } from './ChartEmptyState';
import { hasRenderableData } from './chart-utils';
import type { ChartPoint } from './types';

const LINE_STROKE_WIDTH = 1.5;

export interface SparklineProps {
  data: ChartPoint[];
  width: number;
  height: number;
  /** Overrides the default `accent.primary` stroke. */
  color?: string;
  emptyStateLabel?: string;
  testID?: string;
}

export function Sparkline({
  data,
  width,
  height,
  color,
  emptyStateLabel,
  testID,
}: SparklineProps): React.JSX.Element {
  const { colors } = useTheme();
  const strokeColor = color ?? colors.accent.primary;
  const dataHasValues = hasRenderableData(data);

  if (!dataHasValues) {
    return (
      <ChartEmptyState
        height={height}
        style={{ width }}
        label={emptyStateLabel}
        testID={testID ? `${testID}-empty` : undefined}
      />
    );
  }

  return (
    <CartesianChart
      data={data}
      xKey="x"
      yKeys={['y']}
      explicitSize={{ width, height }}
      domainPadding={{ top: 4, bottom: 4 }}
    >
      {({ points }) => (
        <Line
          points={points.y}
          color={strokeColor}
          strokeWidth={LINE_STROKE_WIDTH}
          connectMissingData
          curveType="linear"
        />
      )}
    </CartesianChart>
  );
}
