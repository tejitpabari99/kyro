/**
 * `RestTimerSheet` tests (M2-09, 02 §3/§7): renders Off + the 5 s/15 s step
 * wheel; selecting a value translates the `0` sentinel back to `null`
 * ("Off") and any other value through unchanged; Done dismisses.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { RestTimerSheet } from '../RestTimerSheet';
import { ThemeProvider } from '@/ui/theme-provider';

describe('RestTimerSheet', () => {
  it('renders nothing while not visible', async () => {
    await render(
      <ThemeProvider preference="dark">
        <RestTimerSheet visible={false} onDismiss={() => {}} value={null} onChange={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.queryByText('Rest Timer')).toBeNull();
  });

  it('seeds the wheel from a null value at the "Off" row', async () => {
    await render(
      <ThemeProvider preference="dark">
        <RestTimerSheet
          testID="sheet"
          visible
          onDismiss={() => {}}
          value={null}
          onChange={() => {}}
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('sheet-wheel-option-0').props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it('selecting a duration option calls onChange with the raw seconds value', async () => {
    const onChange = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <RestTimerSheet
          testID="sheet"
          visible
          onDismiss={() => {}}
          value={null}
          onChange={onChange}
        />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('sheet-wheel-option-90'));
    expect(onChange).toHaveBeenCalledWith(90);
  });

  it('selecting "Off" translates the sentinel back to null', async () => {
    const onChange = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <RestTimerSheet
          testID="sheet"
          visible
          onDismiss={() => {}}
          value={90}
          onChange={onChange}
        />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('sheet-wheel-option-0'));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('Done dismisses the sheet', async () => {
    const onDismiss = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <RestTimerSheet
          testID="sheet"
          visible
          onDismiss={onDismiss}
          value={null}
          onChange={() => {}}
        />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('sheet-done'));
    expect(onDismiss).toHaveBeenCalled();
  });

  it('uses its default testID when none is supplied', async () => {
    await render(
      <ThemeProvider preference="dark">
        <RestTimerSheet visible onDismiss={() => {}} value={null} onChange={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('rest-timer-sheet')).toBeTruthy();
  });
});
