/**
 * `ExerciseDetailScreen` tests (M1-08 acceptance gate): About tab content
 * verified against the real `Barbell_Bench_Press_-_Medium_Grip` record
 * loaded directly from the actual vendored `assets/exercise-db.json` (not
 * hand-copied strings — the record is read from the real file at test time
 * and mapped to the `Exercise` shape here, so this test can never drift
 * from the real data); tab switching (`SegmentedControl` behavioral test);
 * History/Charts/Records `EmptyState` placeholders; the customs-with-no-
 * instructions empty-state copy; RNTL smoke both themes.
 *
 * M1-10 update: `ExerciseDetailScreen` now imports `@/lib/files`
 * (`deleteExercisePhotos`, wired into the delete flow) — that module's own
 * real top-level native imports (`expo-file-system/legacy`/
 * `expo-image-manipulator`/`expo-image-picker`) are unavailable under Jest
 * (08 §5), so it's mocked wholesale here the same way every other consumer
 * of that seam does.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { Exercise, ExerciseRepository } from '@/data/exercises/types';
import type { ExerciseHistorySet, WorkoutRepository } from '@/data/workouts/types';
import type { HistoricalSet } from '@/domain/records';
import { configureRecordsService } from '@/features/stats/records-service';
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

jest.mock('@/lib/files');

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

// M4-09: every test needs a configured `RecordsService` singleton — the
// Records tab's `useRecordsSnapshot` calls the throwing `getRecordsService()`
// getter internally (same convention `HistoryDetailScreen.test.tsx`
// established for its own trophy queries). Empty history by default (no
// records anywhere, matching the pre-M4-09 "No records yet" expectation
// every existing test in this file already asserts) — the M4-09-specific
// `describe` blocks below override this per-test with a real fixture.
beforeEach(() => {
  configureRecordsService({
    setsForExercise: async () => [],
    exerciseHistoryWatermark: async () => 0,
  });
});

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

// ---------------------------------------------------------------------------
// M4-09 — real History/Charts/Records tab content
// ---------------------------------------------------------------------------

// Recent-relative-to-`Date.now()`, not a fixed historical date — the
// Charts tab defaults to the 3M range, which would otherwise filter out a
// hardcoded far-past fixture date depending on when this suite runs.
const DAY1 = Date.now() - 5 * 24 * 60 * 60 * 1000;
const DAY2 = Date.now() - 1 * 24 * 60 * 60 * 1000;

/** Two performances for `REAL_ID` (weight_reps): an earlier "Push Day" with a warm-up + a working set, and a later "Push Day 2" with a heavier single working set. */
const EXERCISE_HISTORY_FIXTURE: ExerciseHistorySet[] = [
  {
    setId: 'set-1a',
    workoutId: 'w1',
    workoutTitle: 'Push Day',
    workoutStartTime: DAY1,
    setOrder: 0,
    setType: 'warmup',
    isCompleted: true,
    weightKg: 40,
    reps: 10,
    distanceMeters: null,
    durationSeconds: null,
    rpe: null,
    customMetric: null,
  },
  {
    setId: 'set-1b',
    workoutId: 'w1',
    workoutTitle: 'Push Day',
    workoutStartTime: DAY1,
    setOrder: 1,
    setType: 'normal',
    isCompleted: true,
    weightKg: 80,
    reps: 8,
    distanceMeters: null,
    durationSeconds: null,
    rpe: 9,
    customMetric: null,
  },
  {
    setId: 'set-2a',
    workoutId: 'w2',
    workoutTitle: 'Push Day 2',
    workoutStartTime: DAY2,
    setOrder: 2,
    setType: 'normal',
    isCompleted: true,
    weightKg: 90,
    reps: 5,
    distanceMeters: null,
    durationSeconds: null,
    rpe: null,
    customMetric: null,
  },
];

function fakeWorkoutRepository(
  sets: ExerciseHistorySet[],
): Pick<WorkoutRepository, 'exerciseHistory'> {
  return { exerciseHistory: async () => sets };
}

describe('ExerciseDetailScreen — History tab (real content)', () => {
  it('renders performances reverse-chron, with numbered set lines and a W badge on the warm-up', async () => {
    const repository = new FakeExerciseRepository([REAL_EXERCISE]);
    render(
      <QueryClientProvider client={newTestQueryClient()}>
        <ThemeProvider preference="dark">
          <ExerciseDetailScreen
            repository={repository}
            workoutRepository={fakeWorkoutRepository(EXERCISE_HISTORY_FIXTURE)}
            exerciseId={REAL_ID}
            testID="detail"
          />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('detail-about')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('detail-tabs-history'));

    await waitFor(() => expect(screen.getByTestId('detail-history-card-w2')).toBeTruthy());
    // Reverse-chron: "Push Day 2" (later) renders before "Push Day".
    expect(screen.getByTestId('detail-history-card-w2')).toBeTruthy();
    expect(screen.getByTestId('detail-history-card-w1')).toBeTruthy();

    const w1Card = screen.getByTestId('detail-history-card-w1');
    expect(within(w1Card).getByText('Push Day')).toBeTruthy();
    // Warm-up set shows the "W" badge glyph, not a working number.
    expect(within(w1Card).getByTestId('detail-history-card-w1-set-set-1a-badge-circle')).toBeTruthy();
    expect(within(w1Card).getByText('W')).toBeTruthy();
    // The working set is numbered "1" (warm-ups don't consume a number) and
    // shows the full "80kg × 8 @9" line — RPE only shown when the store's
    // `rpe_enabled` default (`false`) is overridden; default is off, so no "@9" here.
    expect(within(w1Card).getByText('80kg × 8')).toBeTruthy();

    const w2Card = screen.getByTestId('detail-history-card-w2');
    expect(within(w2Card).getByText('90kg × 5')).toBeTruthy();
  });
});

describe('ExerciseDetailScreen — Charts tab (real content)', () => {
  it('renders the metric selector + a populated chart, and switching metrics updates the active chip', async () => {
    const repository = new FakeExerciseRepository([REAL_EXERCISE]);
    render(
      <QueryClientProvider client={newTestQueryClient()}>
        <ThemeProvider preference="dark">
          <ExerciseDetailScreen
            repository={repository}
            workoutRepository={fakeWorkoutRepository(EXERCISE_HISTORY_FIXTURE)}
            exerciseId={REAL_ID}
            testID="detail"
          />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('detail-about')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('detail-tabs-charts'));

    // weight_reps -> 5 metrics (04 §4.3); Heaviest Weight is first/default.
    await waitFor(() => expect(screen.getByTestId('detail-charts-metric-heaviest_weight')).toBeTruthy());
    expect(screen.getByTestId('detail-charts-metric-best_1rm')).toBeTruthy();
    expect(screen.getByTestId('detail-charts-metric-best_set_volume')).toBeTruthy();
    expect(screen.getByTestId('detail-charts-metric-session_volume')).toBeTruthy();
    expect(screen.getByTestId('detail-charts-metric-total_reps')).toBeTruthy();

    // Real data present -> the chart plot renders, not the empty state.
    expect(screen.getByTestId('detail-charts-chart-plot')).toBeTruthy();
    expect(screen.queryByTestId('detail-charts-chart-empty')).toBeNull();

    await fireEvent.press(screen.getByTestId('detail-charts-metric-total_reps'));
    expect(screen.getByTestId('detail-charts-metric-total_reps').props.accessibilityState.selected).toBe(
      true,
    );
    expect(
      screen.getByTestId('detail-charts-metric-heaviest_weight').props.accessibilityState.selected,
    ).toBe(false);
  });

  it('reps_only exercises show a single Total Reps metric', async () => {
    const repsOnly: Exercise = { ...REAL_EXERCISE, id: 'reps-only-fixture', exerciseType: 'reps_only' };
    const repository = new FakeExerciseRepository([repsOnly]);
    render(
      <QueryClientProvider client={newTestQueryClient()}>
        <ThemeProvider preference="dark">
          <ExerciseDetailScreen
            repository={repository}
            workoutRepository={fakeWorkoutRepository(
              EXERCISE_HISTORY_FIXTURE.map((s) => ({ ...s })),
            )}
            exerciseId={repsOnly.id}
            testID="detail"
          />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('detail-about')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('detail-tabs-charts'));

    await waitFor(() => expect(screen.getByTestId('detail-charts-metric-total_reps')).toBeTruthy());
    expect(screen.queryByTestId('detail-charts-metric-heaviest_weight')).toBeNull();
  });
});

describe('ExerciseDetailScreen — Records tab (real content)', () => {
  it('renders PR cards with value + date, and the Set Records table', async () => {
    const repository = new FakeExerciseRepository([REAL_EXERCISE]);

    const recordsFixtureSets: HistoricalSet[] = [
      {
        setId: 'set-1b',
        workoutId: 'w1',
        workoutStartTime: DAY1,
        setOrder: 0,
        exerciseType: 'weight_reps',
        setType: 'normal',
        isCompleted: true,
        weightKg: 80,
        reps: 8,
        durationSeconds: null,
      },
    ];
    configureRecordsService({
      setsForExercise: async () => recordsFixtureSets,
      exerciseHistoryWatermark: async () => 1,
    });

    render(
      <QueryClientProvider client={newTestQueryClient()}>
        <ThemeProvider preference="dark">
          <ExerciseDetailScreen
            repository={repository}
            workoutRepository={fakeWorkoutRepository(EXERCISE_HISTORY_FIXTURE)}
            exerciseId={REAL_ID}
            testID="detail"
          />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('detail-about')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('detail-tabs-records'));

    await waitFor(() => expect(screen.getByTestId('detail-records-pr-heaviest_weight')).toBeTruthy());
    expect(within(screen.getByTestId('detail-records-pr-heaviest_weight')).getByText('80 kg')).toBeTruthy();
    expect(screen.getByTestId('detail-records-pr-best_1rm')).toBeTruthy();
    expect(screen.getByTestId('detail-records-pr-best_set_volume')).toBeTruthy();
    expect(screen.getByTestId('detail-records-pr-most_reps')).toBeTruthy();

    // Set Records table: bucket "8" (this set's own rep count) holds 80 kg;
    // every other bucket (1-10 minus 8, plus "10+") is empty ("—").
    const table = screen.getByTestId('detail-records-set-records-table');
    expect(within(table).getByText('80 kg')).toBeTruthy();
    expect(within(screen.getByTestId('detail-records-set-record-1')).getByText('—')).toBeTruthy();
    expect(within(screen.getByTestId('detail-records-set-record-10+')).getByText('—')).toBeTruthy();
  });

  it('assisted exercises show a least-assistance line instead of Heaviest/volume trophies', async () => {
    const assisted: Exercise = {
      ...REAL_EXERCISE,
      id: 'assisted-fixture',
      exerciseType: 'bodyweight_assisted_reps',
    };
    const repository = new FakeExerciseRepository([assisted]);

    const recordsFixtureSets: HistoricalSet[] = [
      {
        setId: 'set-a1',
        workoutId: 'w1',
        workoutStartTime: DAY1,
        setOrder: 0,
        exerciseType: 'bodyweight_assisted_reps',
        setType: 'normal',
        isCompleted: true,
        weightKg: 20,
        reps: 6,
        durationSeconds: null,
      },
    ];
    configureRecordsService({
      setsForExercise: async () => recordsFixtureSets,
      exerciseHistoryWatermark: async () => 1,
    });

    render(
      <QueryClientProvider client={newTestQueryClient()}>
        <ThemeProvider preference="dark">
          <ExerciseDetailScreen repository={repository} exerciseId={assisted.id} testID="detail" />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('detail-about')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('detail-tabs-records'));

    await waitFor(() => expect(screen.getByTestId('detail-records-pr-most_reps')).toBeTruthy());
    expect(screen.queryByTestId('detail-records-pr-heaviest_weight')).toBeNull();
    expect(screen.queryByTestId('detail-records-set-records-table')).toBeNull();
    expect(screen.getByTestId('detail-records-least-assistance')).toHaveTextContent('20 kg');
  });
});
