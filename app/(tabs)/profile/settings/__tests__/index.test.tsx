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
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';
import React from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import { SettingsRepository } from '@/data/settings/settings-repository';
import { createSettingsStore } from '@/features/settings/settings-store';
import { ThemeProvider } from '@/ui/theme-provider';
import type { SqliteDriver } from '@/data/sqlite/driver';

import SettingsScreen from '../index';

// M5-04: `SettingsScreen` now calls `useQueryClient()` (the first-day-of-week
// recompute hook, `recompute-hooks.ts`) — every render needs a real
// `QueryClientProvider` ancestor now, unlike before this task.
function newQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
}

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), back: jest.fn() },
}));

// M5-04: "Export Diagnostics" calls this directly — mocked so the suite
// never touches the real `Share.share` (throws under Jest, no native
// `NativeActionSheetManager` — see `src/lib/diagnostics-export.ts`'s own
// file header) and so the row's `onPress` wiring can be asserted by call
// count alone, the same "mock the seam, assert it was called" convention
// `router.push` above already uses.
jest.mock('@/lib/diagnostics-export');

// M5-06: "Export CSV" constructs its `CsvService` via `getAppDriver()`
// lazily, at press-time (see `index.tsx`'s own comment on `handleExportCsv`
// for why) — this suite's every other test renders `SettingsScreen` against
// a self-constructed in-memory driver that never calls the real
// `runDbBoot()`, so `getAppDriver()` would throw if actually invoked; none
// of those pre-existing tests ever press Export CSV, so this mock only
// matters for the dedicated "DATA section" describe block below, which
// configures `createCsvService`'s return value per-test.
jest.mock('@/data/sqlite/boot', () => ({ getAppDriver: jest.fn() }));
jest.mock('@/features/data-transfer/csv-service', () => ({ createCsvService: jest.fn() }));
// M5-06: same "mock the seam, assert it was called" convention as
// `diagnostics-export` above — `lib/share-file.ts`'s own header explains why
// `expo-sharing` itself is never mocked directly in screen tests.
jest.mock('@/lib/share-file', () => ({ shareFile: jest.fn().mockResolvedValue(undefined) }));
// M5-09: "Backup" constructs `BackupService` via `getAppDriver()` lazily at
// press-time too (same reasoning as Export CSV above) — mocked wholesale so
// the dedicated "DATA section, Backup & Restore" describe block below can
// configure `createBackupService`'s return value per-test without touching
// `lib/progress-photos.ts`/`lib/backup-file.ts`'s real native seams (those
// real functions are still passed through as inert arguments to this mock,
// but the mock itself never calls them).
jest.mock('@/features/data-transfer/backup-service', () => ({ createBackupService: jest.fn() }));
// M5-09: the monthly backup-reminder toggle — manual mock, same
// `src/lib/__mocks__/notifications.ts` convention `restTimerStore.test.ts`
// already established for this module.
jest.mock('@/lib/notifications');

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
  let queryClient: QueryClient;

  beforeEach(async () => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    queryClient = newQueryClient();

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
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SettingsScreen />
        </ThemeProvider>
      </QueryClientProvider>,
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
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SettingsScreen />
        </ThemeProvider>
      </QueryClientProvider>,
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
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SettingsScreen />
        </ThemeProvider>
      </QueryClientProvider>,
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
  let queryClient: QueryClient;

  beforeEach(async () => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    queryClient = newQueryClient();

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
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SettingsScreen />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText('1min 30s')).toBeTruthy();
  });

  it('opens the Default Rest Timer wheel sheet and selecting a value writes through', async () => {
    await render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SettingsScreen />
        </ThemeProvider>
      </QueryClientProvider>,
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
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SettingsScreen />
        </ThemeProvider>
      </QueryClientProvider>,
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
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SettingsScreen />
        </ThemeProvider>
      </QueryClientProvider>,
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
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SettingsScreen />
        </ThemeProvider>
      </QueryClientProvider>,
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
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SettingsScreen />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    fireEvent.press(screen.getByTestId('settings-sounds-link'));
    expect(router.push).toHaveBeenCalledWith('/profile/settings/sounds');
  });

  it('navigates to the Plate Calculator screen', async () => {
    await render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SettingsScreen />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    fireEvent.press(screen.getByTestId('settings-plate-calc-link'));
    expect(router.push).toHaveBeenCalledWith('/profile/settings/plate-calculator');
  });

  it('navigates to the Warm-up Calculator screen', async () => {
    await render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SettingsScreen />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    fireEvent.press(screen.getByTestId('settings-warmup-calc-link'));
    expect(router.push).toHaveBeenCalledWith('/profile/settings/warmup-calculator');
  });

  it('navigates to the Archived Exercises screen', async () => {
    await render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SettingsScreen />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    fireEvent.press(screen.getByTestId('settings-archived-exercises-link'));
    expect(router.push).toHaveBeenCalledWith('/profile/exercises-archived');
  });

  it('pressing the back chevron calls router.back()', async () => {
    await render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SettingsScreen />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    fireEvent.press(screen.getByTestId('settings-back'));
    expect(router.back).toHaveBeenCalledTimes(1);
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

describe('Settings screen — General/Notifications/About (M5-04, 04 §7)', () => {
  let driver: SqliteDriver;
  let queryClient: QueryClient;

  beforeEach(async () => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    queryClient = newQueryClient();

    const { useSettingsStore } = jest.requireMock('@/features/settings/settings-store') as {
      useSettingsStore: ReturnType<typeof createSettingsStore>;
    };
    await useSettingsStore.getState().load(new SettingsRepository(driver));

    (router.push as jest.Mock).mockClear();
  });

  afterEach(() => {
    driver.close();
  });

  async function renderSettings() {
    return render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SettingsScreen />
        </ThemeProvider>
      </QueryClientProvider>,
    );
  }

  it('defaults First Day of Week to Monday, and Sunday writes through', async () => {
    await renderSettings();

    expect(screen.getByTestId('settings-first-day-of-week-control-monday')).toHaveProp(
      'accessibilityState',
      { selected: true, disabled: false },
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-first-day-of-week-control-sunday'));
    });

    const repository = new SettingsRepository(driver);
    expect((await repository.get()).first_day_of_week).toBe('sunday');
  });

  it('defaults Weekly Workout Goal to Off, and selecting a value writes through', async () => {
    await renderSettings();

    expect(screen.getByText('Off')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-weekly-goal-row'));
    });
    expect(await screen.findByTestId('settings-weekly-goal-sheet')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-weekly-goal-wheel-option-4'));
    });

    const repository = new SettingsRepository(driver);
    expect((await repository.get()).weekly_goal).toBe(4);
  });

  it('selecting Off on the Weekly Workout Goal wheel writes through null (not the -1 sentinel)', async () => {
    await renderSettings();

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-weekly-goal-row'));
    });
    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-weekly-goal-wheel-option--1'));
    });

    const repository = new SettingsRepository(driver);
    expect((await repository.get()).weekly_goal).toBeNull();
  });

  it('the Rest Timer Notifications toggle defaults on and flips off on press', async () => {
    await renderSettings();

    expect(screen.getByTestId('settings-rest-notifications-enabled').props.value).toBe(true);

    await act(async () => {
      fireEvent(screen.getByTestId('settings-rest-notifications-enabled'), 'valueChange', false);
    });

    const repository = new SettingsRepository(driver);
    expect((await repository.get()).rest_notifications_enabled).toBe(false);
  });

  it('renders the app version in the About section', async () => {
    await renderSettings();
    expect(screen.getByTestId('settings-version-row')).toBeTruthy();
    // `getAppVersion()` falls back to `app.json`'s `expo.version` under Jest
    // (`lib/app-info.ts`'s own file header — no native Constants module here).
    expect(screen.getByText('1.0.0')).toBeTruthy();
  });

  it('the Crash & Error Reporting (Sentry) toggle defaults on and flips off on press', async () => {
    await renderSettings();

    expect(screen.getByTestId('settings-sentry-enabled').props.value).toBe(true);

    await act(async () => {
      fireEvent(screen.getByTestId('settings-sentry-enabled'), 'valueChange', false);
    });

    const repository = new SettingsRepository(driver);
    expect((await repository.get()).sentry_enabled).toBe(false);
  });

  it('pressing Export Diagnostics shares the formatted log buffer', async () => {
    const { shareDiagnostics } = jest.requireMock('@/lib/diagnostics-export') as {
      shareDiagnostics: jest.Mock;
    };

    await renderSettings();
    fireEvent.press(screen.getByTestId('settings-export-diagnostics-row'));

    expect(shareDiagnostics).toHaveBeenCalledTimes(1);
  });

  it('navigates to the Licenses screen', async () => {
    await renderSettings();

    fireEvent.press(screen.getByTestId('settings-licenses-link'));
    expect(router.push).toHaveBeenCalledWith('/profile/settings/licenses');
  });

  it('every new setting persists across a simulated relaunch', async () => {
    const { useSettingsStore } = jest.requireMock('@/features/settings/settings-store') as {
      useSettingsStore: ReturnType<typeof createSettingsStore>;
    };

    await useSettingsStore.getState().setSetting('first_day_of_week', 'saturday');
    await useSettingsStore.getState().setSetting('weekly_goal', 5);
    await useSettingsStore.getState().setSetting('rest_notifications_enabled', false);
    await useSettingsStore.getState().setSetting('sentry_enabled', false);

    const relaunchStore = createSettingsStore();
    await relaunchStore.getState().load(new SettingsRepository(driver));

    expect(relaunchStore.getState().settings.first_day_of_week).toBe('saturday');
    expect(relaunchStore.getState().settings.weekly_goal).toBe(5);
    expect(relaunchStore.getState().settings.rest_notifications_enabled).toBe(false);
    expect(relaunchStore.getState().settings.sentry_enabled).toBe(false);
  });
});

describe('Settings screen — DATA section, Export CSV (M5-06)', () => {
  let driver: SqliteDriver;
  let queryClient: QueryClient;

  beforeEach(async () => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    queryClient = newQueryClient();

    const { useSettingsStore } = jest.requireMock('@/features/settings/settings-store') as {
      useSettingsStore: ReturnType<typeof createSettingsStore>;
    };
    await useSettingsStore.getState().load(new SettingsRepository(driver));

    jest.clearAllMocks();
  });

  afterEach(() => {
    driver.close();
  });

  async function renderSettings() {
    return render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SettingsScreen />
        </ThemeProvider>
      </QueryClientProvider>,
    );
  }

  it('renders Export CSV, Import Hevy CSV, Backup, Restore, and the backup-reminder toggle rows', async () => {
    await renderSettings();

    expect(screen.getByTestId('settings-export-csv-row')).toBeTruthy();
    expect(screen.getByTestId('settings-import-hevy-csv-row')).toBeTruthy();
    expect(screen.getByTestId('settings-backup-row')).toBeTruthy();
    expect(screen.getByTestId('settings-restore-row')).toBeTruthy();
    expect(screen.getByTestId('settings-backup-reminder-enabled')).toBeTruthy();
  });

  it('pressing Import Hevy CSV navigates to /import/hevy (M5-07)', async () => {
    await renderSettings();
    fireEvent.press(screen.getByTestId('settings-import-hevy-csv-row'));

    expect(router.push).toHaveBeenCalledWith('/import/hevy');
  });

  it('pressing Export CSV calls CsvService.exportAll with the live unit settings, then shares the returned file', async () => {
    const { useSettingsStore } = jest.requireMock('@/features/settings/settings-store') as {
      useSettingsStore: ReturnType<typeof createSettingsStore>;
    };
    await useSettingsStore.getState().setSetting('weight_unit', 'lbs');
    await useSettingsStore.getState().setSetting('distance_unit', 'miles');

    const exportAll = jest
      .fn()
      .mockResolvedValue({ uri: 'file:///mock-cache/kyro_workouts.csv', fileName: 'kyro_workouts.csv' });
    const { createCsvService } = jest.requireMock('@/features/data-transfer/csv-service') as {
      createCsvService: jest.Mock;
    };
    createCsvService.mockReturnValue({ exportAll });
    const { shareFile } = jest.requireMock('@/lib/share-file') as { shareFile: jest.Mock };

    await renderSettings();
    fireEvent.press(screen.getByTestId('settings-export-csv-row'));

    await waitFor(() =>
      expect(exportAll).toHaveBeenCalledWith({ weightUnit: 'lbs', distanceUnit: 'miles' }),
    );
    await waitFor(() =>
      expect(shareFile).toHaveBeenCalledWith(
        'file:///mock-cache/kyro_workouts.csv',
        expect.objectContaining({ mimeType: 'text/csv' }),
      ),
    );
  });

  it('surfaces an alert and clears the loading state when export rejects, without an unhandled rejection', async () => {
    const exportAll = jest.fn().mockRejectedValue(new Error('disk full'));
    const { createCsvService } = jest.requireMock('@/features/data-transfer/csv-service') as {
      createCsvService: jest.Mock;
    };
    createCsvService.mockReturnValue({ exportAll });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    await renderSettings();
    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-export-csv-row'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(alertSpy).toHaveBeenCalledWith('Export Failed', expect.any(String));
    // The row's subtitle reverts from "Exporting..." (not stuck loading)
    // once the failure is handled.
    expect(screen.queryByText('Exporting…')).toBeNull();

    alertSpy.mockRestore();
  });
});

describe('Settings screen — DATA section, Backup / Restore / monthly reminder (M5-09)', () => {
  let driver: SqliteDriver;
  let queryClient: QueryClient;

  beforeEach(async () => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    queryClient = newQueryClient();

    const { useSettingsStore } = jest.requireMock('@/features/settings/settings-store') as {
      useSettingsStore: ReturnType<typeof createSettingsStore>;
    };
    await useSettingsStore.getState().load(new SettingsRepository(driver));

    jest.clearAllMocks();
  });

  afterEach(() => {
    driver.close();
  });

  async function renderSettings() {
    return render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SettingsScreen />
        </ThemeProvider>
      </QueryClientProvider>,
    );
  }

  it('pressing Restore navigates to /backup/restore', async () => {
    await renderSettings();
    fireEvent.press(screen.getByTestId('settings-restore-row'));

    expect(router.push).toHaveBeenCalledWith('/backup/restore');
  });

  it('pressing Backup calls BackupService.export(), then shares the returned zip', async () => {
    const exportBackup = jest
      .fn()
      .mockResolvedValue({
        uri: 'file:///mock-cache/kyro_backup_2026-01-01.zip',
        fileName: 'kyro_backup_2026-01-01.zip',
        workoutCount: 3,
        photoCount: 1,
        exportedAt: 0,
      });
    const { createBackupService } = jest.requireMock('@/features/data-transfer/backup-service') as {
      createBackupService: jest.Mock;
    };
    createBackupService.mockReturnValue({ export: exportBackup, restore: jest.fn() });
    const { shareFile } = jest.requireMock('@/lib/share-file') as { shareFile: jest.Mock };

    await renderSettings();
    fireEvent.press(screen.getByTestId('settings-backup-row'));

    await waitFor(() => expect(exportBackup).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(shareFile).toHaveBeenCalledWith(
        'file:///mock-cache/kyro_backup_2026-01-01.zip',
        expect.objectContaining({ mimeType: 'application/zip' }),
      ),
    );
  });

  it('surfaces an alert and clears the loading state when backup export rejects, without an unhandled rejection', async () => {
    const exportBackup = jest.fn().mockRejectedValue(new Error('disk full'));
    const { createBackupService } = jest.requireMock('@/features/data-transfer/backup-service') as {
      createBackupService: jest.Mock;
    };
    createBackupService.mockReturnValue({ export: exportBackup, restore: jest.fn() });
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

    await renderSettings();
    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-backup-row'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(alertSpy).toHaveBeenCalledWith('Backup Failed', expect.any(String));
    expect(screen.queryByText('Backing up…')).toBeNull();

    alertSpy.mockRestore();
  });

  it('enabling the monthly backup reminder requests permission and schedules it when granted', async () => {
    const notifications = jest.requireMock('@/lib/notifications') as {
      requestNotificationPermission: jest.Mock;
      scheduleMonthlyBackupReminder: jest.Mock;
      cancelBackupReminder: jest.Mock;
    };
    notifications.requestNotificationPermission.mockResolvedValue('granted');

    await renderSettings();
    await act(async () => {
      fireEvent(screen.getByTestId('settings-backup-reminder-enabled'), 'valueChange', true);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(notifications.requestNotificationPermission).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(notifications.scheduleMonthlyBackupReminder).toHaveBeenCalledTimes(1));
    expect(notifications.cancelBackupReminder).not.toHaveBeenCalled();

    const { useSettingsStore } = jest.requireMock('@/features/settings/settings-store') as {
      useSettingsStore: ReturnType<typeof createSettingsStore>;
    };
    expect(useSettingsStore.getState().settings.backup_reminder_enabled).toBe(true);
  });

  it('enabling the reminder when permission is denied persists the toggle but never schedules', async () => {
    const notifications = jest.requireMock('@/lib/notifications') as {
      requestNotificationPermission: jest.Mock;
      scheduleMonthlyBackupReminder: jest.Mock;
    };
    notifications.requestNotificationPermission.mockResolvedValue('denied');

    await renderSettings();
    await act(async () => {
      fireEvent(screen.getByTestId('settings-backup-reminder-enabled'), 'valueChange', true);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(notifications.scheduleMonthlyBackupReminder).not.toHaveBeenCalled();
    const { useSettingsStore } = jest.requireMock('@/features/settings/settings-store') as {
      useSettingsStore: ReturnType<typeof createSettingsStore>;
    };
    expect(useSettingsStore.getState().settings.backup_reminder_enabled).toBe(true);
  });

  it('disabling the reminder cancels it, without requesting permission', async () => {
    const { useSettingsStore } = jest.requireMock('@/features/settings/settings-store') as {
      useSettingsStore: ReturnType<typeof createSettingsStore>;
    };
    await useSettingsStore.getState().setSetting('backup_reminder_enabled', true);
    const notifications = jest.requireMock('@/lib/notifications') as {
      requestNotificationPermission: jest.Mock;
      cancelBackupReminder: jest.Mock;
    };

    await renderSettings();
    await act(async () => {
      fireEvent(screen.getByTestId('settings-backup-reminder-enabled'), 'valueChange', false);
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => expect(notifications.cancelBackupReminder).toHaveBeenCalledTimes(1));
    expect(notifications.requestNotificationPermission).not.toHaveBeenCalled();
    expect(useSettingsStore.getState().settings.backup_reminder_enabled).toBe(false);
  });
});

describe('Settings screen — first-day-of-week recompute hook (M5-04 named acceptance case)', () => {
  let driver: SqliteDriver;
  let queryClient: QueryClient;

  beforeEach(async () => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    // Deliberately NOT `newQueryClient()`'s `gcTime: 0` here — every seeded
    // key in this test is set via `setQueryData` with zero observers (no
    // component in this render tree actually subscribes to `['stats', ...]`
    // /`['calendar', ...]`), and `gcTime: 0` garbage-collects an unobserved
    // query almost immediately, which was empirically observed to race the
    // assertions below (`getQueryState` returning `undefined`, not just
    // `isInvalidated: false`). `gcTime: Infinity` keeps every seeded entry
    // around for the whole test regardless of observer count.
    queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity, retry: false } },
    });

    const { useSettingsStore } = jest.requireMock('@/features/settings/settings-store') as {
      useSettingsStore: ReturnType<typeof createSettingsStore>;
    };
    await useSettingsStore.getState().load(new SettingsRepository(driver));

    (router.push as jest.Mock).mockClear();
  });

  afterEach(() => {
    driver.close();
  });

  /**
   * The task's own named acceptance case: "first-day change re-buckets
   * calendar/stats (integration) ... not just 'the setting saves,' but that
   * a dependent query key gets invalidated." Seeds the shared `queryClient`
   * with data under the exact `'stats'`/`'calendar'`-prefixed keys
   * `StatisticsScreen.tsx`/`CalendarScreen.tsx` register, changes
   * `first_day_of_week` via the real control, and asserts both queries are
   * marked invalidated immediately after — proving `recompute-hooks.ts`'s
   * `invalidateWeekBoundaryQueries` actually ran as a result of the change,
   * not merely that `first_day_of_week` itself persisted.
   */
  it('invalidates the stats and calendar query prefixes when First Day of Week changes', async () => {
    queryClient.setQueryData(['stats', 'workout-dates'], [{ date: '2026-07-20', count: 1 }]);
    queryClient.setQueryData(['stats', 'feed', '3m'], []);
    queryClient.setQueryData(['calendar', 'streak'], [{ date: '2026-07-20', count: 1 }]);
    queryClient.setQueryData(['calendar', 'month', 2026, 6], [{ date: '2026-07-20', count: 1 }]);
    // A sibling prefix that must NOT be invalidated by this hook (see
    // `recompute-hooks.ts`'s own header — history never buckets by week).
    queryClient.setQueryData(['history', 'list'], { pages: [], pageParams: [] });

    expect(queryClient.getQueryState(['stats', 'workout-dates'])?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(['calendar', 'month', 2026, 6])?.isInvalidated).toBe(false);

    await render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <SettingsScreen />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-first-day-of-week-control-sunday'));
    });

    await waitFor(() => {
      expect(queryClient.getQueryState(['stats', 'workout-dates'])?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(['stats', 'feed', '3m'])?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(['calendar', 'streak'])?.isInvalidated).toBe(true);
      expect(queryClient.getQueryState(['calendar', 'month', 2026, 6])?.isInvalidated).toBe(true);
    });

    // The 'history' prefix is deliberately untouched by this hook.
    expect(queryClient.getQueryState(['history', 'list'])?.isInvalidated).toBe(false);

    const repository = new SettingsRepository(driver);
    expect((await repository.get()).first_day_of_week).toBe('sunday');
  });
});
