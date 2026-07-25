/**
 * `HistoryListScreen` tests (M4-03 acceptance gate) — empty state, a card
 * per completed workout with title/relative-date/volume/PR-count/exercise
 * summary lines (integration with a fake `RecordsService` fixture, per the
 * task's own "integration with records fixtures" acceptance line),
 * pagination (`onEndReached` fetches the next page via `before`), row-tap
 * navigation, and header nav (Calendar icon, `+` → Log past workout).
 * `buildHistoryCard`'s own per-field correctness (volume math, PR-count
 * summing, summary-line formatting) is already covered by
 * `history-list-model.test.ts` — this file only proves the screen wires
 * real repositories/`RecordsService`/`FlashList`/navigation correctly.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { Exercise, ExerciseRepository } from '@/data/exercises/types';
import type { WorkoutExerciseFull, WorkoutRepository, WorkoutSummary } from '@/data/workouts/types';
import { configureRecordsService } from '@/features/stats/records-service';
import { useSettingsStore } from '@/features/settings/settings-store';
import { ThemeProvider } from '@/ui/theme-provider';

import { HistoryListScreen } from '../HistoryListScreen';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

function makeExercise(overrides: Partial<Exercise> = {}): Exercise {
  return {
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
    ...overrides,
  };
}

function makeSummary(overrides: Partial<WorkoutSummary> = {}): WorkoutSummary {
  return {
    id: 'w-1',
    title: 'Morning Workout',
    description: null,
    routineId: null,
    startTime: new Date(2026, 0, 1, 9, 0, 0).getTime(),
    endTime: new Date(2026, 0, 1, 10, 0, 0).getTime(),
    durationPauseOffsetMs: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function makeWorkoutExercise(overrides: Partial<WorkoutExerciseFull> = {}): WorkoutExerciseFull {
  return {
    id: 'we-1',
    workoutId: 'w-1',
    exerciseId: 'ex-1',
    position: 0,
    supersetId: null,
    notes: null,
    restSeconds: null,
    routineOccurrenceIndex: null,
    sets: [
      {
        id: 'set-1',
        position: 0,
        setType: 'normal',
        weightKg: 60,
        reps: 8,
        distanceMeters: null,
        durationSeconds: null,
        rpe: null,
        customMetric: null,
        isCompleted: true,
        routineSetPosition: null,
      },
    ],
    ...overrides,
  };
}

async function renderScreen(
  workoutRepository: Pick<WorkoutRepository, 'listCompleted' | 'getExercisesForWorkouts'>,
  exerciseRepository: Pick<ExerciseRepository, 'list'>,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider preference="dark">
        <HistoryListScreen
          testID="history"
          workoutRepository={workoutRepository}
          exerciseRepository={exerciseRepository}
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useSettingsStore.setState((state) => ({
    settings: { ...state.settings, weight_unit: 'kg', distance_unit: 'km', warmup_in_stats: false },
  }));
  // Every test needs a configured singleton — `getRecordsService()` throws
  // otherwise (`records-service.ts`'s own "throw until configured" guard).
  // Individual tests override with their own fixture where PR counts matter.
  configureRecordsService({
    setsForExercise: async () => [],
    exerciseHistoryWatermark: async () => 0,
  });
});

describe('HistoryListScreen — empty state', () => {
  it('shows the empty state when there are no completed workouts', async () => {
    const workoutRepository: Pick<WorkoutRepository, 'listCompleted' | 'getExercisesForWorkouts'> = {
      listCompleted: async () => [],
      getExercisesForWorkouts: async () => new Map(),
    };
    const exerciseRepository: Pick<ExerciseRepository, 'list'> = { list: async () => [] };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByText('No workouts logged yet')).toBeTruthy());
  });
});

describe('HistoryListScreen — populated list (04 §3.1 acceptance: accurate volume/PR counts)', () => {
  it('renders a card with title, volume, and PR count from RecordsService', async () => {
    const summary = makeSummary();
    const workoutRepository: Pick<WorkoutRepository, 'listCompleted' | 'getExercisesForWorkouts'> = {
      listCompleted: async () => [summary],
      getExercisesForWorkouts: async () => new Map([['w-1', [makeWorkoutExercise()]]]),
    };
    const exerciseRepository: Pick<ExerciseRepository, 'list'> = {
      list: async () => [makeExercise()],
    };
    // This is the exercise's very first-ever eligible set (no earlier
    // history) — `computeRecordsSnapshot` folds from an all-null starting
    // snapshot, so the first eligible set unconditionally wins every
    // applicable record type in one shot: `weight_reps` is eligible for
    // heaviest_weight, best_1rm, best_set_volume, most_reps, and
    // set_record (`domain/records.ts`'s eligibility table) — 5 awards,
    // all attributable to `workoutId: 'w-1'`.
    configureRecordsService({
      setsForExercise: async () => [
        {
          setId: 'set-1',
          workoutId: 'w-1',
          workoutStartTime: summary.startTime,
          setOrder: 0,
          exerciseType: 'weight_reps',
          setType: 'normal',
          isCompleted: true,
          weightKg: 60,
          reps: 8,
          durationSeconds: null,
        },
      ],
      exerciseHistoryWatermark: async () => 1,
    });

    await renderScreen(workoutRepository, exerciseRepository);

    await waitFor(() => expect(screen.getByTestId('history-card-w-1')).toBeTruthy());
    expect(screen.getByText('Morning Workout')).toBeTruthy();
    expect(screen.getByText(/480 kg/)).toBeTruthy();
    expect(screen.getByText(/🏆 5 PRs/)).toBeTruthy();
    expect(screen.getByText('1 × Bench Press (Barbell) — best 60kg × 8')).toBeTruthy();
  });

  it('omits the trophy segment entirely when PR count is 0', async () => {
    const workoutRepository: Pick<WorkoutRepository, 'listCompleted' | 'getExercisesForWorkouts'> = {
      listCompleted: async () => [makeSummary()],
      getExercisesForWorkouts: async () => new Map([['w-1', [makeWorkoutExercise()]]]),
    };
    const exerciseRepository: Pick<ExerciseRepository, 'list'> = {
      list: async () => [makeExercise()],
    };
    // No fixture history at all beyond this workout's own set — with
    // `setsForExercise` returning [], `RecordsService` computes an empty
    // snapshot and 0 awards for every workout.
    configureRecordsService({ setsForExercise: async () => [], exerciseHistoryWatermark: async () => 0 });

    await renderScreen(workoutRepository, exerciseRepository);

    await waitFor(() => expect(screen.getByTestId('history-card-w-1')).toBeTruthy());
    expect(screen.queryByText(/🏆/)).toBeNull();
  });

  it('excludes unchecked sets from the volume figure', async () => {
    const we = makeWorkoutExercise({
      sets: [
        ...makeWorkoutExercise().sets,
        {
          id: 'set-2',
          position: 1,
          setType: 'normal',
          weightKg: 999,
          reps: 999,
          distanceMeters: null,
          durationSeconds: null,
          rpe: null,
          customMetric: null,
          isCompleted: false,
          routineSetPosition: null,
        },
      ],
    });
    const workoutRepository: Pick<WorkoutRepository, 'listCompleted' | 'getExercisesForWorkouts'> = {
      listCompleted: async () => [makeSummary()],
      getExercisesForWorkouts: async () => new Map([['w-1', [we]]]),
    };
    const exerciseRepository: Pick<ExerciseRepository, 'list'> = {
      list: async () => [makeExercise()],
    };

    await renderScreen(workoutRepository, exerciseRepository);

    await waitFor(() => expect(screen.getByTestId('history-card-w-1')).toBeTruthy());
    expect(screen.getByText(/480 kg/)).toBeTruthy();
    expect(screen.queryByText(/999/)).toBeNull();
  });

  it('tapping a card navigates to /history/{id}', async () => {
    const workoutRepository: Pick<WorkoutRepository, 'listCompleted' | 'getExercisesForWorkouts'> = {
      listCompleted: async () => [makeSummary()],
      getExercisesForWorkouts: async () => new Map([['w-1', [makeWorkoutExercise()]]]),
    };
    const exerciseRepository: Pick<ExerciseRepository, 'list'> = {
      list: async () => [makeExercise()],
    };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByTestId('history-card-w-1')).toBeTruthy());

    fireEvent.press(screen.getByTestId('history-card-w-1'));
    expect(router.push).toHaveBeenCalledWith('/history/w-1');
  });
});

describe('HistoryListScreen — pagination', () => {
  // A full 20-row page (PAGE_SIZE) is what makes `fetchHistoryPage` compute
  // a real `nextBefore` (`history-list-model.test.ts`'s own
  // `fetchHistoryPage` unit tests cover that cursor math directly) — a
  // short page always ends pagination, which is exactly what closes out
  // this fixture's own page 2.
  function makeFullPage(idPrefix: string, latestStartTime: number): WorkoutSummary[] {
    return Array.from({ length: 20 }, (_, index) =>
      makeSummary({ id: `${idPrefix}-${index}`, startTime: latestStartTime - index * 1_000 }),
    );
  }

  it('loads the next page (before = the current last item\'s startTime) on onEndReached', async () => {
    const page1 = makeFullPage('w-page1', 20_000);
    const oldestPage1StartTime = page1[page1.length - 1]!.startTime;
    const page2 = [makeSummary({ id: 'w-page2-0', startTime: oldestPage1StartTime - 1_000 })];
    const listCompleted = jest.fn(async ({ before }: { before?: number; limit?: number } = {}) => {
      if (before === undefined) return page1;
      if (before === oldestPage1StartTime) return page2;
      return [];
    });
    const workoutRepository: Pick<WorkoutRepository, 'listCompleted' | 'getExercisesForWorkouts'> = {
      listCompleted: (page) => listCompleted(page ?? {}),
      getExercisesForWorkouts: async () => new Map(),
    };
    const exerciseRepository: Pick<ExerciseRepository, 'list'> = { list: async () => [] };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByTestId('history-card-w-page1-0')).toBeTruthy());
    expect(screen.queryByTestId('history-card-w-page2-0')).toBeNull();

    fireEvent(screen.getByTestId('history-list'), 'onEndReached');

    await waitFor(() => expect(screen.getByTestId('history-card-w-page2-0')).toBeTruthy());
    expect(listCompleted).toHaveBeenCalledWith({ before: oldestPage1StartTime, limit: 20 });
  });
});

describe('HistoryListScreen — header navigation', () => {
  const workoutRepository: Pick<WorkoutRepository, 'listCompleted' | 'getExercisesForWorkouts'> = {
    listCompleted: async () => [],
    getExercisesForWorkouts: async () => new Map(),
  };
  const exerciseRepository: Pick<ExerciseRepository, 'list'> = { list: async () => [] };

  it('Calendar button navigates to /history/calendar (M4-06 seam)', async () => {
    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByTestId('history-calendar-button')).toBeTruthy());

    fireEvent.press(screen.getByTestId('history-calendar-button'));
    expect(router.push).toHaveBeenCalledWith('/history/calendar');
  });

  it('"+" opens a sheet whose "Log past workout" navigates to /workout/active?retro=1 (M4-05 seam)', async () => {
    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByTestId('history-add-button')).toBeTruthy());

    fireEvent.press(screen.getByTestId('history-add-button'));
    await waitFor(() => expect(screen.getByTestId('history-add-sheet-log-past-workout')).toBeTruthy());

    fireEvent.press(screen.getByTestId('history-add-sheet-log-past-workout'));
    expect(router.push).toHaveBeenCalledWith('/workout/active?retro=1');
  });
});
