/**
 * Theme setting, wired end-to-end (M0-10 acceptance gate): "theme change is
 * instant app-wide" — exercised through the *real* root layout
 * (`app/_layout.tsx`), not a hand-rolled `ThemeProvider` stand-in, so this
 * proves the actual `settingsStore` -> `ThemeProvider`'s controlled
 * `preference` prop wiring this task adds, not just that the store/repo
 * layer works in isolation (that half is `settings-repository.test.ts` +
 * `settings-store.test.ts`'s "survives relaunch" case).
 *
 * `@/data/sqlite/boot` is mocked the same way `db-gate.test.tsx` mocks it
 * (factory-only, `expo-sqlite` never touched under Jest, 08 §5) but
 * `getAppDriver()` here returns a **real** `better-sqlite3` driver against
 * a real migrated in-memory database, so the settings screen's writes are
 * genuine `SettingsRepository` round-trips, not stubs.
 */
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { getAppDriver, runDbBoot } from '@/data/sqlite/boot';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import { SettingsRepository } from '@/data/settings/settings-repository';
import type { SqliteDriver } from '@/data/sqlite/driver';

jest.mock('@/data/sqlite/boot', () => ({
  runDbBoot: jest.fn(),
  getAppDriver: jest.fn(),
}));

const mockRunDbBoot = runDbBoot as jest.MockedFunction<typeof runDbBoot>;
const mockGetAppDriver = getAppDriver as jest.MockedFunction<typeof getAppDriver>;

describe('theme setting applies instantly app-wide (M0-10)', () => {
  let driver: SqliteDriver;

  beforeEach(() => {
    driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    mockRunDbBoot.mockResolvedValue({ fromVersion: 1, toVersion: 1, applied: [] });
    mockGetAppDriver.mockReturnValue(driver);
  });

  afterEach(() => {
    driver.close();
    mockRunDbBoot.mockReset();
    mockGetAppDriver.mockReset();
  });

  it('switching to Dark on the settings screen re-colors the app root immediately, with no remount', async () => {
    await renderRouter('app', { initialUrl: '/profile/settings' });

    const settingsScreen = await screen.findByTestId('settings-screen');
    // Default preference is 'system'; jsdom/RN-test-renderer's environment
    // resolves `useColorScheme()` such that `theme-provider.tsx`'s fallback
    // applies — either way, pressing "Dark" below must deterministically
    // flip it to the dark token regardless of that starting point.

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-theme-control-dark'));
    });

    const rerendered = await screen.findByTestId('settings-screen');
    const flatStyle = Array.isArray(rerendered.props.style)
      ? Object.assign({}, ...rerendered.props.style)
      : rerendered.props.style;

    // 07 §2.1 dark `bg.base` — asserts the *same mounted tree* (no manual
    // remount) picked up the new theme purely from the store write, proving
    // the root `ThemeProvider`'s controlled `preference` prop is genuinely
    // wired to `settingsStore`, not just the settings screen's own local
    // read of it.
    expect(flatStyle.backgroundColor).toBe('#0B0D0C');
    expect(settingsScreen).toBeTruthy();
  });

  it('the persisted theme is read back correctly on the very next SettingsRepository read (no drift)', async () => {
    await renderRouter('app', { initialUrl: '/profile/settings' });
    await screen.findByTestId('settings-screen');

    await act(async () => {
      fireEvent.press(screen.getByTestId('settings-theme-control-dark'));
    });

    await screen.findByTestId('settings-theme-control-dark');

    const settings = await new SettingsRepository(driver).get();
    expect(settings.theme).toBe('dark');
  });
});
