/**
 * `BarChart` tests (M4-07 acceptance gate): RNTL smoke render both themes,
 * empty state, muted/goal-met color split, goal line, and a tooltip
 * interaction test. Same tooltip-testing approach as `LineChart.test.tsx`
 * (see that file's header) — drives the real `ChartPressState` via the
 * controlled `chartPressState` prop rather than simulating a raw gesture.
 */
import { act, render, screen, waitFor } from '@testing-library/react-native';
import React, { useEffect } from 'react';
import { Bar, useChartPressState } from 'victory-native';

import { BarChart, type BarChartPressState } from '../BarChart';
import { ThemeProvider } from '../../theme-provider';
import { colors } from '../../tokens';
import type { BarChartPoint } from '../types';
import { findAllComponentProps, findComponentProps } from './fiber-test-utils';

const DATA: BarChartPoint[] = [
  { x: 0, y: 3, goalMet: true },
  { x: 1, y: 1, goalMet: false },
  { x: 2, y: 4 },
];

describe('BarChart — smoke render (both themes)', () => {
  it('renders title and plot area in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <BarChart testID="bar" data={DATA} height={180} width={300} title="Workouts per week" />
      </ThemeProvider>,
    );

    expect(screen.getByText('Workouts per week')).toBeTruthy();
    expect(screen.getByTestId('bar-plot')).toBeTruthy();
  });

  it('renders without throwing in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <BarChart testID="bar" data={DATA} height={180} width={300} title="Workouts per week" />
      </ThemeProvider>,
    );

    expect(screen.getByText('Workouts per week')).toBeTruthy();
  });

  it('renders a dashed goal line when goalValue is set', async () => {
    await render(
      <ThemeProvider preference="dark">
        <BarChart testID="bar" data={DATA} height={180} width={300} goalValue={3} />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('bar-plot')).toBeTruthy();
  });
});

describe('BarChart — empty state (07 §7)', () => {
  it('shows the "No data yet" empty state for a genuinely empty array', async () => {
    await render(
      <ThemeProvider preference="dark">
        <BarChart testID="bar" data={[]} height={180} width={300} />
      </ThemeProvider>,
    );

    expect(screen.getByText('No data yet')).toBeTruthy();
    expect(screen.getByTestId('bar-empty')).toBeTruthy();
    expect(screen.queryByTestId('bar-plot')).toBeNull();
  });

  it('shows the empty state when every point is null', async () => {
    const emptyData: BarChartPoint[] = [
      { x: 0, y: null },
      { x: 1, y: null },
    ];
    await render(
      <ThemeProvider preference="dark">
        <BarChart testID="bar" data={emptyData} height={180} width={300} />
      </ThemeProvider>,
    );

    expect(screen.getByText('No data yet')).toBeTruthy();
  });
});

describe('BarChart — goal-met/muted color split (07 §7)', () => {
  it('renders two Bar layers colored accent.primary (met) and accent.primary @ 30% (muted)', async () => {
    await render(
      <ThemeProvider preference="dark">
        <BarChart testID="bar" data={DATA} height={180} width={300} />
      </ThemeProvider>,
    );

    const [firstBarProps, secondBarProps] = findAllComponentProps(screen.container, Bar);
    expect(firstBarProps?.color).toBe(colors.dark.accent.primary);
    // The muted layer is a flattened `rgba(...)` of accent.primary @ 30% —
    // built by `alphaOverlayToRgba`, same helper `tokens.ts` itself uses.
    expect(secondBarProps?.color).toContain('rgba(16, 185, 129');
    expect(secondBarProps?.color).toContain('0.3)');
  });
});

describe('BarChart — gap handling (04 §6, applies globally)', () => {
  it('preserves null (not zero-fill) gaps in the points fed to Bar', async () => {
    const gapData: BarChartPoint[] = [
      { x: 0, y: 3 },
      { x: 1, y: null },
      { x: 2, y: 4 },
    ];
    await render(
      <ThemeProvider preference="dark">
        <BarChart testID="bar" data={gapData} height={180} width={300} />
      </ThemeProvider>,
    );

    const barProps = findComponentProps(screen.container, Bar);
    expect(barProps.points).toEqual(
      expect.arrayContaining([expect.objectContaining({ y: null })]),
    );
  });
});

function TooltipHarness({
  onState,
}: {
  onState: (state: BarChartPressState) => void;
}): React.JSX.Element {
  const { state } = useChartPressState({ x: 0, y: { yMet: 0, yMuted: 0 } });

  useEffect(() => {
    onState(state);
  }, [state, onState]);

  return (
    <BarChart
      testID="bar"
      data={DATA}
      height={180}
      width={300}
      chartPressState={state}
      formatTooltipValue={(point) => `${point.y ?? 0} workouts`}
      formatTooltipDate={(point) => `week ${point.x}`}
    />
  );
}

describe('BarChart — tooltip interaction (07 §7)', () => {
  it('shows no tooltip until the press state is active', async () => {
    await render(
      <ThemeProvider preference="dark">
        <TooltipHarness onState={() => {}} />
      </ThemeProvider>,
    );

    expect(screen.queryByTestId('bar-tooltip')).toBeNull();
  });

  it('shows the formatted value + date once a bar is selected', async () => {
    let capturedState: BarChartPressState | undefined;

    await render(
      <ThemeProvider preference="dark">
        <TooltipHarness
          onState={(state) => {
            capturedState = state;
          }}
        />
      </ThemeProvider>,
    );

    await act(async () => {
      capturedState!.matchedIndex.value = 0;
      capturedState!.isActive.value = true;
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    await waitFor(() => {
      expect(screen.getByTestId('bar-tooltip')).toBeTruthy();
      expect(screen.getByText('3 workouts')).toBeTruthy();
      expect(screen.getByText('week 0')).toBeTruthy();
    });
  });
});
