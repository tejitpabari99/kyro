/**
 * `SheetHeader` tests (PRD A `sheet-header-foundation` Task 2 acceptance
 * gate, §7): title centering algorithm, slot press behavior, tone-correct
 * label colors, and `safeTop` inset math — mirrors `Button.test.tsx`'s
 * flatten-and-assert style-checking convention.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { SheetHeader } from '../SheetHeader';
import { ThemeProvider } from '../theme-provider';
import { colors, spacing } from '../tokens';

function flattenStyle(style: unknown): Record<string, unknown> {
  return Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : (style as Record<string, unknown>);
}

describe('SheetHeader — title centering algorithm', () => {
  it('centers the title when neither left nor right is given', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SheetHeader title="Exercise Type" testID="sheet-header" />
      </ThemeProvider>,
    );

    const flatStyle = flattenStyle(screen.getByTestId('sheet-header-title').props.style);
    expect(flatStyle.textAlign).toBe('center');
    expect(flatStyle.marginLeft).toBe(0);
    expect(flatStyle.marginRight).toBe(0);
  });

  it('left-aligns and adds marginLeft when only left is given', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SheetHeader
          title="Log Measurements"
          testID="sheet-header"
          left={{ kind: 'back', onPress: () => {} }}
        />
      </ThemeProvider>,
    );

    const flatStyle = flattenStyle(screen.getByTestId('sheet-header-title').props.style);
    expect(flatStyle.textAlign).toBe('left');
    expect(flatStyle.marginLeft).toBe(spacing['2']);
    expect(flatStyle.marginRight).toBe(0);
  });

  it('left-aligns and adds marginRight when only right is given', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SheetHeader
          title="Multi Select"
          testID="sheet-header"
          right={{ kind: 'label', label: 'Done', onPress: () => {} }}
        />
      </ThemeProvider>,
    );

    const flatStyle = flattenStyle(screen.getByTestId('sheet-header-title').props.style);
    expect(flatStyle.textAlign).toBe('left');
    expect(flatStyle.marginLeft).toBe(0);
    expect(flatStyle.marginRight).toBe(spacing['2']);
  });

  it('left-aligns and sets both margins when both left and right are given', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SheetHeader
          title="Plate Calculator"
          testID="sheet-header"
          left={{ kind: 'back', onPress: () => {} }}
          right={{ kind: 'label', label: 'Done', onPress: () => {} }}
        />
      </ThemeProvider>,
    );

    const flatStyle = flattenStyle(screen.getByTestId('sheet-header-title').props.style);
    expect(flatStyle.textAlign).toBe('left');
    expect(flatStyle.marginLeft).toBe(spacing['2']);
    expect(flatStyle.marginRight).toBe(spacing['2']);
  });
});

describe('SheetHeader — slot behavior', () => {
  it('fires onPress on the left slot when kind is "back"', async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SheetHeader title="Edit Profile" testID="sheet-header" left={{ kind: 'back', onPress }} />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByTestId('sheet-header-left'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('fires onPress on the right slot when kind is "back"', async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SheetHeader title="Edit Profile" testID="sheet-header" right={{ kind: 'back', onPress }} />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByTestId('sheet-header-right'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders the given label text and fires onPress for kind "label"', async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SheetHeader
          title="Multi Select"
          testID="sheet-header"
          right={{ kind: 'label', label: 'Done', onPress }}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText('Done')).toBeTruthy();
    fireEvent.press(screen.getByTestId('sheet-header-right'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['default' as const, colors.dark.text.primary],
    ['accent' as const, colors.dark.accent.text],
    ['danger' as const, colors.dark.semantic.danger],
  ])('colors a "%s"-tone label correctly', async (tone, expectedColor) => {
    await render(
      <ThemeProvider preference="dark">
        <SheetHeader
          title="Exercise Type"
          testID="sheet-header"
          right={{ kind: 'label', label: 'Cancel', onPress: () => {}, tone }}
        />
      </ThemeProvider>,
    );

    const flatStyle = flattenStyle(screen.getByText('Cancel').props.style);
    expect(flatStyle.color).toBe(expectedColor);
  });

  it('defaults an untoned label to the accent color', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SheetHeader
          title="Exercise Type"
          testID="sheet-header"
          right={{ kind: 'label', label: 'Cancel', onPress: () => {} }}
        />
      </ThemeProvider>,
    );

    const flatStyle = flattenStyle(screen.getByText('Cancel').props.style);
    expect(flatStyle.color).toBe(colors.dark.accent.text);
  });

  it('renders custom content verbatim for kind "custom" with no wrapper', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SheetHeader
          title="Exercise Detail"
          testID="sheet-header"
          right={{ kind: 'custom', content: <Text>{'⚙'}</Text> }}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText('⚙')).toBeTruthy();
  });
});

describe('SheetHeader — safeTop inset math', () => {
  it('adds insets.top to paddingTop when safeTop is true', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SafeAreaInsetsContext.Provider value={{ top: 44, bottom: 34, left: 0, right: 0 }}>
          <SheetHeader title="Log Measurements" testID="sheet-header" safeTop />
        </SafeAreaInsetsContext.Provider>
      </ThemeProvider>,
    );

    const flatStyle = flattenStyle(screen.getByTestId('sheet-header').props.style);
    expect(flatStyle.paddingTop).toBe(44 + spacing['3']);
  });

  it('does not add insets.top when safeTop is false (default)', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SafeAreaInsetsContext.Provider value={{ top: 44, bottom: 34, left: 0, right: 0 }}>
          <SheetHeader title="Default Rest Timer" testID="sheet-header" />
        </SafeAreaInsetsContext.Provider>
      </ThemeProvider>,
    );

    const flatStyle = flattenStyle(screen.getByTestId('sheet-header').props.style);
    expect(flatStyle.paddingTop).toBe(spacing['2']);
  });
});
