/**
 * Workout tab route smoke test (M3-02) — proves the route file wires the
 * real `RoutineRepositoryImpl`/`ExerciseRepositoryImpl` through to
 * `RoutinesHubScreen`, using the same `jest.mock`-the-repository-classes-
 * and-the-screen approach `app/workout/__tests__/active.test.tsx` (M2-05)
 * established for `ActiveWorkoutScreen`. `RoutinesHubScreen` itself is
 * mocked here (its own full behavioral suite — Quick Start / one-active-
 * workout gate, folder CRUD, routine ⋯ menu, empty state, both themes —
 * moved to `src/features/routines/__tests__/RoutinesHubScreen.test.tsx`
 * along with this task's new coverage, per this route file no longer
 * owning any of that logic — see `RoutinesHubScreen.tsx`'s own header);
 * this test only needs to prove the route hands it real repository
 * instances, the same "route file is a thin wiring shim" split every
 * other route test in this repo follows.
 *
 * The `RoutinesHubScreen` mock is a plain `jest.fn(() => null)` fetched
 * back out via `jest.requireMock` inside the test (rather than a
 * module-level "mock"-prefixed variable closed over by the factory, the
 * shape `active.test.tsx` uses for `ActiveWorkoutScreen`) — this file, un-
 * like that one, needs a genuine top-level `import WorkoutScreen from
 * '../index'` (not a deferred `renderRouter` call inside the test body),
 * and Babel's CommonJS transform hoists that import above any interleaved
 * `const` declaration regardless of source order, which would otherwise
 * make the factory read a not-yet-initialized binding.
 */
import { render } from '@testing-library/react-native';
import React from 'react';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { RoutineRepositoryImpl } from '@/data/routines/routine-repository';

import WorkoutScreen from '../index';

// Same factory-mock reasoning as `active.test.tsx`: avoids pulling in
// `expo-sqlite`'s native module (unavailable under Jest, 08 §5).
jest.mock('@/data/sqlite/boot', () => ({
  getAppDriver: jest.fn().mockReturnValue({
    dialect: 'better-sqlite3',
    execute: jest.fn().mockReturnValue({ changes: 0, lastInsertRowId: 0 }),
    queryAll: jest.fn().mockReturnValue([]),
    transaction: jest.fn((fn: () => unknown) => fn()),
    close: jest.fn(),
  }),
}));

jest.mock('@/data/exercises/exercise-repository', () => ({
  ExerciseRepositoryImpl: jest.fn().mockImplementation(() => ({ list: jest.fn() })),
}));

jest.mock('@/data/routines/routine-repository', () => ({
  RoutineRepositoryImpl: jest.fn().mockImplementation(() => ({ listFolders: jest.fn(), list: jest.fn() })),
}));

jest.mock('@/features/routines/RoutinesHubScreen', () => ({
  RoutinesHubScreen: jest.fn(() => null),
}));

const mockExerciseRepositoryImpl = ExerciseRepositoryImpl as jest.MockedClass<
  typeof ExerciseRepositoryImpl
>;
const mockRoutineRepositoryImpl = RoutineRepositoryImpl as jest.MockedClass<typeof RoutineRepositoryImpl>;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Workout tab route', () => {
  it('renders RoutinesHubScreen with a real RoutineRepositoryImpl and ExerciseRepositoryImpl', async () => {
    await render(<WorkoutScreen />);

    // Both repository classes were constructed at all (rather than the
    // screen receiving `undefined`/some other value) — `active.test.tsx`
    // uses the same "truthy, not `toBeInstanceOf`" assertion for the
    // identical reason: a `jest.fn().mockImplementation(() => ({...}))`
    // class mock's `new` call returns the plain object literal, not an
    // instance of the mock constructor, so `toBeInstanceOf` would fail here
    // even though the wiring is correct.
    expect(mockExerciseRepositoryImpl).toHaveBeenCalledTimes(1);
    expect(mockRoutineRepositoryImpl).toHaveBeenCalledTimes(1);

    const { RoutinesHubScreen: mockRoutinesHubScreen } = jest.requireMock(
      '@/features/routines/RoutinesHubScreen',
    ) as { RoutinesHubScreen: jest.Mock };

    expect(mockRoutinesHubScreen).toHaveBeenCalled();
    const lastCall = mockRoutinesHubScreen.mock.calls[mockRoutinesHubScreen.mock.calls.length - 1]!;
    const props = lastCall[0] as { routineRepository: unknown; exerciseRepository: unknown };

    expect(props.routineRepository).toBeTruthy();
    expect(props.exerciseRepository).toBeTruthy();
  });
});
