/**
 * Licenses screen tests (M5-04, 04 §7 / `10` §5) — the static
 * Settings → About → Licenses screen: free-exercise-db credit text and the
 * hand-maintained OSS dependency list. No data layer, so this is a plain
 * render-and-read-text smoke test, same weight as `sounds.test.tsx`'s own
 * static-content coverage.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { ThemeProvider } from '@/ui/theme-provider';

import LicensesScreen from '../licenses';

describe('LicensesScreen', () => {
  it('renders the free-exercise-db attribution required by 10 §5', async () => {
    await render(
      <ThemeProvider>
        <LicensesScreen />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('licenses-screen')).toBeTruthy();
    expect(screen.getByTestId('licenses-exercise-db-credit')).toBeTruthy();
    expect(
      screen.getByText(/free-exercise-db \(github\.com\/yuhonas\/free-exercise-db\)/),
    ).toBeTruthy();
    expect(screen.getByText(/Unlicense \(public domain\)/)).toBeTruthy();
  });

  it('renders the OSS dependency list with SPDX license names', async () => {
    await render(
      <ThemeProvider>
        <LicensesScreen />
      </ThemeProvider>,
    );

    expect(screen.getByText('react / react-dom')).toBeTruthy();
    expect(screen.getByText('drizzle-orm')).toBeTruthy();
    expect(screen.getByText('Apache-2.0')).toBeTruthy();
    expect(screen.getByText('lucide-react-native')).toBeTruthy();
    expect(screen.getByText('ISC')).toBeTruthy();
  });

  it('renders in both themes', async () => {
    await render(
      <ThemeProvider preference="light">
        <LicensesScreen />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('licenses-screen')).toBeTruthy();

    await render(
      <ThemeProvider preference="dark">
        <LicensesScreen />
      </ThemeProvider>,
    );
    expect(screen.getAllByTestId('licenses-screen').length).toBeGreaterThan(0);
  });
});
