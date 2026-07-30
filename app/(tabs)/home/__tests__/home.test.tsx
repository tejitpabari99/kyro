/**
 * `(tabs)/home` route smoke tests (M2-14 acceptance gate) — proves both
 * route files wire the real repositories through to
 * `HistoryListScreen`/`HistoryDetailScreen` and render them, using the same
 * `renderRouter` real-route-tree approach `app/exercise/__tests__/id.test.tsx`
 * (M1-08) established. Both `@/data/sqlite/boot` and the two repository
 * modules are mocked (fake `listCompleted`/`getFull`/`get` resolving
 * fixtures) rather than exercising a real `SqliteDriver` here — the real
 * repositories already have their own integration suites (M2-01/M2-02,
 * M1-06); this test only needs to prove each route renders the real screen
 * for the URL it receives.
 */
import { renderRouter, screen } from 'expo-router/testing-library';

const mockFixtureExercise = {
  id: 'ex-1',
  name: 'Bench Press',
  exerciseType: 'weight_reps',
  primaryMuscleGroup: 'chest',
  secondaryMuscleGroups: [],
  equipment: 'barbell',
  instructions: [],
  images: [],
  animationUri: null,
  isCustom: false,
  usesCustomMetric: false,
  aliases: [],
  archivedAt: null,
  createdAt: 0,
  updatedAt: 0,
};

const mockFixtureWorkout = {
  id: 'w-1',
  title: 'Morning Workout',
  description: null,
  routineId: null,
  state: 'completed' as const,
  startTime: new Date(2026, 0, 1, 9, 0, 0).getTime(),
  endTime: new Date(2026, 0, 1, 9, 30, 0).getTime(),
  durationPauseOffsetMs: 0,
  createdAt: 0,
  updatedAt: 0,
  exercises: [
    {
      id: 'we-1',
      workoutId: 'w-1',
      exerciseId: 'ex-1',
      position: 0,
      supersetId: null,
      notes: null,
      restSeconds: null,
      sets: [
        {
          id: 'set-1',
          position: 0,
          setType: 'normal' as const,
          weightKg: 60,
          reps: 8,
          distanceMeters: null,
          durationSeconds: null,
          rpe: null,
          customMetric: null,
          isCompleted: true,
        },
      ],
    },
  ],
};

// Same reasoning as `app/exercise/__tests__/id.test.tsx`'s own `@/data/sqlite/boot`
// mock: a factory mock avoids pulling in `expo-sqlite`'s native module
// (unavailable under Jest, 08 §5).
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
  ExerciseRepositoryImpl: jest.fn().mockImplementation(() => ({
    get: jest.fn((id: string) => Promise.resolve(id === mockFixtureExercise.id ? mockFixtureExercise : null)),
    // M4-03: the real `HistoryListScreen` builds its exercise lookup map via
    // `list({includeArchived: true})`, not a per-row `get` (see that
    // screen's own header) — `HistoryDetailScreen` still uses `get`, so both
    // are backed here.
    list: jest.fn(() => Promise.resolve([mockFixtureExercise])),
  })),
}));

jest.mock('@/data/workouts/workout-repository', () => ({
  WorkoutRepositoryImpl: jest.fn().mockImplementation(() => ({
    // `app/_layout.tsx`'s own boot sequence constructs a `WorkoutRepositoryImpl`
    // too (`useActiveWorkoutStore.getState().rehydrate(...)`, 06 §5.1) — this
    // mock backs *every* construction site, not just the two route files
    // under test, so `getActive` has to resolve (no active workout) or boot
    // itself fails and every route renders `MigrationErrorScreen` instead.
    // The same instance is also what `configureRecordsService` (M4-02) is
    // wired with at boot, so `setsForExercise`/`exerciseHistoryWatermark`
    // have to resolve too, or `HistoryListScreen`'s PR-count read throws.
    getActive: jest.fn(() => Promise.resolve(null)),
    listCompleted: jest.fn(() =>
      Promise.resolve([
        {
          id: mockFixtureWorkout.id,
          title: mockFixtureWorkout.title,
          description: mockFixtureWorkout.description,
          routineId: mockFixtureWorkout.routineId,
          startTime: mockFixtureWorkout.startTime,
          endTime: mockFixtureWorkout.endTime,
          durationPauseOffsetMs: mockFixtureWorkout.durationPauseOffsetMs,
          createdAt: mockFixtureWorkout.createdAt,
          updatedAt: mockFixtureWorkout.updatedAt,
        },
      ]),
    ),
    getFull: jest.fn((id: string) => Promise.resolve(id === mockFixtureWorkout.id ? mockFixtureWorkout : null)),
    getExercisesForWorkouts: jest.fn((ids: string[]) => {
      const map = new Map<string, unknown[]>();
      for (const id of ids) {
        map.set(id, id === mockFixtureWorkout.id ? mockFixtureWorkout.exercises : []);
      }
      return Promise.resolve(map);
    }),
    setsForExercise: jest.fn(() => Promise.resolve([])),
    exerciseHistoryWatermark: jest.fn(() => Promise.resolve(0)),
  })),
}));

describe('/(tabs)/home route', () => {
  it(
    'renders the real HistoryListScreen with the saved workout row',
    async () => {
      await renderRouter('app', { initialUrl: '/home' });
      expect(await screen.findByText('Morning Workout')).toBeTruthy();
      expect(await screen.findByText(/480 kg/)).toBeTruthy();
    },
    15000,
  );

  it(
    'renders the real HistoryDetailScreen for the id in the URL',
    async () => {
      await renderRouter('app', { initialUrl: `/home/${mockFixtureWorkout.id}` });
      expect(await screen.findByText('Morning Workout')).toBeTruthy();
      expect(await screen.findByText('Bench Press')).toBeTruthy();
    },
    15000,
  );

  it(
    'renders a not-found state for an unknown id',
    async () => {
      await renderRouter('app', { initialUrl: '/home/does-not-exist' });
      expect(await screen.findByText('Workout not found')).toBeTruthy();
    },
    15000,
  );
});
