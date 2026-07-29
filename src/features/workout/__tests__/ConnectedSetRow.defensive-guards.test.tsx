/**
 * `ConnectedSetRow` defensive-guard tests — `handleChangeValue`/
 * `handleBlurValue` (M2-06) both resolve `columnKey` against this row's own
 * `columns` prop before doing anything; a key that doesn't resolve is a
 * no-op rather than a crash. Never reachable through the real `SetRow` UI
 * (it only ever calls these with a `column.key` it just rendered from that
 * same `columns` array) — exercised directly here by mocking `ui/SetRow` to
 * capture its props and invoking the callbacks with a key `columns` doesn't
 * contain, the same "exhaustiveness guard, deliberately invalid input"
 * pattern `readCanonical`/`writeCanonical`'s own tests in
 * `ExerciseSetTableSection.test.tsx` already use.
 */
import { render } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import { ThemeProvider } from '@/ui/theme-provider';
import type { SetRowProps } from '@/ui/SetRow';

import { useActiveWorkoutStore } from '../activeWorkoutStore';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

let capturedProps: SetRowProps | null = null;

jest.mock('@/ui/SetRow', () => {
  const ReactActual = jest.requireActual('react');
  return {
    SetRow: (props: SetRowProps) => {
      capturedProps = props;
      return ReactActual.createElement(ReactActual.Fragment);
    },
  };
});

// Imported *after* the mock above so `ConnectedSetRow` picks up the mocked
// `ui/SetRow` — same ordering `ExerciseSetTableSection.render-isolation
// .test.tsx` already established.
// eslint-disable-next-line import/first
import { ExerciseSetTableSection } from '../ExerciseSetTableSection';

afterEach(() => {
  capturedProps = null;
});

describe('ConnectedSetRow — handleChangeValue/handleBlurValue defensive guards', () => {
  it('is a no-op — no store write, no throw — when called with a column key absent from this row\'s own columns', async () => {
    const driver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    const exerciseRepo = new ExerciseRepositoryImpl(driver);
    const workoutRepo = new WorkoutRepositoryImpl(driver, {});
    const exercise = await exerciseRepo.create({
      name: 'Test Exercise',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
    });
    await useActiveWorkoutStore.getState().rehydrate(workoutRepo);
    await useActiveWorkoutStore.getState().startEmpty({ title: 'W', startTime: Date.now() });
    const [added] = await useActiveWorkoutStore.getState().addExercises([{ exerciseId: exercise.id }]);

    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0 } } });
    await render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider preference="dark">
          <ExerciseSetTableSection
            testID="section"
            workoutExerciseId={added!.id}
            exercisePosition={0}
            exercise={exercise}
            weightUnit="kg"
            distanceUnit="km"
            rpeEnabled={false}
            previousValuesMode="any_workout"
            routineId={null}
          />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    expect(capturedProps).not.toBeNull();
    // `SetRow`'s own callbacks are optional on the type (M2-14 added
    // `readOnly` mode, where they're never supplied) — `ConnectedSetRow`
    // always passes them for real, hence the non-null assertions here.
    expect(() => capturedProps!.onChangeValue!('not-a-real-column', 'x')).not.toThrow();
    expect(() => capturedProps!.onBlurValue!('not-a-real-column')).not.toThrow();

    const active = await workoutRepo.getActive();
    expect(active!.exercises[0]!.sets[0]!.weightKg).toBeNull();
    expect(active!.exercises[0]!.sets[0]!.reps).toBeNull();
  });
});
