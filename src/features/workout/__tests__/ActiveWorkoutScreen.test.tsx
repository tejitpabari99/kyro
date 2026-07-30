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
import { SafeAreaInsetsContext, type EdgeInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import type { ExerciseRepository } from '@/data/exercises/types';
import { RoutineRepositoryImpl } from '@/data/routines/routine-repository';
import type { RoutineFull } from '@/data/routines/types';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { migrate } from '@/data/sqlite/migrator';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import type { WorkoutFull, WorkoutRepository } from '@/data/workouts/types';
import { autoTitleForDate } from '@/domain/auto-title';
import { useSettingsStore } from '@/features/settings/settings-store';
import { SettingsRepository } from '@/data/settings/settings-repository';
import { ThemeProvider } from '@/ui/theme-provider';

import { cancelNotification } from '@/lib/notifications';

import { ActiveWorkoutScreen } from '../ActiveWorkoutScreen';
import { useActiveWorkoutStore } from '../activeWorkoutStore';
import { useRestTimerStore } from '../restTimerStore';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

// M2-14: the finish flow cancels any pending rest-timer notification
// (`restTimerStore.skip()`) — mocked here the same way `restTimerStore
// .test.tsx` (M2-10) mocks this native seam, so the finish-flow tests below
// can assert cancellation without touching the unavailable-under-Jest
// `expo-notifications` module (see `src/lib/notifications.ts`'s own header).
jest.mock('@/lib/notifications');

// M2-09: `ExerciseCard`'s name-tap opens `ExerciseDetailSheet`, which reuses
// the real `ExerciseDetailScreen` (M1-08) — that screen imports `@/lib/files`,
// whose own real top-level native imports (`expo-image-manipulator`/
// `expo-image-picker`) are unavailable under Jest (08 §5); mocked wholesale
// here the same way `ExerciseDetailScreen.test.tsx` (M1-10) already does for
// every other consumer of that seam.
jest.mock('@/lib/files');

// M2-13: `ActiveWorkoutScreen` now conditionally mounts `KeepAwakeGate`,
// which calls `expo-keep-awake`'s `useKeepAwake` — a **factory** mock, not a
// bare `jest.mock('expo-keep-awake')`: `expo-keep-awake`'s own
// `ExpoKeepAwake.ts` calls `requireNativeModule('ExpoKeepAwake')`
// synchronously at import time (its native module isn't linked under Jest,
// and unlike `@/lib/files`'s native imports, this one has no `jest-expo`
// mock fallback to fall back to — confirmed by reproducing the exact
// failure with a bare automock first), and even Jest's own automocking has
// to load the real module once to learn its shape — so a bare `jest.mock`
// call still throws. A factory sidesteps that entirely by never touching
// the real module (see `KeepAwakeGate.test.tsx`'s own header for the full
// explanation).
jest.mock('expo-keep-awake', () => ({
  useKeepAwake: jest.fn(),
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

async function renderScreen(
  exerciseRepo: ExerciseRepository,
  overrides: Partial<React.ComponentProps<typeof ActiveWorkoutScreen>> = {},
  theme: 'dark' | 'light' = 'dark',
  insetsOverride?: EdgeInsets,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  const tree = (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider preference={theme}>
        <ActiveWorkoutScreen testID="screen" exerciseRepository={exerciseRepo} {...overrides} />
      </ThemeProvider>
    </QueryClientProvider>
  );
  const result = await render(
    insetsOverride ? (
      <SafeAreaInsetsContext.Provider value={insetsOverride}>{tree}</SafeAreaInsetsContext.Provider>
    ) : (
      tree
    ),
  );
  // Spread so every existing `await renderScreen(...)`/`const { rerender } =
  // await renderScreen(...)` call site keeps working unchanged — `queryClient`
  // is additive, read only by the M2-14 finish-flow cases below (asserting
  // `invalidateQueries` was called with the `['history']` key).
  return { ...result, queryClient };
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

describe('ActiveWorkoutScreen — routine-start (M3-05, 02 §1)', () => {
  it('auto-starts a workout from the routine on mount: title/exercises pre-populated, nothing pre-checked', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    const routineRepo = new RoutineRepositoryImpl(driver);
    const exercise = await exerciseRepo.create({
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
    });
    const routine = await routineRepo.create({
      title: 'Push Day',
      exercises: [{ exerciseId: exercise.id, sets: [{ setType: 'normal', weightKg: 60, reps: 8 }] }],
    });

    await renderScreen(exerciseRepo, {
      routineId: routine.id,
      getRoutineFull: (id) => routineRepo.getFull(id),
    });

    await waitFor(() => expect(screen.getByTestId('screen-title')).toBeTruthy());
    expect(screen.getByText('Push Day')).toBeTruthy();

    const active = await workoutRepo.getActive();
    expect(active?.routineId).toBe(routine.id);
    expect(active?.title).toBe('Push Day');
    expect(active?.exercises).toHaveLength(1);
    expect(active?.exercises[0]!.sets[0]!.isCompleted).toBe(false);
    expect(active?.exercises[0]!.sets[0]!.weightKg).toBeNull();
  });

  it('resuming an already-active workout ignores routineId — no second workout is started', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    const routineRepo = new RoutineRepositoryImpl(driver);
    const routine = await routineRepo.create({ title: 'Push Day' });
    const existing = await workoutRepo.startEmpty({ title: 'Already Active', startTime: Date.now() });
    await useActiveWorkoutStore.getState().rehydrate(workoutRepo);

    await renderScreen(exerciseRepo, {
      routineId: routine.id,
      getRoutineFull: (id) => routineRepo.getFull(id),
    });

    await waitFor(() => expect(screen.getByTestId('screen-title')).toBeTruthy());
    expect(screen.getByText('Already Active')).toBeTruthy();

    const rows = driver.queryAll<{ id: string }>("SELECT id FROM workouts WHERE state = 'active'");
    expect(rows.length).toBe(1);
    expect(rows[0]!.id).toBe(existing.id);
  });

  // Review-fix regression (occurrence-index-must-survive-reorder): the
  // original M3-05 landing recomputed each workout exercise's routine
  // occurrence live from the workout's *current* position order on every
  // render — correct immediately after start, but cross-wired once a
  // mid-workout reorder flipped the relative order of two workout
  // instances of the *same* duplicated exercise. Fixed by pinning
  // `routine_occurrence_index` onto each row once, at `startFromRoutine`
  // creation time (`workout-repository.ts`'s header has the full writeup).
  it('a duplicated exercise keeps showing its own routine target after a mid-workout reorder flips the two instances (M3-05 review fix)', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    const routineRepo = new RoutineRepositoryImpl(driver);
    const exercise = await exerciseRepo.create({
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
    });
    // Same exercise twice in one routine, different targets — the exact
    // shape 02 §16.6/§6 already calls out for PREVIOUS matching, and the
    // one this occurrence-index scheme exists to handle for routine targets.
    const routine = await routineRepo.create({
      title: 'Push Day',
      exercises: [
        { exerciseId: exercise.id, sets: [{ setType: 'normal', weightKg: 60, reps: 8 }] },
        { exerciseId: exercise.id, sets: [{ setType: 'normal', weightKg: 40, reps: 12 }] },
      ],
    });

    await renderScreen(exerciseRepo, {
      routineId: routine.id,
      getRoutineFull: (id) => routineRepo.getFull(id),
    });
    await waitFor(() => expect(screen.getByTestId('screen-title')).toBeTruthy());

    const active = await workoutRepo.getActive();
    const [firstWorkoutExercise, secondWorkoutExercise] = active!.exercises;

    // Before any reorder: first card (routine occurrence 0) shows 60kg x 8,
    // second card (occurrence 1) shows 40kg x 12 — position order still
    // matches the routine's own order at this point either way.
    await waitFor(() => expect(screen.getByText('60kg × 8')).toBeTruthy());
    expect(screen.getByText('40kg × 12')).toBeTruthy();

    // Flip the two workout instances' relative order — the source routine's
    // own exercise order is untouched by this, only the *workout's*.
    await act(async () => {
      await useActiveWorkoutStore
        .getState()
        .reorderExercises([secondWorkoutExercise!.id, firstWorkoutExercise!.id]);
    });

    // Each workout exercise must still show its OWN original routine
    // target — never the other occurrence's, regardless of the new display
    // order. (The bug this regresses: a live "current position order"
    // occurrence computation would have swapped these two targets here.)
    await waitFor(() => expect(screen.getByText('60kg × 8')).toBeTruthy());
    expect(screen.getByText('40kg × 12')).toBeTruthy();

    const firstCard = screen.getByTestId(`screen-exercise-${firstWorkoutExercise!.id}`);
    const secondCard = screen.getByTestId(`screen-exercise-${secondWorkoutExercise!.id}`);
    expect(within(firstCard).getByText('60kg × 8')).toBeTruthy();
    expect(within(secondCard).getByText('40kg × 12')).toBeTruthy();
  });
});

describe('ActiveWorkoutScreen — repeat-workout (M3-07, 02 §1)', () => {
  it('auto-starts a workout from a past workout on mount: title/exercises pre-populated, nothing pre-checked, no routineId', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    const exercise = await exerciseRepo.create({
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
    });

    // Raw-SQL fixture for a completed source workout — same reasoning
    // `workout-repository.lifecycle.test.ts`'s own fixture helpers give:
    // there is no public repository method to insert an already-completed
    // workout directly.
    const sourceWorkoutId = 'source-workout-1';
    const now = Date.now();
    driver.execute(
      `INSERT INTO workouts (id, title, description, state, start_time, end_time, created_at, updated_at)
       VALUES (?, 'Push Day', 'Felt strong', 'completed', ?, ?, ?, ?)`,
      [sourceWorkoutId, now - 100_000, now - 50_000, now - 100_000, now - 50_000],
    );
    driver.execute(
      `INSERT INTO workout_exercises (id, workout_id, exercise_id, position, superset_id, notes, rest_seconds)
       VALUES ('src-we-1', ?, ?, 0, NULL, NULL, NULL)`,
      [sourceWorkoutId, exercise.id],
    );
    driver.execute(
      `INSERT INTO sets (id, workout_exercise_id, position, set_type, weight_kg, reps, is_completed)
       VALUES ('src-set-1', 'src-we-1', 0, 'normal', 60, 8, 1)`,
    );

    await renderScreen(exerciseRepo, { repeatWorkoutId: sourceWorkoutId });

    await waitFor(() => expect(screen.getByTestId('screen-title')).toBeTruthy());
    expect(screen.getByText('Push Day')).toBeTruthy();

    const active = await workoutRepo.getActive();
    expect(active?.routineId).toBeNull();
    expect(active?.title).toBe('Push Day');
    expect(active?.description).toBe('Felt strong');
    expect(active?.exercises).toHaveLength(1);
    expect(active?.exercises[0]!.sets[0]!.isCompleted).toBe(false);
    expect(active?.exercises[0]!.sets[0]!.weightKg).toBeNull();
    expect(active?.exercises[0]!.sets[0]!.reps).toBeNull();

    // "Placeholders" proof (02 §1/§6 acceptance): PREVIOUS surfaces the
    // source workout's own achieved values with zero new plumbing — any
    // workout mode, since the new workout has no `routineId` — see
    // `workout-repository.ts`'s M3-07 header for the full "why" writeup.
    const previous = await workoutRepo.previousSets(exercise.id);
    expect(previous[0]).toMatchObject({ weightKg: 60, reps: 8, isWarmup: false, bucketIndex: 0 });
  });

  it('resuming an already-active workout ignores repeatWorkoutId — no second workout is started', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    const existing = await workoutRepo.startEmpty({ title: 'Already Active', startTime: Date.now() });
    await useActiveWorkoutStore.getState().rehydrate(workoutRepo);

    await renderScreen(exerciseRepo, { repeatWorkoutId: 'does-not-matter' });

    await waitFor(() => expect(screen.getByTestId('screen-title')).toBeTruthy());
    expect(screen.getByText('Already Active')).toBeTruthy();

    const rows = driver.queryAll<{ id: string }>("SELECT id FROM workouts WHERE state = 'active'");
    expect(rows.length).toBe(1);
    expect(rows[0]!.id).toBe(existing.id);
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

  // M2-19 exit-gate regression (see `ActiveWorkoutScreen.tsx`'s
  // `performDiscard` comment): confirming Discard Workout with a rest timer
  // running previously left that timer's notification scheduled — it would
  // fire later for a workout that no longer exists. `finish()`'s own
  // "cancel pending timer notification" contract (tested below) had a
  // regression test; `discard()`'s identical requirement never did.
  it('Discard Workout cancels any pending rest-timer notification', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });
    const { exerciseId, firstSetId } = await seedCheckedExercise(exerciseRepo, false);

    await useRestTimerStore.getState().start({
      exerciseId,
      setId: firstSetId,
      durationSeconds: 90,
      exerciseName: 'Bench Press',
      setNumber: 1,
      notificationsEnabled: true,
    });
    expect(useRestTimerStore.getState().timer).not.toBeNull();
    const pendingNotificationId = useRestTimerStore.getState().timer!.notificationId!;

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-discard')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('screen-discard'));
    await pressAlertButton('Discard');

    await waitFor(() => expect(useActiveWorkoutStore.getState().workout).toBeNull());
    expect(useRestTimerStore.getState().timer).toBeNull();
    expect(cancelNotification).toHaveBeenCalledWith(pendingNotificationId);
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

  it('Settings surfaces its M2-17 stub alert', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-settings')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('screen-settings'));
    expect(Alert.alert).toHaveBeenCalledWith('Workout Settings', 'Workout settings arrive in M2-17.');
  });

  // M2-09: "+ Add Exercise" now opens the real multi-select picker sheet
  // instead of a stub alert — full add-exercise coverage (search, select,
  // Add N exercises, history-seeded row count) lives in
  // `ExerciseCard.operations.test.tsx`; this is just the footer-button seam.
  it('"+ Add Exercise" opens the exercise picker sheet', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-add-exercise')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('screen-add-exercise'));
    await waitFor(() => expect(screen.getByTestId('screen-exercise-picker')).toBeTruthy());
    expect(screen.getByText('Add Exercise')).toBeTruthy();
  });
});

describe('ActiveWorkoutScreen — footer layout (02 §2, revised — sub-project B)', () => {
  it('Settings and Discard Workout share a row (flexDirection: row)', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-footer-row')).toBeTruthy());

    expect(screen.getByTestId('screen-footer-row')).toHaveStyle({ flexDirection: 'row' });
  });

  it('Settings and Discard Workout are each flex: 1 (equal width)', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-settings')).toBeTruthy());

    expect(screen.getByTestId('screen-settings')).toHaveStyle({ flex: 1 });
    expect(screen.getByTestId('screen-discard')).toHaveStyle({ flex: 1 });
  });

  it('applies insets.bottom + spacing[4] as the ScrollView contentContainerStyle paddingBottom', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });

    const insetsOverride = { top: 0, right: 0, bottom: 34, left: 0 };
    await renderScreen(exerciseRepo, {}, 'dark', insetsOverride);
    await waitFor(() => expect(screen.getByTestId('screen-body')).toBeTruthy());

    // insets.bottom (34) + spacing['4'] (16, `src/ui/tokens.ts`) = 50.
    expect(screen.getByTestId('screen-body').props.contentContainerStyle).toEqual(
      expect.objectContaining({ paddingBottom: 50 }),
    );
  });

  it('renders the footer even when the workout has zero exercises (G4 regression guard)', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });
    // No `addExercises(...)` call — `workout.exercises` stays empty, same
    // "empty start" shape as the `describe('ActiveWorkoutScreen — empty
    // start (02 §1)')` block above.

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-footer')).toBeTruthy());
  });
});

/** Seeds one exercise with a checked first set (60kg x 8) and, when `withUncheckedSecondSet`, a second bare/unchecked set — the fixture every finish-flow case below builds on. */
async function seedCheckedExercise(
  exerciseRepo: ExerciseRepository,
  withUncheckedSecondSet: boolean,
): Promise<{ exerciseId: string; firstSetId: string }> {
  const exercise = await exerciseRepo.create({
    name: 'Bench Press',
    exerciseType: 'weight_reps',
    primaryMuscleGroup: 'chest',
    usesCustomMetric: false,
  });
  const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);
  const firstSetId = added!.sets[0]!.id;
  await useActiveWorkoutStore.getState().updateSet(firstSetId, { weightKg: 60, reps: 8 });
  await useActiveWorkoutStore.getState().setCompleted(firstSetId, true);
  if (withUncheckedSecondSet) {
    await useActiveWorkoutStore.getState().addSet(added!.id);
  }
  return { exerciseId: exercise.id, firstSetId };
}

describe('ActiveWorkoutScreen — finish flow (M2-14, 02 §14)', () => {
  it('empty finish (zero checked sets) offers Discard instead of Save, and Discard clears the workout', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-finish')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('screen-finish'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Nothing to save',
      'No sets were completed. Discard this workout instead?',
      expect.any(Array),
    );
    expect(screen.queryByTestId('screen-save-sheet-save')).toBeNull();

    await pressAlertButton('Discard');

    await waitFor(() => expect(useActiveWorkoutStore.getState().workout).toBeNull());
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(await workoutRepo.getActive()).toBeNull();
  });

  it('empty finish — Cancel leaves the workout intact and the sheet closed', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-finish')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('screen-finish'));
    await pressAlertButton('Cancel');

    expect(useActiveWorkoutStore.getState().workout).not.toBeNull();
    expect(router.back).not.toHaveBeenCalled();
    expect(screen.queryByTestId('screen-save-sheet-save')).toBeNull();
  });

  it('unchecked sets present: alert names the count; Cancel leaves the Save sheet closed', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });
    await seedCheckedExercise(exerciseRepo, true);

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-finish')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('screen-finish'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Uncompleted sets',
      '1 sets are not marked complete and will be discarded.',
      expect.any(Array),
    );

    await pressAlertButton('Cancel');
    expect(screen.queryByTestId('screen-save-sheet-save')).toBeNull();
  });

  it('unchecked sets present: "Finish anyway" opens the Save sheet', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });
    await seedCheckedExercise(exerciseRepo, true);

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-finish')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('screen-finish'));
    await pressAlertButton('Finish anyway');

    await waitFor(() => expect(screen.getByTestId('screen-save-sheet-save')).toBeTruthy());
  });

  it('every set checked: Finish opens the Save sheet directly, no unchecked-sets alert', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });
    await seedCheckedExercise(exerciseRepo, false);

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-finish')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('screen-finish'));

    expect(Alert.alert).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('screen-save-sheet-save')).toBeTruthy());
  });

  it('Save Workout: persists via repo finish (unchecked sets dropped), cancels the pending rest-timer notification, invalidates history, and navigates to the detail route', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });
    const { exerciseId, firstSetId } = await seedCheckedExercise(exerciseRepo, true);

    // Seed a running rest timer for the checked set (02 §14: "cancel any
    // pending rest-timer notification" — proven by asserting both the store
    // clears and the mocked `cancelNotification` seam was actually called).
    await useRestTimerStore.getState().start({
      exerciseId,
      setId: firstSetId,
      durationSeconds: 90,
      exerciseName: 'Bench Press',
      setNumber: 1,
      notificationsEnabled: true,
    });
    expect(useRestTimerStore.getState().timer).not.toBeNull();
    const pendingNotificationId = useRestTimerStore.getState().timer!.notificationId!;

    const { queryClient } = await renderScreen(exerciseRepo);
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    await waitFor(() => expect(screen.getByTestId('screen-finish')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('screen-finish'));
    await pressAlertButton('Finish anyway');
    await waitFor(() => expect(screen.getByTestId('screen-save-sheet-save')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('screen-save-sheet-save'));

    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    const [replaceTarget] = (router.replace as jest.Mock).mock.calls[0];
    expect(replaceTarget).toMatch(/^\/history\//);
    const workoutId = String(replaceTarget).replace('/history/', '');

    expect(useRestTimerStore.getState().timer).toBeNull();
    expect(cancelNotification).toHaveBeenCalledWith(pendingNotificationId);
    // M4-02: `finishSave` now goes through `invalidateAfterWorkoutMutation`
    // (`@/features/stats/records-service.ts`) instead of a bare
    // `['history']` call — still invalidates `['history']` (below), plus
    // the per-exercise records key for every exercise this workout touched
    // and the two other workout-scoped aggregate keys (06 §4.4's "records +
    // history + stats + calendar keys").
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['records', exerciseId] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['history'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['stats'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['calendar'] });

    const saved = await workoutRepo.getFull(workoutId);
    expect(saved?.state).toBe('completed');
    // Unchecked second set was dropped by repo `finish()` (M2-01) — only
    // the one checked set survives.
    expect(saved?.exercises[0]!.sets).toHaveLength(1);
    expect(saved?.exercises[0]!.sets[0]!.isCompleted).toBe(true);

    await waitFor(() => expect(useActiveWorkoutStore.getState().workout).toBeNull());
  });
});

/**
 * Starts a workout from a one-exercise/one-set routine (target 60kg x 8,
 * `restSeconds: 90`), checks that set with the achieved values the caller
 * supplies, and finishes any other unchecked rows away — the fixture every
 * M3-06 update-routine-prompt case below builds on.
 */
async function seedRoutineStartedAndChecked(
  driver: SqliteDriver,
  workoutRepo: WorkoutRepositoryImpl,
  exerciseRepo: ExerciseRepository,
  achieved: { weightKg: number; reps: number },
): Promise<{ routineRepo: RoutineRepositoryImpl; routine: RoutineFull }> {
  const routineRepo = new RoutineRepositoryImpl(driver);
  const exercise = await exerciseRepo.create({
    name: 'Bench Press',
    exerciseType: 'weight_reps',
    primaryMuscleGroup: 'chest',
  });
  const routine = await routineRepo.create({
    title: 'Push Day',
    exercises: [
      { exerciseId: exercise.id, restSeconds: 90, sets: [{ setType: 'normal', weightKg: 60, reps: 8 }] },
    ],
  });
  await useActiveWorkoutStore.getState().startFromRoutine(routine.id);
  const active = await workoutRepo.getActive();
  const setId = active!.exercises[0]!.sets[0]!.id;
  await useActiveWorkoutStore.getState().updateSet(setId, achieved);
  await useActiveWorkoutStore.getState().setCompleted(setId, true);
  return { routineRepo, routine };
}

describe('ActiveWorkoutScreen — update-routine prompt (M3-06, 02 §14 step 4 / 04 §2.4)', () => {
  it('a materially different finish shows the prompt; "Keep original" leaves the routine untouched and still navigates', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    const { routineRepo, routine } = await seedRoutineStartedAndChecked(driver, workoutRepo, exerciseRepo, {
      weightKg: 70, // differs from the 60kg target
      reps: 8,
    });
    const updateRoutineFromWorkout = jest.fn((id: string, workoutId: string) =>
      routineRepo.updateFromWorkout(id, workoutId),
    );

    await renderScreen(exerciseRepo, {
      routineId: routine.id,
      getRoutineFull: (id) => routineRepo.getFull(id),
      updateRoutineFromWorkout,
    });
    await waitFor(() => expect(screen.getByTestId('screen-finish')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('screen-finish'));
    await waitFor(() => expect(screen.getByTestId('screen-save-sheet-save')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('screen-save-sheet-save'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Update routine?',
        'Your workout differs from Push Day.',
        expect.any(Array),
      ),
    );

    await pressAlertButton('Keep original');

    expect(updateRoutineFromWorkout).not.toHaveBeenCalled();
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    const stillOriginal = await routineRepo.getFull(routine.id);
    expect(stillOriginal!.exercises[0]!.sets[0]!.weightKg).toBe(60);
  });

  it('"Update routine" writes the achieved values back, invalidates the routines query cache, and still navigates', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    const { routineRepo, routine } = await seedRoutineStartedAndChecked(driver, workoutRepo, exerciseRepo, {
      weightKg: 70,
      reps: 8,
    });
    const updateRoutineFromWorkout = jest.fn((id: string, workoutId: string) =>
      routineRepo.updateFromWorkout(id, workoutId),
    );

    const { queryClient } = await renderScreen(exerciseRepo, {
      routineId: routine.id,
      getRoutineFull: (id) => routineRepo.getFull(id),
      updateRoutineFromWorkout,
    });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    await waitFor(() => expect(screen.getByTestId('screen-finish')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('screen-finish'));
    await waitFor(() => expect(screen.getByTestId('screen-save-sheet-save')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('screen-save-sheet-save'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Update routine?', expect.any(String), expect.any(Array)));

    await pressAlertButton('Update routine');

    await waitFor(() => expect(updateRoutineFromWorkout).toHaveBeenCalled());
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['routines'] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['history'] });

    const updated = await routineRepo.getFull(routine.id);
    expect(updated!.exercises[0]!.sets[0]!.weightKg).toBe(70);
  });

  it('an unchanged finish never shows the prompt and navigates directly', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    const { routineRepo, routine } = await seedRoutineStartedAndChecked(driver, workoutRepo, exerciseRepo, {
      weightKg: 60, // matches the target exactly
      reps: 8,
    });
    const updateRoutineFromWorkout = jest.fn((id: string, workoutId: string) =>
      routineRepo.updateFromWorkout(id, workoutId),
    );

    await renderScreen(exerciseRepo, {
      routineId: routine.id,
      getRoutineFull: (id) => routineRepo.getFull(id),
      updateRoutineFromWorkout,
    });
    await waitFor(() => expect(screen.getByTestId('screen-finish')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('screen-finish'));
    await waitFor(() => expect(screen.getByTestId('screen-save-sheet-save')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('screen-save-sheet-save'));

    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(Alert.alert).not.toHaveBeenCalledWith('Update routine?', expect.any(String), expect.any(Array));
    expect(updateRoutineFromWorkout).not.toHaveBeenCalled();
  });

  it('a deleted source routine (getRoutineFull resolves null) skips the prompt and navigates directly', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    const { routineRepo, routine } = await seedRoutineStartedAndChecked(driver, workoutRepo, exerciseRepo, {
      weightKg: 70,
      reps: 8,
    });
    await routineRepo.delete(routine.id);

    await renderScreen(exerciseRepo, {
      routineId: routine.id,
      getRoutineFull: (id) => routineRepo.getFull(id),
    });
    await waitFor(() => expect(screen.getByTestId('screen-finish')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('screen-finish'));
    await waitFor(() => expect(screen.getByTestId('screen-save-sheet-save')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('screen-save-sheet-save'));

    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(Alert.alert).not.toHaveBeenCalledWith('Update routine?', expect.any(String), expect.any(Array));
  });

  // M3 milestone-wide review finding: `getRoutineFull`/`updateRoutineFromWorkout`
  // were called with no try/catch around them — any repo failure here (a
  // transient driver error, a routine deleted in the gap while the user is
  // looking at the Alert) would have been an unhandled promise rejection that
  // also stranded the user: `finish()` had already committed, but
  // `finishSave()` (query invalidation, closing the sheet, navigating away)
  // never ran. Both cases below assert the already-finished workout still
  // navigates cleanly instead of hanging.
  it('getRoutineFull throwing does not block navigation — the already-finished workout still saves cleanly', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    const { routineRepo, routine } = await seedRoutineStartedAndChecked(driver, workoutRepo, exerciseRepo, {
      weightKg: 70,
      reps: 8,
    });
    const getRoutineFull = jest.fn(() => Promise.reject(new Error('driver read failed')));
    const updateRoutineFromWorkout = jest.fn((id: string, workoutId: string) =>
      routineRepo.updateFromWorkout(id, workoutId),
    );

    const { queryClient } = await renderScreen(exerciseRepo, {
      routineId: routine.id,
      getRoutineFull,
      updateRoutineFromWorkout,
    });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    await waitFor(() => expect(screen.getByTestId('screen-finish')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('screen-finish'));
    await waitFor(() => expect(screen.getByTestId('screen-save-sheet-save')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('screen-save-sheet-save'));

    await waitFor(() => expect(getRoutineFull).toHaveBeenCalled());
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(Alert.alert).not.toHaveBeenCalledWith('Update routine?', expect.any(String), expect.any(Array));
    expect(updateRoutineFromWorkout).not.toHaveBeenCalled();
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['history'] });
  });

  it('updateRoutineFromWorkout throwing does not block navigation — the already-finished workout still saves cleanly', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    const { routineRepo, routine } = await seedRoutineStartedAndChecked(driver, workoutRepo, exerciseRepo, {
      weightKg: 70,
      reps: 8,
    });
    const updateRoutineFromWorkout = jest.fn(() => Promise.reject(new Error('write-back failed')));

    const { queryClient } = await renderScreen(exerciseRepo, {
      routineId: routine.id,
      getRoutineFull: (id) => routineRepo.getFull(id),
      updateRoutineFromWorkout,
    });
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');
    await waitFor(() => expect(screen.getByTestId('screen-finish')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('screen-finish'));
    await waitFor(() => expect(screen.getByTestId('screen-save-sheet-save')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('screen-save-sheet-save'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Update routine?', expect.any(String), expect.any(Array)));

    await pressAlertButton('Update routine');

    await waitFor(() => expect(updateRoutineFromWorkout).toHaveBeenCalled());
    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['history'] });
    // The failed write-back must not have invalidated the routines cache —
    // nothing to refresh, the repo call itself never completed.
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ['routines'] });

    const stillOriginal = await routineRepo.getFull(routine.id);
    expect(stillOriginal!.exercises[0]!.sets[0]!.weightKg).toBe(60);
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
      startFromWorkout: () => Promise.reject(new Error('not used')),
      discard: () => Promise.reject(new Error('not used')),
      finish: () => Promise.reject(new Error('not used')),
      getFull: () => Promise.resolve(null),
      listCompleted: () => Promise.resolve([]),
      workoutDates: () => Promise.resolve([]),
      workoutsForDate: () => Promise.resolve([]),
      softDelete: () => Promise.reject(new Error('not used')),
      addExercises: () => Promise.reject(new Error('not used')),
      removeExercise: () => Promise.reject(new Error('not used')),
      reorderExercises: () => Promise.reject(new Error('not used')),
      replaceExercise: () => Promise.reject(new Error('not used')),
      addSet: () => Promise.reject(new Error('not used')),
      insertWarmupSets: () => Promise.reject(new Error('not used')),
      updateSet: () => Promise.reject(new Error('not used')),
      removeSet: () => Promise.reject(new Error('not used')),
      setSetType: () => Promise.reject(new Error('not used')),
      setCompleted: () => Promise.reject(new Error('not used')),
      updateExercise: () => Promise.reject(new Error('not used')),
      updateMeta: () => Promise.reject(new Error('not used')),
      previousSets: () => Promise.resolve([]),
      setsForExercise: () => Promise.resolve([]),
      statsFeed: () => Promise.resolve([]),
      getExercisesForWorkouts: () => Promise.resolve(new Map()),
      exerciseHistoryWatermark: () => Promise.resolve(0),
      exerciseHistory: () => Promise.resolve([]),
      update: () => Promise.reject(new Error('not used')),
    };
    await useActiveWorkoutStore.getState().rehydrate(hangingRepo);

    await renderScreen(exerciseRepo);
    expect(screen.getByText('Starting workout…')).toBeTruthy();
  });
});
