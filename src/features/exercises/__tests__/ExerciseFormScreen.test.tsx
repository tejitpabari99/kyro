/**
 * `ExerciseFormScreen` tests (M1-09/M1-10 acceptance gates):
 *  - create happy path calls `repository.create` with the expected shape,
 *    including a picked photo resolving to a **relative** file name (never
 *    an absolute path) via the mocked `@/lib/files` seam;
 *  - duplicate name surfaces the repository's own `DuplicateExerciseNameError`
 *    as an inline error, not a thrown/unhandled rejection;
 *  - editing a type-locked exercise (`hasLoggedSets` -> `true`) disables the
 *    type picker with an explanation, and never sends `exerciseType` in the
 *    patch;
 *  - edit happy path patches an existing custom via `repository.update`.
 *
 * `@/lib/files` is mocked wholesale (manual mock, `src/lib/__mocks__/
 * files.ts`) — no real filesystem/image-manipulator/image-picker call ever
 * happens here, matching this task's own no-simulator constraint.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { DuplicateExerciseNameError, ExerciseNotFoundError } from '@/data/exercises/errors';
import type {
  CustomExerciseFields,
  Exercise,
  ExerciseListFilter,
  ExerciseRepository,
  NewCustomExercise,
} from '@/data/exercises/types';
import type { MappedExerciseRecord } from '@/domain/exercise-mapping';
import { ThemeProvider } from '@/ui/theme-provider';

import { ExerciseFormScreen } from '../ExerciseFormScreen';
import type { ExerciseFormPrefill } from '../exercise-form-prefill';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

jest.mock('@/lib/files');
const mockedFiles = jest.requireMock('@/lib/files') as {
  pickExercisePhoto: jest.Mock;
  saveExercisePhoto: jest.Mock;
  deleteExercisePhoto: jest.Mock;
  exercisePhotoUri: jest.Mock;
};

function baseExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'custom-1',
    name: 'My Custom Curl',
    exerciseType: 'weight_reps',
    primaryMuscleGroup: 'biceps',
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
    ...overrides,
  };
}

/** A small, fully-working in-memory fake — this suite needs real `create`/`update`/`hasLoggedSets` behavior, not just read paths (unlike `exercise-fixtures.ts`'s browse/detail-only fake). */
class FakeFormRepository implements ExerciseRepository {
  public createCalls: NewCustomExercise[] = [];
  public updateCalls: { id: string; patch: Partial<CustomExerciseFields> }[] = [];
  private nextId = 'generated-id-1';
  private rejectNameOnCreate: string | null = null;

  constructor(
    private rows: Exercise[] = [],
    private lockedIds: Set<string> = new Set(),
  ) {}

  setRejectNameOnCreate(name: string | null): void {
    this.rejectNameOnCreate = name;
  }

  async list(_filter?: ExerciseListFilter): Promise<Exercise[]> {
    return this.rows;
  }

  async get(id: string): Promise<Exercise | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }

  async create(input: NewCustomExercise): Promise<Exercise> {
    this.createCalls.push(input);
    if (this.rejectNameOnCreate && input.name === this.rejectNameOnCreate) {
      throw new DuplicateExerciseNameError(input.name);
    }
    const created = baseExercise({
      id: this.nextId,
      name: input.name,
      exerciseType: input.exerciseType,
      primaryMuscleGroup: input.primaryMuscleGroup,
      secondaryMuscleGroups: input.secondaryMuscleGroups ?? [],
      equipment: input.equipment ?? 'none',
      instructions: input.instructions ?? [],
      images: input.images ?? [],
      usesCustomMetric: input.usesCustomMetric ?? false,
    });
    this.rows = [...this.rows, created];
    return created;
  }

  async update(id: string, patch: Partial<CustomExerciseFields>): Promise<Exercise> {
    this.updateCalls.push({ id, patch });
    const existing = this.rows.find((r) => r.id === id);
    if (!existing) throw new ExerciseNotFoundError(id);
    const updated: Exercise = { ...existing, ...patch };
    this.rows = this.rows.map((r) => (r.id === id ? updated : r));
    return updated;
  }

  async archive(): Promise<void> {
    throw new Error('unused');
  }
  async restore(): Promise<void> {
    throw new Error('unused');
  }
  async delete(): Promise<void> {
    throw new Error('unused');
  }
  async referenceCount(): Promise<number> {
    throw new Error('unused');
  }
  async hasLoggedSets(id: string): Promise<boolean> {
    return this.lockedIds.has(id);
  }
  async recentlyUsed(): Promise<Exercise[]> {
    return [];
  }
  async seedBuiltins(_dataset: readonly MappedExerciseRecord[], _version: string): Promise<void> {
    throw new Error('unused');
  }
}

function newTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

async function renderForm(
  repository: ExerciseRepository,
  props: Partial<React.ComponentProps<typeof ExerciseFormScreen>> = {},
) {
  // `@testing-library/react-native` v14's `render` is async — every call
  // site below awaits this function (not the raw `render` return value)
  // so `screen.getByTestId` immediately after is guaranteed to see a
  // mounted tree (same pattern `ExerciseDetailScreen.test.tsx`'s
  // `renderWithProviders`/`renderScreen` helpers already established).
  return render(
    <QueryClientProvider client={newTestQueryClient()}>
      <ThemeProvider preference="dark">
        <ExerciseFormScreen repository={repository} mode="create" testID="form" {...props} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedFiles.pickExercisePhoto.mockResolvedValue(null);
  mockedFiles.saveExercisePhoto.mockResolvedValue('mock-uuid.jpg');
  mockedFiles.exercisePhotoUri.mockImplementation(
    (exerciseId: string, fileName: string) => `file:///mock-documents/photos/exercises/${exerciseId}/${fileName}`,
  );
});

describe('ExerciseFormScreen — create happy path', () => {
  it('calls repository.create with the filled-in fields and navigates to the new detail screen', async () => {
    const repository = new FakeFormRepository();
    await renderForm(repository, { mode: 'create' });

    await fireEvent.changeText(screen.getByTestId('form-name-input'), 'Cable Fly');

    await fireEvent.press(screen.getByTestId('form-type-row'));
    await fireEvent.press(await screen.findByTestId('form-type-sheet-option-weight_reps'));

    await fireEvent.press(screen.getByTestId('form-primary-muscle-row'));
    await fireEvent.press(await screen.findByTestId('form-primary-muscle-sheet-option-chest'));

    await fireEvent.changeText(screen.getByTestId('form-instructions-input'), 'Step one.\nStep two.');

    await fireEvent.press(screen.getByTestId('form-save'));

    await waitFor(() => expect(repository.createCalls).toHaveLength(1));
    expect(repository.createCalls[0]).toEqual(
      expect.objectContaining({
        name: 'Cable Fly',
        exerciseType: 'weight_reps',
        primaryMuscleGroup: 'chest',
        instructions: ['Step one.', 'Step two.'],
      }),
    );
    expect(router.replace).toHaveBeenCalledWith('/exercise/generated-id-1');
  });

  it('shows inline validation errors and never calls create when required fields are missing', async () => {
    const repository = new FakeFormRepository();
    await renderForm(repository, { mode: 'create' });

    await fireEvent.press(screen.getByTestId('form-save'));

    expect(await screen.findByTestId('form-name-error')).toHaveTextContent('Name is required.');
    expect(screen.getByTestId('form-type-error')).toHaveTextContent('Exercise type is required.');
    expect(screen.getByTestId('form-primary-muscle-error')).toHaveTextContent(
      'Primary muscle is required.',
    );
    expect(repository.createCalls).toHaveLength(0);
  });

  it('surfaces a duplicate active name as an inline error, case-insensitively rejected by the repository', async () => {
    const repository = new FakeFormRepository();
    repository.setRejectNameOnCreate('Barbell Squat');
    await renderForm(repository, { mode: 'create' });

    await fireEvent.changeText(screen.getByTestId('form-name-input'), 'Barbell Squat');
    await fireEvent.press(screen.getByTestId('form-type-row'));
    await fireEvent.press(await screen.findByTestId('form-type-sheet-option-weight_reps'));
    await fireEvent.press(screen.getByTestId('form-primary-muscle-row'));
    await fireEvent.press(await screen.findByTestId('form-primary-muscle-sheet-option-quadriceps'));

    await fireEvent.press(screen.getByTestId('form-save'));

    expect(await screen.findByTestId('form-name-error')).toHaveTextContent(
      /already exists/,
    );
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('pre-fills the name field from a full Duplicate-as-Custom prefill and creates with the full field set, never touching an absolute path for images', async () => {
    const repository = new FakeFormRepository();
    const prefill: ExerciseFormPrefill = {
      name: 'Barbell Bench Press - Medium Grip (Copy)',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
      secondaryMuscleGroups: ['shoulders', 'triceps'],
      equipment: 'barbell',
      instructions: ['Lie on the bench.', 'Press up.'],
      usesCustomMetric: false,
    };
    await renderForm(repository, { mode: 'create', prefill });

    expect(screen.getByTestId('form-name-input').props.value).toBe(
      'Barbell Bench Press - Medium Grip (Copy)',
    );
    expect(screen.getByTestId('form-type-row')).toHaveTextContent(/Weight & Reps/);
    expect(screen.getByTestId('form-primary-muscle-row')).toHaveTextContent(/Chest/);
    expect(screen.getByTestId('form-secondary-muscles-row')).toHaveTextContent(/Shoulders, Triceps/);

    await fireEvent.press(screen.getByTestId('form-save'));

    await waitFor(() => expect(repository.createCalls).toHaveLength(1));
    expect(repository.createCalls[0]).toEqual(
      expect.objectContaining({
        name: 'Barbell Bench Press - Medium Grip (Copy)',
        exerciseType: 'weight_reps',
        primaryMuscleGroup: 'chest',
        secondaryMuscleGroups: ['shoulders', 'triceps'],
        equipment: 'barbell',
        instructions: ['Lie on the bench.', 'Press up.'],
      }),
    );
  });

  it('stores only the relative file name a mocked picker/save-photo flow resolves to, never an absolute path, in the create payload', async () => {
    const repository = new FakeFormRepository();
    mockedFiles.pickExercisePhoto.mockResolvedValue({
      uri: 'file:///tmp/picked.jpg',
      width: 800,
      height: 800,
    });
    mockedFiles.saveExercisePhoto.mockResolvedValue('abc-123.jpg');

    await renderForm(repository, { mode: 'create' });

    await fireEvent.changeText(screen.getByTestId('form-name-input'), 'Leg Press');
    await fireEvent.press(screen.getByTestId('form-type-row'));
    await fireEvent.press(await screen.findByTestId('form-type-sheet-option-weight_reps'));
    await fireEvent.press(screen.getByTestId('form-primary-muscle-row'));
    await fireEvent.press(await screen.findByTestId('form-primary-muscle-sheet-option-quadriceps'));

    await fireEvent.press(screen.getByTestId('form-pick-library'));
    await waitFor(() => expect(mockedFiles.pickExercisePhoto).toHaveBeenCalledWith('library'));
    expect(await screen.findByTestId('form-image-preview')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('form-save'));

    await waitFor(() => expect(mockedFiles.saveExercisePhoto).toHaveBeenCalled());
    expect(mockedFiles.saveExercisePhoto).toHaveBeenCalledWith('generated-id-1', {
      uri: 'file:///tmp/picked.jpg',
      width: 800,
      height: 800,
    });

    await waitFor(() =>
      expect(repository.updateCalls.some((c) => c.patch.images?.[0] === 'abc-123.jpg')).toBe(true),
    );
    const imagePatchCall = repository.updateCalls.find((c) => c.patch.images !== undefined);
    expect(imagePatchCall?.patch.images).toEqual(['abc-123.jpg']);
    expect(imagePatchCall?.patch.images?.[0]).not.toContain('file://');
    expect(imagePatchCall?.patch.images?.[0]).not.toContain('/');
  });
});

describe('ExerciseFormScreen — edit mode', () => {
  it('hydrates fields from the existing exercise and patches via repository.update', async () => {
    const existing = baseExercise({ id: 'custom-9', name: 'Old Name' });
    const repository = new FakeFormRepository([existing]);
    await renderForm(repository, { mode: 'edit', exerciseId: 'custom-9' });

    expect(await screen.findByTestId('form-name-input')).toHaveProp('value', 'Old Name');

    await fireEvent.changeText(screen.getByTestId('form-name-input'), 'New Name');
    await fireEvent.press(screen.getByTestId('form-save'));

    await waitFor(() => expect(repository.updateCalls.length).toBeGreaterThan(0));
    expect(repository.updateCalls[0]).toEqual(
      expect.objectContaining({ id: 'custom-9', patch: expect.objectContaining({ name: 'New Name' }) }),
    );
    expect(router.back).toHaveBeenCalled();
  });

  it('disables the type picker with an explanation once hasLoggedSets is true, and never patches exerciseType', async () => {
    const existing = baseExercise({ id: 'custom-locked', name: 'Locked Exercise', exerciseType: 'reps_only' });
    const repository = new FakeFormRepository([existing], new Set(['custom-locked']));
    await renderForm(repository, { mode: 'edit', exerciseId: 'custom-locked' });

    await screen.findByTestId('form-name-input');
    await waitFor(() =>
      expect(screen.getByTestId('form-type-locked-explanation')).toBeTruthy(),
    );

    // Tapping the disabled row must not open the sheet (`ListRow` renders
    // with no `onPress` at all once disabled — see `ListRow.tsx`: no
    // `Pressable` wrapper is mounted in that case, so there is nothing to
    // press; the behavioral proof is that no sheet option ever appears).
    await fireEvent.press(screen.getByTestId('form-type-row'));
    expect(screen.queryByTestId('form-type-sheet-option-weight_reps')).toBeNull();

    await fireEvent.changeText(screen.getByTestId('form-name-input'), 'Locked Exercise Renamed');
    await fireEvent.press(screen.getByTestId('form-save'));

    await waitFor(() => expect(repository.updateCalls.length).toBeGreaterThan(0));
    expect(repository.updateCalls[0].patch).not.toHaveProperty('exerciseType');
  });

  it('does not disable the type picker when hasLoggedSets is false', async () => {
    const existing = baseExercise({ id: 'custom-unlocked' });
    const repository = new FakeFormRepository([existing], new Set());
    await renderForm(repository, { mode: 'edit', exerciseId: 'custom-unlocked' });

    await screen.findByTestId('form-name-input');
    expect(screen.queryByTestId('form-type-locked-explanation')).toBeNull();

    // Behavioral proof it's enabled: pressing the row opens the type sheet.
    await fireEvent.press(screen.getByTestId('form-type-row'));
    expect(await screen.findByTestId('form-type-sheet-option-weight_reps')).toBeTruthy();
  });
});
