/**
 * `LineChart` tests (M4-07 acceptance gate): RNTL smoke render both themes,
 * empty state, gap handling (04 §6 chart rule — "line connects existing
 * points, no zero-fill", verified against the real `connectMissingData`
 * prop `victory-native`'s `Line`/`Area` receive, not just a visual guess),
 * and a tooltip interaction test.
 *
 * The tooltip test drives the same `ChartPressState` object
 * `victory-native`'s own internal pan gesture would drive on a real touch
 * (`isActive`/`matchedIndex` — see `CartesianChart`'s source, which installs
 * that gesture and updates exactly these fields whenever a
 * `chartPressState` is passed in) via `LineChart`'s controlled
 * `chartPressState` prop. It does not simulate a raw touch/pan gesture
 * itself (no simulator here to validate real gesture-handler behavior,
 * `docs/plan/BLOCKERS.md`) — it proves the reactive wiring from press-state
 * to rendered tooltip content is correct, using the real state shape and
 * the real bridging hook (`useChartSelection`), same precedent as M3-03's
 * drag-reorder tests documented for the equivalent gesture-vs-callback
 * split.
 */
import { act, render, screen, waitFor } from '@testing-library/react-native';
import React, { useEffect } from 'react';
import { Text } from 'react-native';
import { Line, Area, useChartPressState } from 'victory-native';

import { LineChart, type LineChartPressState } from '../LineChart';
import { ThemeProvider } from '../../theme-provider';
import type { ChartPoint } from '../types';
import { findComponentProps } from './fiber-test-utils';

const DATA: ChartPoint[] = [
  { x: 0, y: 10 },
  { x: 1, y: 20 },
  { x: 2, y: null },
  { x: 3, y: 40 },
];

describe('LineChart — smoke render (both themes)', () => {
  it('renders title, header slot and plot area in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <LineChart
          testID="line"
          data={DATA}
          height={180}
          width={300}
          title="Est. 1RM"
          headerRight={<Text>range</Text>}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText('Est. 1RM')).toBeTruthy();
    expect(screen.getByText('range')).toBeTruthy();
    expect(screen.getByTestId('line-plot')).toBeTruthy();
  });

  it('renders without throwing in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <LineChart testID="line" data={DATA} height={180} width={300} title="Est. 1RM" />
      </ThemeProvider>,
    );

    expect(screen.getByText('Est. 1RM')).toBeTruthy();
  });

  it('renders with no title/headerRight (bare card, no header row)', async () => {
    await render(
      <ThemeProvider preference="dark">
        <LineChart testID="line" data={DATA} height={180} width={300} />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('line-plot')).toBeTruthy();
  });
});

describe('LineChart — empty state (07 §7)', () => {
  it('shows the "No data yet" empty state when every point is null', async () => {
    const emptyData: ChartPoint[] = [
      { x: 0, y: null },
      { x: 1, y: null },
    ];
    await render(
      <ThemeProvider preference="dark">
        <LineChart testID="line" data={emptyData} height={180} width={300} />
      </ThemeProvider>,
    );

    expect(screen.getByText('No data yet')).toBeTruthy();
    expect(screen.getByTestId('line-empty')).toBeTruthy();
    expect(screen.queryByTestId('line-plot')).toBeNull();
  });

  it('shows the "No data yet" empty state for a genuinely empty array', async () => {
    await render(
      <ThemeProvider preference="dark">
        <LineChart testID="line" data={[]} height={180} width={300} />
      </ThemeProvider>,
    );

    expect(screen.getByText('No data yet')).toBeTruthy();
  });

  it('supports a custom empty-state label', async () => {
    await render(
      <ThemeProvider preference="dark">
        <LineChart testID="line" data={[]} height={180} width={300} emptyStateLabel="Log a workout to see this chart" />
      </ThemeProvider>,
    );

    expect(screen.getByText('Log a workout to see this chart')).toBeTruthy();
  });
});

describe('LineChart — gap handling (04 §6, applies globally)', () => {
  it('renders Line and Area with connectMissingData so gaps do not zero-fill', async () => {
    await render(
      <ThemeProvider preference="dark">
        <LineChart testID="line" data={DATA} height={180} width={300} />
      </ThemeProvider>,
    );

    const lineProps = findComponentProps(screen.container, Line);
    const areaProps = findComponentProps(screen.container, Area);
    expect(lineProps.connectMissingData).toBe(true);
    expect(areaProps.connectMissingData).toBe(true);
    // The raw point array handed to victory-native must still carry the
    // `null` through untouched — a zero-fill would show up here as `0`.
    expect(lineProps.points).toEqual(
      expect.arrayContaining([expect.objectContaining({ y: null })]),
    );
  });
});

function TooltipHarness({
  onState,
}: {
  onState: (state: LineChartPressState) => void;
}): React.JSX.Element {
  const { state } = useChartPressState({ x: 0, y: { y: 0 } });

  useEffect(() => {
    onState(state);
  }, [state, onState]);

  return (
    <LineChart
      testID="line"
      data={DATA}
      height={180}
      width={300}
      chartPressState={state}
      formatTooltipValue={(point) => `${point.y ?? 0} kg`}
      formatTooltipDate={(point) => `day ${point.x}`}
    />
  );
}

describe('LineChart — tooltip interaction (07 §7)', () => {
  it('shows no tooltip until the press state is active', async () => {
    await render(
      <ThemeProvider preference="dark">
        <TooltipHarness onState={() => {}} />
      </ThemeProvider>,
    );

    expect(screen.queryByTestId('line-tooltip')).toBeNull();
  });

  it('shows the formatted value + date once a point is selected', async () => {
    let capturedState: LineChartPressState | undefined;

    await render(
      <ThemeProvider preference="dark">
        <TooltipHarness
          onState={(state) => {
            capturedState = state;
          }}
        />
      </ThemeProvider>,
    );

    expect(capturedState).toBeDefined();

    await act(async () => {
      capturedState!.matchedIndex.value = 1;
      capturedState!.isActive.value = true;
      await new Promise((resolve) => setTimeout(resolve, 10));
    });

    await waitFor(() => {
      expect(screen.getByTestId('line-tooltip')).toBeTruthy();
      expect(screen.getByText('20 kg')).toBeTruthy();
      expect(screen.getByText('day 1')).toBeTruthy();
    });
  });

  it('hides the tooltip again once the press state deactivates', async () => {
    let capturedState: LineChartPressState | undefined;

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
    await waitFor(() => expect(screen.getByTestId('line-tooltip')).toBeTruthy());

    await act(async () => {
      capturedState!.isActive.value = false;
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    await waitFor(() => expect(screen.queryByTestId('line-tooltip')).toBeNull());
  });
});
