/**
 * `ExerciseDetailScreen` tests (M1-08 acceptance gate): About tab content
 * verified against the real `Barbell_Bench_Press_-_Medium_Grip` record
 * loaded directly from the actual vendored `assets/exercise-db.json` (not
 * hand-copied strings — the record is read from the real file at test time
 * and mapped to the `Exercise` shape here, so this test can never drift
 * from the real data); tab switching (`SegmentedControl` behavioral test);
 * History/Charts/Records `EmptyState` placeholders; the customs-with-no-
 * instructions empty-state copy; RNTL smoke both themes.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { Exercise, ExerciseRepository } from '@/data/exercises/types';
import { ThemeProvider } from '@/ui/theme-provider';

// The real, already-mapped dataset (03 §6.4 output shape — snake_case,
// matching `src/data/sqlite/schema.ts`'s `exercises` table field-for-field)
// for the M1-08 task's own named example exercise. Read directly from the
// real committed asset (relative path, not the `@/assets/*` tsconfig alias
// — the `ui` Jest project's `moduleNameMapper` only maps `@/*` to `src/*`,
// same reasoning `seed-builtins.ts`'s header documents for its own import
// of this file), not re-typed by hand, so this test's expectations can
// never silently drift from the actual bundled data.
import rawDataset from '../../../../assets/exercise-db.json';

import { ExerciseDetailScreen } from '../ExerciseDetailScreen';
import { FIXTURE_CUSTOM_NO_IMAGES, FakeExerciseRepository } from './exercise-fixtures';

const REAL_ID = 'Barbell_Bench_Press_-_Medium_Grip';
const realRecord = rawDataset.exercises.find((exercise) => exercise.id === REAL_ID);
if (realRecord == null) {
  throw new Error(
    `Fixture setup failure: "${REAL_ID}" was not found in the real assets/exercise-db.json — ` +
      'this test needs a real record to assert against.',
  );
}

function toExercise(
  record: NonNullable<typeof realRecord>,
  overrides: Partial<Exercise> = {},
): Exercise {
  return {
    id: record.id,
    name: record.name,
    exerciseType: record.exercise_type as Exercise['exerciseType'],
    primaryMuscleGroup: record.primary_muscle_group as Exercise['primaryMuscleGroup'],
    secondaryMuscleGroups: record.secondary_muscle_groups as Exercise['secondaryMuscleGroups'],
    equipment: record.equipment as Exercise['equipment'],
    instructions: record.instructions,
    images: record.images,
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

const REAL_EXERCISE = toExercise(realRecord);

// `gcTime: 0` per `ExerciseBrowseScreen.test.tsx`'s header note — avoids a
// `useQuery`-scheduled GC `setTimeout` outliving the test and keeping the
// Jest worker process alive; harmless test-only setting, no product-code
// `QueryClient` (`app/_layout.tsx`) is touched.
function newTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function renderWithProviders(
  repository: ExerciseRepository,
  exerciseId: string,
  theme: 'dark' | 'light' = 'dark',
  props: Partial<React.ComponentProps<typeof ExerciseDetailScreen>> = {},
) {
  return render(
    <QueryClientProvider client={newTestQueryClient()}>
      <ThemeProvider preference={theme}>
        <ExerciseDetailScreen
          repository={repository}
          exerciseId={exerciseId}
          testID="detail"
          {...props}
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

async function renderScreen(repository: ExerciseRepository, exerciseId: string, theme: 'dark' | 'light' = 'dark') {
  return renderWithProviders(repository, exerciseId, theme);
}

describe('ExerciseDetailScreen — About tab matches real exercise data', () => {
  it("renders Barbell Bench Press - Medium Grip's real type/equipment/muscles/instructions", async () => {
    const repository = new FakeExerciseRepository([REAL_EXERCISE]);
    await renderScreen(repository, REAL_ID);

    await waitFor(() => expect(screen.getByTestId('detail-about')).toBeTruthy());

    expect(screen.getByText(REAL_EXERCISE.name)).toBeTruthy();
    // exercise_type: "weight_reps" -> "Weight & Reps" (03 §3's own example).
    expect(screen.getByTestId('detail-about-type')).toHaveTextContent('Weight & Reps');
    // equipment: "barbell" -> "Barbell".
    expect(screen.getByTestId('detail-about-equipment')).toHaveTextContent('Barbell');
    // primary_muscle_group: "chest" -> filled chip "Chest".
    expect(screen.getByTestId('detail-about-primary-muscle-chip')).toHaveTextContent('Chest');
    // secondary_muscle_groups: ["shoulders", "triceps"] -> outline chips.
    expect(screen.getByTestId('detail-about-secondary-muscle-chip-shoulders')).toHaveTextContent(
      'Shoulders',
    );
    expect(screen.getByTestId('detail-about-secondary-muscle-chip-triceps')).toHaveTextContent(
      'Triceps',
    );
    // instructions: every real numbered step renders verbatim.
    REAL_EXERCISE.instructions.forEach((step, index) => {
      const row = screen.getByTestId(`detail-about-instruction-${index}`);
      expect(within(row).getByText(`${index + 1}.`)).toBeTruthy();
      expect(within(row).getByText(step)).toBeTruthy();
    });
    expect(screen.queryByTestId('detail-about-no-instructions')).toBeNull();
  });

  it('renders "No instructions added — edit to add" for a custom with zero instructions', async () => {
    const repository = new FakeExerciseRepository([FIXTURE_CUSTOM_NO_IMAGES]);
    await renderScreen(repository, FIXTURE_CUSTOM_NO_IMAGES.id);

    await waitFor(() => expect(screen.getByTestId('detail-about')).toBeTruthy());

    expect(screen.getByTestId('detail-about-no-instructions')).toHaveTextContent(
      'No instructions added — edit to add',
    );
  });
});

describe('ExerciseDetailScreen — tabs switch correctly', () => {
  it('shows the About tab by default, then switches to History/Charts/Records on tab press', async () => {
    const repository = new FakeExerciseRepository([REAL_EXERCISE]);
    await renderScreen(repository, REAL_ID);

    await waitFor(() => expect(screen.getByTestId('detail-about')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('detail-tabs-history'));
    expect(screen.getByText('No history yet')).toBeTruthy();
    expect(screen.queryByTestId('detail-about')).toBeNull();

    await fireEvent.press(screen.getByTestId('detail-tabs-charts'));
    expect(screen.getByText('No chart data yet')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('detail-tabs-records'));
    // 03 §3 verbatim empty-state copy for Records.
    expect(screen.getByText('No records yet')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('detail-tabs-about'));
    expect(screen.getByTestId('detail-about')).toBeTruthy();
  });
});

describe('ExerciseDetailScreen — not-found / loading', () => {
  it('renders a not-found state when the repository resolves null', async () => {
    const repository = new FakeExerciseRepository([]);
    await renderScreen(repository, 'does-not-exist');

    await waitFor(() => expect(screen.getByTestId('detail-not-found')).toBeTruthy());
  });
});

describe('ExerciseDetailScreen — smoke render (both themes)', () => {
  it('renders in dark theme', async () => {
    const repository = new FakeExerciseRepository([REAL_EXERCISE]);
    await renderScreen(repository, REAL_ID, 'dark');
    await waitFor(() => expect(screen.getByTestId('detail-about')).toBeTruthy());
  });

  it('renders in light theme', async () => {
    const repository = new FakeExerciseRepository([REAL_EXERCISE]);
    await renderScreen(repository, REAL_ID, 'light');
    await waitFor(() => expect(screen.getByTestId('detail-about')).toBeTruthy());
  });
});

describe('ExerciseDetailScreen — showBackButton', () => {
  it('shows the back affordance by default', async () => {
    const repository = new FakeExerciseRepository([REAL_EXERCISE]);
    await renderWithProviders(repository, REAL_ID);
    expect(screen.getByTestId('detail-back')).toBeTruthy();
  });

  it('hides the back affordance when showBackButton={false} (future sheet reuse)', async () => {
    const repository = new FakeExerciseRepository([REAL_EXERCISE]);
    await renderWithProviders(repository, REAL_ID, 'dark', { showBackButton: false });
    expect(screen.queryByTestId('detail-back')).toBeNull();
  });
});
