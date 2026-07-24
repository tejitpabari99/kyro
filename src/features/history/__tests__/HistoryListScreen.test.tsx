/**
 * `HistoryListScreen` tests (M2-14, 09 M2 scope: minimal history) — empty
 * state, a row per completed workout with title/date/volume, correct
 * volume computed from the exercise type + checked sets (not a
 * placeholder — the task's own acceptance criterion), and row-tap
 * navigation to the detail route.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { Exercise, ExerciseRepository } from '@/data/exercises/types';
import type { WorkoutFull, WorkoutRepository, WorkoutSummary } from '@/data/workouts/types';
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
    usesCustomMetric: false,
    isCustom: false,
    isBuiltin: true,
    archivedAt: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  } as Exercise;
}

function makeWorkoutFull(overrides: Partial<WorkoutFull> = {}): WorkoutFull {
  return {
    id: 'w-1',
    title: 'Morning Workout',
    description: null,
    routineId: null,
    state: 'completed',
    startTime: new Date(2026, 0, 1, 9, 0, 0).getTime(),
    endTime: new Date(2026, 0, 1, 10, 0, 0).getTime(),
    durationPauseOffsetMs: 0,
    createdAt: 0,
    updatedAt: 0,
    exercises: [
      {
        id: 'we-1',
        workoutId: 'w-1',
        exerciseId: 'ex-1',
        position: 0,
        supersetId: null,
        notes: null,
        restSeconds: null,
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
          },
        ],
      },
    ],
    ...overrides,
  } as WorkoutFull;
}

function summaryFromFull(full: WorkoutFull): WorkoutSummary {
  return {
    id: full.id,
    title: full.title,
    description: full.description,
    routineId: full.routineId,
    startTime: full.startTime,
    endTime: full.endTime,
    durationPauseOffsetMs: full.durationPauseOffsetMs,
    createdAt: full.createdAt,
    updatedAt: full.updatedAt,
  };
}

async function renderScreen(
  workoutRepository: Pick<WorkoutRepository, 'listCompleted' | 'getFull'>,
  exerciseRepository: Pick<ExerciseRepository, 'get'>,
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
    settings: { ...state.settings, weight_unit: 'kg', warmup_in_stats: false },
  }));
});

describe('HistoryListScreen — empty state', () => {
  it('shows the empty state when there are no completed workouts', async () => {
    const workoutRepository: Pick<WorkoutRepository, 'listCompleted' | 'getFull'> = {
      listCompleted: async () => [],
      getFull: async () => null,
    };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = { get: async () => null };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByText('No workouts logged yet')).toBeTruthy());
  });
});

describe('HistoryListScreen — populated list (02 §14 acceptance: correct volume)', () => {
  it('renders a row with title, date, and correctly computed volume (60kg x 8 = 480 kg)', async () => {
    const full = makeWorkoutFull();
    const workoutRepository: Pick<WorkoutRepository, 'listCompleted' | 'getFull'> = {
      listCompleted: async () => [summaryFromFull(full)],
      getFull: async (id) => (id === full.id ? full : null),
    };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };

    await renderScreen(workoutRepository, exerciseRepository);

    await waitFor(() => expect(screen.getByTestId('history-row-w-1')).toBeTruthy());
    expect(screen.getByText('Morning Workout')).toBeTruthy();
    expect(screen.getByText(/480 kg/)).toBeTruthy();
  });

  it('excludes unchecked sets from the volume figure', async () => {
    const full = makeWorkoutFull({
      exercises: [
        {
          id: 'we-1',
          workoutId: 'w-1',
          exerciseId: 'ex-1',
          position: 0,
          supersetId: null,
          notes: null,
          restSeconds: null,
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
            },
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
            },
          ],
        },
      ],
    });
    const workoutRepository: Pick<WorkoutRepository, 'listCompleted' | 'getFull'> = {
      listCompleted: async () => [summaryFromFull(full)],
      getFull: async (id) => (id === full.id ? full : null),
    };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };

    await renderScreen(workoutRepository, exerciseRepository);

    await waitFor(() => expect(screen.getByTestId('history-row-w-1')).toBeTruthy());
    // Only the checked 60kg x 8 set counts — the unchecked 999x999 row must
    // never leak into the displayed volume (02 §14: "unchecked sets are
    // absent from saved workout, history, stats").
    expect(screen.getByText(/480 kg/)).toBeTruthy();
    expect(screen.queryByText(/999/)).toBeNull();
  });

  it('tapping a row navigates to /history/{id}', async () => {
    const full = makeWorkoutFull();
    const workoutRepository: Pick<WorkoutRepository, 'listCompleted' | 'getFull'> = {
      listCompleted: async () => [summaryFromFull(full)],
      getFull: async (id) => (id === full.id ? full : null),
    };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByTestId('history-row-w-1')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('history-row-w-1'));
    expect(router.push).toHaveBeenCalledWith('/history/w-1');
  });
});
