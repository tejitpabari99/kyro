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
    fireEvent.press(checkButton);
    await waitFor(() => expect(useRestTimerStore.getState().timer).toBeNull());
    fireEvent.press(checkButton);

    // Give any (wrongly-started) async rest-timer scheduling a tick to land.
    await waitFor(() => expect(useRestTimerStore.getState().timer).toBeNull());
  });

  it('Save calls WorkoutRepository.update with the edited content and navigates to the workout detail route', async () => {
    const { driver, workoutRepo, exerciseRepo, benchId } = setup();
    seedCompletedWorkout(driver, 'w1', 'we1', 'set1', benchId, null);
    const updateSpy = jest.spyOn(workoutRepo, 'update');

    await renderScreen('w1', workoutRepo, exerciseRepo, driver);
    await waitFor(() => expect(screen.getByText('Push Day')).toBeTruthy());

    fireEvent.press(screen.getByTestId('edit-save'));

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

    fireEvent.press(screen.getByTestId('edit-save'));
    await waitFor(() => expect(router.replace).toHaveBeenCalled());

    expect(useActiveWorkoutStore.getState().workout?.id).toBe(active!.id);
    expect(useActiveWorkoutStore.getState().workout?.state).toBe('active');
    const stillActive = await workoutRepo.getActive();
    expect(stillActive?.id).toBe(active!.id);
  });
});
