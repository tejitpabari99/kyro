/**
 * `SetTypeBadge` tests (M2-06 acceptance gate): smoke render both themes for
 * every kind, plus the behavioral cases — normal shows the working-set
 * number, W/D/F show their letter, tap fires `onPress`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { SetTypeBadge, type SetBadgeKind } from '../SetTypeBadge';
import { ThemeProvider } from '../theme-provider';

const KINDS: SetBadgeKind[] = ['normal', 'warmup', 'dropset', 'failure'];

describe('SetTypeBadge — smoke render (both themes)', () => {
  it.each(KINDS)('renders the %s kind in dark theme', async (kind) => {
    await render(
      <ThemeProvider preference="dark">
        <SetTypeBadge kind={kind} workingIndex={2} testID="badge" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('badge')).toBeTruthy();
  });

  it.each(KINDS)('renders the %s kind in light theme', async (kind) => {
    await render(
      <ThemeProvider preference="light">
        <SetTypeBadge kind={kind} workingIndex={2} testID="badge" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('badge')).toBeTruthy();
  });
});

describe('SetTypeBadge — behavior', () => {
  it('shows the working-set number for kind="normal"', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetTypeBadge kind="normal" workingIndex={3} testID="badge" />
      </ThemeProvider>,
    );
    expect(screen.getByText('3')).toBeTruthy();
  });

  it.each([
    ['warmup', 'W'],
    ['dropset', 'D'],
    ['failure', 'F'],
  ] as const)('shows the %s letter %s regardless of workingIndex', async (kind, letter) => {
    await render(
      <ThemeProvider preference="dark">
        <SetTypeBadge kind={kind} workingIndex={null} testID="badge" />
      </ThemeProvider>,
    );
    expect(screen.getByText(letter)).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SetTypeBadge kind="normal" workingIndex={1} onPress={onPress} testID="badge" />
      </ThemeProvider>,
    );
    fireEvent.press(screen.getByTestId('badge'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders without a Pressable wrapper when onPress is omitted', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetTypeBadge kind="normal" workingIndex={1} testID="badge" />
      </ThemeProvider>,
    );
    const node = screen.getByTestId('badge');
    expect(node.props.accessibilityRole).not.toBe('button');
  });
});
