/**
 * `ProfileScreen` tests (M5-04, 04 §7 acceptance gate), part 1 — header
 * (avatar/name + edit sheet), workout-count/streak tiles, and both-themes
 * smoke coverage. Shortcut cards / recent workouts / dev-only rows live in
 * the sibling `ProfileScreen.interactions.test.tsx` instead of this file —
 * empirically, running all of those `it` blocks together with this file's
 * own in one process left the very last test in the combined file failing
 * (`findByTestId`/`findByText` timeouts) 100% of the time, while every test
 * passed cleanly in isolation or once split — the exact same "act()/
 * scheduler state accumulates across many sequential renders within one
 * file, not across processes" pattern `StatisticsScreen.test.tsx`'s own file
 * header documents (see also `docs/plan/BLOCKERS.md`'s "Multi-chart-mount
 * RNTL test flakiness within one file" entry) and fixes the same way: split
 * into a second file so Jest resets the module registry/JS environment
 * between them.
 *
 * Reuses this codebase's established fixture-builder + fake-repository
 * pattern (`HistoryListScreen.test.tsx`'s `makeExercise`/`makeSummary`/
 * `makeWorkoutExercise` shapes, `StatisticsScreen.test.tsx`'s real-
 * `QueryClient` convention) rather than inventing a new one.
 *
 * Unlike `StatisticsScreen`/`HistoryListScreen`/`CalendarScreen` (which only
 * ever *read* settings), `ProfileScreen` also *writes* through
 * `useSettingsStore.getState().setSetting('profile', ...)` (the edit-profile
 * sheet) — `setSetting` throws unless the store's `load()` has run at least
 * once (it needs a real `repository` reference to write through to,
 * `settings-store.ts`'s own doc comment). A bare `useSettingsStore.setState`
 * shortcut (fine for read-only screens) leaves that internal `repository`
 * unset, so the edit-sheet test would throw an unhandled rejection that
 * corrupts every later test in the same file/process — empirically
 * reproduced while writing this suite. Fixed by following
 * `app/(tabs)/profile/settings/__tests__/index.test.tsx`'s own established
 * pattern instead: mock the module to substitute a real
 * `createSettingsStore()` instance backed by an in-memory `better-sqlite3`
 * driver, and `load()` it in `beforeEach` before every render.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import type { SqliteDriver } from '@/data/sqlite/driver';
import type { WorkoutDateCount } from '@/domain/streaks';
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

// See file header — `ProfileScreen` writes through `setSetting`, so the
// real app-wide singleton is redirected to a fresh, test-owned store
// instance backed by an in-memory database (same substitution
// `app/(tabs)/profile/settings/__tests__/index.test.tsx` already uses).
jest.mock('@/features/settings/settings-store', () => {
  const actual = jest.requireActual('@/features/settings/settings-store');
  return {
    ...actual,
    useSettingsStore: actual.createSettingsStore(),
  };
});

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
  // `load()` populates the mocked store's internal `repository` reference —
  // required before any test can call `setSetting` without throwing (see
  // file header). The `setState` overlay right after is a plain in-memory
  // convenience default (not itself a write-through) for the keys these
  // tests read but don't otherwise care to set individually.
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

  // `getRecordsService()` throws until configured (`records-service.ts`'s
  // own guard) — every render reaches it via `fetchRecentWorkouts`.
  configureRecordsService({
    setsForExercise: async () => [],
    exerciseHistoryWatermark: async () => 0,
  });
});

afterEach(() => {
  driver.close();
});

describe('ProfileScreen — header (avatar/name)', () => {
  it('shows "Add your name" and the default avatar emoji when no name is set', async () => {
    await renderScreen(makeWorkoutRepository(), { list: async () => [] });

    expect(await screen.findByText('Add your name')).toBeTruthy();
    expect(screen.getByText('💪')).toBeTruthy();
  });

  it('shows the saved name when set', async () => {
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, profile: { name: 'Tejit', avatar_emoji: '🔥' } },
    }));

    await renderScreen(makeWorkoutRepository(), { list: async () => [] });

    expect(await screen.findByText('Tejit')).toBeTruthy();
    expect(screen.getByText('🔥')).toBeTruthy();
    expect(screen.queryByText('Add your name')).toBeNull();
  });

  it('opens the edit-profile sheet on avatar/name tap, saves the name on blur, and updates the avatar on emoji tap', async () => {
    await renderScreen(makeWorkoutRepository(), { list: async () => [] });

    await act(async () => {
      fireEvent.press(screen.getByTestId('profile-avatar-button'));
    });
    expect(await screen.findByTestId('profile-edit-profile-sheet')).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('profile-name-input'), 'New Name');
    });
    await act(async () => {
      fireEvent(screen.getByTestId('profile-name-input'), 'blur');
    });

    await waitFor(() => expect(useSettingsStore.getState().settings.profile.name).toBe('New Name'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('profile-avatar-option-🔥'));
    });
    await waitFor(() =>
      expect(useSettingsStore.getState().settings.profile.avatar_emoji).toBe('🔥'),
    );
  });

  it('navigates to Settings on the gear icon', async () => {
    await renderScreen(makeWorkoutRepository(), { list: async () => [] });

    fireEvent.press(screen.getByTestId('profile-settings-button'));
    expect(router.push).toHaveBeenCalledWith('/profile/settings');
  });
});

describe('ProfileScreen — workout count + streak tiles', () => {
  it('sums workoutDates counts and computes the streak via domain/streaks.ts', async () => {
    const now = new Date(2026, 6, 27); // Monday
    const dates: WorkoutDateCount[] = [
      { date: '2026-07-27', count: 1 }, // this week (Mon-start)
      { date: '2026-07-20', count: 2 }, // previous week
    ];
    const workoutRepository = makeWorkoutRepository({ workoutDates: async () => dates });

    jest.useFakeTimers().setSystemTime(now);
    try {
      await renderScreen(workoutRepository, { list: async () => [] });
      // Total workouts = sum of counts (1 + 2 = 3).
      expect(await screen.findByText('3')).toBeTruthy();
      // Two consecutive weeks with a workout -> a 2-week streak.
      expect(screen.getByText('2 wks')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('ProfileScreen — both themes', () => {
  it('renders in light theme', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
    await render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider preference="light">
          <ProfileScreen
            testID="profile"
            workoutRepository={makeWorkoutRepository()}
            exerciseRepository={{ list: async () => [] }}
          />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByTestId('profile')).toBeTruthy();
  });

  it('renders in dark theme', async () => {
    await renderScreen(makeWorkoutRepository(), { list: async () => [] });
    expect(await screen.findByTestId('profile')).toBeTruthy();
  });
});
