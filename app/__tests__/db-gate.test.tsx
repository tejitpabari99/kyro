/**
 * DB-ready gate RNTL tests (M0-09 acceptance gate, extended by M1-05) — 06
 * §5.1/§9. Mocks the `@/data/sqlite/boot` seam (not `expo-sqlite`/a real
 * driver — 08 §5: "mock only true natives" via `src/lib/`-style seams; this
 * is the equivalent seam for DB boot) so all outcomes of the boot sequence
 * are deterministic:
 *
 *  - `runDbBoot()` resolves, seed succeeds -> the real tab shell renders
 *    (mirrors `tabs-layout.test.tsx`).
 *  - `runDbBoot()` rejects -> `MigrationErrorScreen` renders instead of any
 *    tab content.
 *  - `runDbBoot()` resolves but the M1-05 dataset seed step
 *    (`seedBundledBuiltinExercises`) throws -> `MigrationErrorScreen`
 *    renders too (06 §5.1: seeding is exactly as boot-critical as
 *    migrations — `app/_layout.tsx`'s `.then(async () => {...}).catch(...)`
 *    chain treats a synchronous throw inside that async callback the same
 *    as a rejected `runDbBoot()` promise).
 *
 * `@/data/exercises/seed-builtins` is mocked here too (factory-only, same
 * native-avoidance reasoning as the boot mock below) so these tests aren't
 * coupled to the real 873-record bundled dataset or real seed logic — that
 * belongs to `src/data/exercises/__tests__/seed-builtins.test.ts` and the
 * real-driver `settings-theme-e2e.test.tsx` e2e path.
 */
import { renderRouter, screen } from 'expo-router/testing-library';

import { seedBundledBuiltinExercises } from '@/data/exercises/seed-builtins';
import { getAppDriver, runDbBoot } from '@/data/sqlite/boot';
import type { SqliteDriver } from '@/data/sqlite/driver';

// A factory mock (rather than bare `jest.mock('@/data/sqlite/boot')`) is
// required here: automocking without a factory still `require`s the real
// module first to infer its shape, which would pull in `open-database.ts`
// -> `driver.expo.ts` -> `expo-sqlite`'s native module (unavailable under
// Jest, 08 §5 — the exact reason `driver.expo.ts` itself has no direct
// Jest test). The factory below never touches the real module at all.
jest.mock('@/data/sqlite/boot', () => ({
  runDbBoot: jest.fn(),
  getAppDriver: jest.fn(),
}));

// Mocked for the same reason + to isolate these boot-wiring tests from the
// real bundled dataset (see file header).
jest.mock('@/data/exercises/seed-builtins', () => ({
  seedBundledBuiltinExercises: jest.fn(),
}));

const mockRunDbBoot = runDbBoot as jest.MockedFunction<typeof runDbBoot>;
const mockGetAppDriver = getAppDriver as jest.MockedFunction<typeof getAppDriver>;
const mockSeedBundledBuiltinExercises = seedBundledBuiltinExercises as jest.MockedFunction<
  typeof seedBundledBuiltinExercises
>;

/**
 * M0-10: once `runDbBoot()` resolves, the root layout also calls
 * `SettingsRepository(getAppDriver()).get()` (via `settingsStore.load()`)
 * before flipping the gate to `ready` — so a driver stub with a working
 * (empty-result) `queryAll` is needed here too, or that second boot step
 * itself rejects and the gate never reaches `ready`.
 */
function fakeEmptySettingsDriver(): SqliteDriver {
  return {
    dialect: 'better-sqlite3',
    execute: jest.fn().mockReturnValue({ changes: 0, lastInsertRowId: 0 }),
    queryAll: jest.fn().mockReturnValue([]),
    transaction: jest.fn((fn) => fn()),
    close: jest.fn(),
  };
}

describe('DB-ready gate (M0-09, extended by M1-05)', () => {
  afterEach(() => {
    mockRunDbBoot.mockReset();
    mockGetAppDriver.mockReset();
    mockSeedBundledBuiltinExercises.mockReset();
  });

  it('renders the tab content once migration resolves, seeding before settings load', async () => {
    mockRunDbBoot.mockResolvedValue({
      fromVersion: 0,
      toVersion: 1,
      applied: ['0000_app_meta_and_settings'],
    });
    const driver = fakeEmptySettingsDriver();
    mockGetAppDriver.mockReturnValue(driver);
    mockSeedBundledBuiltinExercises.mockReturnValue({
      previousVersion: null,
      version: 'test-version',
      didSeed: true,
      inserted: 0,
      updated: 0,
      restored: 0,
      archived: 0,
      unchanged: 0,
      durationMs: 0,
    });

    await renderRouter('app', { initialUrl: '/' });

    // M3-02 update: the real routines hub replaced the placeholder — its
    // empty state (real `RoutineRepository`/`ExerciseRepository` reads
    // against the mocked driver's empty `queryAll` result) is this test's
    // "tabs rendered" signal now.
    expect(await screen.findByText('No routines yet')).toBeTruthy();
    expect(screen.queryByTestId('migration-error-screen')).toBeNull();

    // 06 §5.1 ordering: "migrate -> seed/refresh dataset -> load settings".
    // `SettingsRepository.get()` reads settings via `driver.queryAll`, so
    // comparing invocation order against the seed mock's own call directly
    // proves the seed step ran strictly before the settings read, not just
    // that both happened at some point during boot.
    expect(mockSeedBundledBuiltinExercises).toHaveBeenCalledTimes(1);
    expect(mockSeedBundledBuiltinExercises).toHaveBeenCalledWith(driver);
    const queryAllMock = driver.queryAll as jest.Mock;
    expect(queryAllMock.mock.calls.length).toBeGreaterThan(0);
    expect(mockSeedBundledBuiltinExercises.mock.invocationCallOrder[0]).toBeLessThan(
      queryAllMock.mock.invocationCallOrder[0]!,
    );
  });

  it('renders the blocking error screen instead of tabs when migration fails', async () => {
    mockRunDbBoot.mockRejectedValue(new Error('disk full'));

    await renderRouter('app', { initialUrl: '/' });

    expect(await screen.findByTestId('migration-error-screen')).toBeTruthy();
    expect(screen.getByTestId('migration-error-detail')).toHaveTextContent('disk full');
    expect(screen.queryByText('No routines yet')).toBeNull();
    expect(mockSeedBundledBuiltinExercises).not.toHaveBeenCalled();
  });

  it('renders the blocking error screen instead of tabs when the dataset seed step throws (M1-05)', async () => {
    // `runDbBoot()` itself succeeds — this isolates the seed step's own
    // failure mode, which is architecturally different: it's a synchronous
    // throw inside the `.then(async () => {...})` callback, not a rejected
    // promise returned by `runDbBoot()`. Proves that throw still surfaces
    // through the same `.catch` as a migration failure (06 §5.1: seeding is
    // exactly as boot-critical as migrations).
    mockRunDbBoot.mockResolvedValue({
      fromVersion: 0,
      toVersion: 1,
      applied: ['0000_app_meta_and_settings'],
    });
    mockGetAppDriver.mockReturnValue(fakeEmptySettingsDriver());
    mockSeedBundledBuiltinExercises.mockImplementation(() => {
      throw new Error('dataset seed failed: corrupt bundled asset');
    });

    await renderRouter('app', { initialUrl: '/' });

    expect(await screen.findByTestId('migration-error-screen')).toBeTruthy();
    expect(screen.getByTestId('migration-error-detail')).toHaveTextContent(
      'dataset seed failed: corrupt bundled asset',
    );
    expect(screen.queryByText('No routines yet')).toBeNull();
  });
});
