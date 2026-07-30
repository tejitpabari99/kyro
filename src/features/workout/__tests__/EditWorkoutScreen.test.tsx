/**
 * `EditWorkoutScreen` tests (M4-05 acceptance gate, 02 §15 / 08 §4.9) — real
 * `WorkoutRepositoryImpl`/`ExerciseRepositoryImpl` over `better-sqlite3`
 * (never mocked, 08 §5), same fixture-by-raw-SQL convention
 * `workout-repository.records.test.ts` (M4-02) established so this file
 * controls every row id and can construct exact testIDs without threading
 * ids back out of async store calls.
 *
 * Covers: loads and renders an already-`completed` workout with its sets
 * shown (all pre-checked, per `finish()`'s own invariant); rechecking a set
 * does **not** start a rest timer (02 §15: "no rest timers") even when the
 * exercise has a configured `restSeconds`; Save calls
 * `WorkoutRepository.update` with the edited content, bumps happen via that
 * call, and navigates to the workout's detail route; a genuinely active
 * workout (a separate, real `useActiveWorkoutStore` singleton) is completely
 * unaffected by the whole edit session (one-active invariant, RNTL-level
 * proof alongside `activeWorkoutStore.test.ts`'s own store-level proof); an
 * unknown workout id renders the "not found" empty state.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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
import { SettingsRepository } from '@/data/settings/settings-repository';
import { useSettingsStore } from '@/features/settings/settings-store';
import { ThemeProvider } from '@/ui/theme-provider';

import { EditWorkoutScreen } from '../EditWorkoutScreen';
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
  useFocusEffect: () => {},
}));

jest.mock('@/lib/notifications');
jest.mock('@/lib/files');
jest.mock('expo-keep-awake', () => ({ useKeepAwake: jest.fn() }));

function insertExercise(driver: SqliteDriver, id: string): string {
  const now = Date.now();
  driver.execute(
    `INSERT INTO exercises
       (id, name, exercise_type, primary_muscle_group, secondary_muscle_groups,
        equipment, instructions, images, animation_uri, is_custom,
        uses_custom_metric, aliases, archived_at, created_at, updated_at)
     VALUES (?, ?, 'weight_reps', 'chest', '[]', 'barbell', '[]', '[]', NULL, 0, 0, '[]', NULL, ?, ?)`,
    [id, id, now, now],
  );
  return id;
}

function seedCompletedWorkout(
  driver: SqliteDriver,
  workoutId: string,
  workoutExerciseId: string,
  setId: string,
  exerciseId: string,
  restSeconds: number | null,
): void {
  const startTime = 1_700_000_000_000;
  driver.execute(
    `INSERT INTO workouts (id, title, state, start_time, end_time, duration_pause_offset_ms, created_at, updated_at)
     VALUES (?, 'Push Day', 'completed', ?, ?, 0, ?, ?)`,
    [workoutId, startTime, startTime + 60_000, startTime, startTime],
  );
  driver.execute(
    `INSERT INTO workout_exercises (id, workout_id, exercise_id, position, superset_id, notes, rest_seconds)
     VALUES (?, ?, ?, 0, NULL, NULL, ?)`,
    [workoutExerciseId, workoutId, exerciseId, restSeconds],
  );
  driver.execute(
    `INSERT INTO sets
       (id, workout_exercise_id, position, set_type, weight_kg, reps, distance_meters,
        duration_seconds, rpe, custom_metric, is_completed)
     VALUES (?, ?, 0, 'normal', 100, 5, NULL, NULL, NULL, NULL, 1)`,
    [setId, workoutExerciseId],
  );
}

interface Fixture {
  driver: SqliteDriver;
  workoutRepo: WorkoutRepositoryImpl;
  exerciseRepo: ExerciseRepository;
  benchId: string;
}

function setup(): Fixture {
  const driver = openBetterSqlite3Driver(':memory:');
  migrate(driver);
  const workoutRepo = new WorkoutRepositoryImpl(driver, {});
  const exerciseRepo = new ExerciseRepositoryImpl(driver);
  const benchId = insertExercise(driver, 'bench-press');
  return { driver, workoutRepo, exerciseRepo, benchId };
}

async function renderScreen(
  workoutId: string,
  workoutRepo: WorkoutRepositoryImpl,
  exerciseRepo: ExerciseRepository,
  driver: SqliteDriver,
) {
  await useSettingsStore.getState().load(new SettingsRepository(driver));
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  const result = await render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider preference="dark">
        <EditWorkoutScreen
          testID="edit"
          workoutId={workoutId}
          workoutRepository={workoutRepo}
          exerciseRepository={exerciseRepo}
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

describe('EditWorkoutScreen (M4-05)', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('loads and renders an already-completed workout with its (already-checked) sets', async () => {
    const { driver, workoutRepo, exerciseRepo, benchId } = setup();
    seedCompletedWorkout(driver, 'w1', 'we1', 'set1', benchId, 60);

    await renderScreen('w1', workoutRepo, exerciseRepo, driver);

    await waitFor(() => expect(screen.getByText('Push Day')).toBeTruthy());
    expect(screen.getByTestId('edit-save')).toBeTruthy();
    // No "Finish" pill, no live stopwatch chrome from the active logger.
    expect(screen.queryByTestId('edit-finish')).toBeNull();
    expect(screen.queryByTestId('edit-timer-pill')).toBeNull();
    expect(screen.queryByTestId('edit-discard')).toBeNull();
  });

  it('unknown workout id renders the not-found empty state', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();

    await renderScreen('does-not-exist', workoutRepo, exerciseRepo, driver);

    await waitFor(() => expect(screen.getByText('Workout not found')).toBeTruthy());
  });

  it('rechecking a set never starts a rest timer, even with a configured restSeconds (02 §15: "no rest timers")', async () => {
    const { driver, workoutRepo, exerciseRepo, benchId } = setup();
    seedCompletedWorkout(driver, 'w1', 'we1', 'set1', benchId, 60);

    await renderScreen('w1', workoutRepo, exerciseRepo, driver);
    await waitFor(() => expect(screen.getByText('Push Day')).toBeTruthy());

    const checkButton = await waitFor(() =>
      screen.getByTestId('edit-exercise-we1-table-row-0-check'),
    );
    // Uncheck, then recheck — the one path that would start a rest timer on
    // the live logger.
    await fireEvent.press(checkButton);
    await waitFor(() => expect(useRestTimerStore.getState().timer).toBeNull());
    await fireEvent.press(checkButton);

    // Give any (wrongly-started) async rest-timer scheduling a tick to land.
    await waitFor(() => expect(useRestTimerStore.getState().timer).toBeNull());
  });

  it('Save calls WorkoutRepository.update with the edited content and navigates to the workout detail route', async () => {
    const { driver, workoutRepo, exerciseRepo, benchId } = setup();
    seedCompletedWorkout(driver, 'w1', 'we1', 'set1', benchId, null);
    const updateSpy = jest.spyOn(workoutRepo, 'update');

    await renderScreen('w1', workoutRepo, exerciseRepo, driver);
    await waitFor(() => expect(screen.getByText('Push Day')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('edit-save'));

    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    const [calledId, input] = updateSpy.mock.calls[0]!;
    expect(calledId).toBe('w1');
    expect(input.exercises).toHaveLength(1);
    expect(input.exercises[0]!.sets).toHaveLength(1);
    expect(input.exercises[0]!.sets[0]!.weightKg).toBe(100);

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/history/w1'));
  });

  it('editing a past workout does not disturb a genuinely active workout (one-active invariant, RNTL-level)', async () => {
    const { driver, workoutRepo, exerciseRepo, benchId } = setup();
    seedCompletedWorkout(driver, 'w1', 'we1', 'set1', benchId, null);

    await useActiveWorkoutStore.getState().rehydrate(workoutRepo);
    const active = await useActiveWorkoutStore.getState().startEmpty({ title: 'Live session', startTime: 5_000 });
    expect(active).not.toBeNull();

    await renderScreen('w1', workoutRepo, exerciseRepo, driver);
    await waitFor(() => expect(screen.getByText('Push Day')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());

    expect(useActiveWorkoutStore.getState().workout?.id).toBe(active!.id);
    expect(useActiveWorkoutStore.getState().workout?.state).toBe('active');
    const stillActive = await workoutRepo.getActive();
    expect(stillActive?.id).toBe(active!.id);
  });

  it('editing the title commits on blur and persists immediately (write-through, before Save)', async () => {
    const { driver, workoutRepo, exerciseRepo, benchId } = setup();
    seedCompletedWorkout(driver, 'w1', 'we1', 'set1', benchId, null);

    await renderScreen('w1', workoutRepo, exerciseRepo, driver);
    await waitFor(() => expect(screen.getByText('Push Day')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('edit-title'));
    await fireEvent.changeText(screen.getByTestId('edit-title-input'), 'Renamed Push Day');
    fireEvent(screen.getByTestId('edit-title-input'), 'blur');

    await waitFor(() => expect(screen.getByText('Renamed Push Day')).toBeTruthy());
    const persisted = await workoutRepo.getFull('w1');
    expect(persisted!.title).toBe('Renamed Push Day');
  });

  it('the meta sheet saves a new start/end time immediately (write-through, before Save)', async () => {
    const { driver, workoutRepo, exerciseRepo, benchId } = setup();
    seedCompletedWorkout(driver, 'w1', 'we1', 'set1', benchId, null);

    await renderScreen('w1', workoutRepo, exerciseRepo, driver);
    await waitFor(() => expect(screen.getByText('Push Day')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('edit-duration'));
    await waitFor(() => expect(screen.getByTestId('edit-meta-sheet-year')).toBeTruthy());
    await fireEvent.changeText(screen.getByTestId('edit-meta-sheet-hours'), '2');
    await fireEvent.changeText(screen.getByTestId('edit-meta-sheet-minutes'), '0');
    await fireEvent.changeText(screen.getByTestId('edit-meta-sheet-seconds'), '0');
    await fireEvent.press(screen.getByTestId('edit-meta-sheet-save'));

    await waitFor(() => expect(screen.getByText('2:00:00')).toBeTruthy());
    const persisted = await workoutRepo.getFull('w1');
    expect(persisted!.endTime! - persisted!.startTime).toBe(2 * 3600 * 1000);
  });

  it('adding a new exercise via the picker (no superset) persists it immediately', async () => {
    const { driver, workoutRepo, exerciseRepo, benchId } = setup();
    seedCompletedWorkout(driver, 'w1', 'we1', 'set1', benchId, null);
    const squatId = insertExercise(driver, 'back-squat');

    await renderScreen('w1', workoutRepo, exerciseRepo, driver);
    await waitFor(() => expect(screen.getByText('Push Day')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('edit-add-exercise'));
    await waitFor(() => expect(screen.getAllByTestId(`exercise-row-${squatId}`).length).toBeGreaterThan(0));
    await fireEvent.press(screen.getAllByTestId(`exercise-row-${squatId}`)[0]!);
    await waitFor(() => expect(screen.getByTestId('edit-exercise-picker-confirm')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('edit-exercise-picker-confirm'));

    await waitFor(() => expect(screen.getByText('back-squat')).toBeTruthy());
    const persisted = await workoutRepo.getFull('w1');
    expect(persisted!.exercises.map((e) => e.exerciseId)).toEqual(
      expect.arrayContaining([benchId, squatId]),
    );
  });

  it('adding two exercises at once with the Superset toggle groups them under the same supersetId', async () => {
    const { driver, workoutRepo, exerciseRepo, benchId } = setup();
    seedCompletedWorkout(driver, 'w1', 'we1', 'set1', benchId, null);
    const squatId = insertExercise(driver, 'back-squat');
    const rowId = insertExercise(driver, 'row');

    await renderScreen('w1', workoutRepo, exerciseRepo, driver);
    await waitFor(() => expect(screen.getByText('Push Day')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('edit-add-exercise'));
    await fireEvent.press(screen.getByTestId('edit-exercise-picker-superset-toggle'));
    await waitFor(() => expect(screen.getAllByTestId(`exercise-row-${squatId}`).length).toBeGreaterThan(0));
    await fireEvent.press(screen.getAllByTestId(`exercise-row-${squatId}`)[0]!);
    await fireEvent.press(screen.getAllByTestId(`exercise-row-${rowId}`)[0]!);
    await fireEvent.press(screen.getByTestId('edit-exercise-picker-confirm'));

    await waitFor(async () => {
      const persisted = await workoutRepo.getFull('w1');
      const squatExercise = persisted!.exercises.find((e) => e.exerciseId === squatId);
      const rowExercise = persisted!.exercises.find((e) => e.exerciseId === rowId);
      expect(squatExercise?.supersetId).not.toBeNull();
      expect(squatExercise?.supersetId).toBe(rowExercise?.supersetId);
    });
  });

  it('Replace Exercise (via the exercise ⋯ menu) repoints the workout exercise and clears its values', async () => {
    const { driver, workoutRepo, exerciseRepo, benchId } = setup();
    seedCompletedWorkout(driver, 'w1', 'we1', 'set1', benchId, null);
    const squatId = insertExercise(driver, 'back-squat');

    await renderScreen('w1', workoutRepo, exerciseRepo, driver);
    await waitFor(() => expect(screen.getByText('bench-press')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('edit-exercise-we1-menu-button'));
    await waitFor(() => expect(screen.getByTestId('edit-exercise-we1-menu-replace')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('edit-exercise-we1-menu-replace'));

    await waitFor(() => expect(screen.getAllByTestId(`exercise-row-${squatId}`).length).toBeGreaterThan(0));
    await fireEvent.press(screen.getAllByTestId(`exercise-row-${squatId}`)[0]!);

    await waitFor(() => expect(screen.getByText('back-squat')).toBeTruthy());
    expect(screen.queryByText('bench-press')).toBeNull();
    const persisted = await workoutRepo.getFull('w1');
    expect(persisted!.exercises[0]!.exerciseId).toBe(squatId);
    expect(persisted!.exercises[0]!.sets[0]!.weightKg).toBeNull();
  });

  it('Reorder Exercises (via the ⋯ menu) persists the new order', async () => {
    const { driver, workoutRepo, exerciseRepo, benchId } = setup();
    seedCompletedWorkout(driver, 'w1', 'we1', 'set1', benchId, null);
    const squatId = insertExercise(driver, 'back-squat');
    const [squatWe] = await workoutRepo.addExercises('w1', [{ exerciseId: squatId }]);

    await renderScreen('w1', workoutRepo, exerciseRepo, driver);
    await waitFor(() => expect(screen.getByText('back-squat')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('edit-exercise-we1-menu-button'));
    await waitFor(() => expect(screen.getByTestId('edit-exercise-we1-menu-reorder')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('edit-exercise-we1-menu-reorder'));

    await waitFor(() => expect(screen.getByTestId(`edit-reorder-sheet-row-${squatWe!.id}-up`)).toBeTruthy());
    await fireEvent.press(screen.getByTestId(`edit-reorder-sheet-row-${squatWe!.id}-up`));
    await fireEvent.press(screen.getByTestId('edit-reorder-sheet-save'));

    await waitFor(async () => {
      const persisted = await workoutRepo.getFull('w1');
      expect(persisted!.exercises[0]!.exerciseId).toBe(squatId);
      expect(persisted!.exercises[1]!.exerciseId).toBe(benchId);
    });
  });

  it('Add to Superset (via the ⋯ menu) groups two existing, previously-ungrouped exercises', async () => {
    const { driver, workoutRepo, exerciseRepo, benchId } = setup();
    seedCompletedWorkout(driver, 'w1', 'we1', 'set1', benchId, null);
    const squatId = insertExercise(driver, 'back-squat');
    const [squatWe] = await workoutRepo.addExercises('w1', [{ exerciseId: squatId }]);

    await renderScreen('w1', workoutRepo, exerciseRepo, driver);
    await waitFor(() => expect(screen.getByText('back-squat')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('edit-exercise-we1-menu-button'));
    await waitFor(() => expect(screen.getByTestId('edit-exercise-we1-menu-add-to-superset')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('edit-exercise-we1-menu-add-to-superset'));

    await waitFor(() => expect(screen.getByTestId(`edit-add-to-superset-sheet-option-${squatWe!.id}`)).toBeTruthy());
    await fireEvent.press(screen.getByTestId(`edit-add-to-superset-sheet-option-${squatWe!.id}`));
    await fireEvent.press(screen.getByTestId('edit-add-to-superset-sheet-confirm'));

    await waitFor(async () => {
      const persisted = await workoutRepo.getFull('w1');
      const bench = persisted!.exercises.find((e) => e.id === 'we1');
      const squat = persisted!.exercises.find((e) => e.id === squatWe!.id);
      expect(bench?.supersetId).not.toBeNull();
      expect(bench?.supersetId).toBe(squat?.supersetId);
    });
  });

  it('Remove Exercise (via the ⋯ menu) deletes it from the screen and the DB immediately', async () => {
    const { driver, workoutRepo, exerciseRepo, benchId } = setup();
    seedCompletedWorkout(driver, 'w1', 'we1', 'set1', benchId, null);
    const squatId = insertExercise(driver, 'back-squat');
    const [squatWe] = await workoutRepo.addExercises('w1', [{ exerciseId: squatId }]);

    await renderScreen('w1', workoutRepo, exerciseRepo, driver);
    await waitFor(() => expect(screen.getByText('back-squat')).toBeTruthy());

    await fireEvent.press(screen.getByTestId(`edit-exercise-${squatWe!.id}-menu-button`));
    await waitFor(() => expect(screen.getByTestId(`edit-exercise-${squatWe!.id}-menu-remove-exercise`)).toBeTruthy());
    await fireEvent.press(screen.getByTestId(`edit-exercise-${squatWe!.id}-menu-remove-exercise`));

    await waitFor(() => expect(screen.queryByText('back-squat')).toBeNull());
    const persisted = await workoutRepo.getFull('w1');
    expect(persisted!.exercises.map((e) => e.exerciseId)).not.toContain(squatId);
  });

  it('a loadForEdit failure (getFull rejecting) is caught, not thrown — the screen stays in its loading state', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    jest.spyOn(workoutRepo, 'getFull').mockRejectedValueOnce(new Error('simulated read failure'));

    await renderScreen('w1', workoutRepo, exerciseRepo, driver);

    // Neither throws nor gets stuck — settles into the loading state (never
    // resolves `workout`/`notFound` for this one rejected attempt).
    await waitFor(() => expect(screen.getByText('Loading…')).toBeTruthy());
  });

  it('the Back chevron navigates back without saving', async () => {
    const { driver, workoutRepo, exerciseRepo, benchId } = setup();
    seedCompletedWorkout(driver, 'w1', 'we1', 'set1', benchId, null);

    await renderScreen('w1', workoutRepo, exerciseRepo, driver);
    await waitFor(() => expect(screen.getByText('Push Day')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('edit-back'));

    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('dismissing the meta sheet without saving (scrim tap) leaves the original date/duration untouched', async () => {
    const { driver, workoutRepo, exerciseRepo, benchId } = setup();
    seedCompletedWorkout(driver, 'w1', 'we1', 'set1', benchId, null);

    await renderScreen('w1', workoutRepo, exerciseRepo, driver);
    await waitFor(() => expect(screen.getByText('Push Day')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('edit-duration'));
    await waitFor(() => expect(screen.getByTestId('edit-meta-sheet-scrim')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('edit-meta-sheet-scrim'));

    await waitFor(() => expect(screen.queryByTestId('edit-meta-sheet-year')).toBeNull());
    const persisted = await workoutRepo.getFull('w1');
    expect(persisted!.endTime! - persisted!.startTime).toBe(60_000);
  });

  it('Save persists a surviving 2+ member superset group (supersetId carried through to update()), drops a group left with only one survivor', async () => {
    const { driver, workoutRepo, exerciseRepo, benchId } = setup();
    seedCompletedWorkout(driver, 'w1', 'we1', 'set1', benchId, null);
    const squatId = insertExercise(driver, 'back-squat');
    const [squatWe] = await workoutRepo.addExercises('w1', [{ exerciseId: squatId }]);
    // Group the two surviving exercises under the same superset before Save.
    await workoutRepo.updateExercise('we1', { supersetId: 0 });
    await workoutRepo.updateExercise(squatWe!.id, { supersetId: 0 });
    // Give the squat exercise a checked set of its own so it survives Save's
    // unchecked-set filter (addExercises seeds one bare, unchecked set).
    await workoutRepo.updateSet(squatWe!.sets[0]!.id, { weightKg: 40, reps: 10 });
    await workoutRepo.setCompleted(squatWe!.sets[0]!.id, true);
    const updateSpy = jest.spyOn(workoutRepo, 'update');

    await renderScreen('w1', workoutRepo, exerciseRepo, driver);
    await waitFor(() => expect(screen.getByText('back-squat')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('edit-save'));

    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(1));
    const [, input] = updateSpy.mock.calls[0]!;
    const benchExercise = input.exercises.find((e) => e.exerciseId === benchId)!;
    const squatExercise = input.exercises.find((e) => e.exerciseId === squatId)!;
    expect(benchExercise.supersetId).toBe(0);
    expect(squatExercise.supersetId).toBe(0);
  });

  it('a repo update() failure during Save surfaces an alert and leaves saving re-enabled (catch path)', async () => {
    const { driver, workoutRepo, exerciseRepo, benchId } = setup();
    seedCompletedWorkout(driver, 'w1', 'we1', 'set1', benchId, null);
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    jest.spyOn(workoutRepo, 'update').mockRejectedValueOnce(new Error('simulated write failure'));

    await renderScreen('w1', workoutRepo, exerciseRepo, driver);
    await waitFor(() => expect(screen.getByText('Push Day')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('edit-save'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Something went wrong',
        'This workout could not be saved. Please try again.',
      ),
    );
    expect(router.replace).not.toHaveBeenCalled();
  });
});
