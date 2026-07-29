/**
 * `ExerciseDetailScreen` M1-10 acceptance-gate tests: nav wiring (customs
 * show Edit + ⋯ Edit/Delete; built-ins show ⋯ Duplicate as Custom only),
 * the delete/archive-offer flow (referenced delete -> archive-offer path,
 * confirm archive -> archived+hidden-from-default-list), and Duplicate as
 * Custom's prefill hand-off contract.
 *
 * `Alert.alert` is spied on (not mocked away) so each test can locate the
 * exact button it needs and invoke its `onPress` directly — the standard
 * RNTL pattern for testing native `Alert` confirm dialogs, which render no
 * queryable host-component tree of their own.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ExerciseReferencedError } from '@/data/exercises/errors';
import type {
  CustomExerciseFields,
  Exercise,
  ExerciseListFilter,
  ExerciseRepository,
  NewCustomExercise,
} from '@/data/exercises/types';
import type { MappedExerciseRecord } from '@/domain/exercise-mapping';
import { ThemeProvider } from '@/ui/theme-provider';

import { ExerciseDetailScreen } from '../ExerciseDetailScreen';
import { consumeExerciseFormPrefill } from '../exercise-form-prefill';

jest.mock('@/lib/files');
const mockedFiles = jest.requireMock('@/lib/files') as { deleteExercisePhotos: jest.Mock };

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

function exercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
    id: 'custom-1',
    name: 'My Custom Curl',
    exerciseType: 'weight_reps',
    primaryMuscleGroup: 'biceps',
    secondaryMuscleGroups: ['triceps'],
    equipment: 'dumbbell',
    instructions: ['Curl it.'],
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

/** A small fully-working fake — `delete`/`archive` need real, configurable behavior for the M1-10 flows this suite exercises. */
class FakeRepo implements ExerciseRepository {
  public deleteCalls: string[] = [];
  public archiveCalls: string[] = [];
  private referencedCount: number | null = null;
  private archiveError: Error | null = null;

  constructor(private rows: Exercise[]) {}

  simulateReferenced(count: number): void {
    this.referencedCount = count;
  }

  /** Milestone review: makes `archive` throw, to test the Archive-offer flow's own error path. */
  simulateArchiveFailure(error: Error): void {
    this.archiveError = error;
  }

  async list(_filter?: ExerciseListFilter): Promise<Exercise[]> {
    return this.rows.filter((r) => r.archivedAt == null);
  }
  async get(id: string): Promise<Exercise | null> {
    return this.rows.find((r) => r.id === id) ?? null;
  }
  async create(_input: NewCustomExercise): Promise<Exercise> {
    throw new Error('unused');
  }
  async update(_id: string, _patch: Partial<CustomExerciseFields>): Promise<Exercise> {
    throw new Error('unused');
  }
  async archive(id: string): Promise<void> {
    this.archiveCalls.push(id);
    if (this.archiveError) {
      throw this.archiveError;
    }
    this.rows = this.rows.map((r) => (r.id === id ? { ...r, archivedAt: Date.now() } : r));
  }
  async restore(): Promise<void> {
    throw new Error('unused');
  }
  async delete(id: string): Promise<void> {
    this.deleteCalls.push(id);
    if (this.referencedCount != null) {
      throw new ExerciseReferencedError(id, this.referencedCount);
    }
    this.rows = this.rows.filter((r) => r.id !== id);
  }
  async referenceCount(): Promise<number> {
    return this.referencedCount ?? 0;
  }
  async hasLoggedSets(): Promise<boolean> {
    return false;
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

async function renderDetail(repository: ExerciseRepository, exerciseId: string) {
  return render(
    <QueryClientProvider client={newTestQueryClient()}>
      <ThemeProvider preference="dark">
        <ExerciseDetailScreen repository={repository} exerciseId={exerciseId} testID="detail" />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

/** Finds the button labeled `label` in the most recent `Alert.alert` call and invokes its `onPress`. */
function pressAlertButton(label: string): void {
  const alertMock = Alert.alert as jest.Mock;
  const lastCall = alertMock.mock.calls[alertMock.mock.calls.length - 1];
  const buttons = lastCall[2] as { text: string; onPress?: () => void }[];
  const button = buttons.find((b) => b.text === label);
  if (!button?.onPress) throw new Error(`No "${label}" button with an onPress was found.`);
  button.onPress();
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
});

describe('ExerciseDetailScreen — nav wiring (M1-10, 03 §3)', () => {
  it('a custom exercise shows Edit in the header and Edit/Delete in the ⋯ menu', async () => {
    const repository = new FakeRepo([exercise()]);
    await renderDetail(repository, 'custom-1');

    expect(await screen.findByTestId('detail-edit')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('detail-menu'));
    expect(await screen.findByTestId('detail-actions-edit')).toBeTruthy();
    expect(screen.getByTestId('detail-actions-delete')).toBeTruthy();
    expect(screen.queryByTestId('detail-actions-duplicate')).toBeNull();
  });

  it('a built-in exercise shows no Edit affordance, and ⋯ only offers Duplicate as Custom', async () => {
    const builtin = exercise({ id: 'builtin-1', isCustom: false, name: 'Barbell Squat' });
    const repository = new FakeRepo([builtin]);
    await renderDetail(repository, 'builtin-1');

    await screen.findByTestId('detail-name');
    expect(screen.queryByTestId('detail-edit')).toBeNull();

    await fireEvent.press(screen.getByTestId('detail-menu'));
    expect(await screen.findByTestId('detail-actions-duplicate')).toBeTruthy();
    expect(screen.queryByTestId('detail-actions-edit')).toBeNull();
    expect(screen.queryByTestId('detail-actions-delete')).toBeNull();
  });

  it('Edit navigates to /exercise/[id]/edit', async () => {
    const repository = new FakeRepo([exercise()]);
    await renderDetail(repository, 'custom-1');

    await fireEvent.press(await screen.findByTestId('detail-edit'));

    expect(router.push).toHaveBeenCalledWith('/exercise/custom-1/edit');
  });
});

describe('ExerciseDetailScreen — delete/archive-offer flow (M1-10, 03 §5)', () => {
  it('deletes a zero-reference custom exercise directly and cleans up its photo files', async () => {
    const repository = new FakeRepo([exercise()]);
    await renderDetail(repository, 'custom-1');

    await fireEvent.press(await screen.findByTestId('detail-menu'));
    await fireEvent.press(await screen.findByTestId('detail-actions-delete'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete Exercise?',
      expect.stringContaining('My Custom Curl'),
      expect.any(Array),
    );
    pressAlertButton('Delete');

    await waitFor(() => expect(repository.deleteCalls).toEqual(['custom-1']));
    expect(mockedFiles.deleteExercisePhotos).toHaveBeenCalledWith('custom-1');
    expect(router.back).toHaveBeenCalled();
  });

  it('offers Archive instead when the exercise is referenced, and archiving hides it from the default list', async () => {
    const repository = new FakeRepo([exercise()]);
    repository.simulateReferenced(2);
    await renderDetail(repository, 'custom-1');

    await fireEvent.press(await screen.findByTestId('detail-menu'));
    await fireEvent.press(await screen.findByTestId('detail-actions-delete'));
    pressAlertButton('Delete'); // confirm the first ("are you sure") dialog

    await waitFor(() => expect(repository.deleteCalls).toEqual(['custom-1']));
    // The referenced-delete throw must surface the archive-offer dialog,
    // not a generic failure message.
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Can't Delete This Exercise",
        expect.stringContaining('2 workout/routine'),
        expect.any(Array),
      ),
    );

    pressAlertButton('Archive');

    await waitFor(() => expect(repository.archiveCalls).toEqual(['custom-1']));
    expect(router.back).toHaveBeenCalled();
    // Archived -> excluded from the default (browse/picker) list, still
    // `get()`-able by id (03 §5: "still renders where referenced").
    const afterList = await repository.list();
    expect(afterList.map((e) => e.id)).not.toContain('custom-1');
    expect(await repository.get('custom-1')).not.toBeNull();
  });

  // Milestone review (M1 whole-milestone pass): `repository.archive` can
  // throw (e.g. `ExerciseNotFoundError` if the row was removed elsewhere
  // between the referenced-delete attempt and this confirm) — before this
  // fix, `performArchive` had no try/catch at all, the same unhandled-
  // promise-rejection class the M1-12 catch-up review already found and
  // fixed for `ArchivedExercisesScreen.handleRestore`.
  it('surfaces an archive failure as an Alert instead of an unhandled rejection, and does not navigate back', async () => {
    const repository = new FakeRepo([exercise()]);
    repository.simulateReferenced(2);
    repository.simulateArchiveFailure(new Error('row vanished'));
    await renderDetail(repository, 'custom-1');

    await fireEvent.press(await screen.findByTestId('detail-menu'));
    await fireEvent.press(await screen.findByTestId('detail-actions-delete'));
    pressAlertButton('Delete');

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        "Can't Delete This Exercise",
        expect.stringContaining('2 workout/routine'),
        expect.any(Array),
      ),
    );
    pressAlertButton('Archive');

    await waitFor(() => expect(repository.archiveCalls).toEqual(['custom-1']));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Something went wrong',
        expect.stringContaining('could not be archived'),
      ),
    );
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe('ExerciseDetailScreen — Duplicate as Custom (M1-10, 03 §1/§5)', () => {
  it('stashes a full field-set prefill (name + " (Copy)") and navigates to /exercise/new', async () => {
    const builtin = exercise({
      id: 'Barbell_Bench_Press_-_Medium_Grip',
      isCustom: false,
      name: 'Barbell Bench Press - Medium Grip',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
      secondaryMuscleGroups: ['shoulders', 'triceps'],
      equipment: 'barbell',
      instructions: ['Lie on the bench.', 'Press up.'],
    });
    const repository = new FakeRepo([builtin]);
    await renderDetail(repository, builtin.id);

    await fireEvent.press(await screen.findByTestId('detail-menu'));
    await fireEvent.press(await screen.findByTestId('detail-actions-duplicate'));

    expect(router.push).toHaveBeenCalledWith('/exercise/new');
    expect(consumeExerciseFormPrefill()).toEqual({
      name: 'Barbell Bench Press - Medium Grip (Copy)',
      exerciseType: 'weight_reps',
      primaryMuscleGroup: 'chest',
      secondaryMuscleGroups: ['shoulders', 'triceps'],
      equipment: 'barbell',
      instructions: ['Lie on the bench.', 'Press up.'],
      usesCustomMetric: false,
    });
  });
});
