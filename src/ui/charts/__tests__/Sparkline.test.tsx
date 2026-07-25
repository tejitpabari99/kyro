/**
 * `Sparkline` tests (M4-07 acceptance gate): RNTL smoke render both themes,
 * empty state, and gap handling (04 §6, applies globally).
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Line } from 'victory-native';

import { Sparkline } from '../Sparkline';
import { ThemeProvider } from '../../theme-provider';
import { colors } from '../../tokens';
import type { ChartPoint } from '../types';
import { findComponentProps } from './fiber-test-utils';

const DATA: ChartPoint[] = [
  { x: 0, y: 10 },
  { x: 1, y: null },
  { x: 2, y: 30 },
];

describe('Sparkline — smoke render (both themes)', () => {
  it('renders without throwing in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Sparkline testID="spark" data={DATA} width={80} height={24} />
      </ThemeProvider>,
    );

    const lineProps = findComponentProps(screen.container, Line);
    expect(lineProps.color).toBe(colors.dark.accent.primary);
    expect(lineProps.strokeWidth).toBe(1.5);
  });

  it('renders without throwing in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <Sparkline testID="spark" data={DATA} width={80} height={24} />
      </ThemeProvider>,
    );

    const lineProps = findComponentProps(screen.container, Line);
    expect(lineProps.color).toBe(colors.light.accent.primary);
  });

  it('supports a color override', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Sparkline testID="spark" data={DATA} width={80} height={24} color="#FF0000" />
      </ThemeProvider>,
    );

    const lineProps = findComponentProps(screen.container, Line);
    expect(lineProps.color).toBe('#FF0000');
  });
});

describe('Sparkline — empty state (07 §7)', () => {
  it('shows the empty state for a genuinely empty array', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Sparkline testID="spark" data={[]} width={80} height={24} />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('spark-empty')).toBeTruthy();
    expect(screen.getByText('No data yet')).toBeTruthy();
  });

  it('shows the empty state when every point is null', async () => {
    const emptyData: ChartPoint[] = [
      { x: 0, y: null },
      { x: 1, y: null },
    ];
    await render(
      <ThemeProvider preference="dark">
        <Sparkline testID="spark" data={emptyData} width={80} height={24} />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('spark-empty')).toBeTruthy();
  });
});

describe('Sparkline — gap handling (04 §6, applies globally)', () => {
  it('renders Line with connectMissingData so gaps do not zero-fill', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Sparkline testID="spark" data={DATA} width={80} height={24} />
      </ThemeProvider>,
    );

    const lineProps = findComponentProps(screen.container, Line);
    expect(lineProps.connectMissingData).toBe(true);
    expect(lineProps.points).toEqual(
      expect.arrayContaining([expect.objectContaining({ y: null })]),
    );
  });
});
