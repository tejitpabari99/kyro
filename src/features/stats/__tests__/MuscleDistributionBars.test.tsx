/**
 * `MuscleDistributionBars` tests (M4-08) — RNTL smoke render (both themes),
 * empty state, label/value rendering, and integer-vs-decimal weight
 * formatting (0.5-weighted secondary muscle contributions).
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { ThemeProvider } from '@/ui/theme-provider';

import { MuscleDistributionBars } from '../MuscleDistributionBars';

describe('MuscleDistributionBars — smoke render (both themes)', () => {
  const entries = [
    { muscleGroup: 'chest' as const, weight: 4 },
    { muscleGroup: 'triceps' as const, weight: 2.5 },
  ];

  it('renders a labeled row per entry in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <MuscleDistributionBars testID="dist" entries={entries} />
      </ThemeProvider>,
    );

    expect(screen.getByText('Chest')).toBeTruthy();
    expect(screen.getByText('Triceps')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
    expect(screen.getByText('2.5')).toBeTruthy();
  });

  it('renders without throwing in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <MuscleDistributionBars testID="dist" entries={entries} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Chest')).toBeTruthy();
  });
});

describe('MuscleDistributionBars — empty state (07 §7)', () => {
  it('shows the "No data yet" empty state for a genuinely empty array', async () => {
    await render(
      <ThemeProvider preference="dark">
        <MuscleDistributionBars testID="dist" entries={[]} />
      </ThemeProvider>,
    );
    expect(screen.getByText('No data yet')).toBeTruthy();
    expect(screen.getByTestId('dist-empty')).toBeTruthy();
  });
});
