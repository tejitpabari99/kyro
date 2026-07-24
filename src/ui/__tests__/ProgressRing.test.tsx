/**
 * `ProgressRing` (M2-11) tests — 07 §5 "timer full-screen" primitive.
 * Asserts the SVG fill circle's `strokeDashoffset` tracks `progress`
 * (0 = fully drained, 1 = fully full) and that clamping/centered children
 * behave as documented in the component's own file header.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { ProgressRing } from '../ProgressRing';
import { ThemeProvider } from '../theme-provider';

function circumference(size: number, strokeWidth: number): number {
  const radius = (size - strokeWidth) / 2;
  return 2 * Math.PI * radius;
}

/**
 * `react-native-svg`'s own prop-extraction layer (`extractStroke.ts`)
 * renders an exactly-`0` `strokeDashoffset` as `null` in the final native
 * props (confirmed empirically with a throwaway probe dumping `Circle`'s
 * resolved props under RNTL) rather than passing `0` straight through —
 * a library quirk, not a bug in this component. `null` and `0` are
 * functionally identical here (both mean "no offset, ring fully drawn"),
 * so full-ring assertions below accept either.
 */
function expectFullRingOffset(value: unknown): void {
  if (value === null) {
    return;
  }
  expect(value as number).toBeCloseTo(0);
}

describe('ProgressRing — smoke render + progress math (both themes)', () => {
  it('renders a full ring (progress=1) with zero (or null, see helper) dash offset', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ProgressRing progress={1} size={64} strokeWidth={6} testID="ring" />
      </ThemeProvider>,
    );
    const fill = screen.getByTestId('ring-fill');
    expectFullRingOffset(fill.props.strokeDashoffset);
  });

  it('renders an empty ring (progress=0) with a dash offset equal to the full circumference', async () => {
    await render(
      <ThemeProvider preference="light">
        <ProgressRing progress={0} size={64} strokeWidth={6} testID="ring" />
      </ThemeProvider>,
    );
    const fill = screen.getByTestId('ring-fill');
    expect(fill.props.strokeDashoffset).toBeCloseTo(circumference(64, 6));
  });

  it('renders a half-drained ring (progress=0.5) with half the circumference as offset', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ProgressRing progress={0.5} size={100} strokeWidth={10} testID="ring" />
      </ThemeProvider>,
    );
    const fill = screen.getByTestId('ring-fill');
    expect(fill.props.strokeDashoffset).toBeCloseTo(circumference(100, 10) / 2);
  });

  it('clamps progress above 1 to a full ring', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ProgressRing progress={1.4} size={64} strokeWidth={6} testID="ring" />
      </ThemeProvider>,
    );
    expectFullRingOffset(screen.getByTestId('ring-fill').props.strokeDashoffset);
  });

  it('clamps progress below 0 to an empty ring', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ProgressRing progress={-0.2} size={64} strokeWidth={6} testID="ring" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('ring-fill').props.strokeDashoffset).toBeCloseTo(
      circumference(64, 6),
    );
  });

  it('treats a non-finite progress value as 0 rather than crashing', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ProgressRing progress={NaN} size={64} strokeWidth={6} testID="ring" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('ring-fill').props.strokeDashoffset).toBeCloseTo(
      circumference(64, 6),
    );
  });

  it('renders centered children over the ring', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ProgressRing progress={0.5} testID="ring">
          <Text>1:30</Text>
        </ProgressRing>
      </ThemeProvider>,
    );
    expect(screen.getByText('1:30')).toBeTruthy();
  });

  it('renders with no children with no error', async () => {
    await render(
      <ThemeProvider preference="light">
        <ProgressRing progress={0.5} testID="ring" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('ring')).toBeTruthy();
  });
});
