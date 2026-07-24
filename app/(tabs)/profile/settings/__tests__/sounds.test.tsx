/**
 * "Sounds" settings screen tests (M2-17, 02 §7/§13 item 1) — same fixture
 * convention as `plate-calculator.test.tsx`/`warmup-calculator.test.tsx`: a
 * fresh in-memory `settingsStore` instance, mocked in place of the app-wide
 * singleton the screen imports directly.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { migrate } from '@/data/sqlite/migrator';
import { SettingsRepository } from '@/data/settings/settings-repository';
import { createSettingsStore } from '@/features/settings/settings-store';
import { ThemeProvider } from '@/ui/theme-provider';

import SoundsScreen from '../sounds';

jest.mock('@/features/settings/settings-store', () => {
  const actual = jest.requireActual('@/features/settings/settings-store');
  return {
    ...actual,
    useSettingsStore: actual.createSettingsStore(),
  };
});

describe('Sounds settings screen (M2-17, 02 §7/§13)', () => {
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

  it('renders the shipped defaults (Default sound, Normal for all three volumes)', async () => {
    await render(
      <ThemeProvider>
        <SoundsScreen />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('settings-sounds-timer-sound-default')).toHaveProp(
      'accessibilityState',
      { selected: true, disabled: false },
    );
    expect(screen.getByTestId('settings-sounds-timer-volume-normal')).toHaveProp(
      'accessibilityState',
      { selected: true, disabled: false },
    );
    expect(screen.getByTestId('settings-sounds-set-check-volume-normal')).toHaveProp(
      'accessibilityState',
      { selected: true, disabled: false },
    );
    expect(screen.getByTestId('settings-sounds-notification-volume-normal')).toHaveProp(
      'accessibilityState',
      { selected: true, disabled: false },
    );
  });

  it('changing the timer sound writes through, leaving the other sub-keys untouched', async () => {
    await render(
      <ThemeProvider>
        <SoundsScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-sounds-timer-sound-bell'));
    });

    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.sounds).toEqual({
      timer_sound: 'bell',
      timer_volume: 'normal',
      set_check_volume: 'normal',
      notification_volume: 'normal',
    });
  });

  it('changing each volume independently writes through the correct sub-key', async () => {
    await render(
      <ThemeProvider>
        <SoundsScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-sounds-timer-volume-low'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-sounds-set-check-volume-off'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-sounds-notification-volume-high'));
    });

    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.sounds).toEqual({
      timer_sound: 'default',
      timer_volume: 'low',
      set_check_volume: 'off',
      notification_volume: 'high',
    });
  });
});
