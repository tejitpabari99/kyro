/**
 * Profile tab placeholder test (M0-08, +M0-10's Settings link) — the
 * dev-gallery link's `__DEV__` guard: shown under `__DEV__` (true in every
 * Jest run), hidden when `__DEV__` is `false` (the guard's actual
 * production behavior). Also covers the M0-10 Settings row, which is
 * unconditional (present in every build).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import ProfileScreen from '../index';
import { ThemeProvider } from '@/ui/theme-provider';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn() },
}));

describe('ProfileScreen — Settings link + dev-gallery link __DEV__ gate', () => {
  it('shows the Settings row (every build) and navigates to /profile/settings on press', async () => {
    await render(
      <ThemeProvider>
        <ProfileScreen />
      </ThemeProvider>,
    );

    const settingsLink = screen.getByTestId('settings-link');
    expect(settingsLink).toBeTruthy();
    fireEvent.press(settingsLink);
    expect(router.push).toHaveBeenCalledWith('/profile/settings');
  });

  it('shows the Archived Exercises row (M1-10) and navigates to it on press', async () => {
    await render(
      <ThemeProvider>
        <ProfileScreen />
      </ThemeProvider>,
    );

    const archivedLink = screen.getByTestId('archived-exercises-link');
    expect(archivedLink).toBeTruthy();
    fireEvent.press(archivedLink);
    expect(router.push).toHaveBeenCalledWith('/profile/exercises-archived');
  });

  it('shows the Design Gallery row under __DEV__', async () => {
    await render(
      <ThemeProvider>
        <ProfileScreen />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('dev-gallery-link')).toBeTruthy();
  });

  it('hides the Design Gallery row when __DEV__ is false', async () => {
    const original = __DEV__;
    // @ts-expect-error — `__DEV__` is a read-only ambient global in its type
    // declaration; intentionally overwritten here to simulate a production
    // build for this one assertion.
    __DEV__ = false;
    try {
      await render(
        <ThemeProvider>
          <ProfileScreen />
        </ThemeProvider>,
      );
      expect(screen.queryByTestId('dev-gallery-link')).toBeNull();
    } finally {
      // @ts-expect-error — restoring the ambient global, same carve-out as above.
      __DEV__ = original;
    }
  });
});
