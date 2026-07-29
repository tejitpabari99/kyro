/**
 * `ProfileScreen` tests (M5-04, 04 §7 acceptance gate), part 2 — shortcut
 * cards, recent workouts (3), and the `__DEV__`-gated dev rows. Split out of
 * `ProfileScreen.test.tsx` — see that file's own header for exactly why
 * (accumulated act()/scheduler state across many sequential renders within
 * one file, the same category `StatisticsScreen.test.tsx`'s split already
 * documents; not a functional bug in either screen or this suite).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import type { SqliteDriver } from '@/data/sqlite/driver';
import type { Exercise } from '@/data/exercises/types';
import type { WorkoutExerciseFull, WorkoutSummary } from '@/data/workouts/types';
import { SettingsRepository } from '@/data/settings/settings-repository';
import { configureRecordsService } from '@/features/stats/records-service';
import { useSettingsStore } from '@/features/settings/settings-store';
import { ThemeProvider } from '@/ui/theme-provider';

import {
  ProfileScreen,
  type ProfileExerciseRepository,
  type ProfileWorkoutRepository,
} from '../ProfileScreen';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn() },
}));

// See `ProfileScreen.test.tsx`'s own header for why this substitution exists.
jest.mock('@/features/settings/settings-store', () => {
  const actual = jest.requireActual('@/features/settings/settings-store');
  return {
    ...actual,
    useSettingsStore: actual.createSettingsStore(),
  };
});

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

function makeWorkoutRepository(
  overrides: Partial<ProfileWorkoutRepository> = {},
): ProfileWorkoutRepository {
  return {
    workoutDates: async () => [],
    listCompleted: async () => [],
    getExercisesForWorkouts: async () => new Map(),
    ...overrides,
  };
}

async function renderScreen(
  workoutRepository: ProfileWorkoutRepository,
  exerciseRepository: ProfileExerciseRepository,
) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider preference="dark">
        <ProfileScreen
          testID="profile"
          workoutRepository={workoutRepository}
          exerciseRepository={exerciseRepository}
        />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

let driver: SqliteDriver;

beforeEach(async () => {
  jest.clearAllMocks();

  driver = openBetterSqlite3Driver(':memory:');
  migrate(driver);
  await useSettingsStore.getState().load(new SettingsRepository(driver));
  useSettingsStore.setState((state) => ({
    settings: {
      ...state.settings,
      first_day_of_week: 'monday',
      weight_unit: 'kg',
      distance_unit: 'km',
      warmup_in_stats: false,
      profile: { name: '', avatar_emoji: '💪' },
    },
  }));

  configureRecordsService({
    setsForExercise: async () => [],
    exerciseHistoryWatermark: async () => 0,
  });
});

afterEach(() => {
  driver.close();
});

describe('ProfileScreen — shortcut cards', () => {
  it.each([
    ['profile-statistics-shortcut', '/profile/statistics'],
    ['profile-archived-exercises-shortcut', '/profile/exercises-archived'],
    ['profile-measures-shortcut', '/profile/measures'],
    ['profile-calendar-shortcut', '/history/calendar'],
  ])('the %s card navigates to %s', async (testID, path) => {
    await renderScreen(makeWorkoutRepository(), { list: async () => [] });

    fireEvent.press(screen.getByTestId(testID));
    expect(router.push).toHaveBeenCalledWith(path);
  });
});

describe('ProfileScreen — recent workouts', () => {
  it('shows the empty message when there are no completed workouts', async () => {
    await renderScreen(makeWorkoutRepository(), { list: async () => [] });

    expect(await screen.findByText('No workouts logged yet.')).toBeTruthy();
  });

  it('renders up to 3 recent workout cards and navigates on tap', async () => {
    const exercise = makeExercise();
    const summaries: WorkoutSummary[] = [
      makeSummary({ id: 'w-1', title: 'Push Day' }),
      makeSummary({ id: 'w-2', title: 'Pull Day' }),
    ];
    const exercisesByWorkout = new Map<string, WorkoutExerciseFull[]>([
      ['w-1', [makeWorkoutExercise({ id: 'we-1', workoutId: 'w-1', exerciseId: exercise.id })]],
      ['w-2', [makeWorkoutExercise({ id: 'we-2', workoutId: 'w-2', exerciseId: exercise.id })]],
    ]);
    const workoutRepository = makeWorkoutRepository({
      listCompleted: async () => summaries,
      getExercisesForWorkouts: async () => exercisesByWorkout,
    });
    const exerciseRepository: ProfileExerciseRepository = { list: async () => [exercise] };

    await renderScreen(workoutRepository, exerciseRepository);

    expect(await screen.findByText('Push Day')).toBeTruthy();
    expect(screen.getByText('Pull Day')).toBeTruthy();

    fireEvent.press(screen.getByTestId('profile-recent-card-w-1'));
    expect(router.push).toHaveBeenCalledWith('/history/w-1');
  });

  it('navigates to History on "See All"', async () => {
    await renderScreen(makeWorkoutRepository(), { list: async () => [] });

    fireEvent.press(screen.getByTestId('profile-see-all-history'));
    expect(router.push).toHaveBeenCalledWith('/history');
  });
});

describe('ProfileScreen — dev-only rows (__DEV__ gate)', () => {
  it('shows the Design Gallery and Load Fixture Data rows under __DEV__ and navigates on press', async () => {
    await renderScreen(makeWorkoutRepository(), { list: async () => [] });

    expect(await screen.findByTestId('dev-gallery-link')).toBeTruthy();
    expect(screen.getByTestId('dev-load-fixture-link')).toBeTruthy();

    fireEvent.press(screen.getByTestId('dev-gallery-link'));
    expect(router.push).toHaveBeenCalledWith('/dev/gallery');

    fireEvent.press(screen.getByTestId('dev-load-fixture-link'));
    expect(router.push).toHaveBeenCalledWith('/dev/load-fixture');
  });

  it('hides the dev-only rows when __DEV__ is false', async () => {
    const original = __DEV__;
    // @ts-expect-error — intentional overwrite to simulate a production
    // build for this one assertion (same carve-out the old profile
    // placeholder test used).
    __DEV__ = false;
    try {
      await renderScreen(makeWorkoutRepository(), { list: async () => [] });
      expect(screen.queryByTestId('dev-gallery-link')).toBeNull();
      expect(screen.queryByTestId('dev-load-fixture-link')).toBeNull();
    } finally {
      // @ts-expect-error — restoring the ambient global, same carve-out as above.
      __DEV__ = original;
    }
  });
});
