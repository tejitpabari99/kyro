/**
 * `KeyboardDoneBar` tests (06 §Task 16, PRD §7.2): renders with the given `nativeID`
 * (`InputAccessoryView` is a no-op wrapper under Jest's RN test renderer, same as it is for
 * `KeyboardAccessoryBar` — asserted via the inner `View`'s testID being present), pressing the
 * Done button calls `Keyboard.dismiss` exactly once, and the default testID is used when none is
 * supplied.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Keyboard } from 'react-native';

import { KeyboardDoneBar } from '../KeyboardDoneBar';
import { ThemeProvider } from '../theme-provider';

describe('KeyboardDoneBar — render', () => {
  it('renders with the given nativeID, reaching the underlying InputAccessoryView', async () => {
    await render(
      <ThemeProvider preference="dark">
        <KeyboardDoneBar nativeID="note-field" testID="bar" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('bar')).toBeTruthy();
    expect(screen.getByTestId('bar-done')).toBeTruthy();
  });

  it('uses the default testID (keyboard-done-bar) when none is supplied', async () => {
    await render(
      <ThemeProvider preference="dark">
        <KeyboardDoneBar nativeID="note-field" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('keyboard-done-bar')).toBeTruthy();
    expect(screen.getByTestId('keyboard-done-bar-done')).toBeTruthy();
  });
});

describe('KeyboardDoneBar — Done button', () => {
  it('calls Keyboard.dismiss exactly once when pressed', async () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => undefined);
    await render(
      <ThemeProvider preference="dark">
        <KeyboardDoneBar nativeID="note-field" testID="bar" />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('bar-done'));
    expect(dismissSpy).toHaveBeenCalledTimes(1);
  });
});
