/**
 * `HistoryDetailScreen` tests (M2-14, 07 §5 read-only `SetTable`) — loading
 * state, not-found state, header (title/date), stats row
 * (Duration/Volume/Sets), and a read-only set table per exercise (no
 * editable inputs, no swipe-to-delete, correct values/badges).
 */
import { render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { Exercise, ExerciseRepository } from '@/data/exercises/types';
import type { WorkoutFull, WorkoutRepository } from '@/data/workouts/types';
import { useSettingsStore } from '@/features/settings/settings-store';
import { ThemeProvider } from '@/ui/theme-provider';

import { HistoryDetailScreen } from '../HistoryDetailScreen';

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

const START_TIME = new Date(2026, 0, 1, 9, 0, 0).getTime();
const END_TIME = START_TIME + 30 * 60 * 1000; // 30 min later

function makeWorkoutFull(overrides: Partial<WorkoutFull> = {}): WorkoutFull {
  return {
    id: 'w-1',
    title: 'Morning Workout',
    description: 'Felt strong',
    routineId: null,
    state: 'completed',
    startTime: START_TIME,
    endTime: END_TIME,
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
          {
            id: 'set-2',
            position: 1,
            setType: 'normal',
            weightKg: 65,
            reps: 6,
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

async function renderScreen(
  workoutRepository: Pick<WorkoutRepository, 'getFull'>,
  exerciseRepository: Pick<ExerciseRepository, 'get'>,
  workoutId = 'w-1',
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider preference="dark">
        <HistoryDetailScreen
          testID="detail"
          workoutId={workoutId}
          workoutRepository={workoutRepository}
          exerciseRepository={exerciseRepository}
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useSettingsStore.setState((state) => ({
    settings: {
      ...state.settings,
      weight_unit: 'kg',
      distance_unit: 'km',
      rpe_enabled: false,
      warmup_in_stats: false,
    },
  }));
});

describe('HistoryDetailScreen — not found', () => {
  it('shows a not-found state when getFull resolves null', async () => {
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = { getFull: async () => null };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = { get: async () => null };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByText(/not found/i)).toBeTruthy());
  });
});

describe('HistoryDetailScreen — header + stats row', () => {
  it('renders the title, date, and computed Duration/Volume/Sets stats', async () => {
    const full = makeWorkoutFull();
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = {
      getFull: async (id) => (id === full.id ? full : null),
    };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };

    await renderScreen(workoutRepository, exerciseRepository);

    await waitFor(() => expect(screen.getByText('Morning Workout')).toBeTruthy());
    // Duration: 30 min = "30:00".
    expect(screen.getByText('30:00')).toBeTruthy();
    // Volume: (60x8) + (65x6) = 480 + 390 = 870 kg.
    expect(screen.getByText('870 kg')).toBeTruthy();
    // Sets: 2 checked sets.
    expect(screen.getByTestId('detail-stat-sets')).toBeTruthy();
  });
});

describe('HistoryDetailScreen — read-only set table (07 §5)', () => {
  it('renders each set row read-only: correct values, no editable inputs, no delete chrome', async () => {
    const full = makeWorkoutFull();
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = {
      getFull: async (id) => (id === full.id ? full : null),
    };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByText('Bench Press')).toBeTruthy());

    // Values render as static text, not NumericInput.
    expect(screen.queryByTestId('detail-set-set-1-value-weight')).toBeNull();
    expect(screen.getByText('60')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
    expect(screen.getByText('65')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();

    // No swipe-to-delete chrome anywhere in the read-only table.
    expect(screen.queryByTestId('detail-set-set-1-delete-button')).toBeNull();
    expect(screen.queryByTestId('detail-set-set-2-delete-button')).toBeNull();

    // Working-set numbering: two normal sets -> 1, 2 (scoped to each row's
    // own SET badge to avoid colliding with the "Sets: 2" stat's own "2").
    expect(within(screen.getByTestId('detail-set-set-1-badge')).getByText('1')).toBeTruthy();
    expect(within(screen.getByTestId('detail-set-set-2-badge')).getByText('2')).toBeTruthy();

    // Both rows show as completed (checked).
    expect(screen.getByTestId('detail-set-set-1-check').props.accessibilityState.checked).toBe(true);
    expect(screen.getByTestId('detail-set-set-2-check').props.accessibilityState.checked).toBe(true);
  });
});
