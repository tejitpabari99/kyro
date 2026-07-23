/**
 * `ArchivedExercisesScreen` tests (M1-10 acceptance gate): lists only
 * archived rows (filters out an active exercise the fake repository also
 * returns via `includeArchived: true`), empty state when nothing is
 * archived, and Restore calling `repository.restore` + refetching so the
 * restored row drops out of the list.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type {
  CustomExerciseFields,
  Exercise,
  ExerciseListFilter,
  ExerciseRepository,
  NewCustomExercise,
} from '@/data/exercises/types';
import { DuplicateExerciseNameError } from '@/data/exercises/errors';
import type { MappedExerciseRecord } from '@/domain/exercise-mapping';
import { ThemeProvider } from '@/ui/theme-provider';

import { ArchivedExercisesScreen } from '../ArchivedExercisesScreen';

function exercise(overrides: Partial<Exercise> & Pick<Exercise, 'id' | 'name'>): Exercise {
  return {
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
    ...overrides,
  };
}

class FakeRepo implements ExerciseRepository {
  public restoreCalls: string[] = [];

  constructor(
    private rows: Exercise[],
    private restoreError?: Error,
  ) {}

  async list(filter?: ExerciseListFilter): Promise<Exercise[]> {
    if (filter?.includeArchived) return this.rows;
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
  async archive(): Promise<void> {
    throw new Error('unused');
  }
  async restore(id: string): Promise<void> {
    this.restoreCalls.push(id);
    if (this.restoreError) {
      throw this.restoreError;
    }
    this.rows = this.rows.map((r) => (r.id === id ? { ...r, archivedAt: null } : r));
  }
  async delete(): Promise<void> {
    throw new Error('unused');
  }
  async referenceCount(): Promise<number> {
    return 0;
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

async function renderScreen(repository: ExerciseRepository) {
  return render(
    <QueryClientProvider client={newTestQueryClient()}>
      <ThemeProvider preference="dark">
        <ArchivedExercisesScreen repository={repository} testID="archived" />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

describe('ArchivedExercisesScreen', () => {
  it('lists only archived rows, excluding an active exercise the repository also returns', async () => {
    const repository = new FakeRepo([
      exercise({ id: 'active-1', name: 'Active One', archivedAt: null }),
      exercise({ id: 'archived-1', name: 'Archived One', archivedAt: 1000 }),
    ]);
    await renderScreen(repository);

    expect(await screen.findByTestId('archived-row-archived-1')).toBeTruthy();
    expect(screen.queryByTestId('archived-row-active-1')).toBeNull();
  });

  it('shows an empty state when nothing is archived', async () => {
    const repository = new FakeRepo([exercise({ id: 'active-1', name: 'Active One' })]);
    await renderScreen(repository);

    expect(await screen.findByTestId('archived-empty')).toBeTruthy();
  });

  it('Restore calls repository.restore and the row drops out of the list', async () => {
    const repository = new FakeRepo([
      exercise({ id: 'archived-1', name: 'Archived One', archivedAt: 1000 }),
    ]);
    await renderScreen(repository);

    await fireEvent.press(await screen.findByTestId('archived-restore-archived-1'));

    await waitFor(() => expect(repository.restoreCalls).toEqual(['archived-1']));
    await waitFor(() => expect(screen.queryByTestId('archived-row-archived-1')).toBeNull());
    expect(await screen.findByTestId('archived-empty')).toBeTruthy();
  });

  // Regression (M1-12 catch-up review): `repository.restore` can throw
  // `DuplicateExerciseNameError` (see that method's own comment on
  // `ExerciseRepository` — restoring must not silently violate active-name
  // uniqueness) but the screen previously had no catch at all around the
  // call, so this surfaced as a silent unhandled rejection with zero user
  // feedback and the row staying in the list with no explanation. Now
  // surfaced via `Alert.alert`, matching `ExerciseDetailScreen`'s existing
  // error-Alert convention for repository failures.
  it('Restore surfaces a DuplicateExerciseNameError as an Alert instead of an unhandled rejection', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    const repository = new FakeRepo(
      [exercise({ id: 'archived-1', name: 'Archived One', archivedAt: 1000 })],
      new DuplicateExerciseNameError('Archived One'),
    );
    await renderScreen(repository);

    await fireEvent.press(await screen.findByTestId('archived-restore-archived-1'));

    await waitFor(() => expect(repository.restoreCalls).toEqual(['archived-1']));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        "Can't Restore This Exercise",
        expect.stringContaining('Archived One'),
      ),
    );
    // The row is still there — the restore never actually applied.
    expect(await screen.findByTestId('archived-row-archived-1')).toBeTruthy();

    alertSpy.mockRestore();
  });
});
