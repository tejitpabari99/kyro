/**
 * `Sheet` tests (M0-07 acceptance gate): RNTL smoke render both themes,
 * plus the open/dismiss behavioral test called out explicitly in the
 * task's acceptance gate — content renders when `visible`, is absent when
 * `visible={false}`, and pressing the scrim invokes `onDismiss`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { Sheet, type SheetDetent } from '../Sheet';
import { ThemeProvider } from '../theme-provider';

const DETENTS: SheetDetent[] = ['half', 'full'];

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
