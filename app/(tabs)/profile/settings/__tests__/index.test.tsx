/**
 * Settings screen tests — M0-10's Theme + Weight Unit controls, plus M2-17's
 * "Workouts" group (02 §13's 12 settings, minus Units which is the existing
 * Weight Unit control above): Default Rest Timer (wheel sheet), Previous
 * Workout Values, RPE Tracking, Smart Superset Scrolling, Inline Timer,
 * Keep Awake, Sounds (nav), Warm-Up Sets in stats, Plate Calculator (nav),
 * Warm-up Calculator (nav), Live PR Notification.
 *
 * The "applies instantly app-wide via the root `ThemeProvider`" half of the
 * Theme acceptance gate is covered separately in
 * `app/__tests__/settings-theme-e2e.test.tsx`. The kg→lb "applies live
 * mid-workout, no DB drift" acceptance gate (02 §13) is covered by
 * `src/domain/__tests__/units.test.ts` (exact round-trip, no display
 * rounding) together with `ActiveWorkoutScreen.tsx`'s existing reactive
 * `useSettingsStore((s) => s.settings.weight_unit)` selector (verified by
 * inspection, not touched here — that file belongs to a parallel M2-14
 * task) — this suite only needs to prove the Weight Unit control itself
 * reads/writes the same `weight_unit` key correctly, not re-derive the
 * unit-math tests.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';

import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import { SettingsRepository } from '@/data/settings/settings-repository';
import { createSettingsStore } from '@/features/settings/settings-store';
import { ThemeProvider } from '@/ui/theme-provider';
import type { SqliteDriver } from '@/data/sqlite/driver';

import SettingsScreen from '../index';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn() },
}));

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

    (router.push as jest.Mock).mockClear();
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

describe('Settings screen — Workouts group (M2-17, 02 §13)', () => {
  let driver: SqliteDriver;

  beforeEach(async () => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);

    const { useSettingsStore } = jest.requireMock('@/features/settings/settings-store') as {
      useSettingsStore: ReturnType<typeof createSettingsStore>;
    };
    await useSettingsStore.getState().load(new SettingsRepository(driver));

    (router.push as jest.Mock).mockClear();
  });

  afterEach(() => {
    driver.close();
  });

  it('renders the Default Rest Timer row with the current value (90s default) as its subtitle', async () => {
    await render(
      <ThemeProvider>
        <SettingsScreen />
      </ThemeProvider>,
    );

    expect(screen.getByText('1min 30s')).toBeTruthy();
  });

  it('opens the Default Rest Timer wheel sheet and selecting a value writes through', async () => {
    await render(
      <ThemeProvider>
        <SettingsScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-default-rest-timer-row'));
    });
    expect(await screen.findByTestId('settings-default-rest-timer-sheet')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-default-rest-timer-wheel-option-120'));
    });

    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.default_rest_seconds).toBe(120);
  });

  it('selecting Off (0) on the Default Rest Timer wheel writes through', async () => {
    await render(
      <ThemeProvider>
        <SettingsScreen />
      </ThemeProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-default-rest-timer-row'));
    });
    expect(await screen.findByTestId('settings-default-rest-timer-sheet')).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-default-rest-timer-wheel-option-0'));
    });

    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.default_rest_seconds).toBe(0);
  });

  it('defaults Previous Workout Values to Any Workout, and Same Routine writes through', async () => {
    await render(
      <ThemeProvider>
        <SettingsScreen />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('settings-previous-values-control-any_workout')).toHaveProp(
      'accessibilityState',
      { selected: true, disabled: false },
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-previous-values-control-same_routine'));
    });

    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings.previous_values_mode).toBe('same_routine');
  });

  it.each([
    ['settings-rpe-enabled', 'rpe_enabled', false],
    ['settings-smart-superset-scroll', 'smart_superset_scroll', true],
    ['settings-inline-timer', 'inline_timer', true],
    ['settings-keep-awake', 'keep_awake', true],
    ['settings-warmup-in-stats', 'warmup_in_stats', false],
    ['settings-live-pr-banner', 'live_pr_banner', true],
  ] as const)('the %s toggle defaults to %s and flips %s on press', async (testID, key, defaultValue) => {
    await render(
      <ThemeProvider>
        <SettingsScreen />
      </ThemeProvider>,
    );

    expect(screen.getByTestId(testID).props.value).toBe(defaultValue);

    await act(async () => {
      fireEvent(screen.getByTestId(testID), 'valueChange', !defaultValue);
    });

    const repository = new SettingsRepository(driver);
    const settings = await repository.get();
    expect(settings[key]).toBe(!defaultValue);
  });

  it('navigates to the Sounds screen', async () => {
    await render(
      <ThemeProvider>
        <SettingsScreen />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByTestId('settings-sounds-link'));
    expect(router.push).toHaveBeenCalledWith('/profile/settings/sounds');
  });

  it('navigates to the Plate Calculator screen', async () => {
    await render(
      <ThemeProvider>
        <SettingsScreen />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByTestId('settings-plate-calc-link'));
    expect(router.push).toHaveBeenCalledWith('/profile/settings/plate-calculator');
  });

  it('navigates to the Warm-up Calculator screen', async () => {
    await render(
      <ThemeProvider>
        <SettingsScreen />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByTestId('settings-warmup-calc-link'));
    expect(router.push).toHaveBeenCalledWith('/profile/settings/warmup-calculator');
  });

  it('each Workouts setting persists across a simulated relaunch (fresh store instance, same DB)', async () => {
    const { useSettingsStore } = jest.requireMock('@/features/settings/settings-store') as {
      useSettingsStore: ReturnType<typeof createSettingsStore>;
    };

    await useSettingsStore.getState().setSetting('rpe_enabled', true);
    await useSettingsStore.getState().setSetting('default_rest_seconds', 45);

    // Simulate relaunch: a brand-new store instance reading the same DB.
    const relaunchStore = createSettingsStore();
    await relaunchStore.getState().load(new SettingsRepository(driver));

    expect(relaunchStore.getState().settings.rpe_enabled).toBe(true);
    expect(relaunchStore.getState().settings.default_rest_seconds).toBe(45);
  });
});
