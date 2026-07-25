/**
 * `StackedBarChart` tests (M4-07 acceptance gate): RNTL smoke render both
 * themes, empty state, and palette color assignment (07 §7: superset
 * palette + teal, cycled).
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { StackedBar } from 'victory-native';

import { StackedBarChart } from '../StackedBarChart';
import { ThemeProvider } from '../../theme-provider';
import { supersetPalette } from '../../tokens';
import type { StackedBarChartPoint, StackedBarSeries } from '../types';
import { findComponentProps } from './fiber-test-utils';

const SERIES: StackedBarSeries[] = [
  { key: 'chest', label: 'Chest' },
  { key: 'back', label: 'Back' },
  { key: 'legs', label: 'Legs' },
];

const DATA: StackedBarChartPoint[] = [
  { x: 0, values: { chest: 3, back: 2, legs: 1 } },
  { x: 1, values: { chest: 1, back: 4, legs: 2 } },
];

describe('StackedBarChart — smoke render (both themes)', () => {
  it('renders title and plot area in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <StackedBarChart
          testID="stacked"
          data={DATA}
          series={SERIES}
          height={180}
          width={300}
          title="Sets per muscle group"
        />
      </ThemeProvider>,
    );

    expect(screen.getByText('Sets per muscle group')).toBeTruthy();
    expect(screen.getByTestId('stacked-plot')).toBeTruthy();
  });

  it('renders without throwing in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <StackedBarChart testID="stacked" data={DATA} series={SERIES} height={180} width={300} />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('stacked-plot')).toBeTruthy();
  });
});

describe('StackedBarChart — empty state (07 §7)', () => {
  it('shows the "No data yet" empty state for a genuinely empty array', async () => {
    await render(
      <ThemeProvider preference="dark">
        <StackedBarChart testID="stacked" data={[]} series={SERIES} height={180} width={300} />
      </ThemeProvider>,
    );

    expect(screen.getByText('No data yet')).toBeTruthy();
    expect(screen.getByTestId('stacked-empty')).toBeTruthy();
    expect(screen.queryByTestId('stacked-plot')).toBeNull();
  });

  it('shows the empty state when every series value is 0', async () => {
    const zeroData: StackedBarChartPoint[] = [{ x: 0, values: { chest: 0, back: 0, legs: 0 } }];
    await render(
      <ThemeProvider preference="dark">
        <StackedBarChart testID="stacked" data={zeroData} series={SERIES} height={180} width={300} />
      </ThemeProvider>,
    );

    expect(screen.getByText('No data yet')).toBeTruthy();
  });
});

describe('StackedBarChart — color palette (07 §7: superset palette + teal, cycled)', () => {
  it('colors series in palette order, using each series own color override when given', async () => {
    const seriesWithOverride: StackedBarSeries[] = [
      { key: 'chest', label: 'Chest' },
      { key: 'back', label: 'Back', color: '#ABCDEF' },
    ];
    await render(
      <ThemeProvider preference="dark">
        <StackedBarChart
          testID="stacked"
          data={[{ x: 0, values: { chest: 3, back: 2 } }]}
          series={seriesWithOverride}
          height={180}
          width={300}
        />
      </ThemeProvider>,
    );

    const stackedBarProps = findComponentProps(screen.container, StackedBar);
    expect(stackedBarProps.colors).toEqual([supersetPalette[0], '#ABCDEF']);
  });

  it('falls back to the default palette (superset + teal) with no overrides', async () => {
    await render(
      <ThemeProvider preference="dark">
        <StackedBarChart testID="stacked" data={DATA} series={SERIES} height={180} width={300} />
      </ThemeProvider>,
    );

    const stackedBarProps = findComponentProps(screen.container, StackedBar);
    expect(stackedBarProps.colors).toEqual([
      supersetPalette[0],
      supersetPalette[1],
      supersetPalette[2],
    ]);
  });

  it('cycles the palette once more series are passed than it has colors for', async () => {
    const manySeries: StackedBarSeries[] = Array.from({ length: supersetPalette.length + 2 }, (_, i) => ({
      key: `s${i}`,
      label: `S${i}`,
    }));
    const manyData: StackedBarChartPoint[] = [
      { x: 0, values: Object.fromEntries(manySeries.map((s) => [s.key, 1])) },
    ];
    await render(
      <ThemeProvider preference="dark">
        <StackedBarChart testID="stacked" data={manyData} series={manySeries} height={180} width={300} />
      </ThemeProvider>,
    );

    const stackedBarProps = findComponentProps(screen.container, StackedBar);
    const paletteLength = supersetPalette.length + 1; // + teal
    const resolvedColors = stackedBarProps.colors as string[];
    expect(resolvedColors[paletteLength]).toBe(resolvedColors[0]);
    expect(resolvedColors[0]).toBe(supersetPalette[0]);
  });
});
