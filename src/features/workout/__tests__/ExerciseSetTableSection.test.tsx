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
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import type { Exercise } from '@/data/exercises/types';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { migrate } from '@/data/sqlite/migrator';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import type { ExerciseType } from '@/domain/enums';
import { ThemeProvider } from '@/ui/theme-provider';

import { ExerciseSetTableSection } from '../ExerciseSetTableSection';
import { useActiveWorkoutStore } from '../activeWorkoutStore';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

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

describe('ExerciseSetTableSection — check toggle (basic, M2-07 owns validation)', () => {
  it('tapping the check cell calls setCompleted directly', async () => {
    const { exercise, workoutExerciseId, workoutRepo } = await setupExercise('weight_reps');
    await renderSection(workoutExerciseId, exercise);

    await fireEvent.press(screen.getByTestId('section-row-0-check'));

    const active = await workoutRepo.getActive();
    expect(active!.exercises[0]!.sets[0]!.isCompleted).toBe(true);
  });
});
