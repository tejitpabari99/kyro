/**
 * `ExerciseCard` unit tests (M2-09) — direct render (not through the full
 * `ActiveWorkoutScreen`) covering the card's own chrome and card-local ⋯
 * menu items: superset indicator, note row visibility + edit, rest-timer
 * row + sheet, `+ Add Set`, name-tap navigation, and every ⋯ menu item's
 * wiring (the cross-card ones as bubbled callback assertions, the
 * card-local ones — Remove from Superset, Add Warm-Up Sets stub — against
 * real store/DB state). Real `WorkoutRepositoryImpl`/`ExerciseRepositoryImpl`
 * over an in-memory `better-sqlite3` driver (08 §5), same convention as
 * every other M2 suite.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import type { Exercise, ExerciseRepository } from '@/data/exercises/types';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { migrate } from '@/data/sqlite/migrator';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import { ThemeProvider } from '@/ui/theme-provider';

import { ExerciseCard, type ExerciseCardProps } from '../ExerciseCard';
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
  exercise: Exercise;
  workoutExerciseId: string;
}

async function setup(): Promise<Fixture> {
  const driver = openBetterSqlite3Driver(':memory:');
  migrate(driver);
  const workoutRepo = new WorkoutRepositoryImpl(driver, {});
  const exerciseRepo = new ExerciseRepositoryImpl(driver);
  await useActiveWorkoutStore.getState().rehydrate(workoutRepo);

  const exercise = await exerciseRepo.create({
    name: 'Incline Bench Press',
    exerciseType: 'weight_reps',
    primaryMuscleGroup: 'chest',
  });
  await useActiveWorkoutStore.getState().startEmpty({ title: 'Today', startTime: Date.now() });
  const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

  return { driver, workoutRepo, exerciseRepo, exercise, workoutExerciseId: added!.id };
}

async function renderCard(fixture: Fixture, overrides: Partial<ExerciseCardProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  const props: ExerciseCardProps = {
    testID: 'card',
    workoutExerciseId: fixture.workoutExerciseId,
    exercisePosition: 0,
    exercise: fixture.exercise,
    notes: null,
    restSeconds: null,
    supersetVisual: null,
    weightUnit: 'kg',
    distanceUnit: 'km',
    rpeEnabled: false,
    previousValuesMode: 'any_workout',
    routineId: null,
    onReorderPress: jest.fn(),
    onReplacePress: jest.fn(),
    onAddToSupersetPress: jest.fn(),
    onRemove: jest.fn(),
    ...overrides,
  };
  const result = await render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider preference="dark">
        <ExerciseCard {...props} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { props, ...result };
}

beforeEach(() => {
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

describe('ExerciseCard — chrome (02 §3)', () => {
  it('renders the thumb, name, and rest-timer row (Off by default)', async () => {
    const fixture = await setup();
    await renderCard(fixture);
    expect(screen.getByText('Incline Bench Press')).toBeTruthy();
    expect(screen.getByText('Rest Timer: Off')).toBeTruthy();
    expect(screen.queryByTestId('card-superset-indicator')).toBeNull();
    expect(screen.getByTestId('card-note-placeholder')).toBeTruthy();
  });

  it('renders the rest-timer value and a note row when notes are present', async () => {
    const fixture = await setup();
    await renderCard(fixture, { restSeconds: 90, notes: 'Keep elbows tucked' });
    expect(screen.getByText('Rest Timer: 1min 30s')).toBeTruthy();
    expect(screen.getByTestId('card-note-row')).toBeTruthy();
    expect(screen.getByTestId('card-note-text')).toBeTruthy();
    expect(screen.getByText('Keep elbows tucked')).toBeTruthy();
  });

  it('renders the superset indicator (label + color) when supersetVisual is set', async () => {
    const fixture = await setup();
    await renderCard(fixture, { supersetVisual: { label: 'B', color: '#06B6D4' } });
    expect(screen.getByTestId('card-superset-indicator')).toBeTruthy();
    expect(screen.getByText('Superset B')).toBeTruthy();
  });

  it('tapping the name calls router.push to the full-screen exercise detail route', async () => {
    const fixture = await setup();
    await renderCard(fixture);
    await fireEvent.press(screen.getByTestId('card-name'));
    expect(router.push).toHaveBeenCalledWith(`/exercise/${fixture.exercise.id}`);
  });

  it('"+ Add Set" appends a bare normal row to the store/DB', async () => {
    const fixture = await setup();
    await renderCard(fixture);
    await waitFor(() => expect(screen.getByTestId('card-table-row-0-value-weight')).toBeTruthy());
    expect(screen.queryByTestId('card-table-row-1-value-weight')).toBeNull();

    await fireEvent.press(screen.getByTestId('card-add-set'));

    await waitFor(() => expect(screen.getByTestId('card-table-row-1-value-weight')).toBeTruthy());
    const persisted = await fixture.workoutRepo.getFull(
      useActiveWorkoutStore.getState().workout!.id,
    );
    expect(persisted!.exercises[0]!.sets).toHaveLength(2);
  });
});

describe('ExerciseCard — inline note field (06 §4.1)', () => {
  it('tapping the note row enters edit mode pre-filled; typing and blurring persists it', async () => {
    const fixture = await setup();
    await renderCard(fixture, { notes: 'Old note' });

    await fireEvent.press(screen.getByTestId('card-note-row'));
    await waitFor(() => expect(screen.getByTestId('card-note-input')).toBeTruthy());
    expect(screen.getByTestId('card-note-input').props.value).toBe('Old note');

    await fireEvent.changeText(screen.getByTestId('card-note-input'), 'New note');
    await fireEvent(screen.getByTestId('card-note-input'), 'blur');

    // The field returns to display mode; `notes` itself is a plain prop here
    // (this test renders `ExerciseCard` directly, not through
    // `ActiveWorkoutScreen`'s store-subscribed re-render), so the persisted
    // DB write is the meaningful assertion, not the still-static on-screen text.
    await waitFor(() => expect(screen.queryByTestId('card-note-input')).toBeNull());
    await waitFor(async () => {
      const persisted = await fixture.workoutRepo.getFull(
        useActiveWorkoutStore.getState().workout!.id,
      );
      expect(persisted!.exercises[0]!.notes).toBe('New note');
    });
  });
});

describe('ExerciseCard — rest timer row + sheet (02 §3, §7)', () => {
  it('tapping the rest-timer row opens the picker; selecting a value persists it', async () => {
    const fixture = await setup();
    await renderCard(fixture);

    await fireEvent.press(screen.getByTestId('card-rest-timer-row'));
    await waitFor(() => expect(screen.getByTestId('card-rest-timer-sheet')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('card-rest-timer-sheet-wheel-option-90'));

    // `restSeconds` is a plain prop here (direct render, not through
    // `ActiveWorkoutScreen`'s store-subscribed re-render) — assert the
    // persisted DB write, not the still-static row label.
    await waitFor(async () => {
      const persisted = await fixture.workoutRepo.getFull(
        useActiveWorkoutStore.getState().workout!.id,
      );
      expect(persisted!.exercises[0]!.restSeconds).toBe(90);
    });
  });

  it('⋯ → Rest Timer opens the same sheet', async () => {
    const fixture = await setup();
    await renderCard(fixture);

    await fireEvent.press(screen.getByTestId('card-menu-button'));
    await fireEvent.press(screen.getByTestId('card-menu-rest-timer'));
    await waitFor(() => expect(screen.getByTestId('card-rest-timer-sheet')).toBeTruthy());
  });
});

describe('ExerciseCard — ⋯ menu wiring (02 §3)', () => {
  it('Reorder Exercises bubbles onReorderPress', async () => {
    const fixture = await setup();
    const { props } = await renderCard(fixture);

    await fireEvent.press(screen.getByTestId('card-menu-button'));
    await fireEvent.press(screen.getByTestId('card-menu-reorder'));
    expect(props.onReorderPress).toHaveBeenCalled();
  });

  it('Replace Exercise bubbles onReplacePress with this card\'s workoutExerciseId', async () => {
    const fixture = await setup();
    const { props } = await renderCard(fixture);

    await fireEvent.press(screen.getByTestId('card-menu-button'));
    await fireEvent.press(screen.getByTestId('card-menu-replace'));
    expect(props.onReplacePress).toHaveBeenCalledWith(fixture.workoutExerciseId);
  });

  it('Add to Superset bubbles onAddToSupersetPress when ungrouped', async () => {
    const fixture = await setup();
    const { props } = await renderCard(fixture, { supersetVisual: null });

    await fireEvent.press(screen.getByTestId('card-menu-button'));
    await waitFor(() => expect(screen.getByTestId('card-menu-add-to-superset')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('card-menu-add-to-superset'));
    expect(props.onAddToSupersetPress).toHaveBeenCalledWith(fixture.workoutExerciseId);
  });

  it('Remove from Superset (grouped) clears supersetId locally, no bubbling needed', async () => {
    const fixture = await setup();
    await useActiveWorkoutStore.getState().updateExercise(fixture.workoutExerciseId, { supersetId: 0 });
    await renderCard(fixture, { supersetVisual: { label: 'A', color: '#8B5CF6' } });

    await fireEvent.press(screen.getByTestId('card-menu-button'));
    await waitFor(() => expect(screen.getByTestId('card-menu-remove-from-superset')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('card-menu-remove-from-superset'));

    await waitFor(async () => {
      const persisted = await fixture.workoutRepo.getFull(
        useActiveWorkoutStore.getState().workout!.id,
      );
      expect(persisted!.exercises[0]!.supersetId).toBeNull();
    });
  });

  it('Remove from Superset dissolves the group when it drops to exactly one remaining member', async () => {
    const fixture = await setup();
    const [second] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: fixture.exercise.id }]);
    await useActiveWorkoutStore.getState().updateExercise(fixture.workoutExerciseId, { supersetId: 0 });
    await useActiveWorkoutStore.getState().updateExercise(second!.id, { supersetId: 0 });
    await renderCard(fixture, { supersetVisual: { label: 'A', color: '#8B5CF6' } });

    await fireEvent.press(screen.getByTestId('card-menu-button'));
    await waitFor(() => expect(screen.getByTestId('card-menu-remove-from-superset')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('card-menu-remove-from-superset'));

    await waitFor(async () => {
      const persisted = await fixture.workoutRepo.getFull(
        useActiveWorkoutStore.getState().workout!.id,
      );
      const removed = persisted!.exercises.find((we) => we.id === fixture.workoutExerciseId)!;
      const remaining = persisted!.exercises.find((we) => we.id === second!.id)!;
      expect(removed.supersetId).toBeNull();
      // The group had exactly 2 members — removing one must dissolve the
      // other's own supersetId too (02 §8: "group of 1 dissolves automatically").
      expect(remaining.supersetId).toBeNull();
    });
  });

  it('Remove Exercise bubbles onRemove with the id and exercise name', async () => {
    const fixture = await setup();
    const { props } = await renderCard(fixture);

    await fireEvent.press(screen.getByTestId('card-menu-button'));
    await fireEvent.press(screen.getByTestId('card-menu-remove-exercise'));
    expect(props.onRemove).toHaveBeenCalledWith(fixture.workoutExerciseId, 'Incline Bench Press');
  });
});

/** Same shape as `setup()`, but the exercise is created with `equipment: 'barbell'` — needed for the default-formula test's "0% = empty bar" / bar-weight-floor rows to actually engage (`setup()`'s own exercise defaults to `equipment: 'none'`, `ExerciseRepositoryImpl.create`'s own default, which every other test in this file is indifferent to). */
async function setupBarbell(): Promise<Fixture> {
  const driver = openBetterSqlite3Driver(':memory:');
  migrate(driver);
  const workoutRepo = new WorkoutRepositoryImpl(driver, {});
  const exerciseRepo = new ExerciseRepositoryImpl(driver);
  await useActiveWorkoutStore.getState().rehydrate(workoutRepo);

  const exercise = await exerciseRepo.create({
    name: 'Barbell Back Squat',
    exerciseType: 'weight_reps',
    primaryMuscleGroup: 'quadriceps',
    equipment: 'barbell',
  });
  await useActiveWorkoutStore.getState().startEmpty({ title: 'Today', startTime: Date.now() });
  const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

  return { driver, workoutRepo, exerciseRepo, exercise, workoutExerciseId: added!.id };
}

describe('ExerciseCard — Add Warm-Up Sets (M2-16, 02 §12)', () => {
  it('⋯ → Add Warm-Up Sets opens the sheet pre-filled from the first normal set\'s weight', async () => {
    const fixture = await setupBarbell();
    const firstSetId = useActiveWorkoutStore.getState().workout!.exercises[0]!.sets[0]!.id;
    await useActiveWorkoutStore.getState().updateSet(firstSetId, { weightKg: 100, reps: 5 });
    await renderCard(fixture);

    await fireEvent.press(screen.getByTestId('card-menu-button'));
    await fireEvent.press(screen.getByTestId('card-menu-warmup-sets'));

    await waitFor(() => expect(screen.getByTestId('card-warmup-sheet')).toBeTruthy());
    expect(screen.getByTestId('card-warmup-sheet-working-weight').props.value).toBe('100');
  });

  it('Generate inserts the default-formula warm-up rows above the existing set, without disturbing working-set numbering', async () => {
    const fixture = await setupBarbell();
    const firstSetId = useActiveWorkoutStore.getState().workout!.exercises[0]!.sets[0]!.id;
    await useActiveWorkoutStore.getState().updateSet(firstSetId, { weightKg: 100, reps: 5 });
    await renderCard(fixture);

    // One working row at SET badge "1" before generating.
    await waitFor(() =>
      expect(screen.getByTestId('card-table-row-0-badge-number')).toHaveTextContent('1'),
    );

    await fireEvent.press(screen.getByTestId('card-menu-button'));
    await fireEvent.press(screen.getByTestId('card-menu-warmup-sets'));
    await waitFor(() => expect(screen.getByTestId('card-warmup-sheet-working-weight')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('card-warmup-sheet-generate'));

    // Sheet dismisses.
    await waitFor(() => expect(screen.queryByTestId('card-warmup-sheet')).toBeNull());

    // Default formula (P8) @ 100 kg, 2.5 kg rounding, 20 kg bar -> 4 W rows
    // above the original working set, which keeps SET badge "1" (warm-ups
    // don't consume working-set numbering, 02 §4/§12).
    await waitFor(() => expect(screen.getByTestId('card-table-row-4-badge-number')).toBeTruthy());
    for (let i = 0; i < 4; i += 1) {
      expect(screen.getByTestId(`card-table-row-${i}-badge-circle`)).toBeTruthy();
    }
    expect(screen.getByTestId('card-table-row-4-badge-number')).toHaveTextContent('1');

    const persisted = await fixture.workoutRepo.getFull(
      useActiveWorkoutStore.getState().workout!.id,
    );
    const sets = persisted!.exercises[0]!.sets;
    expect(sets.map((s) => ({ setType: s.setType, weightKg: s.weightKg, reps: s.reps }))).toEqual([
      { setType: 'warmup', weightKg: 20, reps: 10 },
      { setType: 'warmup', weightKg: 40, reps: 8 },
      { setType: 'warmup', weightKg: 60, reps: 5 },
      { setType: 'warmup', weightKg: 80, reps: 3 },
      { setType: 'normal', weightKg: 100, reps: 5 },
    ]);
    expect(sets.every((s) => !s.isCompleted)).toBe(true);
  });
});
