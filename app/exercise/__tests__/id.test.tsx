/**
 * `/exercise/[id]` route smoke test (M1-08 acceptance gate) — proves the
 * route file wires the real navigation param through to
 * `ExerciseDetailScreen` and renders it, using the same `renderRouter`
 * real-route-tree approach `tabs-layout.test.tsx` (M0-08) established.
 * `@/data/exercises/exercise-repository` is mocked (a fake `get` resolving
 * a fixture) rather than exercising a real `SqliteDriver` here — the real
 * repository already has its own integration suite (M1-06); this test only
 * needs to prove the route renders the real detail screen for the param it
 * receives, matching M1-07's confirmed navigation contract
 * (`router.push('/exercise/${exercise.id}')`, a plain string path).
 *
 * M1-10 update: `ExerciseDetailScreen` now imports `@/lib/files` (the
 * delete flow's `deleteExercisePhotos` call) — mocked wholesale here too,
 * same as every other consumer of that native-touching seam (08 §5).
 *
 * AD-2 update: the exercise type ("Weight & Reps") moved off the default
 * Summary tab into the How to tab's TYPE row (`HowToTab`,
 * `ExerciseDetailScreen.test.tsx` covers this in depth) — this smoke test
 * now presses the How-to tab first, same as that suite, before asserting on
 * it.
 */
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

jest.mock('@/lib/files');

const FIXTURE_EXERCISE = {
  id: 'Barbell_Squat',
  name: 'Barbell Squat',
  exerciseType: 'weight_reps',
  primaryMuscleGroup: 'quadriceps',
  secondaryMuscleGroups: ['calves', 'glutes', 'hamstrings', 'lower_back'],
  equipment: 'barbell',
  instructions: ['Step 1.', 'Step 2.'],
  images: [],
  animationUri: null,
  isCustom: false,
  usesCustomMetric: false,
  aliases: [],
  archivedAt: null,
  createdAt: 0,
  updatedAt: 0,
};

// Same reasoning as `tabs-layout.test.tsx`'s `@/data/sqlite/boot` mock: a
// factory mock avoids pulling in `expo-sqlite`'s native module (unavailable
// under Jest, 08 §5).
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
    get: jest.fn((id: string) =>
      Promise.resolve(id === FIXTURE_EXERCISE.id ? FIXTURE_EXERCISE : null),
    ),
  })),
}));

describe('/exercise/[id] route', () => {
  it(
    'renders the real ExerciseDetailScreen for the id in the URL',
    async () => {
      await renderRouter('app', { initialUrl: `/exercise/${FIXTURE_EXERCISE.id}` });
      expect(await screen.findByText('Barbell Squat')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('exercise-detail-screen-tabs-howto'));
      expect(await screen.findByText('Weight & Reps')).toBeTruthy();
    },
    15000,
  );

  it(
    'renders a not-found state for an unknown id',
    async () => {
      await renderRouter('app', { initialUrl: '/exercise/does-not-exist' });
      expect(await screen.findByText('Exercise not found')).toBeTruthy();
    },
    15000,
  );
});
