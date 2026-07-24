/**
 * `ExerciseSetTableSection` render-isolation test (M2-06 acceptance gate,
 * 06 §8: "memoize rows with per-set selectors... typing in one row doesn't
 * re-render others — write at least one test/assertion proving row
 * isolation").
 *
 * Technique: mock `ui/SetRow` (the leaf every row eventually renders)
 * with a `React.memo`-wrapped spy, while keeping the *real*
 * `ConnectedSetRow` — deliberately not the other way around: mocking away
 * `ConnectedSetRow` itself would also remove the very
 * `selectWorkoutSet(setId)` subscription this test needs to exercise (the
 * mock would only ever see the props `ExerciseSetTableSection` passes down,
 * which don't change on a value edit — that was confirmed empirically while
 * building this test: it made *every* row's spy report zero re-renders,
 * including the edited one, which would have been a false pass for the
 * wrong reason). With the real `ConnectedSetRow` in place, editing one
 * row's value (`updateSet`, the exact call its own blur handler makes)
 * changes only *that* row's own subscribed `WorkoutSet` reference
 * (`activeWorkoutStore`'s structural sharing, M2-03) — the real
 * `ConnectedSetRow` for that row re-renders and passes new `values` into
 * the mocked `SetRow`, while sibling rows' `ConnectedSetRow` instances
 * never re-render at all (their own subscription is unchanged *and* their
 * props from `ExerciseSetTableSection` stay referentially stable), so their
 * mocked `SetRow` spy is never called again.
 */
import { act, render, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import { ThemeProvider } from '@/ui/theme-provider';

import { useActiveWorkoutStore } from '../activeWorkoutStore';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

const renderSpy = jest.fn();
(globalThis as Record<string, unknown>).__setRowRenderSpy = renderSpy;

jest.mock('@/ui/SetRow', () => {
  const ReactActual = jest.requireActual('react');
  // `SetRow`'s own identifying prop is `testID` (`section-row-<index>`,
  // stable per row) — used as the spy key since it's the one prop this
  // mock can read without importing the real `WorkoutSet`-shaped values.
  const MockSetRow = ReactActual.memo(function MockSetRow(props: { testID?: string }) {
    (globalThis as unknown as { __setRowRenderSpy: (id?: string) => void }).__setRowRenderSpy(
      props.testID,
    );
    return null;
  });
  return { SetRow: MockSetRow };
});

// Imported *after* the mock above so `ConnectedSetRow` picks up the mocked
// `ui/SetRow`.
// eslint-disable-next-line import/first
import { ExerciseSetTableSection } from '../ExerciseSetTableSection';

describe('ExerciseSetTableSection — per-row typing isolation (06 §8)', () => {
  it('committing an edit to one set only re-renders that set’s own row', async () => {
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
    const setA = await useActiveWorkoutStore.getState().addSet(added!.id);
    await useActiveWorkoutStore.getState().addSet(added!.id); // setB — its own id isn't needed below, only its row's isolation.
    // Now 3 sets total: the auto-created one, setA, setB.
    const allSetIds = useActiveWorkoutStore.getState().workout!.exercises[0]!.sets.map((s) => s.id);
    expect(allSetIds).toHaveLength(3);

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

    // Wait for the `previousSets` query to actually settle *before* taking
    // the baseline render count — otherwise its loading->success transition
    // (an unrelated, one-time re-render of every row, once `previousResults`
    // recomputes with a new array reference) can land inside the window
    // we're about to measure and produce a false positive for "an edit
    // re-rendered every row." A fixed `>= 3` call-count threshold isn't
    // enough: it can be satisfied by the *first* render pass alone (before
    // the query's data has landed), racing against that second pass under
    // slower/coverage-instrumented timing and clearing the spy too early —
    // reproduced directly under `pnpm test -- --coverage`. Wait for the
    // query's own cache entry to reach `success` first (a signal tied to
    // the actual async fetch, not a guess about render-pass count), then
    // wait for the render-count to stop changing (two consecutive equal
    // polls) so the resulting re-render has actually committed too.
    const previousSetsQueryKey = ['workout', 'previousSets', exercise.id, 'any_workout', null];
    await waitFor(() => {
      expect(queryClient.getQueryState(previousSetsQueryKey)?.status).toBe('success');
    });
    let previousCount = -1;
    let stableReads = 0;
    await waitFor(
      () => {
        const count = renderSpy.mock.calls.length;
        if (count === previousCount) {
          stableReads += 1;
        } else {
          stableReads = 0;
          previousCount = count;
        }
        if (stableReads < 1) {
          throw new Error(`renderSpy call count still settling (currently ${count})`);
        }
      },
      { interval: 20 },
    );
    renderSpy.mockClear();

    // Simulate "typing in row A and committing" — the exact store call
    // ConnectedSetRow's own onBlurValue handler makes.
    await act(async () => {
      await useActiveWorkoutStore.getState().updateSet(setA!.id, { weightKg: 80 });
    });

    // setA is row index 1 (auto-created set is row 0, setB is row 2).
    // `updateSet`'s own optimistic-then-reconciled-canonical update shape
    // (activeWorkoutStore.ts, M2-03) legitimately re-renders row 1's real
    // `ConnectedSetRow` more than once (optimistic apply, canonical
    // reconcile, and this component's own re-seed effect) — that multiple-
    // renders-of-the-*same*-row detail isn't what 06 §8 cares about. What
    // matters, and what every one of those calls must satisfy, is that
    // *only* row 1 ever re-rendered: rows 0 and 2 (siblings, unaffected by
    // this edit) never re-ran at all.
    expect(renderSpy).toHaveBeenCalledWith('section-row-1');
    expect(renderSpy).not.toHaveBeenCalledWith('section-row-0');
    expect(renderSpy).not.toHaveBeenCalledWith('section-row-2');
    expect(renderSpy.mock.calls.every((call) => call[0] === 'section-row-1')).toBe(true);
  });
});
