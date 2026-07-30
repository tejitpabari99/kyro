/**
 * Live PR banner wiring (M4-10, 04 §5.5) — `ConnectedSetRow`'s real
 * check-commit flow through `RecordsService.evaluateLive` and
 * `prBannerStore`/`PRBannerHost`/`ui/PRBanner`, exercised through the real
 * `ActiveWorkoutScreen` UI (fill a value, press the real check button) per
 * this task's own "RNTL banner behavior; integration through store" gate.
 *
 * Kept in its own file, same reasoning `ActiveWorkoutScreen.smart-scroll
 * .test.tsx`'s header already documents for its own check-flow tests (a
 * fresh module registry avoids cross-test haptics/timer pollution) — this
 * file additionally needs `configureRecordsService` called once per test
 * (the RecordsService singleton persists for the rest of *this* file once
 * configured; harmless here since every test below wants it configured
 * anyway, unlike the main `ActiveWorkoutScreen.test.tsx` suite, which
 * deliberately never configures it — see `ConnectedSetRow.tsx`'s own
 * `tryGetRecordsService` header for why that's still safe there).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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
import { configureRecordsService } from '@/features/stats/records-service';
import { ThemeProvider } from '@/ui/theme-provider';

import { ActiveWorkoutScreen } from '../ActiveWorkoutScreen';
import { useActiveWorkoutStore } from '../activeWorkoutStore';
import { usePRBannerStore } from '../prBannerStore';

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

jest.mock('expo-keep-awake', () => ({
  useKeepAwake: jest.fn(),
}));

// Same rationale as `ActiveWorkoutScreen.smart-scroll.test.tsx`'s identical
// note — the real check-commit flow reaches true native seams unavailable
// under Jest.
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
  configureRecordsService(workoutRepo);
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

/** Creates and finishes a past workout — one completed set of `exerciseId` at `weightKg`x`reps` — establishing the history baseline `evaluateLive` compares against. */
async function seedHistory(
  workoutRepo: WorkoutRepositoryImpl,
  exerciseId: string,
  weightKg: number,
  reps: number,
): Promise<void> {
  const active = await workoutRepo.startEmpty({ title: 'History', startTime: Date.now() - 100_000 });
  const [added] = await workoutRepo.addExercises(active.id, [{ exerciseId }]);
  const setId = added!.sets[0]!.id;
  await workoutRepo.updateSet(setId, { weightKg, reps });
  await workoutRepo.setCompleted(setId, true);
  await workoutRepo.finish(active.id, {});
}

async function checkSetWithValue(
  workoutExerciseId: string,
  rowIndex: number,
  weightKg: number,
  reps: number,
): Promise<void> {
  const rowTestID = `screen-exercise-${workoutExerciseId}-table-row-${rowIndex}`;
  await fireEvent.changeText(screen.getByTestId(`${rowTestID}-value-weight`), String(weightKg));
  await fireEvent.changeText(screen.getByTestId(`${rowTestID}-value-reps`), String(reps));
  await fireEvent.press(screen.getByTestId(`${rowTestID}-check`));
}

jest.setTimeout(20000);

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  usePRBannerStore.getState().dismiss();
});

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
  });
}

describe('ActiveWorkoutScreen — live PR banner (M4-10, 04 §5.5)', () => {
  it('checking 102.5 kg over a 100 kg history best shows the banner (04 §5 acceptance: "102.5 over 100 banners")', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);

    const exercise = await exerciseRepo.create({
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
    });
    await seedHistory(workoutRepo, exercise.id, 100, 5);

    await useActiveWorkoutStore.getState().startEmpty({ title: 'Push Day', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByText('Bench Press')).toBeTruthy(), { timeout: 8000 });

    // Cache-warm effect runs on mount — give it a tick to resolve before
    // checking, matching real usage (the card is on screen for a while
    // before the user actually checks a set).
    await waitFor(() => expect(usePRBannerStore.getState().message).toBeNull());

    await checkSetWithValue(added!.id, 0, 102.5, 5);

    await waitFor(() => expect(usePRBannerStore.getState().message).not.toBeNull(), { timeout: 8000 });
    expect(usePRBannerStore.getState().message).toContain('Heaviest Weight PR — 102.5 kg');
    expect(screen.getByTestId('screen-pr-banner')).toBeTruthy();
    expect(screen.getByText(/Heaviest Weight PR — 102.5 kg/)).toBeTruthy();
  });

  it('a second identical-weight set in the same session does not re-banner (04 §5 acceptance)', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);

    const exercise = await exerciseRepo.create({
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
    });
    await seedHistory(workoutRepo, exercise.id, 100, 5);

    const active = await useActiveWorkoutStore.getState().startEmpty({ title: 'Push Day', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);
    // A second (unchecked) row to check next.
    await useActiveWorkoutStore.getState().addSet(added!.id);

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByText('Bench Press')).toBeTruthy(), { timeout: 8000 });
    await waitFor(() => expect(usePRBannerStore.getState().message).toBeNull());

    await checkSetWithValue(added!.id, 0, 102.5, 5);
    await waitFor(() => expect(usePRBannerStore.getState().message).not.toBeNull(), { timeout: 8000 });

    await act(async () => usePRBannerStore.getState().dismiss());
    await checkSetWithValue(added!.id, 1, 102.5, 5);

    // No new banner — the duplicate value never re-fires `show()`.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(usePRBannerStore.getState().message).toBeNull();

    const persisted = await workoutRepo.getFull(active!.id);
    expect(persisted!.exercises[0]!.sets.filter((s) => s.isCompleted)).toHaveLength(2);
  });

  it('uncheck then re-check re-banners (04 §5 acceptance)', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);

    const exercise = await exerciseRepo.create({
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
    });
    await seedHistory(workoutRepo, exercise.id, 100, 5);

    await useActiveWorkoutStore.getState().startEmpty({ title: 'Push Day', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByText('Bench Press')).toBeTruthy(), { timeout: 8000 });
    await waitFor(() => expect(usePRBannerStore.getState().message).toBeNull());

    await checkSetWithValue(added!.id, 0, 105, 5);
    await waitFor(() => expect(usePRBannerStore.getState().message).not.toBeNull(), { timeout: 8000 });
    await act(async () => usePRBannerStore.getState().dismiss());

    // Uncheck.
    await fireEvent.press(screen.getByTestId(`screen-exercise-${added!.id}-table-row-0-check`));
    await waitFor(() => {
      const ex = useActiveWorkoutStore.getState().workout!.exercises.find((e) => e.id === added!.id)!;
      expect(ex.sets[0]!.isCompleted).toBe(false);
    });

    // Re-check the exact same value — banners again (08 §4.1 case 13).
    await fireEvent.press(screen.getByTestId(`screen-exercise-${added!.id}-table-row-0-check`));
    await waitFor(() => expect(usePRBannerStore.getState().message).not.toBeNull(), { timeout: 8000 });
    expect(usePRBannerStore.getState().message).toContain('Heaviest Weight PR — 105 kg');
  });

  it('does not show a banner when the live_pr_banner setting is off', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);
    await useSettingsStore.getState().setSetting('live_pr_banner', false);

    const exercise = await exerciseRepo.create({
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
    });
    await seedHistory(workoutRepo, exercise.id, 100, 5);

    await useActiveWorkoutStore.getState().startEmpty({ title: 'Push Day', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByText('Bench Press')).toBeTruthy(), { timeout: 8000 });

    await checkSetWithValue(added!.id, 0, 102.5, 5);
    await waitFor(() => {
      const ex = useActiveWorkoutStore.getState().workout!.exercises.find((e) => e.id === added!.id)!;
      expect(ex.sets[0]!.isCompleted).toBe(true);
    });

    expect(usePRBannerStore.getState().message).toBeNull();
    expect(screen.queryByTestId('screen-pr-banner')).toBeNull();
  });

  it('finishing with a would-be-PR set left unchecked earns no record on the Save sheet (08 §4.1 case 13)', async () => {
    const { driver, workoutRepo, exerciseRepo } = setup();
    await rehydrateStores(workoutRepo, driver);

    const exercise = await exerciseRepo.create({
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
    });
    await seedHistory(workoutRepo, exercise.id, 100, 5);

    await useActiveWorkoutStore.getState().startEmpty({ title: 'Push Day', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);
    // A second row, deliberately left unchecked below — filled with a value
    // that would easily beat the 100 kg history baseline if it were ever
    // fed into `evaluateWorkoutEarned`.
    await useActiveWorkoutStore.getState().addSet(added!.id);

    await renderScreen(exerciseRepo);
    await waitFor(() => expect(screen.getByText('Bench Press')).toBeTruthy(), { timeout: 8000 });
    await waitFor(() => expect(usePRBannerStore.getState().message).toBeNull());

    // First row: checked, but below history — no live banner, no PR.
    await checkSetWithValue(added!.id, 0, 90, 5);
    await waitFor(() => {
      const ex = useActiveWorkoutStore.getState().workout!.exercises.find((e) => e.id === added!.id)!;
      expect(ex.sets[0]!.isCompleted).toBe(true);
    });
    expect(usePRBannerStore.getState().message).toBeNull();

    // Second row: fill a 200 kg value but never press its check button.
    const secondRowTestID = `screen-exercise-${added!.id}-table-row-1`;
    await fireEvent.changeText(screen.getByTestId(`${secondRowTestID}-value-weight`), '200');
    await fireEvent.changeText(screen.getByTestId(`${secondRowTestID}-value-reps`), '5');

    await fireEvent.press(screen.getByTestId('screen-finish'));
    // One row is still unchecked -> the "Uncompleted sets" alert fires first.
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Uncompleted sets',
        expect.stringContaining('are not marked complete'),
        expect.any(Array),
      ),
    );
    await pressAlertButton('Finish anyway');

    await waitFor(() => expect(screen.getByTestId('screen-save-sheet-save')).toBeTruthy());
    // The unchecked 200 kg set must never surface as a Records-earned row —
    // `ActiveWorkoutScreen`'s `recordsEarnedExercises` memo filters to
    // `isCompleted` sets before it ever reaches `evaluateWorkoutEarned`.
    expect(screen.queryByTestId('screen-save-sheet-records')).toBeNull();
  });
});
