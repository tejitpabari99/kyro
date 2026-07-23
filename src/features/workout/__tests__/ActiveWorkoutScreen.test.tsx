/**
 * `ActiveWorkoutScreen` behavioral tests (M2-05 acceptance gate, 02 §1–2) —
 * run against the real `WorkoutRepositoryImpl`/`ExerciseRepositoryImpl` over
 * `better-sqlite3` (never mocked, 08 §5), bound to the real
 * `useActiveWorkoutStore`/`useSettingsStore` singletons — same convention
 * `ExerciseSetTableSection.test.tsx` (M2-06) established, since this screen
 * imports both singletons directly (matching how the real app wires
 * screens; no store-instance prop threading needed).
 *
 * Covers: empty start renders with the correct auto-title; stopwatch
 * ticks upward for a normal start and stays frozen at 0 for retro mode;
 * duration/pause edits persist to the store+DB; discard clears the active
 * workout after a confirm; both-themes smoke.
 *
 * ## Fake timers vs. the async DB-backed mount effect (read before adding a case)
 *
 * `useWorkoutStopwatch`'s own `setInterval` and this screen's mount effect
 * (auto `startEmpty` on an empty start) don't mix safely under one fake-timer
 * regime: Jest's modern fake timers only fake timer/Date APIs, not Promise
 * microtasks, so the DB round-trip itself still resolves fine — but
 * `waitFor`/`findBy*`'s own internal polling depends on real timers unless
 * explicitly driven. Every "ticking" case below therefore **pre-seeds** the
 * active workout directly via the repository/store *before* rendering (so
 * the mount effect's `workout` check short-circuits immediately, no
 * DB-round-trip-during-fake-timers involved) and only then engages fake
 * timers for the tick assertion. The "auto-title" and "duration/pause
 * persist" cases instead render with **real** timers and `await
 * waitFor(...)`, exercising the actual mount-effect DB round trip.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import type { ExerciseRepository } from '@/data/exercises/types';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { migrate } from '@/data/sqlite/migrator';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import type { WorkoutFull, WorkoutRepository } from '@/data/workouts/types';
import { autoTitleForDate } from '@/domain/auto-title';
import { useSettingsStore } from '@/features/settings/settings-store';
import { SettingsRepository } from '@/data/settings/settings-repository';
import { ThemeProvider } from '@/ui/theme-provider';

import { ActiveWorkoutScreen } from '../ActiveWorkoutScreen';
import { useActiveWorkoutStore } from '../activeWorkoutStore';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

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
  // `settingsStore` reads its own singleton driver-independent state — a
  // fresh in-memory driver has no `settings` rows yet, so `load()` just
  // seeds `SETTINGS_DEFAULTS` (weight_unit 'kg' etc.), exactly what every
  // test here wants.
  await useSettingsStore.getState().load(new SettingsRepository(driver));
}

function renderScreen(
  exerciseRepo: ExerciseRepository,
  overrides: Partial<React.ComponentProps<typeof ActiveWorkoutScreen>> = {},
  theme: 'dark' | 'light' = 'dark',
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider preference={theme}>
        <ActiveWorkoutScreen testID="screen" exerciseRepository={exerciseRepo} {...overrides} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

/**
 * Finds the button labeled `label` in the most recent `Alert.alert` call and
 * invokes its `onPress` (a genuine no-op if the button — e.g. a plain
 * `{ text: 'Cancel', style: 'cancel' }` — carries no `onPress` at all,
 * matching real `Alert.alert` semantics: only the label must exist).
 * `Alert.alert`'s buttons are plain callbacks, not RN event handlers
 * `fireEvent` can wrap — invoked here inside an explicit `act(async () =>
 * ...)` (mirroring what `fireEvent`'s own async wrapper does internally,
 * `node_modules/@testing-library/react-native/dist/fire-event.js`) so any
 * store write the button triggers is fully flushed, and its own `act`
 * scope properly closed, before the caller's next assertion or the next
 * test's `render()` — un-awaited act scopes here were observed to corrupt
 * React's act-queue bookkeeping for every subsequent test in this file
 * (full-suite run only; each test alone was fine).
 */
async function pressAlertButton(label: string): Promise<void> {
  const alertMock = Alert.alert as jest.Mock;
  const lastCall = alertMock.mock.calls[alertMock.mock.calls.length - 1];
  const buttons = lastCall[2] as { text: string; onPress?: () => void }[];
  const button = buttons.find((b) => b.text === label);
  if (!button) {
    throw new Error(`No "${label}" button was found.`);
  }
  await act(async () => {
    button.onPress?.();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ActiveWorkoutScreen — empty start (02 §1)', () => {
  it('auto-starts an empty workout on mount with the correct time-of-day title', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);

    await renderScreen(exerciseRepo);

    const expectedTitle = autoTitleForDate(new Date());
    await waitFor(() => expect(screen.getByTestId('screen-title')).toBeTruthy());
    expect(screen.getByText(expectedTitle)).toBeTruthy();

    // Persisted, not just drafted in memory.
    const active = await workoutRepo.getActive();
    expect(active?.title).toBe(expectedTitle);
    expect(active?.exercises).toEqual([]);
  });

  // `rerender` swaps in a *second* `QueryClientProvider` below — it must
  // carry the same `gcTime: 0` override every `QueryClient` in this file
  // uses (see `renderScreen`): a default-options `QueryClient` schedules a
  // real 5-minute `setTimeout` once a query becomes unobserved, which this
  // test's own eventual unmount would trigger — the exact "Jest did not
  // exit" pitfall M1-07's `ExerciseBrowseScreen.test.tsx` already diagnosed
  // and fixed once (see its EXECUTION-LOG entry); reproduced and re-fixed
  // here after tracking down a real hang while writing this suite.
  it('does not double-start when the effect re-runs (e.g. a settings-driven re-render)', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);

    const { rerender } = await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-title')).toBeTruthy());

    await act(async () => {
      rerender(
        <QueryClientProvider
          client={new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } })}
        >
          <ThemeProvider preference="dark">
            <ActiveWorkoutScreen testID="screen" exerciseRepository={exerciseRepo} />
          </ThemeProvider>
        </QueryClientProvider>,
      );
    });

    const rows = driver.queryAll<{ id: string }>("SELECT id FROM workouts WHERE state = 'active'");
    expect(rows.length).toBe(1);
  });
});

describe('ActiveWorkoutScreen — stopwatch (02 §2, §6.1)', () => {
  it('ticks upward for a normal (non-retro) start', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    // Pre-seed (see file header) so the mount effect no-ops and only the
    // stopwatch's own interval is exercised under fake timers.
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });

    jest.useFakeTimers();
    await renderScreen(exerciseRepo);

    expect(screen.getByText('0:00')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    expect(screen.getByText('0:05')).toBeTruthy();
  });

  it('retro mode renders paused at 0 and never ticks (02 §1 retro-log)', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    const pastNoon = new Date();
    pastNoon.setHours(12, 0, 0, 0);
    await useActiveWorkoutStore
      .getState()
      .startEmpty({ title: 'Retro Workout', startTime: pastNoon.getTime() });

    jest.useFakeTimers();
    await renderScreen(exerciseRepo, { retro: true });

    expect(screen.getByText('0:00')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(10_000);
    });
    expect(screen.getByText('0:00')).toBeTruthy();
  });
});

describe('ActiveWorkoutScreen — duration/pause edits persist (02 §2)', () => {
  it('editing duration via the sheet updates the store and the DB', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    const started = await useActiveWorkoutStore
      .getState()
      .startEmpty({ title: 'Test Workout', startTime: Date.now() - 60_000 });

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-duration')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('screen-duration'));
    await waitFor(() => expect(screen.getByTestId('screen-duration-sheet')).toBeTruthy());

    await fireEvent.changeText(screen.getByTestId('screen-duration-sheet-minutes'), '10');
    await fireEvent.press(screen.getByTestId('screen-duration-sheet-save-duration'));

    await waitFor(() => {
      const workout = useActiveWorkoutStore.getState().workout;
      expect(workout?.startTime).not.toBe(started!.startTime);
    });

    const persisted = await workoutRepo.getFull(started!.id);
    expect(persisted?.startTime).toBe(useActiveWorkoutStore.getState().workout?.startTime);
  });

  it('editing start time via the sheet updates the store and the DB', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    const started = await useActiveWorkoutStore
      .getState()
      .startEmpty({ title: 'Test Workout', startTime: Date.now() });

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-duration')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('screen-duration'));
    await waitFor(() => expect(screen.getByTestId('screen-duration-sheet')).toBeTruthy());

    await fireEvent.changeText(screen.getByTestId('screen-duration-sheet-hour'), '05');
    await fireEvent.changeText(screen.getByTestId('screen-duration-sheet-minute'), '30');
    await fireEvent.press(screen.getByTestId('screen-duration-sheet-save-start-time'));

    await waitFor(() => {
      const workout = useActiveWorkoutStore.getState().workout;
      expect(workout?.startTime).not.toBe(started!.startTime);
    });

    const persisted = await workoutRepo.getFull(started!.id);
    expect(persisted?.startTime).toBe(useActiveWorkoutStore.getState().workout?.startTime);
  });

  it('pause then resume persists an accumulated pause offset', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    const started = await useActiveWorkoutStore
      .getState()
      .startEmpty({ title: 'Test Workout', startTime: Date.now() - 5000 });

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-duration')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('screen-duration'));
    await waitFor(() => expect(screen.getByTestId('screen-duration-sheet')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('screen-duration-sheet-pause-resume'));
    await waitFor(() =>
      expect(screen.getByTestId('screen-duration-sheet-pause-resume')).toHaveTextContent(
        'Resume Workout',
      ),
    );
    await fireEvent.press(screen.getByTestId('screen-duration-sheet-pause-resume'));

    await waitFor(() => {
      const workout = useActiveWorkoutStore.getState().workout;
      expect(workout?.durationPauseOffsetMs).toBeGreaterThan(0);
    });

    const persisted = await workoutRepo.getFull(started!.id);
    expect(persisted?.durationPauseOffsetMs).toBe(
      useActiveWorkoutStore.getState().workout?.durationPauseOffsetMs,
    );
  });
});

describe('ActiveWorkoutScreen — title inline edit', () => {
  it('tapping the title, editing, and submitting persists the new title', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Old Title', startTime: Date.now() });

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-title')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('screen-title'));
    const input = await screen.findByTestId('screen-title-input');
    await fireEvent.changeText(input, 'New Title');
    await fireEvent(input, 'submitEditing');

    await waitFor(() => expect(useActiveWorkoutStore.getState().workout?.title).toBe('New Title'));
    expect(screen.getByText('New Title')).toBeTruthy();
  });

  it('committing an empty/unchanged title is a no-op (keeps the original title)', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Kept Title', startTime: Date.now() });

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-title')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('screen-title'));
    const input = await screen.findByTestId('screen-title-input');
    await fireEvent.changeText(input, '   ');
    await fireEvent(input, 'submitEditing');

    await waitFor(() => expect(screen.queryByTestId('screen-title-input')).toBeNull());
    expect(useActiveWorkoutStore.getState().workout?.title).toBe('Kept Title');
    expect(screen.getByText('Kept Title')).toBeTruthy();
  });
});

describe('ActiveWorkoutScreen — discard flow (02 §2, §10)', () => {
  it('Discard Workout shows a confirm; confirming clears the active workout and minimizes', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-discard')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('screen-discard'));
    expect(Alert.alert).toHaveBeenCalledWith(
      'Discard workout?',
      'All entered data will be lost.',
      expect.any(Array),
    );
    await pressAlertButton('Discard');

    await waitFor(() => expect(useActiveWorkoutStore.getState().workout).toBeNull());
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(await workoutRepo.getActive()).toBeNull();
  });

  it('Discard Workout — Cancel leaves the workout intact', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-discard')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('screen-discard'));
    await pressAlertButton('Cancel');

    expect(useActiveWorkoutStore.getState().workout).not.toBeNull();
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe('ActiveWorkoutScreen — header/footer stub affordances', () => {
  it('minimize (chevron) calls router.back()', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-minimize')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('screen-minimize'));
    expect(router.back).toHaveBeenCalled();
  });

  it('Finish/Add Exercise/Settings surface their M2-14/M2-09/M2-17 stub alerts', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-finish')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('screen-finish'));
    expect(Alert.alert).toHaveBeenCalledWith('Finish Workout', 'The finish flow arrives in M2-14.');

    await fireEvent.press(screen.getByTestId('screen-add-exercise'));
    expect(Alert.alert).toHaveBeenCalledWith('Add Exercise', 'The exercise picker arrives in M2-09.');

    await fireEvent.press(screen.getByTestId('screen-settings'));
    expect(Alert.alert).toHaveBeenCalledWith('Workout Settings', 'Workout settings arrive in M2-17.');
  });
});

describe('ActiveWorkoutScreen — meta row counters (02 §2)', () => {
  it('renders an added exercise via ExerciseSetTableSection and counts a checked set', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });

    const exercise = await exerciseRepo.create({
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
      usesCustomMetric: false,
    });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);
    await useActiveWorkoutStore.getState().updateSet(added!.sets[0]!.id, { weightKg: 60, reps: 8 });
    await useActiveWorkoutStore.getState().setCompleted(added!.sets[0]!.id, true);

    await renderScreen(exerciseRepo);

    await waitFor(() => expect(screen.getByText('Bench Press')).toBeTruthy());
    // Sets counter: 1 checked set.
    expect(within(screen.getByTestId('screen-sets')).getByText('1')).toBeTruthy();
    // Volume: 60 kg x 8 reps (weight_reps formula, 04 §4.2) = 480 kg.
    expect(within(screen.getByTestId('screen-volume')).getByText('480 kg')).toBeTruthy();
  });
});

describe('ActiveWorkoutScreen — smoke render (both themes)', () => {
  it('renders in dark theme', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });

    await renderScreen(exerciseRepo, {}, 'dark');
    await waitFor(() => expect(screen.getByTestId('screen')).toBeTruthy());
  });

  it('renders in light theme', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });

    await renderScreen(exerciseRepo, {}, 'light');
    await waitFor(() => expect(screen.getByTestId('screen')).toBeTruthy());
  });

  it('shows a loading state before the workout exists', async () => {
    // better-sqlite3 resolves near-instantly, so racing the real mount
    // effect's `startEmpty()` round trip against a synchronous assertion
    // would be flaky (it can easily settle before this line runs). A
    // repository whose `startEmpty` never resolves freezes the screen in
    // the pre-workout state deterministically instead.
    const { exerciseRepo } = setup();
    const hangingRepo: WorkoutRepository = {
      getActive: () => Promise.resolve(null),
      startEmpty: () => new Promise<WorkoutFull>(() => {}),
      startFromRoutine: () => Promise.reject(new Error('not used')),
      discard: () => Promise.reject(new Error('not used')),
      finish: () => Promise.reject(new Error('not used')),
      getFull: () => Promise.resolve(null),
      listCompleted: () => Promise.resolve([]),
      softDelete: () => Promise.reject(new Error('not used')),
      addExercises: () => Promise.reject(new Error('not used')),
      removeExercise: () => Promise.reject(new Error('not used')),
      reorderExercises: () => Promise.reject(new Error('not used')),
      replaceExercise: () => Promise.reject(new Error('not used')),
      addSet: () => Promise.reject(new Error('not used')),
      updateSet: () => Promise.reject(new Error('not used')),
      removeSet: () => Promise.reject(new Error('not used')),
      setSetType: () => Promise.reject(new Error('not used')),
      setCompleted: () => Promise.reject(new Error('not used')),
      updateExercise: () => Promise.reject(new Error('not used')),
      updateMeta: () => Promise.reject(new Error('not used')),
      previousSets: () => Promise.resolve([]),
    };
    await useActiveWorkoutStore.getState().rehydrate(hangingRepo);

    await renderScreen(exerciseRepo);
    expect(screen.getByText('Starting workout…')).toBeTruthy();
  });
});
