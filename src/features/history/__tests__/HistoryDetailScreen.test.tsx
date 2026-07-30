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
 *
 * M4-04 additions (04 §3.1/§5.4; 02 §15; 07 §6): trophy badges verified
 * against a real `configureRecordsService` fixture (this task's own
 * acceptance line — "Trophy badges match domain attribution on a fixture
 * history"), the tap-to-reveal record-type label, exercise notes, the ⋯
 * menu's new "Edit Workout" nav and "Delete" confirm/soft-delete/recompute
 * flow, and a light-theme smoke render (dark is already covered by every
 * `renderScreen` call's default `ThemeProvider preference="dark"`).
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { Exercise, ExerciseRepository } from '@/data/exercises/types';
import type { RoutineRepository, RoutineSummary } from '@/data/routines/types';
import type { WorkoutFull, WorkoutRepository } from '@/data/workouts/types';
import type { CsvServiceApi } from '@/features/data-transfer/csv-service';
import { useActiveWorkoutStore } from '@/features/workout/activeWorkoutStore';
import { useSettingsStore } from '@/features/settings/settings-store';
import { configureRecordsService, invalidateAfterWorkoutMutation } from '@/features/stats/records-service';
import { shareFile } from '@/lib/share-file';
import { ThemeProvider, type ThemePreference } from '@/ui/theme-provider';

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

// M5-06: `HistoryDetailScreen` calls `lib/share-file.ts`'s `shareFile`
// (never `expo-sharing` directly, per that file's own header) for the ⋯
// menu's newly un-hidden "Export CSV" item — mocked at this seam so these
// tests assert the screen's own behavior (which URI it passes) without
// touching the real native module.
jest.mock('@/lib/share-file', () => ({
  shareFile: jest.fn().mockResolvedValue(undefined),
}));

// M4-04: `invalidateAfterWorkoutMutation` is spied (real implementation
// otherwise, `getSnapshot`/`configureRecordsService`/etc. all stay real) so
// the "⋯ Delete" tests below can assert the screen actually calls the
// central M4-02 recompute helper with this workout's own exercise ids,
// without needing to reach into the `QueryClient` `renderScreen` builds
// internally.
jest.mock('@/features/stats/records-service', () => ({
  ...jest.requireActual('@/features/stats/records-service'),
  invalidateAfterWorkoutMutation: jest.fn().mockResolvedValue(undefined),
}));

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

/** Default `CsvService` fixture (M5-06) — `exportWorkout` unused by every test that isn't specifically exercising the ⋯ menu's "Export CSV" item, overridable per-test below. */
function defaultCsvService(): Pick<CsvServiceApi, 'exportWorkout'> {
  return {
    exportWorkout: async () => {
      throw new Error('not used in this test');
    },
  };
}

/**
 * M4-04: `softDelete` is optional here and defaulted to a no-op stub — every
 * pre-M4-04 test constructs its own `workoutRepository` fixture as `Pick<...,
 * 'getFull'>` only (M2-14/M3-07's own established shape), and none of them
 * care about delete; only the new "⋯ Delete" `describe` block below
 * overrides it to assert the real call.
 */
async function renderScreen(
  workoutRepository: Pick<WorkoutRepository, 'getFull'> & Partial<Pick<WorkoutRepository, 'softDelete'>>,
  exerciseRepository: Pick<ExerciseRepository, 'get'>,
  routineRepository: Pick<RoutineRepository, 'createFromWorkout' | 'get'> = defaultRoutineRepository(),
  workoutId = 'w-1',
  theme: ThemePreference = 'dark',
  csvService: Pick<CsvServiceApi, 'exportWorkout'> = defaultCsvService(),
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  const fullWorkoutRepository: Pick<WorkoutRepository, 'getFull' | 'softDelete'> = {
    softDelete: async () => undefined,
    ...workoutRepository,
  };
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider preference={theme}>
        <HistoryDetailScreen
          testID="detail"
          workoutId={workoutId}
          workoutRepository={fullWorkoutRepository}
          exerciseRepository={exerciseRepository}
          routineRepository={routineRepository}
          csvService={csvService}
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
  // M4-04: every test needs a configured `RecordsService` singleton —
  // `getSnapshot` (inside the screen's `awardsQuery`) throws otherwise
  // (`records-service.ts`'s own "throw until configured" guard). Empty
  // history by default (no trophies anywhere) — the trophy-specific
  // `describe` block below overrides this per-test with a real fixture.
  configureRecordsService({
    setsForExercise: async () => [],
    exerciseHistoryWatermark: async () => 0,
  });
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

describe('HistoryDetailScreen — back button (09 Task 13)', () => {
  it('calls router.back() when the back chevron is pressed', async () => {
    const full = makeWorkoutFull();
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = {
      getFull: async (id) => (id === full.id ? full : null),
    };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByText('Morning Workout')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('detail-back'));

    expect(router.back).toHaveBeenCalledTimes(1);
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

// -- M4-04 -------------------------------------------------------------

/**
 * A workout whose two sets, taken as `ex-1`'s *entire* history (the fixture
 * `configureRecordsService` below feeds back as `setsForExercise`), produces
 * one clear-trophy set and one clear-no-trophy set — the same
 * `domain/records.ts` fold every other trophy surface uses, worked by hand
 * here so the assertions below are checked against real domain attribution,
 * not a stubbed boolean:
 *
 *  - `set-1` (100 kg × 5, first-ever eligible set for a `weight_reps`
 *    exercise): unconditionally wins every applicable slot — Heaviest
 *    Weight, Best Est. 1RM, Best Set Volume, Most Reps, Set Record (bucket
 *    5). 5 awards.
 *  - `set-2` (80 kg × 5): beats nothing — 80 < 100 (Heaviest Weight), Epley
 *    93.33 < 116.67 (Best Est. 1RM), 400 < 500 (Best Set Volume), 5 is not
 *    `>` 5 (Most Reps), and the bucket-5 Set Record already holds 100 kg
 *    (80 < 100, no re-award). 0 awards — no trophy.
 */
function makeTrophyWorkoutFull(overrides: Partial<WorkoutFull> = {}): WorkoutFull {
  return makeWorkoutFull({
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
            weightKg: 100,
            reps: 5,
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
            weightKg: 80,
            reps: 5,
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
  } as Partial<WorkoutFull>);
}

/** Feeds `RecordsService` exactly `full`'s own two sets as `ex-1`'s complete history — the trophy fold then runs for real against them (see `makeTrophyWorkoutFull`'s own doc comment for the worked-out expected awards). */
function configureTrophyHistory(full: WorkoutFull): void {
  const sets = full.exercises[0]!.sets;
  configureRecordsService({
    setsForExercise: async () => [
      {
        setId: sets[0]!.id,
        workoutId: full.id,
        workoutStartTime: full.startTime,
        setOrder: 0,
        exerciseType: 'weight_reps',
        setType: sets[0]!.setType,
        isCompleted: sets[0]!.isCompleted,
        weightKg: sets[0]!.weightKg,
        reps: sets[0]!.reps,
        durationSeconds: sets[0]!.durationSeconds,
      },
      {
        setId: sets[1]!.id,
        workoutId: full.id,
        workoutStartTime: full.startTime,
        setOrder: 1,
        exerciseType: 'weight_reps',
        setType: sets[1]!.setType,
        isCompleted: sets[1]!.isCompleted,
        weightKg: sets[1]!.weightKg,
        reps: sets[1]!.reps,
        durationSeconds: sets[1]!.durationSeconds,
      },
    ],
    exerciseHistoryWatermark: async () => 1,
  });
}

describe('HistoryDetailScreen — trophy badges (M4-04, 04 §5.4/§5.2, 07 §6)', () => {
  it('shows a trophy on the record-defining set and none on the set that earns nothing, matching real domain attribution', async () => {
    const full = makeTrophyWorkoutFull();
    configureTrophyHistory(full);
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = { getFull: async () => full };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByTestId('detail-set-set-1-trophy')).toBeTruthy());

    expect(screen.queryByTestId('detail-set-set-2-trophy')).toBeNull();
  });

  it('reveals the combined record-type label via Alert on trophy tap (04 §5.4 "record-type label on tap")', async () => {
    const full = makeTrophyWorkoutFull();
    configureTrophyHistory(full);
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = { getFull: async () => full };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByTestId('detail-set-set-1-trophy')).toBeTruthy());

    fireEvent.press(screen.getByTestId('detail-set-set-1-trophy'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Personal Record',
      expect.stringContaining('Heaviest Weight — 100 kg'),
    );
    // `set-1` wins every applicable slot for `weight_reps` — Best Set
    // Volume and Most Reps are both in the same combined label.
    const message = (Alert.alert as jest.Mock).mock.calls[0][1] as string;
    expect(message).toContain('Best Set Volume — 500 kg');
    expect(message).toContain('Most Reps — 5 reps');
  });

  it('omits the trophy affordance entirely once a set earns nothing (RecordsService returns [] for that workout/set pair)', async () => {
    const full = makeTrophyWorkoutFull();
    configureTrophyHistory(full);
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = { getFull: async () => full };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByText('Bench Press')).toBeTruthy());
    await waitFor(() => expect(screen.getByTestId('detail-set-set-1-trophy')).toBeTruthy());

    // No accidental tap target on the no-trophy row.
    expect(screen.queryByTestId('detail-set-set-2-trophy')).toBeNull();
  });
});

describe('HistoryDetailScreen — exercise notes (M4-04, 04 §3.1)', () => {
  it('renders a workout-exercise\'s note read-only', async () => {
    const full = makeWorkoutFull({
      exercises: [
        {
          id: 'we-1',
          workoutId: 'w-1',
          exerciseId: 'ex-1',
          position: 0,
          supersetId: null,
          notes: 'Elbows tucked, paused reps',
          restSeconds: null,
          sets: makeWorkoutFull().exercises[0]!.sets,
        },
      ],
    } as Partial<WorkoutFull>);
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = { getFull: async () => full };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByText('Elbows tucked, paused reps')).toBeTruthy());
  });

  it('renders no note row when the workout-exercise has none', async () => {
    const full = makeWorkoutFull();
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = { getFull: async () => full };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByText('Bench Press')).toBeTruthy());
    expect(screen.queryByTestId('detail-notes-we-1')).toBeNull();
  });
});

describe('HistoryDetailScreen — ⋯ Edit Workout (M4-04 -> M4-05 route)', () => {
  it('navigates to /workout/{id}/edit', async () => {
    const full = makeWorkoutFull();
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = { getFull: async () => full };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByText('Morning Workout')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('detail-menu-button'));
    await fireEvent.press(await screen.findByTestId('detail-actions-sheet-edit-workout'));

    expect(router.push).toHaveBeenCalledWith('/workout/w-1/edit');
  });
});

describe('HistoryDetailScreen — ⋯ Delete (M4-04, 02 §15)', () => {
  it('confirms, soft-deletes, recomputes via RecordsService, and navigates back', async () => {
    const full = makeWorkoutFull();
    const softDelete = jest.fn().mockResolvedValue(undefined);
    const workoutRepository: Pick<WorkoutRepository, 'getFull' | 'softDelete'> = {
      getFull: async () => full,
      softDelete,
    };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByText('Morning Workout')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('detail-menu-button'));
    await fireEvent.press(await screen.findByTestId('detail-actions-sheet-delete'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Delete Workout?',
      `Delete "Morning Workout"? This can't be undone.`,
      expect.any(Array),
    );
    expect(softDelete).not.toHaveBeenCalled();

    await pressAlertButton('Delete');

    expect(softDelete).toHaveBeenCalledWith('w-1');
    await waitFor(() =>
      expect(invalidateAfterWorkoutMutation).toHaveBeenCalledWith(expect.anything(), ['ex-1']),
    );
    await waitFor(() => expect(router.back).toHaveBeenCalledTimes(1));
  });

  it('surfaces an error alert when softDelete rejects, without navigating away', async () => {
    const full = makeWorkoutFull();
    const workoutRepository: Pick<WorkoutRepository, 'getFull' | 'softDelete'> = {
      getFull: async () => full,
      softDelete: jest.fn().mockRejectedValue(new Error('boom')),
    };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByText('Morning Workout')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('detail-menu-button'));
    await fireEvent.press(await screen.findByTestId('detail-actions-sheet-delete'));
    await pressAlertButton('Delete');

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Something went wrong', expect.any(String)),
    );
    expect(router.back).not.toHaveBeenCalled();
  });

  it('does nothing when Cancel is pressed', async () => {
    const full = makeWorkoutFull();
    const softDelete = jest.fn();
    const workoutRepository: Pick<WorkoutRepository, 'getFull' | 'softDelete'> = {
      getFull: async () => full,
      softDelete,
    };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByText('Morning Workout')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('detail-menu-button'));
    await fireEvent.press(await screen.findByTestId('detail-actions-sheet-delete'));
    await pressAlertButton('Cancel');

    expect(softDelete).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe('HistoryDetailScreen — ⋯ Export CSV (M5-06, 04 §3.1)', () => {
  it('shows an Export CSV item in the ⋯ menu', async () => {
    const full = makeWorkoutFull();
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = { getFull: async () => full };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };

    await renderScreen(workoutRepository, exerciseRepository);
    await waitFor(() => expect(screen.getByText('Morning Workout')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('detail-menu-button'));
    await waitFor(() => expect(screen.getByTestId('detail-actions-sheet-delete')).toBeTruthy());

    expect(screen.getByText(/export csv/i)).toBeTruthy();
  });

  it('exports this workout via CsvService.exportWorkout and opens the share sheet with the returned URI, using the live unit settings', async () => {
    const full = makeWorkoutFull();
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = { getFull: async () => full };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };
    const exportWorkout = jest
      .fn()
      .mockResolvedValue({ uri: 'file:///mock-cache/kyro_workout_2026-01-01.csv', fileName: 'kyro_workout_2026-01-01.csv' });
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, weight_unit: 'lbs', distance_unit: 'miles' },
    }));

    await renderScreen(
      workoutRepository,
      exerciseRepository,
      defaultRoutineRepository(),
      'w-1',
      'dark',
      { exportWorkout },
    );
    await waitFor(() => expect(screen.getByText('Morning Workout')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('detail-menu-button'));
    await fireEvent.press(await screen.findByTestId('detail-actions-sheet-export-csv'));

    expect(exportWorkout).toHaveBeenCalledWith('w-1', { weightUnit: 'lbs', distanceUnit: 'miles' });
    await waitFor(() =>
      expect(shareFile).toHaveBeenCalledWith(
        'file:///mock-cache/kyro_workout_2026-01-01.csv',
        expect.objectContaining({ mimeType: 'text/csv' }),
      ),
    );
  });

  it('surfaces an error alert when the export rejects, without leaving an unhandled rejection', async () => {
    const full = makeWorkoutFull();
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = { getFull: async () => full };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };
    const exportWorkout = jest.fn().mockRejectedValue(new Error('disk full'));

    await renderScreen(
      workoutRepository,
      exerciseRepository,
      defaultRoutineRepository(),
      'w-1',
      'dark',
      { exportWorkout },
    );
    await waitFor(() => expect(screen.getByText('Morning Workout')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('detail-menu-button'));
    await fireEvent.press(await screen.findByTestId('detail-actions-sheet-export-csv'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Something went wrong', expect.any(String)),
    );
  });
});

describe('HistoryDetailScreen — both-themes smoke (07)', () => {
  it('renders in light theme without crashing, with trophy badges intact', async () => {
    const full = makeTrophyWorkoutFull();
    configureTrophyHistory(full);
    const workoutRepository: Pick<WorkoutRepository, 'getFull'> = { getFull: async () => full };
    const exerciseRepository: Pick<ExerciseRepository, 'get'> = {
      get: async (id) => (id === 'ex-1' ? makeExercise() : null),
    };

    await renderScreen(workoutRepository, exerciseRepository, defaultRoutineRepository(), 'w-1', 'light');

    await waitFor(() => expect(screen.getByText('Morning Workout')).toBeTruthy());
    expect(screen.getByTestId('detail-set-set-1-trophy')).toBeTruthy();
    expect(screen.queryByTestId('detail-set-set-2-trophy')).toBeNull();
  });
});
