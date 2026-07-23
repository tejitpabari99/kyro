/**
 * Shared test fixtures (M1-07) — a small, hand-picked subset of **real**
 * `assets/exercise-db.json` records (verbatim field values, just
 * snake_case -> camelCase per `Exercise`, 05 §3.1/`src/data/exercises/types.ts`)
 * plus a `FakeExerciseRepository` that serves them without touching SQLite.
 *
 * Component-level tests (`ExerciseBrowseScreen.test.tsx`) use this instead
 * of seeding the full 873-row dataset into a real driver for every
 * behavioral case — the full-dataset path (seed + real `FlashList` mount)
 * is exercised once, deliberately, in
 * `ExerciseBrowseScreen.full-dataset.test.tsx`, and the AND-composition
 * filtering logic itself is exhaustively verified against the complete
 * real dataset in `exercise-list-model.test.ts`. Every id/name/muscle/
 * equipment value below is copied from the real vendored dataset (not
 * invented) so assertions like "press + barbell excludes the dumbbell
 * variant" stay meaningful.
 */
import type { Exercise, ExerciseRepository } from '@/data/exercises/types';

function builtin(overrides: Partial<Exercise> & Pick<Exercise, 'id' | 'name'>): Exercise {
  return {
    exerciseType: 'weight_reps',
    primaryMuscleGroup: 'chest',
    secondaryMuscleGroups: [],
    equipment: 'barbell',
    instructions: [],
    images: [`exercises/${overrides.id}/0.jpg`, `exercises/${overrides.id}/1.jpg`],
    animationUri: null,
    isCustom: false,
    usesCustomMetric: false,
    aliases: [],
    archivedAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

/** `03 §2`'s search+equipment example lives here: "Barbell Bench Press - Medium Grip" (barbell) vs. "Dumbbell Bench Press" (dumbbell). */
export const FIXTURE_EXERCISES: Exercise[] = [
  builtin({
    id: 'Barbell_Bench_Press_-_Medium_Grip',
    name: 'Barbell Bench Press - Medium Grip',
    primaryMuscleGroup: 'chest',
    secondaryMuscleGroups: ['shoulders', 'triceps'],
    equipment: 'barbell',
    aliases: ['BP'],
  }),
  builtin({
    id: 'Barbell_Shoulder_Press',
    name: 'Barbell Shoulder Press',
    primaryMuscleGroup: 'shoulders',
    secondaryMuscleGroups: ['chest', 'triceps'],
    equipment: 'barbell',
    aliases: ['OHP'],
  }),
  builtin({
    id: 'Dumbbell_Bench_Press',
    name: 'Dumbbell Bench Press',
    primaryMuscleGroup: 'chest',
    secondaryMuscleGroups: ['shoulders', 'triceps'],
    equipment: 'dumbbell',
  }),
  builtin({
    id: 'Push_Press',
    name: 'Push Press',
    primaryMuscleGroup: 'shoulders',
    secondaryMuscleGroups: ['quadriceps', 'triceps'],
    equipment: 'barbell',
  }),
  builtin({
    id: 'Barbell_Squat',
    name: 'Barbell Squat',
    primaryMuscleGroup: 'quadriceps',
    secondaryMuscleGroups: ['calves', 'glutes', 'hamstrings', 'lower_back'],
    equipment: 'barbell',
  }),
  builtin({
    id: 'Zercher_Squats',
    name: 'Zercher Squats',
    primaryMuscleGroup: 'quadriceps',
    secondaryMuscleGroups: ['calves', 'glutes', 'hamstrings'],
    equipment: 'barbell',
  }),
  builtin({
    id: 'Bodyweight_Squat',
    name: 'Bodyweight Squat',
    exerciseType: 'reps_only',
    primaryMuscleGroup: 'quadriceps',
    secondaryMuscleGroups: ['glutes', 'hamstrings'],
    equipment: 'none',
  }),
  builtin({
    id: 'Dumbbell_Squat',
    name: 'Dumbbell Squat',
    primaryMuscleGroup: 'quadriceps',
    secondaryMuscleGroups: ['calves', 'glutes', 'hamstrings', 'lower_back'],
    equipment: 'dumbbell',
  }),
  builtin({
    id: '3_4_Sit-Up',
    name: '3/4 Sit-Up',
    exerciseType: 'reps_only',
    primaryMuscleGroup: 'abdominals',
    equipment: 'none',
  }),
];

/** A custom (`isCustom: true`) exercise with no images — the "placeholder thumbnail" acceptance case (03 §2). */
export const FIXTURE_CUSTOM_NO_IMAGES: Exercise = {
  id: 'custom-1',
  name: 'My Custom Move',
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

/**
 * Minimal `ExerciseRepository` serving fixed in-memory arrays — only
 * `list`/`recentlyUsed`/`get` are meaningful for the screens that use this
 * (`list`/`recentlyUsed` for `ExerciseBrowseScreen`, M1-07; `get` added for
 * `ExerciseDetailScreen`, M1-08 — a plain by-id lookup over the same `all`
 * array, no new fixture class needed); every write/lifecycle method still
 * throws (unused by either screen, both are read-only over the repository).
 */
export class FakeExerciseRepository implements ExerciseRepository {
  constructor(
    private readonly all: Exercise[],
    private readonly recent: Exercise[] = [],
  ) {}

  async list(): Promise<Exercise[]> {
    return this.all;
  }

  async recentlyUsed(limit: number): Promise<Exercise[]> {
    return this.recent.slice(0, limit);
  }

  async get(id: string): Promise<Exercise | null> {
    return this.all.find((exercise) => exercise.id === id) ?? null;
  }
  async create(): Promise<Exercise> {
    throw new Error('FakeExerciseRepository.create is not implemented — unused by ExerciseBrowseScreen.');
  }
  async update(): Promise<Exercise> {
    throw new Error('FakeExerciseRepository.update is not implemented — unused by ExerciseBrowseScreen.');
  }
  async archive(): Promise<void> {
    throw new Error('FakeExerciseRepository.archive is not implemented — unused by ExerciseBrowseScreen.');
  }
  async restore(): Promise<void> {
    throw new Error('FakeExerciseRepository.restore is not implemented — unused by ExerciseBrowseScreen.');
  }
  async delete(): Promise<void> {
    throw new Error('FakeExerciseRepository.delete is not implemented — unused by ExerciseBrowseScreen.');
  }
  async referenceCount(): Promise<number> {
    throw new Error(
      'FakeExerciseRepository.referenceCount is not implemented — unused by ExerciseBrowseScreen.',
    );
  }
  async seedBuiltins(): Promise<void> {
    throw new Error(
      'FakeExerciseRepository.seedBuiltins is not implemented — unused by ExerciseBrowseScreen.',
    );
  }
}
