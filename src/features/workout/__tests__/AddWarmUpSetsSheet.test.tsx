/**
 * `AddWarmUpSetsSheet` unit tests (M2-16) — direct render (not through
 * `ExerciseCard`) covering the pieces `ExerciseCard.test.tsx`'s end-to-end
 * flow tests don't isolate: no-prefill blank field (no first normal set
 * value and no previous session), dumbbell equipment (no bar-weight
 * floor), the lb unit path, Generate disabled on an invalid/blank draft,
 * and Cancel/scrim dismissal doing nothing. Real `WorkoutRepositoryImpl`
 * over an in-memory `better-sqlite3` driver + a real (mocked-singleton)
 * `settingsStore`, same convention as every other M2 integration suite (08
 * §5: never mock repositories).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import type { Exercise, ExerciseRepository } from '@/data/exercises/types';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { migrate } from '@/data/sqlite/migrator';
import { SettingsRepository } from '@/data/settings/settings-repository';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import { createSettingsStore } from '@/features/settings/settings-store';
import { ThemeProvider } from '@/ui/theme-provider';

import { AddWarmUpSetsSheet, type AddWarmUpSetsSheetProps } from '../AddWarmUpSetsSheet';
import { useActiveWorkoutStore } from '../activeWorkoutStore';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock('@/features/settings/settings-store', () => {
  const actual = jest.requireActual('@/features/settings/settings-store');
  return {
    ...actual,
    useSettingsStore: actual.createSettingsStore(),
  };
});

interface Fixture {
  driver: SqliteDriver;
  workoutRepo: WorkoutRepositoryImpl;
  exerciseRepo: ExerciseRepository;
  exercise: Exercise;
  workoutExerciseId: string;
}

async function setup(equipment: Exercise['equipment'] = 'barbell'): Promise<Fixture> {
  const driver = openBetterSqlite3Driver(':memory:');
  migrate(driver);

  const { useSettingsStore } = jest.requireMock('@/features/settings/settings-store') as {
    useSettingsStore: ReturnType<typeof createSettingsStore>;
  };
  await useSettingsStore.getState().load(new SettingsRepository(driver));

  const workoutRepo = new WorkoutRepositoryImpl(driver, {});
  const exerciseRepo = new ExerciseRepositoryImpl(driver);
  await useActiveWorkoutStore.getState().rehydrate(workoutRepo);

  const exercise = await exerciseRepo.create({
    name: 'Dumbbell Row',
    exerciseType: 'weight_reps',
    primaryMuscleGroup: 'upper_back',
    equipment,
  });
  await useActiveWorkoutStore.getState().startEmpty({ title: 'Today', startTime: Date.now() });
  const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

  return { driver, workoutRepo, exerciseRepo, exercise, workoutExerciseId: added!.id };
}

async function renderSheet(fixture: Fixture, overrides: Partial<AddWarmUpSetsSheetProps> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
  const props: AddWarmUpSetsSheetProps = {
    testID: 'sheet',
    visible: true,
    onDismiss: jest.fn(),
    workoutExerciseId: fixture.workoutExerciseId,
    exerciseId: fixture.exercise.id,
    equipment: fixture.exercise.equipment,
    weightUnit: 'kg',
    previousValuesMode: 'any_workout',
    routineId: null,
    ...overrides,
  };
  const result = await render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider preference="dark">
        <AddWarmUpSetsSheet {...props} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { props, ...result };
}

describe('AddWarmUpSetsSheet (M2-16, 02 §12)', () => {
  it('renders nothing while not visible', async () => {
    const fixture = await setup();
    await renderSheet(fixture, { visible: false });
    expect(screen.queryByTestId('sheet')).toBeNull();
  });

  it('with no first-normal-set value and no previous session, the field starts blank and Generate is disabled', async () => {
    const fixture = await setup();
    await renderSheet(fixture);

    await waitFor(() => expect(screen.getByTestId('sheet-working-weight')).toBeTruthy());
    expect(screen.getByTestId('sheet-working-weight').props.value).toBe('');
    expect(screen.getByTestId('sheet-generate').props.accessibilityState.disabled).toBe(true);
  });

  it('typing a working weight enables Generate; Generate inserts warm-up rows and dismisses', async () => {
    const fixture = await setup('dumbbell');
    await renderSheet(fixture);

    await fireEvent.changeText(screen.getByTestId('sheet-working-weight'), '24');
    expect(screen.getByTestId('sheet-generate').props.accessibilityState.disabled).toBe(false);

    await fireEvent.press(screen.getByTestId('sheet-generate'));

    await waitFor(async () => {
      const persisted = await fixture.workoutRepo.getFull(
        useActiveWorkoutStore.getState().workout!.id,
      );
      const sets = persisted!.exercises[0]!.sets;
      // Dumbbell equipment: no bar-weight floor, dumbbell increment (2 kg
      // default) — 4 default-formula rows above the original bare set.
      expect(sets).toHaveLength(5);
      expect(sets.slice(0, 4).every((s) => s.setType === 'warmup')).toBe(true);
      // 0% with no floor -> literal 0 (08 §4.3's "no bar to float to" case).
      expect(sets[0]!.weightKg).toBe(0);
      // 40% of 24 = 9.6, nearest 2 kg -> 10.
      expect(sets[1]!.weightKg).toBe(10);
    });
  });

  it('a working weight of 0 is valid (empty bar) and enables Generate', async () => {
    const fixture = await setup();
    await renderSheet(fixture);

    await fireEvent.changeText(screen.getByTestId('sheet-working-weight'), '0');
    expect(screen.getByTestId('sheet-generate').props.accessibilityState.disabled).toBe(false);
  });

  it('with no first-normal-set weight, seeds the field once the previous-session query resolves (async re-seed)', async () => {
    const driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    const { useSettingsStore } = jest.requireMock('@/features/settings/settings-store') as {
      useSettingsStore: ReturnType<typeof createSettingsStore>;
    };
    await useSettingsStore.getState().load(new SettingsRepository(driver));
    const exerciseRepo = new ExerciseRepositoryImpl(driver);
    const workoutRepo = new WorkoutRepositoryImpl(driver, {});
    const exercise = await exerciseRepo.create({
      name: 'Overhead Press',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'shoulders',
      equipment: 'barbell',
    });

    // A previous, completed workout with one checked 52.5 kg x 6 set.
    const previousWorkout = await workoutRepo.startEmpty({
      title: 'Previous',
      startTime: Date.now() - 100_000,
    });
    const [previousExercise] = await workoutRepo.addExercises(previousWorkout.id, [
      { exerciseId: exercise.id },
    ]);
    await workoutRepo.updateSet(previousExercise!.sets[0]!.id, { weightKg: 52.5, reps: 6 });
    await workoutRepo.setCompleted(previousExercise!.sets[0]!.id, true);
    await workoutRepo.finish(previousWorkout.id);

    await useActiveWorkoutStore.getState().rehydrate(workoutRepo);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'Now', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

    await renderSheet({
      driver,
      workoutRepo,
      exerciseRepo,
      exercise,
      workoutExerciseId: added!.id,
    });

    // The bare set has no weight of its own — the field starts blank, then
    // seeds from the previous session's 52.5 kg once that query resolves.
    await waitFor(() =>
      expect(screen.getByTestId('sheet-working-weight').props.value).toBe('52.5'),
    );

    driver.close();
  });

  it('pre-fills from the first normal set\'s own weight when present', async () => {
    const fixture = await setup();
    const setId = useActiveWorkoutStore.getState().workout!.exercises[0]!.sets[0]!.id;
    await useActiveWorkoutStore.getState().updateSet(setId, { weightKg: 62.5, reps: 5 });
    await renderSheet(fixture);

    await waitFor(() =>
      expect(screen.getByTestId('sheet-working-weight').props.value).toBe('62.5'),
    );
  });

  it('lb unit path: displays/accepts the working weight in lb and stores canonical kg', async () => {
    const fixture = await setup();
    const setId = useActiveWorkoutStore.getState().workout!.exercises[0]!.sets[0]!.id;
    // 100 kg -> displayed in lb.
    await useActiveWorkoutStore.getState().updateSet(setId, { weightKg: 100, reps: 5 });
    await renderSheet(fixture, { weightUnit: 'lbs' });

    await waitFor(() => {
      const shown = Number(screen.getByTestId('sheet-working-weight').props.value);
      // kgToLb(100) ~= 220.46 — assert it's the converted value, not the
      // raw canonical 100.
      expect(shown).toBeGreaterThan(200);
      expect(shown).toBeLessThan(230);
    });

    await fireEvent.press(screen.getByTestId('sheet-generate'));

    await waitFor(async () => {
      const persisted = await fixture.workoutRepo.getFull(
        useActiveWorkoutStore.getState().workout!.id,
      );
      const sets = persisted!.exercises[0]!.sets;
      expect(sets).toHaveLength(5);
      // Every generated row's canonical weight is still a plausible kg
      // value in the working-weight's neighborhood (round-trip through lb
      // math and back never explodes/collapses the magnitude).
      for (const s of sets.slice(0, 4)) {
        expect(s.weightKg).toBeGreaterThanOrEqual(0);
        expect(s.weightKg).toBeLessThanOrEqual(110);
      }
    });
  });

  it('tapping the scrim dismisses without writing anything', async () => {
    const fixture = await setup();
    const { props } = await renderSheet(fixture);

    await fireEvent.press(screen.getByTestId('sheet-scrim'));
    expect(props.onDismiss).toHaveBeenCalled();

    const persisted = await fixture.workoutRepo.getFull(
      useActiveWorkoutStore.getState().workout!.id,
    );
    expect(persisted!.exercises[0]!.sets).toHaveLength(1);
  });

  it('falls back to the default "add-warmup-sets-sheet" testID when none is given', async () => {
    const fixture = await setup();
    await renderSheet(fixture, { testID: undefined });
    expect(screen.getByTestId('add-warmup-sets-sheet')).toBeTruthy();
  });

  it('pluralizes the row-count blurb for a single-row formula ("1 warm-up set", not "sets")', async () => {
    const fixture = await setup();
    const { useSettingsStore } = jest.requireMock('@/features/settings/settings-store') as {
      useSettingsStore: ReturnType<typeof createSettingsStore>;
    };
    const current = useSettingsStore.getState().settings.warmup_calc;
    await useSettingsStore
      .getState()
      .setSetting('warmup_calc', { ...current, sets: [{ percent: 50, reps: 5 }] });

    await renderSheet(fixture);
    expect(screen.getByText('1 warm-up set will be added above your working sets.')).toBeTruthy();
  });

  it('the default multi-row formula uses the plural blurb', async () => {
    const fixture = await setup();
    await renderSheet(fixture);
    expect(screen.getByText('4 warm-up sets will be added above your working sets.')).toBeTruthy();
  });

  it('bar-weight fallback: no bar named "Barbell" configured falls back to the first configured bar', async () => {
    const fixture = await setup();
    const { useSettingsStore } = jest.requireMock('@/features/settings/settings-store') as {
      useSettingsStore: ReturnType<typeof createSettingsStore>;
    };
    const current = useSettingsStore.getState().settings.plate_calc;
    await useSettingsStore.getState().setSetting('plate_calc', {
      ...current,
      bars: [{ name: 'Trap Bar', weight_kg: 25 }],
    });

    await renderSheet(fixture);
    await fireEvent.changeText(screen.getByTestId('sheet-working-weight'), '100');
    await fireEvent.press(screen.getByTestId('sheet-generate'));

    await waitFor(async () => {
      const persisted = await fixture.workoutRepo.getFull(
        useActiveWorkoutStore.getState().workout!.id,
      );
      // 0% row floors at the fallback "Trap Bar" weight (25), not the
      // shipped-default 20 kg "Barbell" entry (which no longer exists).
      expect(persisted!.exercises[0]!.sets[0]!.weightKg).toBe(25);
    });
  });

  it('bar-weight fallback: no bars configured at all falls back to a literal 20 kg', async () => {
    const fixture = await setup();
    const { useSettingsStore } = jest.requireMock('@/features/settings/settings-store') as {
      useSettingsStore: ReturnType<typeof createSettingsStore>;
    };
    const current = useSettingsStore.getState().settings.plate_calc;
    await useSettingsStore.getState().setSetting('plate_calc', { ...current, bars: [] });

    await renderSheet(fixture);
    await fireEvent.changeText(screen.getByTestId('sheet-working-weight'), '100');
    await fireEvent.press(screen.getByTestId('sheet-generate'));

    await waitFor(async () => {
      const persisted = await fixture.workoutRepo.getFull(
        useActiveWorkoutStore.getState().workout!.id,
      );
      expect(persisted!.exercises[0]!.sets[0]!.weightKg).toBe(20);
    });
  });
});
