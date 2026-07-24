/**
 * `ExerciseSetTableSection` behavioral tests (M2-06 acceptance gate) — run
 * against the real `WorkoutRepositoryImpl`/`ExerciseRepositoryImpl` over
 * `better-sqlite3` (never mocked, 08 §5), bound to the real
 * `useActiveWorkoutStore` singleton (each test calls `rehydrate()` against
 * its own fresh in-memory driver, so tests never share DB state even
 * though the Zustand store instance itself is the same module-level
 * singleton every real screen uses — the same "rehydrate re-binds cleanly"
 * property `activeWorkoutStore.test.ts` already established for
 * `createActiveWorkoutStore()` instances, applied here to the singleton
 * because `ConnectedSetRow`/`ExerciseSetTableSection` import it directly,
 * matching how the real app wires screens — no store-instance prop
 * threading needed).
 *
 * Covers: each of the 8 types renders exactly its expected columns; a
 * set-type change re-badges + renumbers; swipe-delete (the always-mounted
 * delete button) renumbers; PREVIOUS tap autofills; `"130"` parses to
 * `1:30`/90s; assisted weight displays `−20kg` while storing positive;
 * both-themes smoke.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import type { Exercise } from '@/data/exercises/types';
import type { UpdateSetInput } from '@/data/workouts/types';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { migrate } from '@/data/sqlite/migrator';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import type { ExerciseType } from '@/domain/enums';
import { columnsForExerciseType } from '@/domain/set-table-columns';
import { triggerImpact, triggerNotificationFeedback } from '@/lib/haptics';
import { cancelNotification, scheduleRestNotification } from '@/lib/notifications';
import { ThemeProvider } from '@/ui/theme-provider';

import { ConnectedSetRow, readCanonical, writeCanonical } from '../ConnectedSetRow';
import { ExerciseSetTableSection } from '../ExerciseSetTableSection';
import { useActiveWorkoutStore } from '../activeWorkoutStore';
import { useRestTimerStore } from '../restTimerStore';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock('@/lib/haptics');
// M2-10: checking a set can now start a rest timer (`restTimerStore.start`),
// which calls through to `@/lib/notifications` — mocked per 08 §5 ("mock
// only true natives ... via src/lib/ seams") so these RNTL tests never
// touch the real `expo-notifications` native module.
jest.mock('@/lib/notifications');

function renderSection(
  workoutExerciseId: string,
  exercise: Exercise,
  overrides: Partial<React.ComponentProps<typeof ExerciseSetTableSection>> = {},
  theme: 'dark' | 'light' = 'dark',
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider preference={theme}>
        <ExerciseSetTableSection
          testID="section"
          workoutExerciseId={workoutExerciseId}
          exercise={exercise}
          weightUnit="kg"
          distanceUnit="km"
          rpeEnabled={false}
          previousValuesMode="any_workout"
          routineId={null}
          {...overrides}
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

interface Fixture {
  driver: SqliteDriver;
  workoutRepo: WorkoutRepositoryImpl;
  exercise: Exercise;
  workoutExerciseId: string;
}

async function setupExercise(
  exerciseType: ExerciseType,
  options: { usesCustomMetric?: boolean; setCount?: number } = {},
): Promise<Fixture> {
  const driver = openBetterSqlite3Driver(':memory:');
  migrate(driver);
  const exerciseRepo = new ExerciseRepositoryImpl(driver);
  const workoutRepo = new WorkoutRepositoryImpl(driver, {});

  const exercise = await exerciseRepo.create({
    name: 'Test Exercise',
    exerciseType,
    primaryMuscleGroup: 'chest',
    usesCustomMetric: options.usesCustomMetric ?? false,
  });

  await useActiveWorkoutStore.getState().rehydrate(workoutRepo);
  await useActiveWorkoutStore.getState().startEmpty({ title: 'Test Workout', startTime: Date.now() });
  const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

  const extraSets = (options.setCount ?? 1) - 1;
  for (let i = 0; i < extraSets; i++) {
    await useActiveWorkoutStore.getState().addSet(added!.id);
  }

  return { driver, workoutRepo, exercise, workoutExerciseId: added!.id };
}

afterEach(() => {
  jest.clearAllMocks();
  // M2-10: `restTimerStore` is a module-level singleton (same reasoning as
  // `useActiveWorkoutStore` in this file's header) — reset it so a timer
  // started by one test never leaks into the next.
  useRestTimerStore.setState({ timer: null, permissionDeniedNoticePending: false });
});

const ALL_TYPES: { type: ExerciseType; labels: string[] }[] = [
  { type: 'weight_reps', labels: ['KG', 'REPS'] },
  { type: 'reps_only', labels: ['REPS'] },
  { type: 'bodyweight_reps', labels: ['+KG', 'REPS'] },
  { type: 'bodyweight_assisted_reps', labels: ['−KG', 'REPS'] },
  { type: 'duration', labels: ['TIME'] },
  { type: 'weight_duration', labels: ['KG', 'TIME'] },
  { type: 'distance_duration', labels: ['KM', 'TIME'] },
  { type: 'short_distance_weight', labels: ['KG', 'M'] },
];

describe('ExerciseSetTableSection — each of the 8 types renders exactly its columns', () => {
  it.each(ALL_TYPES)('$type -> $labels', async ({ type, labels }) => {
    const { exercise, workoutExerciseId } = await setupExercise(type);
    await renderSection(workoutExerciseId, exercise);

    for (const label of labels) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // SET / PREVIOUS / ✓ are always present regardless of type.
    expect(screen.getByText('SET')).toBeTruthy();
    expect(screen.getByText('PREVIOUS')).toBeTruthy();
    expect(screen.getByText('✓')).toBeTruthy();
  });

  it('appends CUSTOM when usesCustomMetric is true', async () => {
    const { exercise, workoutExerciseId } = await setupExercise('weight_reps', {
      usesCustomMetric: true,
    });
    await renderSection(workoutExerciseId, exercise);
    expect(screen.getByText('CUSTOM')).toBeTruthy();
  });

  it('appends RPE for a rep-based type when rpeEnabled', async () => {
    const { exercise, workoutExerciseId } = await setupExercise('weight_reps');
    await renderSection(workoutExerciseId, exercise, { rpeEnabled: true });
    expect(screen.getByText('RPE')).toBeTruthy();
  });

  it('never appends RPE for a non-rep-based type, even when rpeEnabled', async () => {
    const { exercise, workoutExerciseId } = await setupExercise('duration');
    await renderSection(workoutExerciseId, exercise, { rpeEnabled: true });
    expect(screen.queryByText('RPE')).toBeNull();
  });
});

describe('ExerciseSetTableSection — smoke render (both themes)', () => {
  it('renders in dark theme', async () => {
    const { exercise, workoutExerciseId } = await setupExercise('weight_reps');
    await renderSection(workoutExerciseId, exercise, {}, 'dark');
    expect(screen.getByTestId('section')).toBeTruthy();
  });

  it('renders in light theme', async () => {
    const { exercise, workoutExerciseId } = await setupExercise('weight_reps');
    await renderSection(workoutExerciseId, exercise, {}, 'light');
    expect(screen.getByTestId('section')).toBeTruthy();
  });
});

describe('ExerciseSetTableSection — set-type change re-badges + renumbers', () => {
  it('W,1,2,W,3 numbering: turning row 0 into a warm-up shifts the rest down', async () => {
    const { exercise, workoutExerciseId } = await setupExercise('weight_reps', { setCount: 3 });
    await renderSection(workoutExerciseId, exercise);

    // Initially: 1, 2, 3.
    expect(screen.getByTestId('section-row-0-badge-number').props.children).toBe(1);
    expect(screen.getByTestId('section-row-1-badge-number').props.children).toBe(2);
    expect(screen.getByTestId('section-row-2-badge-number').props.children).toBe(3);

    await fireEvent.press(screen.getByTestId('section-row-0-badge'));
    await fireEvent.press(screen.getByTestId('section-row-0-set-type-warmup'));

    expect(screen.getByTestId('section-row-0-badge-circle')).toBeTruthy();
    expect(screen.getByText('W')).toBeTruthy();
    // Rows 1 and 2 (still normal) renumber to 1 and 2.
    expect(screen.getByTestId('section-row-1-badge-number').props.children).toBe(1);
    expect(screen.getByTestId('section-row-2-badge-number').props.children).toBe(2);
  });

  it('Remove Set from the menu removes the row', async () => {
    const { exercise, workoutExerciseId } = await setupExercise('weight_reps', { setCount: 2 });
    await renderSection(workoutExerciseId, exercise);

    await fireEvent.press(screen.getByTestId('section-row-0-badge'));
    await fireEvent.press(screen.getByTestId('section-row-0-set-type-remove'));

    expect(screen.queryByTestId('section-row-1')).toBeNull();
    expect(screen.getByTestId('section-row-0-badge-number').props.children).toBe(1);
  });
});

describe('ExerciseSetTableSection — swipe-delete renumbers', () => {
  it('deleting the middle row renumbers the remaining two', async () => {
    const { exercise, workoutExerciseId } = await setupExercise('weight_reps', { setCount: 3 });
    await renderSection(workoutExerciseId, exercise);

    await fireEvent.press(screen.getByTestId('section-row-1-delete-button'));

    expect(screen.queryByTestId('section-row-2')).toBeNull();
    expect(screen.getByTestId('section-row-0-badge-number').props.children).toBe(1);
    expect(screen.getByTestId('section-row-1-badge-number').props.children).toBe(2);
  });
});

describe('ExerciseSetTableSection — PREVIOUS tap autofills', () => {
  it('autofills weight/reps from the most recent completed occurrence', async () => {
    const driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    const exerciseRepo = new ExerciseRepositoryImpl(driver);
    const workoutRepo = new WorkoutRepositoryImpl(driver, {});
    const exercise = await exerciseRepo.create({
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
    });

    // A previous, completed workout with one checked 45kg x 9 set.
    const previousWorkout = await workoutRepo.startEmpty({
      title: 'Previous',
      startTime: Date.now() - 100_000,
    });
    const [previousExercise] = await workoutRepo.addExercises(previousWorkout.id, [
      { exerciseId: exercise.id },
    ]);
    const previousSet = previousExercise!.sets[0]!;
    await workoutRepo.updateSet(previousSet.id, { weightKg: 45, reps: 9 });
    await workoutRepo.setCompleted(previousSet.id, true);
    await workoutRepo.finish(previousWorkout.id);

    // The active workout being logged now.
    await useActiveWorkoutStore.getState().rehydrate(workoutRepo);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Now', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

    await renderSection(added!.id, exercise);

    await waitFor(() => expect(screen.getByText('45kg × 9')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('section-row-0-previous'));

    expect(screen.getByTestId('section-row-0-value-weight').props.value).toBe('45');
    expect(screen.getByTestId('section-row-0-value-reps').props.value).toBe('9');

    // Committed to the store/DB, not just the local text buffer.
    const committed = await workoutRepo.getActive();
    const committedSet = committed!.exercises[0]!.sets[0]!;
    expect(committedSet.weightKg).toBe(45);
    expect(committedSet.reps).toBe(9);
  });
});

describe('ExerciseSetTableSection — TIME digit-fill parsing', () => {
  it('"130" typed in TIME renders 1:30 and stores 90 seconds', async () => {
    const { exercise, workoutExerciseId, workoutRepo } = await setupExercise('duration');
    await renderSection(workoutExerciseId, exercise);

    const input = screen.getByTestId('section-row-0-value-duration');
    await fireEvent.changeText(input, '130');
    expect(screen.getByTestId('section-row-0-value-duration').props.value).toBe('1:30');

    await fireEvent(screen.getByTestId('section-row-0-value-duration'), 'blur');

    const active = await workoutRepo.getActive();
    expect(active!.exercises[0]!.sets[0]!.durationSeconds).toBe(90);
  });
});

describe('ExerciseSetTableSection — assisted weight (bodyweight_assisted_reps)', () => {
  it('displays a − prefix and stores the positive value', async () => {
    const { exercise, workoutExerciseId, workoutRepo } = await setupExercise(
      'bodyweight_assisted_reps',
    );
    await renderSection(workoutExerciseId, exercise);

    expect(screen.getByText('−')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('section-row-0-value-weight'), '20');
    await fireEvent(screen.getByTestId('section-row-0-value-weight'), 'blur');

    expect(screen.getByTestId('section-row-0-value-weight').props.value).toBe('20');

    const active = await workoutRepo.getActive();
    expect(active!.exercises[0]!.sets[0]!.weightKg).toBe(20);
  });
});

describe('ExerciseSetTableSection — check flow (M2-07, 02 §4 / 00 P6)', () => {
  it('blocks the check when a required field (reps) is empty with no placeholder: row stays unchecked, notificationWarning haptic fires, nothing is written', async () => {
    const { exercise, workoutExerciseId, workoutRepo } = await setupExercise('weight_reps');
    await renderSection(workoutExerciseId, exercise);

    await fireEvent.press(screen.getByTestId('section-row-0-check'));

    expect(screen.getByTestId('section-row-0-check').props.accessibilityState.checked).toBe(false);
    expect(triggerNotificationFeedback).toHaveBeenCalledWith('warning');
    expect(triggerImpact).not.toHaveBeenCalled();

    const active = await workoutRepo.getActive();
    expect(active!.exercises[0]!.sets[0]!.isCompleted).toBe(false);
    expect(active!.exercises[0]!.sets[0]!.reps).toBeNull();
  });

  it('commits typed values as-is and checks the row, firing the impactLight haptic', async () => {
    const { exercise, workoutExerciseId, workoutRepo } = await setupExercise('weight_reps');
    await renderSection(workoutExerciseId, exercise);

    await fireEvent.changeText(screen.getByTestId('section-row-0-value-weight'), '60');
    await fireEvent.changeText(screen.getByTestId('section-row-0-value-reps'), '8');

    await fireEvent.press(screen.getByTestId('section-row-0-check'));

    expect(screen.getByTestId('section-row-0-check').props.accessibilityState.checked).toBe(true);
    expect(triggerImpact).toHaveBeenCalledWith('light');

    const active = await workoutRepo.getActive();
    const committed = active!.exercises[0]!.sets[0]!;
    expect(committed.weightKg).toBe(60);
    expect(committed.reps).toBe(8);
    expect(committed.isCompleted).toBe(true);
  });

  it('empty-with-placeholder commits the previous-session placeholder values on check', async () => {
    const driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    const exerciseRepo = new ExerciseRepositoryImpl(driver);
    const workoutRepo = new WorkoutRepositoryImpl(driver, {});
    const exercise = await exerciseRepo.create({
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
    });

    const previousWorkout = await workoutRepo.startEmpty({ title: 'Previous', startTime: Date.now() - 100_000 });
    const [previousExercise] = await workoutRepo.addExercises(previousWorkout.id, [{ exerciseId: exercise.id }]);
    const previousSet = previousExercise!.sets[0]!;
    await workoutRepo.updateSet(previousSet.id, { weightKg: 45, reps: 9 });
    await workoutRepo.setCompleted(previousSet.id, true);
    await workoutRepo.finish(previousWorkout.id);

    await useActiveWorkoutStore.getState().rehydrate(workoutRepo);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Now', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

    await renderSection(added!.id, exercise);
    await waitFor(() => expect(screen.getByText('45kg × 9')).toBeTruthy());

    // Neither field typed — check should commit the 45/9 placeholders.
    await fireEvent.press(screen.getByTestId('section-row-0-check'));

    expect(screen.getByTestId('section-row-0-check').props.accessibilityState.checked).toBe(true);
    const active = await workoutRepo.getActive();
    const committed = active!.exercises[0]!.sets[0]!;
    expect(committed.weightKg).toBe(45);
    expect(committed.reps).toBe(9);
    expect(committed.isCompleted).toBe(true);
  });

  it('a non-required, unresolved weight defaults to 0 rather than blocking (empty bar/bodyweight)', async () => {
    const { exercise, workoutExerciseId, workoutRepo } = await setupExercise('weight_reps');
    await renderSection(workoutExerciseId, exercise);

    // Only reps typed — weight has no typed value and no placeholder.
    await fireEvent.changeText(screen.getByTestId('section-row-0-value-reps'), '12');
    await fireEvent.press(screen.getByTestId('section-row-0-check'));

    expect(screen.getByTestId('section-row-0-check').props.accessibilityState.checked).toBe(true);
    const active = await workoutRepo.getActive();
    const committed = active!.exercises[0]!.sets[0]!;
    expect(committed.weightKg).toBe(0);
    expect(committed.reps).toBe(12);
  });

  it('leaves an unresolved custom metric null (never forced to 0) while a non-required weight still defaults to 0', async () => {
    const { exercise, workoutExerciseId, workoutRepo } = await setupExercise('weight_reps', {
      usesCustomMetric: true,
    });
    await renderSection(workoutExerciseId, exercise);

    await fireEvent.changeText(screen.getByTestId('section-row-0-value-reps'), '10');
    await fireEvent.press(screen.getByTestId('section-row-0-check'));

    expect(screen.getByTestId('section-row-0-check').props.accessibilityState.checked).toBe(true);
    const active = await workoutRepo.getActive();
    const committed = active!.exercises[0]!.sets[0]!;
    expect(committed.weightKg).toBe(0);
    expect(committed.reps).toBe(10);
    expect(committed.customMetric).toBeNull();
  });

  it('an RPE column present on the row is never part of the check-commit decision (RPE is optional, written only via its own picker)', async () => {
    const { exercise, workoutExerciseId, workoutRepo } = await setupExercise('weight_reps');
    await renderSection(workoutExerciseId, exercise, { rpeEnabled: true });

    await fireEvent.changeText(screen.getByTestId('section-row-0-value-weight'), '60');
    await fireEvent.changeText(screen.getByTestId('section-row-0-value-reps'), '8');
    await fireEvent.press(screen.getByTestId('section-row-0-check'));

    expect(screen.getByTestId('section-row-0-check').props.accessibilityState.checked).toBe(true);
    const active = await workoutRepo.getActive();
    const committed = active!.exercises[0]!.sets[0]!;
    expect(committed.weightKg).toBe(60);
    expect(committed.reps).toBe(8);
    expect(committed.rpe).toBeNull();
  });

  it('unchecking reverses the row: setCompleted flips back to false, values untouched', async () => {
    const { exercise, workoutExerciseId, workoutRepo } = await setupExercise('weight_reps');
    await renderSection(workoutExerciseId, exercise);

    await fireEvent.changeText(screen.getByTestId('section-row-0-value-weight'), '60');
    await fireEvent.changeText(screen.getByTestId('section-row-0-value-reps'), '8');
    await fireEvent.press(screen.getByTestId('section-row-0-check'));
    expect(screen.getByTestId('section-row-0-check').props.accessibilityState.checked).toBe(true);

    await fireEvent.press(screen.getByTestId('section-row-0-check'));

    expect(screen.getByTestId('section-row-0-check').props.accessibilityState.checked).toBe(false);
    const active = await workoutRepo.getActive();
    const committed = active!.exercises[0]!.sets[0]!;
    expect(committed.isCompleted).toBe(false);
    expect(committed.weightKg).toBe(60);
    expect(committed.reps).toBe(8);
  });
});

describe('ExerciseSetTableSection — check flow starts/cancels the rest timer (M2-10, 02 §7)', () => {
  it('checking a set with the exercise\'s rest timer set starts restTimerStore and schedules a notification', async () => {
    const { exercise, workoutExerciseId, workoutRepo } = await setupExercise('weight_reps');
    await useActiveWorkoutStore.getState().updateExercise(workoutExerciseId, { restSeconds: 90 });
    await renderSection(workoutExerciseId, exercise);

    await fireEvent.changeText(screen.getByTestId('section-row-0-value-weight'), '60');
    await fireEvent.changeText(screen.getByTestId('section-row-0-value-reps'), '8');
    await fireEvent.press(screen.getByTestId('section-row-0-check'));

    const setId = (await workoutRepo.getActive())!.exercises[0]!.sets[0]!.id;
    await waitFor(() => expect(useRestTimerStore.getState().timer).not.toBeNull());
    expect(useRestTimerStore.getState().timer).toMatchObject({ exerciseId: exercise.id, setId });
    expect(scheduleRestNotification).toHaveBeenCalledWith(
      expect.objectContaining({ secondsFromNow: 90, body: expect.stringContaining(`of ${exercise.name}`) }),
    );
  });

  it('checking a set does NOT start a timer when the exercise\'s rest timer is Off (restSeconds null)', async () => {
    const { exercise, workoutExerciseId } = await setupExercise('weight_reps');
    // restSeconds defaults to null (Off) from `setupExercise`'s plain `addExercises` call.
    await renderSection(workoutExerciseId, exercise);

    await fireEvent.changeText(screen.getByTestId('section-row-0-value-weight'), '60');
    await fireEvent.changeText(screen.getByTestId('section-row-0-value-reps'), '8');
    await fireEvent.press(screen.getByTestId('section-row-0-check'));

    expect(useRestTimerStore.getState().timer).toBeNull();
    expect(scheduleRestNotification).not.toHaveBeenCalled();
  });

  it('checking a set does NOT start a timer when the next row (same exercise) is a drop set', async () => {
    const { exercise, workoutExerciseId, workoutRepo } = await setupExercise('weight_reps', { setCount: 2 });
    await useActiveWorkoutStore.getState().updateExercise(workoutExerciseId, { restSeconds: 60 });
    const active = await workoutRepo.getActive();
    const secondSetId = active!.exercises[0]!.sets[1]!.id;
    await useActiveWorkoutStore.getState().setSetType(secondSetId, 'dropset');

    await renderSection(workoutExerciseId, exercise);

    await fireEvent.changeText(screen.getByTestId('section-row-0-value-weight'), '60');
    await fireEvent.changeText(screen.getByTestId('section-row-0-value-reps'), '8');
    await fireEvent.press(screen.getByTestId('section-row-0-check'));

    expect(screen.getByTestId('section-row-0-check').props.accessibilityState.checked).toBe(true);
    expect(useRestTimerStore.getState().timer).toBeNull();
    expect(scheduleRestNotification).not.toHaveBeenCalled();
  });

  it('checking a set DOES start a timer when it is itself followed only by its own last row (no suppression for last-row checks)', async () => {
    const { exercise, workoutExerciseId, workoutRepo } = await setupExercise('weight_reps', { setCount: 2 });
    await useActiveWorkoutStore.getState().updateExercise(workoutExerciseId, { restSeconds: 45 });
    await renderSection(workoutExerciseId, exercise);

    // Check the *last* row — no next row at all, must still start a timer.
    await fireEvent.changeText(screen.getByTestId('section-row-1-value-weight'), '20');
    await fireEvent.changeText(screen.getByTestId('section-row-1-value-reps'), '10');
    await fireEvent.press(screen.getByTestId('section-row-1-check'));

    const setId = (await workoutRepo.getActive())!.exercises[0]!.sets[1]!.id;
    await waitFor(() => expect(useRestTimerStore.getState().timer).not.toBeNull());
    expect(useRestTimerStore.getState().timer!.setId).toBe(setId);
  });

  it('unchecking the set that started the timer cancels it (its own timer only)', async () => {
    const { exercise, workoutExerciseId } = await setupExercise('weight_reps');
    await useActiveWorkoutStore.getState().updateExercise(workoutExerciseId, { restSeconds: 90 });
    await renderSection(workoutExerciseId, exercise);

    await fireEvent.changeText(screen.getByTestId('section-row-0-value-weight'), '60');
    await fireEvent.changeText(screen.getByTestId('section-row-0-value-reps'), '8');
    await fireEvent.press(screen.getByTestId('section-row-0-check'));
    await waitFor(() => expect(useRestTimerStore.getState().timer).not.toBeNull());
    const notificationId = useRestTimerStore.getState().timer!.notificationId!;

    await fireEvent.press(screen.getByTestId('section-row-0-check'));

    await waitFor(() => expect(useRestTimerStore.getState().timer).toBeNull());
    expect(cancelNotification).toHaveBeenCalledWith(notificationId);
  });

  it('unchecking a DIFFERENT set than the one that started the running timer leaves it untouched', async () => {
    const { exercise, workoutExerciseId } = await setupExercise('weight_reps', { setCount: 2 });
    await useActiveWorkoutStore.getState().updateExercise(workoutExerciseId, { restSeconds: 90 });
    await renderSection(workoutExerciseId, exercise);

    // Check + immediately uncheck row 0 with the timer setting Off would be
    // the simplest isolation, but the real "own timer only" scenario needs
    // *some other already-checked row* whose own check never started a
    // timer (e.g. it was checked before the rest-timer setting existed /
    // via a direct store call) while row 1's check owns the running timer.
    await useActiveWorkoutStore.getState().setCompleted(
      useActiveWorkoutStore.getState().workout!.exercises[0]!.sets[0]!.id,
      true,
    );
    await fireEvent.changeText(screen.getByTestId('section-row-1-value-weight'), '20');
    await fireEvent.changeText(screen.getByTestId('section-row-1-value-reps'), '10');
    await fireEvent.press(screen.getByTestId('section-row-1-check'));
    await waitFor(() => expect(useRestTimerStore.getState().timer).not.toBeNull());
    const runningTimer = useRestTimerStore.getState().timer;

    // Uncheck row 0 (never started a timer of its own).
    await fireEvent.press(screen.getByTestId('section-row-0-check'));

    expect(useRestTimerStore.getState().timer).toEqual(runningTimer);
    expect(cancelNotification).not.toHaveBeenCalled();
  });
});

describe('ConnectedSetRow — rep-range targets never auto-commit on check (04 §2.3)', () => {
  it('blocks the check when the only PREVIOUS source is a rep-range target, even though a label shows', async () => {
    const { exercise, workoutRepo } = await setupExercise('reps_only');
    const columns = columnsForExerciseType('reps_only', {
      usesCustomMetric: false,
      rpeEnabled: false,
      weightUnit: 'kg',
      distanceUnit: 'km',
    });
    const active = await workoutRepo.getActive();
    const setId = active!.exercises[0]!.sets[0]!.id;

    await render(
      <ThemeProvider preference="dark">
        <ConnectedSetRow
          testID="range-row"
          setId={setId}
          columns={columns}
          badgeKind="normal"
          workingIndex={1}
          // A rep-range target: a label shows ("6-8") but `autofill.reps`
          // is null, exactly what `previous-values.ts`'s `autofillFrom`
          // produces for a real rep-range routine target (04 §2.3).
          previousResult={{
            label: '6-8',
            autofill: { weightKg: null, reps: null, distanceMeters: null, durationSeconds: null, customMetric: null },
            source: 'routine_target',
            isRepRange: true,
          }}
          units={{ weightUnit: 'kg', distanceUnit: 'km' }}
          exerciseType={exercise.exerciseType}
          exerciseId={exercise.id}
          exerciseName={exercise.name}
          restSeconds={null}
          nextSetType={null}
          setNumber={1}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText('6-8')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('range-row-check'));

    expect(screen.getByTestId('range-row-check').props.accessibilityState.checked).toBe(false);
    expect(triggerNotificationFeedback).toHaveBeenCalledWith('warning');
    const afterBlocked = await workoutRepo.getActive();
    expect(afterBlocked!.exercises[0]!.sets[0]!.isCompleted).toBe(false);
    expect(afterBlocked!.exercises[0]!.sets[0]!.reps).toBeNull();

    // Typing an actual value still commits normally.
    await fireEvent.changeText(screen.getByTestId('range-row-value-reps'), '7');
    await fireEvent.press(screen.getByTestId('range-row-check'));

    expect(screen.getByTestId('range-row-check').props.accessibilityState.checked).toBe(true);
    const afterTyped = await workoutRepo.getActive();
    expect(afterTyped!.exercises[0]!.sets[0]!.reps).toBe(7);
  });
});

describe('ConnectedSetRow — RPE picker (02 §5)', () => {
  it('offers only the 8 enum values with helper text, commits the picked value, and Clear removes it', async () => {
    const { exercise, workoutExerciseId, workoutRepo } = await setupExercise('weight_reps');
    await renderSection(workoutExerciseId, exercise, { rpeEnabled: true });

    await fireEvent.press(screen.getByTestId('section-row-0-rpe'));
    expect(screen.getByTestId('section-row-0-rpe-sheet')).toBeTruthy();

    // Exactly the 8 enum values are enterable.
    for (const value of ['6', '7', '7.5', '8', '8.5', '9', '9.5', '10']) {
      expect(screen.getByTestId(`section-row-0-rpe-${value}`)).toBeTruthy();
    }
    expect(screen.getByText('Max effort')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('section-row-0-rpe-8.5'));

    expect(screen.queryByTestId('section-row-0-rpe-sheet')).toBeNull();
    await waitFor(async () => {
      const active = await workoutRepo.getActive();
      expect(active!.exercises[0]!.sets[0]!.rpe).toBe(8.5);
    });
    expect(screen.getByText('8.5')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('section-row-0-rpe'));
    await fireEvent.press(screen.getByTestId('section-row-0-rpe-clear'));

    await waitFor(async () => {
      const active = await workoutRepo.getActive();
      expect(active!.exercises[0]!.sets[0]!.rpe).toBeNull();
    });
  });

  it('dismissing the RPE sheet via the scrim closes it without writing anything', async () => {
    const { exercise, workoutExerciseId, workoutRepo } = await setupExercise('weight_reps');
    await renderSection(workoutExerciseId, exercise, { rpeEnabled: true });

    await fireEvent.press(screen.getByTestId('section-row-0-rpe'));
    expect(screen.getByTestId('section-row-0-rpe-sheet')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('section-row-0-rpe-sheet-scrim'));

    expect(screen.queryByTestId('section-row-0-rpe-sheet')).toBeNull();
    const active = await workoutRepo.getActive();
    expect(active!.exercises[0]!.sets[0]!.rpe).toBeNull();
  });

  it('toggling rpeEnabled mid-workout adds/removes the RPE column live while retaining the stored value', async () => {
    const { exercise, workoutExerciseId, workoutRepo } = await setupExercise('weight_reps');
    const { rerender } = await renderSection(workoutExerciseId, exercise, { rpeEnabled: false });

    expect(screen.queryByText('RPE')).toBeNull();

    await act(async () => {
      await useActiveWorkoutStore.getState().updateSet(
        (await workoutRepo.getActive())!.exercises[0]!.sets[0]!.id,
        { rpe: 9 },
      );
    });

    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
    await rerender(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider preference="dark">
          <ExerciseSetTableSection
            testID="section"
            workoutExerciseId={workoutExerciseId}
            exercise={exercise}
            weightUnit="kg"
            distanceUnit="km"
            rpeEnabled
            previousValuesMode="any_workout"
            routineId={null}
          />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    expect(screen.getByText('RPE')).toBeTruthy();
    expect(screen.getByText('9')).toBeTruthy();
  });
});

describe('ExerciseSetTableSection — unresolved workoutExerciseId renders nothing', () => {
  it('returns null when the workoutExerciseId does not resolve in the active workout', async () => {
    const { exercise } = await setupExercise('weight_reps');
    await renderSection('nonexistent-workout-exercise-id', exercise);
    expect(screen.queryByTestId('section')).toBeNull();
  });
});

describe('ExerciseSetTableSection — many-sets warning (02 §16.7)', () => {
  it('console.warns once the exercise has more than 50 sets', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { exercise, workoutExerciseId } = await setupExercise('weight_reps', { setCount: 51 });
    await renderSection(workoutExerciseId, exercise);

    await waitFor(() =>
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('51 sets')),
    );
    warnSpy.mockRestore();
  });

  it('does not warn at or under the 50-set threshold', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { exercise, workoutExerciseId } = await setupExercise('weight_reps', { setCount: 2 });
    await renderSection(workoutExerciseId, exercise);

    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('ExerciseSetTableSection — distance column blur commits distanceMeters', () => {
  it('commits a typed km value to distanceMeters on blur (distance_duration type)', async () => {
    const { exercise, workoutExerciseId, workoutRepo } = await setupExercise('distance_duration');
    await renderSection(workoutExerciseId, exercise);

    await fireEvent.changeText(screen.getByTestId('section-row-0-value-distance'), '5');
    await fireEvent(screen.getByTestId('section-row-0-value-distance'), 'blur');

    const active = await workoutRepo.getActive();
    expect(active!.exercises[0]!.sets[0]!.distanceMeters).toBe(5000);
  });
});

describe('ExerciseSetTableSection — CUSTOM column blur commits customMetric', () => {
  it('commits a typed custom value on blur', async () => {
    const { exercise, workoutExerciseId, workoutRepo } = await setupExercise('weight_reps', {
      usesCustomMetric: true,
    });
    await renderSection(workoutExerciseId, exercise);

    await fireEvent.changeText(screen.getByTestId('section-row-0-value-custom'), '12.5');
    await fireEvent(screen.getByTestId('section-row-0-value-custom'), 'blur');

    const active = await workoutRepo.getActive();
    expect(active!.exercises[0]!.sets[0]!.customMetric).toBe(12.5);
  });
});

describe('ExerciseSetTableSection — PREVIOUS tap with no previous data is a no-op', () => {
  it('does nothing when there is no previous set to autofill from', async () => {
    const { exercise, workoutExerciseId, workoutRepo } = await setupExercise('weight_reps');
    await renderSection(workoutExerciseId, exercise);

    await fireEvent.press(screen.getByTestId('section-row-0-previous'));

    expect(screen.getByTestId('section-row-0-value-weight').props.value).toBe('');
    const active = await workoutRepo.getActive();
    expect(active!.exercises[0]!.sets[0]!.weightKg).toBeNull();
  });
});

describe('ExerciseSetTableSection — PREVIOUS tap skips columns the previous set left empty', () => {
  it('autofills weight/reps but leaves CUSTOM untouched when the previous set has no custom metric', async () => {
    const driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    const exerciseRepo = new ExerciseRepositoryImpl(driver);
    const workoutRepo = new WorkoutRepositoryImpl(driver, {});
    const exercise = await exerciseRepo.create({
      name: 'Bench Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
      usesCustomMetric: true,
    });

    const previousWorkout = await workoutRepo.startEmpty({
      title: 'Previous',
      startTime: Date.now() - 100_000,
    });
    const [previousExercise] = await workoutRepo.addExercises(previousWorkout.id, [
      { exerciseId: exercise.id },
    ]);
    const previousSet = previousExercise!.sets[0]!;
    // customMetric deliberately left null — the previous session didn't fill it in.
    await workoutRepo.updateSet(previousSet.id, { weightKg: 45, reps: 9 });
    await workoutRepo.setCompleted(previousSet.id, true);
    await workoutRepo.finish(previousWorkout.id);

    await useActiveWorkoutStore.getState().rehydrate(workoutRepo);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Now', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

    await renderSection(added!.id, exercise);
    await waitFor(() => expect(screen.getByText('45kg × 9')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('section-row-0-previous'));

    expect(screen.getByTestId('section-row-0-value-weight').props.value).toBe('45');
    expect(screen.getByTestId('section-row-0-value-reps').props.value).toBe('9');
    expect(screen.getByTestId('section-row-0-value-custom').props.value).toBe('');

    const active = await workoutRepo.getActive();
    const committedSet = active!.exercises[0]!.sets[0]!;
    expect(committedSet.weightKg).toBe(45);
    expect(committedSet.reps).toBe(9);
    expect(committedSet.customMetric).toBeNull();
  });
});

describe('ExerciseSetTableSection — set-type sheet dismiss without selecting', () => {
  it('dismissing via the scrim closes the sheet without changing the row', async () => {
    const { exercise, workoutExerciseId } = await setupExercise('weight_reps', { setCount: 2 });
    await renderSection(workoutExerciseId, exercise);

    await fireEvent.press(screen.getByTestId('section-row-0-badge'));
    expect(screen.getByTestId('section-row-0-set-type-sheet')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('section-row-0-set-type-sheet-scrim'));

    expect(screen.queryByTestId('section-row-0-set-type-sheet')).toBeNull();
    expect(screen.getByTestId('section-row-0-badge-number').props.children).toBe(1);
    expect(screen.getByTestId('section-row-1-badge-number').props.children).toBe(2);
  });
});

describe('ConnectedSetRow — unresolved set renders nothing', () => {
  it('returns null when setId does not resolve to a set in the store', async () => {
    const { exercise } = await setupExercise('weight_reps');
    const columns = columnsForExerciseType(exercise.exerciseType, {
      usesCustomMetric: false,
      rpeEnabled: false,
      weightUnit: 'kg',
      distanceUnit: 'km',
    });

    await render(
      <ThemeProvider preference="dark">
        <ConnectedSetRow
          testID="ghost-row"
          setId="nonexistent-set-id"
          columns={columns}
          badgeKind="normal"
          workingIndex={1}
          previousResult={{ label: null, autofill: null, source: 'none', isRepRange: false }}
          units={{ weightUnit: 'kg', distanceUnit: 'km' }}
          exerciseType={exercise.exerciseType}
          exerciseId={exercise.id}
          exerciseName={exercise.name}
          restSeconds={null}
          nextSetType={null}
          setNumber={1}
        />
      </ThemeProvider>,
    );

    expect(screen.queryByTestId('ghost-row')).toBeNull();
  });
});

describe('ConnectedSetRow — readCanonical/writeCanonical exhaustiveness guards', () => {
  const SAMPLE_SET = {
    weightKg: 45,
    reps: 9,
    distanceMeters: 5000,
    durationSeconds: 90,
    customMetric: 12.5,
    rpe: 8,
  };

  it('readCanonical reads each known column key', () => {
    expect(readCanonical(SAMPLE_SET, 'weight')).toBe(45);
    expect(readCanonical(SAMPLE_SET, 'reps')).toBe(9);
    expect(readCanonical(SAMPLE_SET, 'distance')).toBe(5000);
    expect(readCanonical(SAMPLE_SET, 'duration')).toBe(90);
    expect(readCanonical(SAMPLE_SET, 'custom')).toBe(12.5);
    expect(readCanonical(SAMPLE_SET, 'rpe')).toBe(8);
  });

  it('readCanonical returns null for an unrecognized column key (never reachable via the real SetColumnSpec[] union, matching the SET_TYPE_MENU/set-table-columns exhaustiveness-test convention)', () => {
    expect(readCanonical(SAMPLE_SET, 'not_a_real_key')).toBeNull();
  });

  it('writeCanonical writes each known column key onto the patch', () => {
    const patch: UpdateSetInput = {};
    writeCanonical(patch, 'weight', 10);
    writeCanonical(patch, 'reps', 5);
    writeCanonical(patch, 'distance', 100);
    writeCanonical(patch, 'duration', 60);
    writeCanonical(patch, 'custom', 3.5);
    writeCanonical(patch, 'rpe', 7);
    expect(patch).toEqual({
      weightKg: 10,
      reps: 5,
      distanceMeters: 100,
      durationSeconds: 60,
      customMetric: 3.5,
      rpe: 7,
    });
  });

  it('writeCanonical is a no-op for an unrecognized column key', () => {
    const patch: UpdateSetInput = {};
    writeCanonical(patch, 'not_a_real_key', 5);
    expect(patch).toEqual({});
  });
});
