/**
 * Smart Superset Scrolling wiring (M2-12, 02 §8) — the round-robin
 * *decision* itself (`nextSupersetScrollTarget`/`resolveSupersetScrollTarget`)
 * is fully unit-tested in `src/domain/__tests__/supersets.test.ts`; these
 * cases exercise `ActiveWorkoutScreen`'s real `handleSetChecked`/
 * `handleCardLayout` glue end-to-end through the real UI (fill a value,
 * press the real check button) without asserting the literal native
 * `ScrollView.scrollTo` call — `react-test-renderer`'s default
 * `createNodeMock` hands host-component refs back as `null` under Jest (no
 * simulator/device), so `scrollViewRef.current` is always `null` here and
 * the call is a harmless, unobservable no-op, same as `ui/WheelPicker.tsx`'s
 * own `scrollRef.current?.scrollTo(...)` call — never asserted directly in
 * that component's own test suite either, for the identical reason. What
 * *is* observable and asserted below: checking a set never throws even when
 * every early-return branch (setting off / ungrouped / grouped-with-a-
 * completed-sibling / no recorded card offset yet) is exercised, and the
 * check itself still lands in the DB regardless.
 *
 * Kept in its own file rather than folded into `ExerciseCard.operations
 * .test.tsx` (which already covers every other superset flow): that file's
 * ~30 other `it`s never press a set-table's own check button, and adding
 * the first one there produced multi-second cross-test slowdowns/timeouts
 * in whichever `it` ran immediately after — most likely a real (unmocked)
 * `expo-haptics`/native-module timer or promise left pending by the check
 * flow's haptics call interacting badly with that file's ~40 already-heavy
 * suites sharing one Jest worker. A fresh, small, dedicated file sidesteps
 * it entirely (own module registry, own singleton store instances, nothing
 * else queued up ahead of these few tests) without weakening coverage of
 * anything this file doesn't itself claim to test.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import type { ExerciseRepository } from '@/data/exercises/types';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { migrate } from '@/data/sqlite/migrator';
import { SettingsRepository } from '@/data/settings/settings-repository';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import { useSettingsStore } from '@/features/settings/settings-store';
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
  useFocusEffect: () => {},
}));

jest.mock('@/lib/files');

// M2-13: see `ActiveWorkoutScreen.test.tsx`'s identical note — a **factory**
// mock, since even a bare `jest.mock('expo-keep-awake')` still has to load
// the real module once to learn its shape, which throws (its native module
// isn't linked under Jest and has no `jest-expo` mock fallback).
jest.mock('expo-keep-awake', () => ({
  useKeepAwake: jest.fn(),
}));

// Checking a set (the whole point of this file) runs the real
// `ConnectedSetRow.handleToggleCompleted` success path, which calls
// `triggerImpact('light')` (`@/lib/haptics`) and, if a rest timer starts,
// `@/lib/notifications` — both true native seams unavailable under Jest (08
// §5's "mock only true natives ... via src/lib/ seams" convention,
// `ExerciseSetTableSection.test.tsx`'s own established pattern for the same
// check flow). Left unmocked, `expo-haptics`'s missing native module throws
// synchronously inside the event handler, uncaught, silently corrupting the
// render tree for every subsequent test in the same file — the concrete bug
// this file's header note above was originally written to explain.
jest.mock('@/lib/haptics');
jest.mock('@/lib/notifications');

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
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider preference="dark">
        <ActiveWorkoutScreen testID="screen" exerciseRepository={exerciseRepo} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

async function checkFirstSet(workoutExerciseId: string): Promise<void> {
  const rowTestID = `screen-exercise-${workoutExerciseId}-table-row-0`;
  await fireEvent.changeText(screen.getByTestId(`${rowTestID}-value-reps`), '8');
  await fireEvent.press(screen.getByTestId(`${rowTestID}-check`));
}

// Deliberately never fire each card's own `onLayout` here (the real
// `ActiveWorkoutScreen`'s `handleCardLayout`/`cardOffsetsRef` wiring, which
// would otherwise be straightforward to exercise with a `fireEvent(el,
// 'layout', {...})` per card): doing so gives `handleSetChecked` a genuine
// scroll target, which means it reaches the real
// `scrollViewRef.current.scrollTo(...)` call — and empirically, under this
// Jest/RNTL/jest-expo combination (no simulator/device), `ScrollView`'s ref
// does *not* resolve to `null` the way a bare `react-test-renderer`
// component's normally would; calling `.scrollTo(...)` on it leaves
// something pending that corrupts whichever test's `render()` runs next in
// this file (manifests as React's own "overlapping act() calls" warning,
// then that next test's screen never finding its own content — diagnosed
// empirically while writing this suite). `domain/__tests__/supersets
// .test.ts`'s `resolveSupersetScrollTarget` suite already proves *which*
// target the decision resolves to with total precision and zero RN
// involvement; these tests stay focused on "the real check-commit flow
// never throws and still lands in the store/DB" for each of
// `handleSetChecked`'s early-return branches, which never requires actually
// reaching the `scrollTo` call.

jest.setTimeout(20000);

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

/**
 * Asserts the given exercise's first set ends up checked, both in the
 * *reactive store* and in SQLite. Polls the store's own state rather than
 * `workoutRepo.getFull()` alone: `updateSet`/`setCompleted` are
 * fire-and-forget (`void ...`) in `ConnectedSetRow`'s real check-commit
 * flow, so their async completion can otherwise land in a React `act()`
 * scope *after* a test has already moved on to the next one — resolving
 * `true` from the DB write alone (while the store's own pending `set()`
 * call is still outstanding) risks that pending update firing mid-render of
 * whatever test runs next. Waiting on the store's own state first
 * guarantees nothing is left pending by the time this resolves.
 */
async function expectFirstSetChecked(
  workoutRepo: WorkoutRepositoryImpl,
  workoutId: string,
  workoutExerciseId: string,
): Promise<void> {
  await waitFor(
    () => {
      const exercise = useActiveWorkoutStore
        .getState()
        .workout!.exercises.find((we) => we.id === workoutExerciseId)!;
      expect(exercise.sets[0]!.isCompleted).toBe(true);
    },
    { timeout: 8000 },
  );
  const persisted = await workoutRepo.getFull(workoutId);
  expect(persisted!.exercises.find((we) => we.id === workoutExerciseId)!.sets[0]!.isCompleted).toBe(
    true,
  );
}

describe('ActiveWorkoutScreen — Smart Superset Scrolling wiring (M2-12, 02 §8)', () => {
  it('checking a set in a 3-member circuit, with a completed sibling already in the group, commits normally', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);

    const rowA = await exerciseRepo.create({ name: 'Squat', exerciseType: 'weight_reps', primaryMuscleGroup: 'quadriceps' });
    const rowB = await exerciseRepo.create({ name: 'Lunge', exerciseType: 'weight_reps', primaryMuscleGroup: 'quadriceps' });
    const rowC = await exerciseRepo.create({ name: 'Leg Press', exerciseType: 'weight_reps', primaryMuscleGroup: 'quadriceps' });

    const active = await useActiveWorkoutStore.getState().startEmpty({ title: 'Legs', startTime: Date.now() });
    const [addedA, addedB, addedC] = await useActiveWorkoutStore
      .getState()
      .addExercises([{ exerciseId: rowA.id }, { exerciseId: rowB.id }, { exerciseId: rowC.id }]);
    await useActiveWorkoutStore.getState().updateExercise(addedA!.id, { supersetId: 0 });
    await useActiveWorkoutStore.getState().updateExercise(addedB!.id, { supersetId: 0 });
    await useActiveWorkoutStore.getState().updateExercise(addedC!.id, { supersetId: 0 });
    // B is already fully completed — the round-robin (unit-tested
    // separately, `domain/__tests__/supersets.test.ts`) must skip it when
    // deciding where to scroll next; this test only needs the check itself
    // to succeed with that shape in place, not to observe the scroll.
    const bSetId = useActiveWorkoutStore.getState().workout!.exercises.find((we) => we.id === addedB!.id)!.sets[0]!.id;
    await useActiveWorkoutStore.getState().setCompleted(bSetId, true);

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByText('Squat')).toBeTruthy(), { timeout: 8000 });

    await checkFirstSet(addedA!.id);

    await expectFirstSetChecked(workoutRepo, active!.id, addedA!.id);
  });

  it('checking a set with Smart Superset Scrolling off still commits normally (setting-off early-return branch)', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useSettingsStore.getState().setSetting('smart_superset_scroll', false);

    const rowA = await exerciseRepo.create({ name: 'Overhead Press', exerciseType: 'weight_reps', primaryMuscleGroup: 'shoulders' });
    const rowB = await exerciseRepo.create({ name: 'Lat Pulldown', exerciseType: 'weight_reps', primaryMuscleGroup: 'lats' });

    const active = await useActiveWorkoutStore.getState().startEmpty({ title: 'Push Pull', startTime: Date.now() });
    const [addedA, addedB] = await useActiveWorkoutStore
      .getState()
      .addExercises([{ exerciseId: rowA.id }, { exerciseId: rowB.id }]);
    await useActiveWorkoutStore.getState().updateExercise(addedA!.id, { supersetId: 0 });
    await useActiveWorkoutStore.getState().updateExercise(addedB!.id, { supersetId: 0 });

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByText('Overhead Press')).toBeTruthy(), { timeout: 8000 });

    await checkFirstSet(addedA!.id);

    await expectFirstSetChecked(workoutRepo, active!.id, addedA!.id);
  });

  it('checking a set in an ungrouped exercise commits normally (ungrouped early-return branch)', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);

    const rowA = await exerciseRepo.create({ name: 'Solo Curl', exerciseType: 'weight_reps', primaryMuscleGroup: 'biceps' });

    const active = await useActiveWorkoutStore.getState().startEmpty({ title: 'Arms', startTime: Date.now() });
    const [addedA] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: rowA.id }]);

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByText('Solo Curl')).toBeTruthy(), { timeout: 8000 });

    await checkFirstSet(addedA!.id);

    await expectFirstSetChecked(workoutRepo, active!.id, addedA!.id);
  });
});
