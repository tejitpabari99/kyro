/**
 * `ExerciseCard` / picker / card-operations integration tests — M2-09's own
 * acceptance/test-gate line, verbatim: "re-added exercise recreates last
 * row count + PREVIOUS; replace keeps count/clears values; remove+undo
 * restores values; reorder persists with PREVIOUS attached correctly
 * (integration via store suite)."
 *
 * Same convention every other M2 screen suite uses (`ActiveWorkoutScreen
 * .test.tsx`, `ExerciseSetTableSection.test.tsx`): real
 * `WorkoutRepositoryImpl`/`ExerciseRepositoryImpl` over an in-memory
 * `better-sqlite3` driver (never mocked, 08 §5), driven end-to-end through
 * `ActiveWorkoutScreen` (the real screen — `ExerciseCard`, the picker
 * sheet, the ⋯ menu, the reorder sheet — nothing stubbed) via the real
 * `useActiveWorkoutStore`/`useSettingsStore` singletons.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
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
import { SUPERSET_PALETTE } from '@/domain/supersets';
import { useSettingsStore } from '@/features/settings/settings-store';
import { cancelNotification } from '@/lib/notifications';
import { ThemeProvider } from '@/ui/theme-provider';

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

// `ExerciseCard`'s name-tap opens `ExerciseDetailSheet` -> the real
// `ExerciseDetailScreen`, which imports `@/lib/files` (native-only top-level
// imports, unavailable under Jest, 08 §5) — mocked wholesale, same
// convention `ExerciseDetailScreen.test.tsx` established.
jest.mock('@/lib/files');

// M2-19 follow-up review (§3.3): removing an exercise whose set owns a
// running rest timer must cancel that timer's notification too — mocked per
// 08 §5 ("mock only true natives ... via src/lib/ seams") so this suite
// never touches the real `expo-notifications` native module.
jest.mock('@/lib/notifications');

// M2-13: see `ActiveWorkoutScreen.test.tsx`'s identical note — a **factory**
// mock, since even a bare `jest.mock('expo-keep-awake')` still has to load
// the real module once to learn its shape, which throws (its native module
// isn't linked under Jest and has no `jest-expo` mock fallback).
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
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  // M2-10: `restTimerStore` is a module-level singleton — reset it so a
  // timer started by one test never leaks into the next (same reasoning
  // `ExerciseSetTableSection.test.tsx`'s own `afterEach` documents).
  useRestTimerStore.setState({ timer: null, permissionDeniedNoticePending: false });
});

describe('ExerciseCard — add exercise recreates history row count + PREVIOUS (02 §3)', () => {
  it('adding a previously-logged exercise pre-creates the same set count with correct PREVIOUS', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);

    const exercise = await exerciseRepo.create({
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
    });

    // A prior completed session with 3 checked sets — 02 §3's own example.
    const previousWorkout = await workoutRepo.startEmpty({
      title: 'Previous',
      startTime: Date.now() - 100_000,
    });
    const [previousExercise] = await workoutRepo.addExercises(previousWorkout.id, [
      { exerciseId: exercise.id },
    ]);
    const set1 = await workoutRepo.addSet(previousExercise!.id);
    const set2 = await workoutRepo.addSet(previousExercise!.id);
    const setIds = [previousExercise!.sets[0]!.id, set1.id, set2.id];
    const rows = [45, 50, 55];
    const reps = [9, 8, 6];
    for (let i = 0; i < 3; i++) {
      await workoutRepo.updateSet(setIds[i]!, { weightKg: rows[i], reps: reps[i] });
      await workoutRepo.setCompleted(setIds[i]!, true);
    }
    await workoutRepo.finish(previousWorkout.id);

    await useActiveWorkoutStore.getState().startEmpty({ title: 'Today', startTime: Date.now() });

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-add-exercise')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('screen-add-exercise'));
    // Bench Press was just logged in the "previous" workout above, so it
    // shows in both the picker's `Recent` and `All` sections (03 §2) —
    // either row is an equally valid tap target for this test.
    await waitFor(() => expect(screen.getAllByTestId(`exercise-row-${exercise.id}`).length).toBeGreaterThan(0));
    await fireEvent.press(screen.getAllByTestId(`exercise-row-${exercise.id}`)[0]!);
    await waitFor(() => expect(screen.getByTestId('screen-exercise-picker-confirm')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('screen-exercise-picker-confirm'));

    await waitFor(() => expect(screen.getByText('Bench Press')).toBeTruthy());

    const workout = useActiveWorkoutStore.getState().workout;
    const added = workout!.exercises.find((we) => we.exerciseId === exercise.id)!;
    expect(added.sets).toHaveLength(3);
    // Persisted, not just drafted.
    const persisted = await workoutRepo.getFull(workout!.id);
    expect(persisted!.exercises[0]!.sets).toHaveLength(3);

    // PREVIOUS: tapping row 0's PREVIOUS cell autofills the first prior
    // session's values (02 §6).
    const tableTestID = `screen-exercise-${added.id}-table`;
    await fireEvent.press(screen.getByTestId(`${tableTestID}-row-0-previous`));
    expect(screen.getByTestId(`${tableTestID}-row-0-value-weight`).props.value).toBe('45');
    expect(screen.getByTestId(`${tableTestID}-row-0-value-reps`).props.value).toBe('9');
  });
});

describe('ExerciseCard — Replace Exercise (02 §3)', () => {
  it('keeps the row count and clears values, and PREVIOUS reflects the new exercise', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);

    const squat = await exerciseRepo.create({
      name: 'Back Squat',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'quadriceps',
    });
    const deadlift = await exerciseRepo.create({
      name: 'Deadlift',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'hamstrings',
    });

    // Deadlift has its own history, so PREVIOUS after replace should come
    // from *its* history, not Squat's.
    const previousWorkout = await workoutRepo.startEmpty({
      title: 'Previous',
      startTime: Date.now() - 100_000,
    });
    const [previousExercise] = await workoutRepo.addExercises(previousWorkout.id, [
      { exerciseId: deadlift.id },
    ]);
    await workoutRepo.updateSet(previousExercise!.sets[0]!.id, { weightKg: 100, reps: 5 });
    await workoutRepo.setCompleted(previousExercise!.sets[0]!.id, true);
    await workoutRepo.finish(previousWorkout.id);

    const active = await useActiveWorkoutStore
      .getState()
      .startEmpty({ title: 'Today', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: squat.id }]);
    await useActiveWorkoutStore.getState().addSet(added!.id); // 2 sets total

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByText('Back Squat')).toBeTruthy());

    const tableTestID = `screen-exercise-${added!.id}-table`;
    await fireEvent.changeText(screen.getByTestId(`${tableTestID}-row-0-value-weight`), '80');
    await fireEvent(screen.getByTestId(`${tableTestID}-row-0-value-weight`), 'blur');
    await fireEvent.changeText(screen.getByTestId(`${tableTestID}-row-1-value-reps`), '5');
    await fireEvent(screen.getByTestId(`${tableTestID}-row-1-value-reps`), 'blur');

    await waitFor(async () => {
      const persisted = await workoutRepo.getFull(active!.id);
      expect(persisted!.exercises[0]!.sets[0]!.weightKg).toBe(80);
    });

    await fireEvent.press(screen.getByTestId(`screen-exercise-${added!.id}-menu-button`));
    await waitFor(() => expect(screen.getByTestId(`screen-exercise-${added!.id}-menu-replace`)).toBeTruthy());
    await fireEvent.press(screen.getByTestId(`screen-exercise-${added!.id}-menu-replace`));

    // Deadlift was logged in its own "previous" workout above, so it shows
    // in both `Recent` and `All` (03 §2) — take the first match.
    await waitFor(() =>
      expect(screen.getAllByTestId(`exercise-row-${deadlift.id}`).length).toBeGreaterThan(0),
    );
    await fireEvent.press(screen.getAllByTestId(`exercise-row-${deadlift.id}`)[0]!);

    await waitFor(() => expect(screen.getByText('Deadlift')).toBeTruthy());
    expect(screen.queryByText('Back Squat')).toBeNull();

    const persisted = await workoutRepo.getFull(active!.id);
    const replaced = persisted!.exercises[0]!;
    expect(replaced.exerciseId).toBe(deadlift.id);
    // Row count preserved, values cleared.
    expect(replaced.sets).toHaveLength(2);
    expect(replaced.sets[0]!.weightKg).toBeNull();
    expect(replaced.sets[0]!.reps).toBeNull();
    expect(replaced.sets[1]!.weightKg).toBeNull();
    expect(replaced.sets[1]!.reps).toBeNull();

    // PREVIOUS now reflects Deadlift's own history.
    await fireEvent.press(screen.getByTestId(`${tableTestID}-row-0-previous`));
    expect(screen.getByTestId(`${tableTestID}-row-0-value-weight`).props.value).toBe('100');
    expect(screen.getByTestId(`${tableTestID}-row-0-value-reps`).props.value).toBe('5');
  });
});

describe('ExerciseCard — Remove Exercise + Undo (02 §3)', () => {
  it('hides the card immediately; Undo restores it with every entered value intact', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);

    const exercise = await exerciseRepo.create({
      name: 'Overhead Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'shoulders',
    });

    const active = await useActiveWorkoutStore
      .getState()
      .startEmpty({ title: 'Today', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByText('Overhead Press')).toBeTruthy());

    const tableTestID = `screen-exercise-${added!.id}-table`;
    await fireEvent.changeText(screen.getByTestId(`${tableTestID}-row-0-value-weight`), '60');
    await fireEvent(screen.getByTestId(`${tableTestID}-row-0-value-weight`), 'blur');
    await fireEvent.changeText(screen.getByTestId(`${tableTestID}-row-0-value-reps`), '8');
    await fireEvent(screen.getByTestId(`${tableTestID}-row-0-value-reps`), 'blur');

    await waitFor(async () => {
      const persisted = await workoutRepo.getFull(active!.id);
      expect(persisted!.exercises[0]!.sets[0]!.weightKg).toBe(60);
    });

    await fireEvent.press(screen.getByTestId(`screen-exercise-${added!.id}-menu-button`));
    await waitFor(() =>
      expect(screen.getByTestId(`screen-exercise-${added!.id}-menu-remove-exercise`)).toBeTruthy(),
    );
    await fireEvent.press(screen.getByTestId(`screen-exercise-${added!.id}-menu-remove-exercise`));

    // No confirm — the card disappears immediately (still in the DB, per
    // `ExerciseCard`'s file header: nothing is written until the Snackbar's
    // own timeout elapses without Undo).
    expect(screen.queryByText('Overhead Press')).toBeNull();
    expect(screen.getByTestId(`screen-remove-snackbar-${added!.id}`)).toBeTruthy();
    let persisted = await workoutRepo.getFull(active!.id);
    expect(persisted!.exercises).toHaveLength(1);

    await fireEvent.press(screen.getByText('Undo'));

    await waitFor(() => expect(screen.getByText('Overhead Press')).toBeTruthy());
    expect(screen.queryByTestId(`screen-remove-snackbar-${added!.id}`)).toBeNull();
    // Values survived the hide/restore round trip.
    expect(screen.getByTestId(`${tableTestID}-row-0-value-weight`).props.value).toBe('60');
    expect(screen.getByTestId(`${tableTestID}-row-0-value-reps`).props.value).toBe('8');

    persisted = await workoutRepo.getFull(active!.id);
    expect(persisted!.exercises).toHaveLength(1);
    expect(persisted!.exercises[0]!.sets[0]!.weightKg).toBe(60);
  });

  it('finalizes the removal once the Snackbar auto-dismisses without Undo', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);

    const exercise = await exerciseRepo.create({
      name: 'Lateral Raise',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'shoulders',
    });

    const active = await useActiveWorkoutStore
      .getState()
      .startEmpty({ title: 'Today', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

    jest.useFakeTimers();
    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByText('Lateral Raise')).toBeTruthy());

    await fireEvent.press(screen.getByTestId(`screen-exercise-${added!.id}-menu-button`));
    await fireEvent.press(screen.getByTestId(`screen-exercise-${added!.id}-menu-remove-exercise`));
    expect(screen.getByTestId(`screen-remove-snackbar-${added!.id}`)).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    // `removeExercise` is a fire-and-forget store call fired from inside the
    // timer callback (not awaited by it); switch back to real timers so
    // `waitFor`'s own polling can actually retry while that async chain
    // (store action -> repository -> the in-memory driver) finishes.
    jest.useRealTimers();

    expect(screen.queryByTestId(`screen-remove-snackbar-${added!.id}`)).toBeNull();
    await waitFor(async () => {
      const persisted = await workoutRepo.getFull(active!.id);
      expect(persisted!.exercises).toHaveLength(0);
    });
  });

  // M2-19 follow-up review (§3.3): removing (via the ⋯ menu, finalized after
  // the Snackbar's own timeout) an exercise whose checked set currently owns
  // the one running rest timer previously left that timer's notification
  // scheduled — it would fire later, referencing a set that no longer
  // exists. Mirrors the existing "Discard Workout cancels any pending
  // rest-timer notification" regression test in `ActiveWorkoutScreen.test.tsx`.
  it('finalizing an exercise removal cancels a running rest timer owned by one of its sets', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);

    const exercise = await exerciseRepo.create({
      name: 'Lateral Raise',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'shoulders',
    });

    await useActiveWorkoutStore.getState().startEmpty({ title: 'Today', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);
    const firstSetId = added!.sets[0]!.id;

    await useRestTimerStore.getState().start({
      exerciseId: exercise.id,
      setId: firstSetId,
      durationSeconds: 90,
      exerciseName: exercise.name,
      setNumber: 1,
      notificationsEnabled: true,
    });
    expect(useRestTimerStore.getState().timer).not.toBeNull();
    const pendingNotificationId = useRestTimerStore.getState().timer!.notificationId!;

    jest.useFakeTimers();
    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByText('Lateral Raise')).toBeTruthy());

    await fireEvent.press(screen.getByTestId(`screen-exercise-${added!.id}-menu-button`));
    await fireEvent.press(screen.getByTestId(`screen-exercise-${added!.id}-menu-remove-exercise`));

    await act(async () => {
      jest.advanceTimersByTime(5000);
    });
    jest.useRealTimers();

    await waitFor(() => expect(useRestTimerStore.getState().timer).toBeNull());
    expect(cancelNotification).toHaveBeenCalledWith(pendingNotificationId);
  });
});

describe('ExerciseCard — Reorder Exercises (02 §3)', () => {
  it('persists the new order with PREVIOUS still attached to the correct exercise', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);

    const alpha = await exerciseRepo.create({
      name: 'Alpha Curl',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'biceps',
    });
    const beta = await exerciseRepo.create({
      name: 'Beta Row',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'upper_back',
    });

    // Distinct history per exercise.
    const alphaHistory = await workoutRepo.startEmpty({
      title: 'Alpha history',
      startTime: Date.now() - 200_000,
    });
    const [alphaWe] = await workoutRepo.addExercises(alphaHistory.id, [{ exerciseId: alpha.id }]);
    await workoutRepo.updateSet(alphaWe!.sets[0]!.id, { weightKg: 10, reps: 5 });
    await workoutRepo.setCompleted(alphaWe!.sets[0]!.id, true);
    await workoutRepo.finish(alphaHistory.id);

    const betaHistory = await workoutRepo.startEmpty({
      title: 'Beta history',
      startTime: Date.now() - 100_000,
    });
    const [betaWe] = await workoutRepo.addExercises(betaHistory.id, [{ exerciseId: beta.id }]);
    await workoutRepo.updateSet(betaWe!.sets[0]!.id, { weightKg: 20, reps: 6 });
    await workoutRepo.setCompleted(betaWe!.sets[0]!.id, true);
    await workoutRepo.finish(betaHistory.id);

    const active = await useActiveWorkoutStore
      .getState()
      .startEmpty({ title: 'Today', startTime: Date.now() });
    const [addedAlpha, addedBeta] = await useActiveWorkoutStore
      .getState()
      .addExercises([{ exerciseId: alpha.id }, { exerciseId: beta.id }]);

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByText('Alpha Curl')).toBeTruthy());
    expect(screen.getByText('Beta Row')).toBeTruthy();

    await fireEvent.press(screen.getByTestId(`screen-exercise-${addedAlpha!.id}-menu-button`));
    await fireEvent.press(screen.getByTestId(`screen-exercise-${addedAlpha!.id}-menu-reorder`));
    await waitFor(() => expect(screen.getByTestId('screen-reorder-sheet')).toBeTruthy());

    // Move Beta Row up so it lands first.
    await fireEvent.press(screen.getByTestId(`screen-reorder-sheet-row-${addedBeta!.id}-up`));
    await fireEvent.press(screen.getByTestId('screen-reorder-sheet-save'));

    await waitFor(async () => {
      const persisted = await workoutRepo.getFull(active!.id);
      expect(persisted!.exercises[0]!.exerciseId).toBe(beta.id);
      expect(persisted!.exercises[1]!.exerciseId).toBe(alpha.id);
    });

    // PREVIOUS values stay attached to the correct exercise after reorder —
    // Beta's own card (now first) shows Beta's PREVIOUS; Alpha's own card
    // (now second) still shows Alpha's PREVIOUS.
    const betaTableTestID = `screen-exercise-${addedBeta!.id}-table`;
    const alphaTableTestID = `screen-exercise-${addedAlpha!.id}-table`;

    await waitFor(() =>
      expect(within(screen.getByTestId(betaTableTestID)).getByText('20kg × 6')).toBeTruthy(),
    );
    await fireEvent.press(
      within(screen.getByTestId(betaTableTestID)).getByTestId(`${betaTableTestID}-row-0-previous`),
    );
    expect(screen.getByTestId(`${betaTableTestID}-row-0-value-weight`).props.value).toBe('20');
    expect(screen.getByTestId(`${betaTableTestID}-row-0-value-reps`).props.value).toBe('6');

    await waitFor(() =>
      expect(within(screen.getByTestId(alphaTableTestID)).getByText('10kg × 5')).toBeTruthy(),
    );
    await fireEvent.press(
      within(screen.getByTestId(alphaTableTestID)).getByTestId(`${alphaTableTestID}-row-0-previous`),
    );
    expect(screen.getByTestId(`${alphaTableTestID}-row-0-value-weight`).props.value).toBe('10');
    expect(screen.getByTestId(`${alphaTableTestID}-row-0-value-reps`).props.value).toBe('5');
  });
});

describe('Exercise picker — Superset toggle on multi-add (02 §8 stub)', () => {
  it('groups every newly-added exercise under the lowest of their own new positions', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);

    const pullUp = await exerciseRepo.create({
      name: 'Pull-Up',
      exerciseType: 'bodyweight_reps',
      primaryMuscleGroup: 'lats',
    });
    const pushUp = await exerciseRepo.create({
      name: 'Push-Up',
      exerciseType: 'bodyweight_reps',
      primaryMuscleGroup: 'chest',
    });

    const active = await useActiveWorkoutStore
      .getState()
      .startEmpty({ title: 'Today', startTime: Date.now() });

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByTestId('screen-add-exercise')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('screen-add-exercise'));
    await waitFor(() => expect(screen.getAllByTestId(`exercise-row-${pullUp.id}`).length).toBeGreaterThan(0));
    await fireEvent.press(screen.getAllByTestId(`exercise-row-${pullUp.id}`)[0]!);
    await fireEvent.press(screen.getAllByTestId(`exercise-row-${pushUp.id}`)[0]!);

    await fireEvent.press(screen.getByTestId('screen-exercise-picker-superset-toggle'));
    await fireEvent.press(screen.getByTestId('screen-exercise-picker-confirm'));

    await waitFor(async () => {
      const persisted = await workoutRepo.getFull(active!.id);
      expect(persisted!.exercises).toHaveLength(2);
      expect(persisted!.exercises[0]!.supersetId).not.toBeNull();
      expect(persisted!.exercises[0]!.supersetId).toBe(persisted!.exercises[1]!.supersetId);
    });
  });

  it('does not group when the Superset toggle is off', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);

    const pullUp = await exerciseRepo.create({
      name: 'Chin-Up',
      exerciseType: 'bodyweight_reps',
      primaryMuscleGroup: 'lats',
    });

    const active = await useActiveWorkoutStore
      .getState()
      .startEmpty({ title: 'Today', startTime: Date.now() });

    await renderScreen(exerciseRepo);
    await fireEvent.press(screen.getByTestId('screen-add-exercise'));
    await waitFor(() => expect(screen.getAllByTestId(`exercise-row-${pullUp.id}`).length).toBeGreaterThan(0));
    await fireEvent.press(screen.getAllByTestId(`exercise-row-${pullUp.id}`)[0]!);
    await fireEvent.press(screen.getByTestId('screen-exercise-picker-confirm'));

    await waitFor(async () => {
      const persisted = await workoutRepo.getFull(active!.id);
      expect(persisted!.exercises).toHaveLength(1);
      expect(persisted!.exercises[0]!.supersetId).toBeNull();
    });
  });
});

describe('ExerciseCard — Add to Superset sheet (02 §8 stub)', () => {
  it('grouping two exercises writes the same supersetId (lowest involved position) to both', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);

    const rowA = await exerciseRepo.create({
      name: 'Dip',
      exerciseType: 'bodyweight_reps',
      primaryMuscleGroup: 'triceps',
    });
    const rowB = await exerciseRepo.create({
      name: 'Bench Dip',
      exerciseType: 'bodyweight_reps',
      primaryMuscleGroup: 'triceps',
    });

    const active = await useActiveWorkoutStore
      .getState()
      .startEmpty({ title: 'Today', startTime: Date.now() });
    const [addedA, addedB] = await useActiveWorkoutStore
      .getState()
      .addExercises([{ exerciseId: rowA.id }, { exerciseId: rowB.id }]);

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByText('Dip')).toBeTruthy());

    await fireEvent.press(screen.getByTestId(`screen-exercise-${addedA!.id}-menu-button`));
    await fireEvent.press(screen.getByTestId(`screen-exercise-${addedA!.id}-menu-add-to-superset`));
    await waitFor(() => expect(screen.getByTestId('screen-add-to-superset-sheet')).toBeTruthy());

    await fireEvent.press(screen.getByTestId(`screen-add-to-superset-sheet-option-${addedB!.id}`));
    await fireEvent.press(screen.getByTestId('screen-add-to-superset-sheet-confirm'));

    await waitFor(async () => {
      const persisted = await workoutRepo.getFull(active!.id);
      const a = persisted!.exercises.find((we) => we.id === addedA!.id)!;
      const b = persisted!.exercises.find((we) => we.id === addedB!.id)!;
      expect(a.supersetId).not.toBeNull();
      expect(a.supersetId).toBe(b.supersetId);
    });

    // Card header now shows the superset indicator (02 §3).
    await waitFor(() =>
      expect(screen.getByTestId(`screen-exercise-${addedA!.id}-superset-indicator`)).toBeTruthy(),
    );
  });
});

describe('ExerciseCard — superset colors/labels + dissolution (M2-12, 02 §8 acceptance)', () => {
  it('a 3-member circuit renders one shared color with A/B/C-consistent labels', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);

    const rowA = await exerciseRepo.create({
      name: 'Squat',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'quadriceps',
    });
    const rowB = await exerciseRepo.create({
      name: 'Lunge',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'quadriceps',
    });
    const rowC = await exerciseRepo.create({
      name: 'Leg Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'quadriceps',
    });

    await useActiveWorkoutStore.getState().startEmpty({ title: 'Legs', startTime: Date.now() });
    const [addedA, addedB, addedC] = await useActiveWorkoutStore
      .getState()
      .addExercises([{ exerciseId: rowA.id }, { exerciseId: rowB.id }, { exerciseId: rowC.id }]);
    // A 3-member circuit, all sharing the lowest involved position (0) as
    // the group id — the same convention the two group-creation paths
    // (picker Superset toggle / Add to Superset sheet) already use.
    await useActiveWorkoutStore.getState().updateExercise(addedA!.id, { supersetId: 0 });
    await useActiveWorkoutStore.getState().updateExercise(addedB!.id, { supersetId: 0 });
    await useActiveWorkoutStore.getState().updateExercise(addedC!.id, { supersetId: 0 });

    await renderScreen(exerciseRepo);

    const labels = await waitFor(() => {
      const found = screen.getAllByText('Superset A');
      expect(found).toHaveLength(3);
      return found;
    });

    // Every member's label text shares the exact same (first) palette color
    // (07 §2.5) — flatten each Text's style array to read its resolved color.
    const colors = labels.map((label) => {
      const flat = Object.assign({}, ...([] as unknown[]).concat(label.props.style));
      return flat.color as string;
    });
    expect(new Set(colors).size).toBe(1);
    expect(colors[0]).toBe(SUPERSET_PALETTE[0]);
  });

  it('removing the second-to-last member of a 2-member group dissolves it for both (both supersetId clear, indicator disappears from both cards)', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);

    const rowA = await exerciseRepo.create({
      name: 'Row',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'upper_back',
    });
    const rowB = await exerciseRepo.create({
      name: 'Pulldown',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'upper_back',
    });

    const active = await useActiveWorkoutStore
      .getState()
      .startEmpty({ title: 'Pull Day', startTime: Date.now() });
    const [addedA, addedB] = await useActiveWorkoutStore
      .getState()
      .addExercises([{ exerciseId: rowA.id }, { exerciseId: rowB.id }]);
    await useActiveWorkoutStore.getState().updateExercise(addedA!.id, { supersetId: 0 });
    await useActiveWorkoutStore.getState().updateExercise(addedB!.id, { supersetId: 0 });

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getAllByText('Superset A')).toHaveLength(2));

    await fireEvent.press(screen.getByTestId(`screen-exercise-${addedA!.id}-menu-button`));
    await fireEvent.press(screen.getByTestId(`screen-exercise-${addedA!.id}-menu-remove-from-superset`));

    // Both cards lose their superset indicator — not just the one that was
    // explicitly removed (02 §8: "group of 1 dissolves automatically").
    await waitFor(() => expect(screen.queryByText('Superset A')).toBeNull());
    expect(
      screen.queryByTestId(`screen-exercise-${addedA!.id}-superset-indicator`),
    ).toBeNull();
    expect(
      screen.queryByTestId(`screen-exercise-${addedB!.id}-superset-indicator`),
    ).toBeNull();

    const persisted = await workoutRepo.getFull(active!.id);
    const a = persisted!.exercises.find((we) => we.id === addedA!.id)!;
    const b = persisted!.exercises.find((we) => we.id === addedB!.id)!;
    expect(a.supersetId).toBeNull();
    expect(b.supersetId).toBeNull();
  });
});
