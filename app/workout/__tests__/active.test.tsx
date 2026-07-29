/**
 * `/workout/active` route smoke test (M2-05 acceptance gate) — proves the
 * route file wires the real `ExerciseRepositoryImpl` + the `retro`/
 * `startTime` query params through to `ActiveWorkoutScreen`, using the same
 * `renderRouter` real-route-tree approach `tabs-layout.test.tsx` (M0-08)
 * established. `ActiveWorkoutScreen` itself is mocked here (its own full
 * behavioral suite — auto-start-on-mount DB writes, stopwatch, discard —
 * lives in `src/features/workout/__tests__/ActiveWorkoutScreen.test.tsx`);
 * this test only needs to prove the route hands it the right props, the
 * same "route file is a thin wiring shim" split every other route test in
 * this repo follows (`app/exercise/__tests__/id.test.tsx`, M1-08).
 */
import { renderRouter } from 'expo-router/testing-library';

// Same factory-mock reasoning as `tabs-layout.test.tsx`: avoids pulling in
// `expo-sqlite`'s native module (unavailable under Jest, 08 §5).
jest.mock('@/data/sqlite/boot', () => ({
  runDbBoot: jest.fn().mockResolvedValue({ fromVersion: 0, toVersion: 1, applied: [] }),
  getAppDriver: jest.fn().mockReturnValue({
    dialect: 'better-sqlite3',
    execute: jest.fn().mockReturnValue({ changes: 0, lastInsertRowId: 0 }),
    queryAll: jest.fn().mockReturnValue([]),
    transaction: jest.fn((fn: () => unknown) => fn()),
    close: jest.fn(),
  }),
}));

jest.mock('@/data/exercises/exercise-repository', () => ({
  ExerciseRepositoryImpl: jest.fn().mockImplementation(() => ({ get: jest.fn() })),
}));

// M3-05: this route now also constructs a real `RoutineRepositoryImpl`
// (`routineId`/`getRoutineFull` wiring) — mocked the same way the exercise
// repository above is, since `ActiveWorkoutScreen` itself is mocked out and
// this test only needs to prove the route hands it *something* real.
jest.mock('@/data/routines/routine-repository', () => ({
  RoutineRepositoryImpl: jest.fn().mockImplementation(() => ({
    getFull: jest.fn(),
    updateFromWorkout: jest.fn(),
  })),
}));

const mockActiveWorkoutScreen = jest.fn((_props: unknown) => null);
jest.mock('@/features/workout/ActiveWorkoutScreen', () => ({
  ActiveWorkoutScreen: (props: unknown) => {
    mockActiveWorkoutScreen(props);
    return null;
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('/workout/active route', () => {
  it('renders ActiveWorkoutScreen with a real ExerciseRepositoryImpl and retro=false by default', async () => {
    await renderRouter('app', { initialUrl: '/workout/active' });

    expect(mockActiveWorkoutScreen).toHaveBeenCalled();
    const lastCall = mockActiveWorkoutScreen.mock.calls[mockActiveWorkoutScreen.mock.calls.length - 1]!;
    const props = lastCall[0] as {
      exerciseRepository: unknown;
      retro: boolean;
      retroStartTime: number | undefined;
    };
    expect(props.exerciseRepository).toBeTruthy();
    expect(props.retro).toBe(false);
    expect(props.retroStartTime).toBeUndefined();
  });

  it('wires a real RoutineRepositoryImpl-backed getRoutineFull and an undefined routineId when no query param is given', async () => {
    await renderRouter('app', { initialUrl: '/workout/active' });

    expect(mockActiveWorkoutScreen).toHaveBeenCalled();
    const lastCall = mockActiveWorkoutScreen.mock.calls[mockActiveWorkoutScreen.mock.calls.length - 1]!;
    const props = lastCall[0] as {
      routineId: string | undefined;
      getRoutineFull: ((id: string) => Promise<unknown>) | undefined;
    };
    expect(props.routineId).toBeUndefined();
    expect(props.getRoutineFull).toBeInstanceOf(Function);
  });

  it('wires a real RoutineRepositoryImpl-backed updateRoutineFromWorkout (M3-06)', async () => {
    await renderRouter('app', { initialUrl: '/workout/active' });

    expect(mockActiveWorkoutScreen).toHaveBeenCalled();
    const lastCall = mockActiveWorkoutScreen.mock.calls[mockActiveWorkoutScreen.mock.calls.length - 1]!;
    const props = lastCall[0] as {
      updateRoutineFromWorkout: ((routineId: string, workoutId: string) => Promise<unknown>) | undefined;
    };
    expect(props.updateRoutineFromWorkout).toBeInstanceOf(Function);
  });

  it('parses a routineId query param through to the screen', async () => {
    await renderRouter('app', { initialUrl: '/workout/active?routineId=some-routine-id' });

    expect(mockActiveWorkoutScreen).toHaveBeenCalled();
    const lastCall = mockActiveWorkoutScreen.mock.calls[mockActiveWorkoutScreen.mock.calls.length - 1]!;
    const props = lastCall[0] as { routineId: string | undefined };
    expect(props.routineId).toBe('some-routine-id');
  });

  it('parses a repeatWorkoutId query param through to the screen (M3-07)', async () => {
    await renderRouter('app', { initialUrl: '/workout/active?repeatWorkoutId=some-workout-id' });

    expect(mockActiveWorkoutScreen).toHaveBeenCalled();
    const lastCall = mockActiveWorkoutScreen.mock.calls[mockActiveWorkoutScreen.mock.calls.length - 1]!;
    const props = lastCall[0] as { repeatWorkoutId: string | undefined };
    expect(props.repeatWorkoutId).toBe('some-workout-id');
  });

  it('leaves repeatWorkoutId undefined when no query param is given', async () => {
    await renderRouter('app', { initialUrl: '/workout/active' });

    expect(mockActiveWorkoutScreen).toHaveBeenCalled();
    const lastCall = mockActiveWorkoutScreen.mock.calls[mockActiveWorkoutScreen.mock.calls.length - 1]!;
    const props = lastCall[0] as { repeatWorkoutId: string | undefined };
    expect(props.repeatWorkoutId).toBeUndefined();
  });

  it('parses retro=1 and a numeric startTime query param through to the screen', async () => {
    await renderRouter('app', { initialUrl: '/workout/active?retro=1&startTime=1700000000000' });

    expect(mockActiveWorkoutScreen).toHaveBeenCalled();
    const lastCall = mockActiveWorkoutScreen.mock.calls[mockActiveWorkoutScreen.mock.calls.length - 1]!;
    const props = lastCall[0] as {
      retro: boolean;
      retroStartTime: number | undefined;
    };
    expect(props.retro).toBe(true);
    expect(props.retroStartTime).toBe(1700000000000);
  });
});

// Note: the route's `presentation: 'fullScreenModal'` / `animation:
// 'slide_from_bottom'` options (06 §3) live on `app/_layout.tsx`'s
// `<Stack.Screen name="workout/active">` declaration — react-navigation
// doesn't expose resolved screen options through RNTL's `screen` helper,
// so that piece isn't independently assertable here; it's a plain object
// literal in the root layout, reviewed by inspection.
