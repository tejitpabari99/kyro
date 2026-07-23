/**
 * `/exercise/[id]/edit` route smoke test (M1-10 acceptance gate) — proves
 * the route wires the real `ExerciseFormScreen` in `mode="edit"` with the
 * `id` param from the URL, hydrating from the mocked repository's `get`.
 */
import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('@/lib/files');

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

const FIXTURE_EXERCISE = {
  id: 'custom-7',
  name: 'My Custom Row',
  exerciseType: 'weight_reps',
  primaryMuscleGroup: 'chest',
  secondaryMuscleGroups: [],
  equipment: 'none',
  instructions: [],
  images: [],
  animationUri: null,
  isCustom: true,
  usesCustomMetric: false,
  aliases: [],
  archivedAt: null,
  createdAt: 0,
  updatedAt: 0,
};

jest.mock('@/data/exercises/exercise-repository', () => ({
  ExerciseRepositoryImpl: jest.fn().mockImplementation(() => ({
    get: jest.fn((id: string) =>
      Promise.resolve(id === FIXTURE_EXERCISE.id ? FIXTURE_EXERCISE : null),
    ),
    hasLoggedSets: jest.fn().mockResolvedValue(false),
    update: jest.fn(),
  })),
}));

describe('/exercise/[id]/edit route', () => {
  it('renders the real ExerciseFormScreen in edit mode, hydrated from the id in the URL', async () => {
    await renderRouter('app', { initialUrl: `/exercise/${FIXTURE_EXERCISE.id}/edit` });

    expect((await screen.findByTestId('exercise-form-screen-name-input')).props.value).toBe(
      'My Custom Row',
    );
  });
});
