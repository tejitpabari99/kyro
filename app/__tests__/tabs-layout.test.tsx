/**
 * Tab shell smoke test (M0-08 acceptance gate): "app boots to tabs ...
 * all 4 tabs navigable ... RNTL smoke on the tab layout itself."
 *
 * `renderRouter` (expo-router/testing-library) builds the real navigation
 * tree from the actual `app/` directory (via a require-context ponyfill —
 * see `node_modules/expo-router/build/testing-library/require-context-
 * ponyfill.js`) and renders it through the project's real root layout
 * (providers included), so this exercises the genuine route tree rather
 * than a hand-rolled stand-in — the closest thing to "boots on a
 * simulator" available without one (see M0-08's report for the
 * `expo export` bundling-only verification that stands in for a real
 * device boot).
 *
 * `renderRouter` must be **awaited**: `@testing-library/react-native`
 * 14's `render()` is `async`, but `expo-router`'s `renderRouter` helper
 * (56.2.15) does not await its internal `render()` call before attaching
 * its extra `getPathname`/etc. helpers and returning — the returned value
 * is the still-pending render `Promise` with those helpers tacked on as
 * own properties. Querying `screen` before that promise settles hits
 * RNTL's `defaultScreen` stub (every query method throws "`render`
 * function has not been called" — see `@testing-library/react-native`'s
 * `dist/screen.js`), since `setRenderResult` only runs once the async
 * `render()` actually finishes. Awaiting the `renderRouter(...)` call
 * fixes this (matches every other RNTL test in this repo already
 * `await render(...)`-ing for the same reason).
 */
import { renderRouter, screen } from 'expo-router/testing-library';

// M0-09 update: the root layout now gates the `<Stack>` on
// `@/data/sqlite/boot`'s `runDbBoot()` (06 §5.1). Mocked here (resolved) so
// this smoke test still exercises the real tab tree — the gate's own
// pending/error paths get dedicated coverage in `db-gate.test.tsx`. A
// factory mock (not bare `jest.mock('@/data/sqlite/boot')`) is required:
// automocking without one still `require`s the real module first, which
// would pull in `expo-sqlite`'s native module (unavailable under Jest, 08
// §5 — see `db-gate.test.tsx`'s header for the full explanation).
// M0-10 update: the root layout now also loads `settingsStore` from
// `SettingsRepository(getAppDriver())` before flipping the gate to `ready`
// (see `db-gate.test.tsx`'s `fakeEmptySettingsDriver` for why `getAppDriver`
// needs a working (empty-result) driver stub, not just `jest.fn()`).
jest.mock('@/data/sqlite/boot', () => ({
  runDbBoot: jest.fn().mockResolvedValue({ fromVersion: 0, toVersion: 1, applied: [] }),
  getAppDriver: jest.fn().mockReturnValue({
    dialect: 'better-sqlite3',
    execute: jest.fn().mockReturnValue({ changes: 0, lastInsertRowId: 0 }),
    queryAll: jest.fn().mockReturnValue([]),
    transaction: jest.fn((fn: () => unknown) => fn()),
    close: jest.fn(),
  }),
}));

// The Exercises tab route (M1-07) renders `ExerciseRow`, whose thumbnail
// resolution (`resolveExerciseThumbnailSource`, fixed M1-12) now reaches
// `@/lib/files`'s real top-level native imports (`expo-image-manipulator`/
// `expo-image-picker`) — mocked here for the same reason
// `ExerciseBrowseScreen.test.tsx` mocks it.
jest.mock('@/lib/files');

describe('tab shell — boots to tabs, all 4 tabs navigable', () => {
  // M0-12 note: the default 5000 ms Jest test timeout was observed to flake
  // under full-suite (`pnpm run ci`) CPU contention specifically on the
  // first `renderRouter(...)` call in this file (~2.9s in isolation, timed
  // out under load) — `renderRouter` cold-builds the whole route tree via
  // the require-context ponyfill (see file header), so it is the most
  // CPU-sensitive render in the suite. Bumped to 15000 ms for every test in
  // this file (not just the first) since any of them can land first
  // depending on worker scheduling. Not a functional change.
  it(
    'redirects "/" to the Workout tab',
    async () => {
      await renderRouter('app', { initialUrl: '/' });
      // M3-02 update: the real routines hub replaced the placeholder. The
      // mocked driver's `queryAll` returns `[]` for everything (including
      // `RoutineRepository.listFolders()`/`list()`), so the hub legitimately
      // renders its empty state here — this smoke test only needs to prove
      // the route renders the real screen, not routines-hub behavior
      // (covered in `src/features/routines/__tests__/`).
      expect(await screen.findByText('No routines yet')).toBeTruthy();
    },
    15000,
  );

  it(
    'navigates to the Workout tab',
    async () => {
      await renderRouter('app', { initialUrl: '/workout' });
      expect(await screen.findByText('No routines yet')).toBeTruthy();
    },
    15000,
  );

  it(
    'navigates to the History tab',
    async () => {
      await renderRouter('app', { initialUrl: '/history' });
      expect(await screen.findByText('No workouts logged yet')).toBeTruthy();
    },
    15000,
  );

  it(
    'navigates to the Exercises tab',
    async () => {
      // M1-07 update: the real browse screen replaced the placeholder.
      // `getAppDriver`'s mock above returns an empty `queryAll(...)` result
      // for everything (including `ExerciseRepository.list()`), so the
      // screen legitimately renders its "no exercises" empty state here —
      // this smoke test only needs to prove the route renders the real
      // screen, not exercise real browse behavior (covered in
      // `src/features/exercises/__tests__/`).
      await renderRouter('app', { initialUrl: '/exercises' });
      expect(await screen.findByText('No exercises found')).toBeTruthy();
    },
    15000,
  );

  it(
    'navigates to the Profile tab',
    async () => {
      await renderRouter('app', { initialUrl: '/profile' });
      expect(await screen.findByText('Profile coming soon')).toBeTruthy();
    },
    15000,
  );
});
