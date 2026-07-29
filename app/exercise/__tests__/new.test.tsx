/**
 * `/exercise/new` route smoke test (M1-09/M1-10 acceptance gate) — proves
 * the route wires the real `ExerciseFormScreen` in `mode="create"` and
 * resolves both prefill sources documented in `new.tsx`'s header:
 *  - the M1-07 `name` query-param contract (empty-search shortcut/`+`);
 *  - `exercise-form-prefill.ts`'s in-memory store (Duplicate-as-Custom,
 *    M1-10) taking priority when both are present.
 *
 * `renderRouter` must be awaited (`@testing-library/react-native` 14's
 * `render` is async) — same reasoning `tabs-layout.test.tsx` documents.
 */
import { renderRouter, screen } from 'expo-router/testing-library';

import { setExerciseFormPrefill } from '@/features/exercises/exercise-form-prefill';

// `ExerciseFormScreen` imports `@/lib/files`, which has a real top-level
// import of `expo-file-system/legacy`/`expo-image-manipulator`/
// `expo-image-picker` (native modules unavailable under Jest, 08 §5) — the
// manual mock (`src/lib/__mocks__/files.ts`) is this seam's mockable
// boundary, same as every other native-touching `src/lib/**` module.
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

jest.mock('@/data/exercises/exercise-repository', () => ({
  ExerciseRepositoryImpl: jest.fn().mockImplementation(() => ({
    get: jest.fn().mockResolvedValue(null),
    create: jest.fn(),
    hasLoggedSets: jest.fn().mockResolvedValue(false),
  })),
}));

describe('/exercise/new route', () => {
  it('pre-fills the name field from the `name` query param when no duplicate-prefill is pending', async () => {
    await renderRouter('app', { initialUrl: '/exercise/new?name=Cable+Fly' });

    expect((await screen.findByTestId('exercise-form-screen-name-input')).props.value).toBe(
      'Cable Fly',
    );
  });

  it('prefers the Duplicate-as-Custom prefill store over the `name` query param when both are present', async () => {
    setExerciseFormPrefill({
      name: 'Barbell Bench Press - Medium Grip (Copy)',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
      secondaryMuscleGroups: [],
      equipment: 'barbell',
      instructions: [],
      usesCustomMetric: false,
    });

    await renderRouter('app', { initialUrl: '/exercise/new?name=Ignored' });

    expect((await screen.findByTestId('exercise-form-screen-name-input')).props.value).toBe(
      'Barbell Bench Press - Medium Grip (Copy)',
    );
    expect(screen.getByTestId('exercise-form-screen-type-row')).toHaveTextContent(/Weight & Reps/);
  });
});
