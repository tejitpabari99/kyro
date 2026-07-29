/**
 * `ScreenFooter` tests (PRD A `sheet-header-foundation` Task 3 acceptance
 * gate, §7): default/custom bottom-inset math, children passthrough, and a
 * regression guard against reintroducing `position: 'absolute'` (the
 * "sticky-by-accident" failure mode §4.3 warns retrofits about) — mirrors
 * `SheetHeader.test.tsx`'s flatten-and-assert style-checking convention.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { ScreenFooter } from '../ScreenFooter';
import { ThemeProvider } from '../theme-provider';
import { spacing } from '../tokens';

function flattenStyle(style: unknown): Record<string, unknown> {
  return Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : (style as Record<string, unknown>);
}

describe('ScreenFooter — bottom-inset math', () => {
  it('defaults paddingBottom to insets.bottom + spacing["4"]', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 34, left: 0, right: 0 }}>
          <ScreenFooter testID="screen-footer">
            <Text>Save</Text>
          </ScreenFooter>
        </SafeAreaInsetsContext.Provider>
      </ThemeProvider>,
    );

    const flatStyle = flattenStyle(screen.getByTestId('screen-footer').props.style);
    expect(flatStyle.paddingBottom).toBe(34 + spacing['4']);
    expect(flatStyle.paddingBottom).toBe(50);
  });

  it('overrides the default gap when a custom gap prop is given', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SafeAreaInsetsContext.Provider value={{ top: 0, bottom: 34, left: 0, right: 0 }}>
          <ScreenFooter testID="screen-footer" gap={8}>
            <Text>Save</Text>
          </ScreenFooter>
        </SafeAreaInsetsContext.Provider>
      </ThemeProvider>,
    );

    const flatStyle = flattenStyle(screen.getByTestId('screen-footer').props.style);
    expect(flatStyle.paddingBottom).toBe(34 + 8);
    expect(flatStyle.paddingBottom).toBe(42);
  });
});

describe('ScreenFooter — children passthrough', () => {
  it('renders children unchanged', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ScreenFooter testID="screen-footer">
          <Text>Save</Text>
        </ScreenFooter>
      </ThemeProvider>,
    );

    expect(screen.getByText('Save')).toBeTruthy();
  });
});

describe('ScreenFooter — not sticky', () => {
  it('never sets position: "absolute" on its computed style', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ScreenFooter testID="screen-footer">
          <Text>Save</Text>
        </ScreenFooter>
      </ThemeProvider>,
    );

    const flatStyle = flattenStyle(screen.getByTestId('screen-footer').props.style);
    expect(flatStyle.position).not.toBe('absolute');
  });
});
