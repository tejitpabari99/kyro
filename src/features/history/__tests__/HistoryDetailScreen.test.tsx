/**
 * `HistoryDetailScreen` tests (M2-14, 07 §5 read-only `SetTable`) — loading
 * state, not-found state, header (title/date), stats row
 * (Duration/Volume/Sets), and a read-only set table per exercise (no
 * editable inputs, no swipe-to-delete, correct values/badges).
 *
 * M3-07 additions: the ⋯ menu's "Save as Routine" (calls
 * `createFromWorkout` then navigates to the M3-04 editor) and "Repeat
 * Workout" (the same one-active-workout gate `RoutinesHubScreen.test.tsx`
 * already exercises for "Start Routine," scoped here to `repeatWorkoutId`),
 * plus the routine-name/"(deleted routine)" subtitle (04 §2.2/05 §3.3).
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { Exercise, ExerciseRepository } from '@/data/exercises/types';
import type { RoutineRepository, RoutineSummary } from '@/data/routines/types';
import type { WorkoutFull, WorkoutRepository } from '@/data/workouts/types';
import { useActiveWorkoutStore } from '@/features/workout/activeWorkoutStore';
import { useSettingsStore } from '@/features/settings/settings-store';
import { ThemeProvider } from '@/ui/theme-provider';

import { HistoryDetailScreen } from '../HistoryDetailScreen';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

// M3-07's "Discard & Start New" path cancels a running rest-timer
// notification (`useRestTimerStore.getState().skip()`) — same native seam
// `RoutinesHubScreen.test.tsx` mocks for the identical reason.
jest.mock('@/lib/notifications');

function fixtureRoutineSummary(overrides: Partial<RoutineSummary> = {}): RoutineSummary {
  return {
    id: 'r-1',
    title: 'Push Day',
    notes: null,
    folderId: null,
    position: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function fixtureActiveWorkout(overrides: Partial<WorkoutFull> = {}): WorkoutFull {
  return {
    id: 'active-1',
    title: 'Evening Workout',
    description: null,
    routineId: null,
    state: 'active',
    startTime: Date.now(),
    endTime: null,
    durationPauseOffsetMs: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    exercises: [],
    ...overrides,
  };
}

/** Same helper `RoutinesHubScreen.test.tsx` uses — finds and presses a button by label in the most recent `Alert.alert` call. */
async function pressAlertButton(label: string): Promise<void> {
  const alertMock = Alert.alert as jest.Mock;
  const lastCall = alertMock.mock.calls[alertMock.mock.calls.length - 1];
  const buttons = lastCall[2] as { text: string; onPress?: () => void }[];
  const button = buttons.find((b) => b.text === label);
  if (!button) throw new Error(`No "${label}" button was found.`);
  await act(async () => {
    button.onPress?.();
    await Promise.resolve();
    await Promise.resolve();
  });
}

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

/** Default routine repository fixture — `createFromWorkout`/`get` unused by every pre-M3-07 test, overridable per-test for the new ⋯-menu cases below. */
function defaultRoutineRepository(): Pick<RoutineRepository, 'createFromWorkout' | 'get'> {
  return {
    createFromWorkout: async () => {
      throw new Error('not used in this test');
    },
    get: async () => null,
  };
}

async function renderScreen(
  workoutRepository: Pick<WorkoutRepository, 'getFull'>,
  exerciseRepository: Pick<ExerciseRepository, 'get'>,
  routineRepository: Pick<RoutineRepository, 'createFromWorkout' | 'get'> = defaultRoutineRepository(),
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
          routineRepository={routineRepository}
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  useActiveWorkoutStore.setState({ workout: null, loaded: true, error: null });
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

describe('HistoryDetailScreen — ⋯ Save as Routine (M3-07, 04 §2.2)', () => {
  it('calls createFromWorkout then navigates to the new routine\'s editor', async () => {
    const full = makeWorkoutFull();
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = {
      getFull: async () => full,
    };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };
    const createFromWorkout = jest.fn().mockResolvedValue(fixtureRoutineSummary({ id: 'new-r-1' }));
    const routineRepository: Pick<RoutineRepository, 'createFromWorkout' | 'get'> = {
      createFromWorkout,
      get: async () => null,
    };

    await renderScreen(workoutRepository, exerciseRepository, routineRepository);
    await waitFor(() => expect(screen.getByText('Morning Workout')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('detail-menu-button'));
    await fireEvent.press(await screen.findByTestId('detail-actions-sheet-save-as-routine'));

    expect(createFromWorkout).toHaveBeenCalledWith('w-1');
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/routine/new-r-1/edit'));
  });

  it('surfaces an error alert when createFromWorkout rejects, without navigating', async () => {
    const full = makeWorkoutFull();
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = { getFull: async () => full };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };
    const routineRepository: Pick<RoutineRepository, 'createFromWorkout' | 'get'> = {
      createFromWorkout: jest.fn().mockRejectedValue(new Error('boom')),
      get: async () => null,
    };

    await renderScreen(workoutRepository, exerciseRepository, routineRepository);
    await waitFor(() => expect(screen.getByText('Morning Workout')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('detail-menu-button'));
    await fireEvent.press(await screen.findByTestId('detail-actions-sheet-save-as-routine'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Something went wrong', expect.any(String)));
    expect(router.push).not.toHaveBeenCalled();
  });
});

describe('HistoryDetailScreen — ⋯ Repeat Workout (M3-07, 02 §1)', () => {
  it('navigates straight to /workout/active?repeatWorkoutId=... when nothing is active', async () => {
    const full = makeWorkoutFull();
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = { getFull: async () => full };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByText('Morning Workout')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('detail-menu-button'));
    await fireEvent.press(await screen.findByTestId('detail-actions-sheet-repeat-workout'));

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/workout/active?repeatWorkoutId=w-1');
  });

  it('shows the Resume / Discard-and-start / Cancel gate when a workout is already active (02 §1 one-active invariant)', async () => {
    useActiveWorkoutStore.setState({ workout: fixtureActiveWorkout({ title: 'Evening Workout' }) });
    const full = makeWorkoutFull();
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = { getFull: async () => full };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByText('Morning Workout')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('detail-menu-button'));
    await fireEvent.press(await screen.findByTestId('detail-actions-sheet-repeat-workout'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Workout in Progress',
      '"Evening Workout" is still active.',
      expect.arrayContaining([
        expect.objectContaining({ text: 'Cancel' }),
        expect.objectContaining({ text: 'Resume' }),
        expect.objectContaining({ text: 'Discard & Start New' }),
      ]),
    );
    expect(router.push).not.toHaveBeenCalled();
  });

  it('Discard & Start New discards the active workout then navigates to the repeat target', async () => {
    const discard = jest.fn().mockResolvedValue(undefined);
    useActiveWorkoutStore.setState({ workout: fixtureActiveWorkout(), discard });
    const full = makeWorkoutFull();
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = { getFull: async () => full };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByText('Morning Workout')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('detail-menu-button'));
    await fireEvent.press(await screen.findByTestId('detail-actions-sheet-repeat-workout'));
    await pressAlertButton('Discard & Start New');

    expect(Alert.alert).toHaveBeenCalledWith(
      'Discard workout?',
      'All entered data will be lost.',
      expect.any(Array),
    );
    expect(discard).not.toHaveBeenCalled();

    await pressAlertButton('Discard');

    expect(discard).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/workout/active?repeatWorkoutId=w-1');
  });

  it('Resume navigates to the existing active workout, not the repeat target', async () => {
    useActiveWorkoutStore.setState({ workout: fixtureActiveWorkout({ title: 'Evening Workout' }) });
    const full = makeWorkoutFull();
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = { getFull: async () => full };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByText('Morning Workout')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('detail-menu-button'));
    await fireEvent.press(await screen.findByTestId('detail-actions-sheet-repeat-workout'));
    await pressAlertButton('Resume');

    expect(router.push).toHaveBeenCalledWith('/workout/active');
  });
});

describe('HistoryDetailScreen — routine name / "(deleted routine)" (M3-07, 04 §2.2, 05 §3.3)', () => {
  it('renders nothing extra for a workout with no routineId', async () => {
    const full = makeWorkoutFull({ routineId: null });
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = { getFull: async () => full };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByText('Morning Workout')).toBeTruthy());

    expect(screen.queryByTestId('detail-routine-subtitle')).toBeNull();
  });

  it('shows "From {title}" when the routine still exists', async () => {
    const full = makeWorkoutFull({ routineId: 'r-1' });
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = { getFull: async () => full };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };
    const routineRepository: Pick<RoutineRepository, 'createFromWorkout' | 'get'> = {
      createFromWorkout: jest.fn(),
      get: async (id) => (id === 'r-1' ? fixtureRoutineSummary({ id: 'r-1', title: 'Push Day' }) : null),
    };

    await renderScreen(workoutRepository, exerciseRepository, routineRepository);
    await waitFor(() => expect(screen.getByTestId('detail-routine-subtitle')).toBeTruthy());
    expect(screen.getByText('From Push Day')).toBeTruthy();
  });

  it('shows "(deleted routine)" once the routine no longer resolves (05 §3.3 soft reference — history still loads/renders)', async () => {
    const full = makeWorkoutFull({ routineId: 'deleted-r-1' });
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = { getFull: async () => full };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };
    const routineRepository: Pick<RoutineRepository, 'createFromWorkout' | 'get'> = {
      createFromWorkout: jest.fn(),
      get: async () => null,
    };

    await renderScreen(workoutRepository, exerciseRepository, routineRepository);
    await waitFor(() => expect(screen.getByTestId('detail-routine-subtitle')).toBeTruthy());
    expect(screen.getByText('(deleted routine)')).toBeTruthy();

    // The rest of the workout still renders normally — deleting a routine
    // never touches/cascades into past workouts.
    expect(screen.getByText('Morning Workout')).toBeTruthy();
    expect(screen.getByText('Bench Press')).toBeTruthy();
  });
});
