/**
 * `AzRail` unit tests (M1-07) — 03 §2's "right-edge A–Z index rail":
 * available letters call `onSelectLetter`; letters with no section in the
 * current data are disabled no-ops. `ExerciseBrowseScreen.test.tsx` covers
 * the screen wiring this feeds into (`onSelectLetter` -> `scrollToIndex`).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ThemeProvider } from '@/ui/theme-provider';

import { AzRail } from '../AzRail';

describe('AzRail (M1-07)', () => {
  it('calls onSelectLetter with the pressed letter when that letter is available', async () => {
    const onSelectLetter = jest.fn();
    await render(
      <ThemeProvider>
        <AzRail availableLetters={new Set(['B'])} onSelectLetter={onSelectLetter} testID="rail" />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByTestId('rail-letter-B'));
    expect(onSelectLetter).toHaveBeenCalledWith('B');
  });

  it('disables letters absent from availableLetters and does not call onSelectLetter for them', async () => {
    const onSelectLetter = jest.fn();
    await render(
      <ThemeProvider>
        <AzRail availableLetters={new Set(['B'])} onSelectLetter={onSelectLetter} testID="rail" />
      </ThemeProvider>,
    );

    const disabledButton = screen.getByTestId('rail-letter-Z');
    expect(disabledButton).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true }));
    fireEvent.press(disabledButton);
    expect(onSelectLetter).not.toHaveBeenCalled();
  });

  it('renders all 26 letters regardless of which are available', async () => {
    await render(
      <ThemeProvider>
        <AzRail availableLetters={new Set()} onSelectLetter={jest.fn()} testID="rail" />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('rail-letter-A')).toBeTruthy();
    expect(screen.getByTestId('rail-letter-Z')).toBeTruthy();
  });
});
