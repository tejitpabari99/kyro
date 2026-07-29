/**
 * Resume-on-launch regression test (M2-13, 02 §10 / 06 §3/§5.1): "On app
 * launch, if an active workout exists, show the minimized bar immediately."
 * / "On relaunch: `state='active'` workout found → restore Zustand store
 * from DB → show mini-bar (**not** the full logger)."
 *
 * Exercises the *real* root layout (`app/_layout.tsx`) via `renderRouter`,
 * same pattern `settings-theme-e2e.test.tsx` (M0-10) established: `@/data/
 * sqlite/boot` is mocked to hand back a real, migrated in-memory
 * `better-sqlite3` driver (not an all-empty stub) so `activeWorkoutStore`'s
 * boot-time `rehydrate()` call performs a genuine `WorkoutRepository
 * .getActive()` read against a pre-seeded active workout row — this is the
 * one thing `tabs-layout.test.tsx`'s own all-empty-driver mock can't
 * exercise (its `getActive()` always resolves `null`).
 *
 * Proves two things nothing else in this codebase's suite currently does
 * together: (1) cold start with an active workout lands on the tabs (mini-
 * bar showing), never auto-presenting the full `/workout/active` route, and
 * (2) tapping the mini-bar really navigates there through the app's actual
 * `expo-router` stack (not a mocked `router.push` spy) — `expo-router` is
 * deliberately left unmocked here for that reason.
 */
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';

import { getAppDriver, runDbBoot } from '@/data/sqlite/boot';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';

jest.mock('@/data/sqlite/boot', () => ({
  runDbBoot: jest.fn(),
  getAppDriver: jest.fn(),
}));

// `ExerciseCard` (rendered by the real `/workout/active` route once
// re-presented) reaches `@/lib/files`'s real top-level native imports —
// mocked here for the same reason every other consumer of that seam mocks
// it (`ActiveWorkoutScreen.test.tsx` et al.).
jest.mock('@/lib/files');

// `KeepAwakeGate` (M2-13) — a **factory** mock: `expo-keep-awake`'s own
// `ExpoKeepAwake.ts` calls `requireNativeModule('ExpoKeepAwake')`
// synchronously at import time (unlinked under Jest, no `jest-expo` mock
// fallback exists for it), and even a bare `jest.mock('expo-keep-awake')`
// still has to load the real module once to learn its shape — see
// `KeepAwakeGate.test.tsx`'s own header for the full explanation.
jest.mock('expo-keep-awake', () => ({
  useKeepAwake: jest.fn(),
}));

const mockRunDbBoot = runDbBoot as jest.MockedFunction<typeof runDbBoot>;
const mockGetAppDriver = getAppDriver as jest.MockedFunction<typeof getAppDriver>;

describe('resume on launch shows the mini-bar, not the full logger (M2-13)', () => {
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

  // 15000 ms, matching `tabs-layout.test.tsx`'s own note: `renderRouter`
  // cold-builds the whole route tree via the require-context ponyfill and
  // was observed to flake under full-suite CPU contention at Jest's default
  // 5000 ms timeout.
  it(
    'boots to the tabs with the mini-bar visible, not the fullscreen logger',
    async () => {
      const workoutRepo = new WorkoutRepositoryImpl(driver, {});
      await workoutRepo.startEmpty({ title: 'Resumed Session', startTime: Date.now() - 90_000 });

      await renderRouter('app', { initialUrl: '/' });

      // Tabs render (the Workout tab's own empty state, since the seeded
      // workout has no exercises to browse yet) — proving we're on the tab
      // shell, not the fullScreenModal logger (which would show
      // "screen-title"/"screen-finish", not this empty-state copy). M3-02
      // update: the real routines hub replaced the placeholder.
      expect(await screen.findByText('No routines yet')).toBeTruthy();

      // The mini-bar itself, showing the resumed workout's title.
      expect(await screen.findByTestId('global-workout-bar')).toBeTruthy();
      expect(screen.getByTestId('global-workout-bar-title')).toHaveTextContent('Resumed Session');

      // The full logger's own header is NOT on screen.
      expect(screen.queryByTestId('active-workout-title')).toBeNull();
    },
    15000,
  );

  it(
    'tapping the mini-bar re-presents the real /workout/active logger',
    async () => {
      const workoutRepo = new WorkoutRepositoryImpl(driver, {});
      await workoutRepo.startEmpty({ title: 'Resumed Session', startTime: Date.now() - 90_000 });

      await renderRouter('app', { initialUrl: '/' });
      await screen.findByTestId('global-workout-bar');

      await act(async () => {
        fireEvent.press(screen.getByTestId('global-workout-bar'));
      });

      expect(await screen.findByTestId('active-workout-title')).toHaveTextContent('Resumed Session');
    },
    15000,
  );
});
