/**
 * `ActiveWorkoutScreen` minimize/resume/keep-awake tests (M2-13, 02 §10,
 * 06 §3/§6.3). Companion to `ActiveWorkoutScreen.test.tsx` (M2-05) — kept in
 * its own file since this task's concerns (logger-visibility tracking,
 * swipe-down-to-minimize, keep-awake gating) are orthogonal to that file's
 * own stopwatch/discard/auto-title coverage, mirroring
 * `ActiveWorkoutScreen.smart-scroll.test.tsx`'s (M2-12) precedent of a
 * dedicated per-task file for the same screen.
 *
 * Real `WorkoutRepositoryImpl`/`ExerciseRepositoryImpl` over in-memory
 * `better-sqlite3` (08 §5, never mocked), bound to the real
 * `useActiveWorkoutStore`/`useSettingsStore`/`useLoggerVisibilityStore`
 * singletons — same convention `ActiveWorkoutScreen.test.tsx` established.
 *
 * **Testing the swipe-down gesture:** `react-native-gesture-handler`'s own
 * `jestSetup.js` (wired via `jest.config.js`'s `setupFiles`) only mocks the
 * native module + `GestureButtons`/`Pressable` — `GestureDetector`/
 * `Gesture.Pan()` remain the library's real, pure-JS implementation, which
 * means a real pan touch sequence can't be *simulated* under Jest (no native
 * gesture-recognition driver exists here), matching this repo's existing
 * precedent (`Sheet.tsx`/`SetRow.tsx` both build the identical
 * `Gesture.Pan()` + `GestureDetector` shape and neither is drive-tested via
 * a simulated touch anywhere in this codebase's test suite). This file
 * instead partially mocks `react-native-gesture-handler` to capture the
 * `gesture` prop `ActiveWorkoutScreen` passes to its header's
 * `GestureDetector`, then invokes that gesture's own `.handlers.onEnd(...)`
 * directly — confirmed via reading `Gesture.Pan().onEnd(callback)`'s actual
 * implementation (`node_modules/react-native-gesture-handler/lib/commonjs/
 * handlers/gestures/gesture.js`): `.onEnd()` stores `callback` verbatim at
 * `this.handlers.onEnd`, so invoking it directly with a synthetic `{
 * translationY }` event runs the exact same code the real native gesture
 * driver would call on release, without needing to fake touch delivery.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import type { ExerciseRepository } from '@/data/exercises/types';
import { SettingsRepository } from '@/data/settings/settings-repository';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { migrate } from '@/data/sqlite/migrator';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import { useSettingsStore } from '@/features/settings/settings-store';
import { ThemeProvider } from '@/ui/theme-provider';

import { ActiveWorkoutScreen } from '../ActiveWorkoutScreen';
import { useActiveWorkoutStore } from '../activeWorkoutStore';
import { useLoggerVisibilityStore } from '../loggerVisibilityStore';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
  useFocusEffect: () => {},
}));

jest.mock('@/lib/files');

// Factory mock, not `jest.requireActual`/a bare `jest.mock('expo-keep-awake')`
// — both still have to load the real module once, which throws
// (`requireNativeModule('ExpoKeepAwake')` fails synchronously at import
// time under Jest; see `KeepAwakeGate.test.tsx`'s own header for the full
// explanation). `mockUseKeepAwake` (not `useKeepAwakeMock`) so Jest's
// module-factory hoisting guard (out-of-scope-variable check) allows
// referencing it — variable names prefixed `mock` are the documented
// escape hatch.
jest.mock('expo-keep-awake', () => ({
  useKeepAwake: (...args: unknown[]) => mockUseKeepAwake(...args),
}));
const mockUseKeepAwake = jest.fn();

// Capturing the real gesture-handler `Gesture.Pan()` builder object; typing
// it precisely would require importing gesture-handler's own (large,
// partly-internal) type surface for no real benefit in a test file.
let capturedHeaderGesture: any;

jest.mock('react-native-gesture-handler', () => {
  const actual = jest.requireActual('react-native-gesture-handler');
  return {
    ...actual,
    GestureDetector: ({ gesture, children }: { gesture: unknown; children: React.ReactNode }) => {
      capturedHeaderGesture = gesture;
      return children;
    },
  };
});

interface Fixture {
  driver: SqliteDriver;
  workoutRepo: WorkoutRepositoryImpl;
  exerciseRepo: ExerciseRepository;
}

function setup(): Fixture {
  const driver = openBetterSqlite3Driver(':memory:');
  migrate(driver);
  const workoutRepo = new WorkoutRepositoryImpl(driver, {});
  const exerciseRepo = new ExerciseRepositoryImpl(driver);
  return { driver, workoutRepo, exerciseRepo };
}

async function rehydrateStores(workoutRepo: WorkoutRepositoryImpl, driver: SqliteDriver): Promise<void> {
  await useActiveWorkoutStore.getState().rehydrate(workoutRepo);
  await useSettingsStore.getState().load(new SettingsRepository(driver));
}

function renderScreen(exerciseRepo: ExerciseRepository) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider preference="dark">
        <ActiveWorkoutScreen testID="screen" exerciseRepository={exerciseRepo} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  capturedHeaderGesture = undefined;
});

afterEach(async () => {
  // `await act(async () => ...)`, never a bare sync `act(() => ...)` — a
  // bare one here was observed (while writing this suite) to corrupt
  // React's act-queue bookkeeping badly enough that every subsequent
  // test's own `render()` never settled (its `findByTestId` calls all
  // timed out) — the same class of cross-test corruption
  // `ActiveWorkoutScreen.test.tsx`'s own header documents and fixes the
  // identical way; see also `useForegroundReconciliation.test.ts`'s
  // identical note.
  await act(async () => {
    useLoggerVisibilityStore.setState({ visible: false });
  });
});

describe('ActiveWorkoutScreen — logger-visibility tracking (M2-13, 06 §3)', () => {
  it('flips loggerVisibilityStore.visible true on mount and false on unmount', async () => {
    const { workoutRepo, exerciseRepo, driver } = setup();
    await rehydrateStores(workoutRepo, driver);

    expect(useLoggerVisibilityStore.getState().visible).toBe(false);

    const result = await renderScreen(exerciseRepo);
    await screen.findByTestId('screen');
    expect(useLoggerVisibilityStore.getState().visible).toBe(true);

    await act(async () => {
      result.unmount();
    });
    expect(useLoggerVisibilityStore.getState().visible).toBe(false);

    driver.close();
  });

  it('is visible even before the workout itself has loaded (the "Starting workout…" window)', async () => {
    const { workoutRepo, exerciseRepo, driver } = setup();
    await rehydrateStores(workoutRepo, driver);
    // Deliberately not awaiting the mount effect's `startEmpty` before
    // asserting — this is the loading window itself.
    await renderScreen(exerciseRepo);
    expect(useLoggerVisibilityStore.getState().visible).toBe(true);
    driver.close();
  });
});

describe('ActiveWorkoutScreen — chevron minimize (M2-13, 02 §10)', () => {
  it('the chevron button still calls router.back()', async () => {
    const { workoutRepo, exerciseRepo, driver } = setup();
    await rehydrateStores(workoutRepo, driver);
    await renderScreen(exerciseRepo);
    await screen.findByTestId('screen-title');

    fireEvent.press(screen.getByTestId('screen-minimize'));
    expect(router.back).toHaveBeenCalledTimes(1);

    driver.close();
  });
});

describe('ActiveWorkoutScreen — swipe-down-to-minimize (M2-13, 02 §10)', () => {
  it('a downward swipe past the threshold on the header calls router.back()', async () => {
    const { workoutRepo, exerciseRepo, driver } = setup();
    await rehydrateStores(workoutRepo, driver);
    await renderScreen(exerciseRepo);
    await screen.findByTestId('screen-title');

    expect(capturedHeaderGesture).toBeDefined();
    expect(capturedHeaderGesture.handlers.onEnd).toBeInstanceOf(Function);

    await act(async () => {
      capturedHeaderGesture.handlers.onEnd({ translationY: 150 });
    });

    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));

    driver.close();
  });

  it('a small downward drag below the threshold does NOT minimize', async () => {
    const { workoutRepo, exerciseRepo, driver } = setup();
    await rehydrateStores(workoutRepo, driver);
    await renderScreen(exerciseRepo);
    await screen.findByTestId('screen-title');

    await act(async () => {
      capturedHeaderGesture.handlers.onEnd({ translationY: 20 });
    });

    expect(router.back).not.toHaveBeenCalled();

    driver.close();
  });

  it('an upward swipe (negative translationY) does NOT minimize', async () => {
    const { workoutRepo, exerciseRepo, driver } = setup();
    await rehydrateStores(workoutRepo, driver);
    await renderScreen(exerciseRepo);
    await screen.findByTestId('screen-title');

    await act(async () => {
      capturedHeaderGesture.handlers.onEnd({ translationY: -200 });
    });

    expect(router.back).not.toHaveBeenCalled();

    driver.close();
  });
});

describe('ActiveWorkoutScreen — useKeepAwake gating (M2-13, 06 §6.3)', () => {
  it('activates keep-awake when the keep_awake setting is on (the default)', async () => {
    const { workoutRepo, exerciseRepo, driver } = setup();
    await rehydrateStores(workoutRepo, driver);
    expect(useSettingsStore.getState().settings.keep_awake).toBe(true);

    await renderScreen(exerciseRepo);
    await screen.findByTestId('screen-title');

    expect(mockUseKeepAwake).toHaveBeenCalled();

    driver.close();
  });

  it('does not activate keep-awake when the keep_awake setting is off', async () => {
    const { workoutRepo, exerciseRepo, driver } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useSettingsStore.getState().setSetting('keep_awake', false);

    await renderScreen(exerciseRepo);
    await screen.findByTestId('screen-title');

    expect(mockUseKeepAwake).not.toHaveBeenCalled();

    driver.close();
  });
});
