/**
 * Settings screen tests (M0-10) — the theme + weight-unit controls in
 * isolation: pressing a segment calls `settingsStore.setSetting` (write-
 * through) and the control's own selected state updates synchronously.
 * The "applies instantly app-wide via the root `ThemeProvider`" half of the
 * acceptance gate is covered separately in
 * `app/__tests__/settings-theme-e2e.test.tsx`, which exercises the real
 * root layout end-to-end.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import { SettingsRepository } from '@/data/settings/settings-repository';
import { createSettingsStore } from '@/features/settings/settings-store';
import { ThemeProvider } from '@/ui/theme-provider';
import type { SqliteDriver } from '@/data/sqlite/driver';

import SettingsScreen from '../index';

// The screen imports the app-wide `useSettingsStore` singleton directly
// (matching every other app-code consumer, e.g. `app/_layout.tsx`) — mocked
// here to redirect to a fresh, test-owned store instance backed by an
// in-memory database, so this suite never touches the real singleton other
// suites in the same Jest worker might mutate.
jest.mock('@/features/settings/settings-store', () => {
  const actual = jest.requireActual('@/features/settings/settings-store');
  return {
    ...actual,
    useSettingsStore: actual.createSettingsStore(),
  };
});

describe('Settings screen (M0-10)', () => {
  let driver: SqliteDriver;

  beforeEach(async () => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);

    const { useSettingsStore } = jest.requireMock('@/features/settings/settings-store') as {
      useSettingsStore: ReturnType<typeof createSettingsStore>;
    };
    await useSettingsStore.getState().load(new SettingsRepository(driver));
  });

  afterEach(() => {
    driver.close();
  });

  it('renders the theme control defaulted to System and the weight-unit control defaulted to kg', async () => {
    await render(
      <ThemeProvider>
        <SettingsScreen />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('settings-theme-control-system')).toHaveProp('accessibilityState', {
      selected: true,
      disabled: false,
    });
    expect(screen.getByTestId('settings-weight-unit-control-kg')).toHaveProp(
      'accessibilityState',
      { selected: true, disabled: false },
    );
  });

  it('pressing Dark writes through to the repository and updates the control synchronously', async () => {
    await render(
      <ThemeProvider>
        <SettingsScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-theme-control-dark'));
    });

    expect(await screen.findByTestId('settings-theme-control-dark')).toHaveProp(
      'accessibilityState',
      { selected: true, disabled: false },
    );

    const repository = new SettingsRepository(driver);
    expect((await repository.get()).theme).toBe('dark');
  });

  it('pressing lbs writes through to the repository and updates the control synchronously', async () => {
    await render(
      <ThemeProvider>
        <SettingsScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-weight-unit-control-lbs'));
    });

    expect(await screen.findByTestId('settings-weight-unit-control-lbs')).toHaveProp(
      'accessibilityState',
      { selected: true, disabled: false },
    );

    const repository = new SettingsRepository(driver);
    expect((await repository.get()).weight_unit).toBe('lbs');
  });
});
