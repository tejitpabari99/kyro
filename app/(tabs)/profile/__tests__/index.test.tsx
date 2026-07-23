/**
 * Profile tab placeholder test (M0-08) — the dev-gallery link's `__DEV__`
 * guard: shown under `__DEV__` (true in every Jest run), hidden when
 * `__DEV__` is `false` (the guard's actual production behavior).
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import ProfileScreen from '../index';
import { ThemeProvider } from '@/ui/theme-provider';

describe('ProfileScreen — dev-gallery link is __DEV__-gated', () => {
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
