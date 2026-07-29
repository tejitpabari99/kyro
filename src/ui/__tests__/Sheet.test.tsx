/**
 * `Sheet` tests (M0-07 acceptance gate): RNTL smoke render both themes,
 * plus the open/dismiss behavioral test called out explicitly in the
 * task's acceptance gate — content renders when `visible`, is absent when
 * `visible={false}`, and pressing the scrim invokes `onDismiss`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Dimensions, Text } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { Sheet, type SheetDetent } from '../Sheet';
import { ThemeProvider } from '../theme-provider';
import { radii } from '../tokens';

const DETENTS: SheetDetent[] = ['half', 'full'];

/** Same flattening idiom used by `Card.test.tsx`/`Button.test.tsx` etc. for
 * asserting on a RN style array without pulling in a snapshot dependency. */
function flattenStyle(node: { props: { style?: unknown } }): Record<string, unknown> {
  const { style } = node.props;
  return Array.isArray(style) ? Object.assign({}, ...style) : (style as Record<string, unknown>);
}

describe('Sheet — smoke render (both themes)', () => {
  it.each(DETENTS)('renders its content in dark theme (%s detent)', async (detent) => {
    await render(
      <ThemeProvider preference="dark">
        <Sheet visible onDismiss={() => {}} detent={detent} testID="sheet">
          <Text>Sheet body</Text>
        </Sheet>
      </ThemeProvider>,
    );
    expect(screen.getByText('Sheet body')).toBeTruthy();
  });

  it.each(DETENTS)('renders its content in light theme (%s detent)', async (detent) => {
    await render(
      <ThemeProvider preference="light">
        <Sheet visible onDismiss={() => {}} detent={detent} testID="sheet">
          <Text>Sheet body</Text>
        </Sheet>
      </ThemeProvider>,
    );
    expect(screen.getByText('Sheet body')).toBeTruthy();
  });
});

describe('Sheet — open/dismiss behavior', () => {
  it('renders its content when visible', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Sheet visible onDismiss={() => {}} testID="sheet">
          <Text>Set-type menu</Text>
        </Sheet>
      </ThemeProvider>,
    );

    expect(screen.getByText('Set-type menu')).toBeTruthy();
    expect(screen.getByTestId('sheet-content')).toBeTruthy();
  });

  it('renders nothing when visible is false', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Sheet visible={false} onDismiss={() => {}} testID="sheet">
          <Text>Set-type menu</Text>
        </Sheet>
      </ThemeProvider>,
    );

    expect(screen.queryByText('Set-type menu')).toBeNull();
    expect(screen.queryByTestId('sheet-content')).toBeNull();
  });

  it('removes its content once the caller flips visible to false after a dismiss', async () => {
    const onDismiss = jest.fn();
    const { rerender } = await render(
      <ThemeProvider preference="dark">
        <Sheet visible onDismiss={onDismiss} testID="sheet">
          <Text>Set-type menu</Text>
        </Sheet>
      </ThemeProvider>,
    );
    expect(screen.getByText('Set-type menu')).toBeTruthy();

    await rerender(
      <ThemeProvider preference="dark">
        <Sheet visible={false} onDismiss={onDismiss} testID="sheet">
          <Text>Set-type menu</Text>
        </Sheet>
      </ThemeProvider>,
    );

    expect(screen.queryByText('Set-type menu')).toBeNull();
  });

  it('calls onDismiss when the scrim is pressed', async () => {
    const onDismiss = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <Sheet visible onDismiss={onDismiss} testID="sheet">
          <Text>Set-type menu</Text>
        </Sheet>
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByTestId('sheet-scrim'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('calls onDismiss when the Android hardware back / modal request-close fires', async () => {
    const onDismiss = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <Sheet visible onDismiss={onDismiss} testID="sheet">
          <Text>Set-type menu</Text>
        </Sheet>
      </ThemeProvider>,
    );

    fireEvent(screen.getByTestId('sheet'), 'requestClose');

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe('Sheet — full-detent geometry & insets', () => {
  it.each(DETENTS)('renders the %s detent at the expected height', async (detent) => {
    await render(
      <ThemeProvider preference="dark">
        <Sheet visible onDismiss={() => {}} detent={detent} testID="sheet">
          <Text>Sheet body</Text>
        </Sheet>
      </ThemeProvider>,
    );

    const windowHeight = Dimensions.get('window').height;
    const expectedHeight = detent === 'full' ? windowHeight : windowHeight * 0.5;
    expect(flattenStyle(screen.getByTestId('sheet-content')).height).toBe(expectedHeight);
  });

  it('gives the full detent square top corners (no radius)', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Sheet visible onDismiss={() => {}} detent="full" testID="sheet">
          <Text>Sheet body</Text>
        </Sheet>
      </ThemeProvider>,
    );

    const flatStyle = flattenStyle(screen.getByTestId('sheet-content'));
    expect(flatStyle.borderTopLeftRadius).toBe(0);
    expect(flatStyle.borderTopRightRadius).toBe(0);
  });

  it('keeps the half detent rounded top corners (radii.lg)', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Sheet visible onDismiss={() => {}} detent="half" testID="sheet">
          <Text>Sheet body</Text>
        </Sheet>
      </ThemeProvider>,
    );

    const flatStyle = flattenStyle(screen.getByTestId('sheet-content'));
    expect(flatStyle.borderTopLeftRadius).toBe(radii.lg);
    expect(flatStyle.borderTopRightRadius).toBe(radii.lg);
  });

  // Grabber presence, split one detent per test (rather than two `render`s
  // in one test) to match this file's existing one-render-per-`it` idiom
  // and avoid overlapping-`act()` cleanup ordering between renders. `half`
  // has grabber + content wrapper = 2 children; `full` has the content
  // wrapper only = 1 — together these prove the grabber is conditionally
  // rendered on `isFull`, same intent as a diff-based assertion.
  it('renders a grabber alongside the content wrapper for the half detent (2 sheet-content children)', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Sheet visible onDismiss={() => {}} detent="half" testID="sheet">
          <Text>Sheet body</Text>
        </Sheet>
      </ThemeProvider>,
    );

    expect(screen.getByTestId('sheet-content').children.length).toBe(2);
  });

  it('hides the grabber for the full detent (1 sheet-content child: content wrapper only)', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Sheet visible onDismiss={() => {}} detent="full" testID="sheet">
          <Text>Sheet body</Text>
        </Sheet>
      </ThemeProvider>,
    );

    expect(screen.getByTestId('sheet-content').children.length).toBe(1);
  });

  it.each(DETENTS)(
    'applies the live safe-area bottom inset as content paddingBottom (%s detent)',
    async (detent) => {
      await render(
        <ThemeProvider preference="dark">
          <SafeAreaInsetsContext.Provider value={{ top: 44, bottom: 34, left: 0, right: 0 }}>
            <Sheet visible onDismiss={() => {}} detent={detent} testID="sheet">
              <Text>Sheet body</Text>
            </Sheet>
          </SafeAreaInsetsContext.Provider>
        </ThemeProvider>,
      );

      const sheetContent = screen.getByTestId('sheet-content');
      const contentWrapper = sheetContent.children[sheetContent.children.length - 1] as {
        props: { style?: unknown };
      };
      expect(flattenStyle(contentWrapper).paddingBottom).toBe(34);
    },
  );
});
