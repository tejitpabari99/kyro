/**
 * `StatisticsScreen` tests (M4-08 acceptance gate), part 1 — summary tile
 * values and the warm-up-toggle live-recompute acceptance line (04 §4:
 * "warm-up toggle flips dashboard live"). Same real-`QueryClient` pattern
 * `CalendarScreen.test.tsx` established. Interaction-heavy behaviors (range
 * controls, metric switcher, first-day-of-week reactivity) live in the
 * sibling `StatisticsScreen.interactions.test.tsx` instead of this file —
 * empirically, running all of those `it` blocks together with this file's
 * own in one process left later tests seeing `act()`-scheduling warnings
 * ("overlapping act() calls", "update ... not wrapped in act") and
 * occasional stuck queries, while every one of those same tests passes
 * cleanly in a fresh process (`-t` filtered to just that describe block).
 * Splitting into a separate file sidesteps it outright — Jest resets the
 * module registry and JS environment per test **file**, not just per test,
 * so each file's `StatisticsScreen`/TanStack Query/React-act() state starts
 * genuinely fresh rather than accumulating within one shared process.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import React from 'react';
import { router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { StatsFeedRow, WorkoutDateCount } from '@/data/workouts/types';
import { useSettingsStore } from '@/features/settings/settings-store';
import { ThemeProvider } from '@/ui/theme-provider';

import { StatisticsScreen, type StatsRepository } from '../StatisticsScreen';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { back: jest.fn() },
}));

// Each render mounts 3 real victory-native/Skia chart cards at once — under
// Jest's CanvasKit-wasm test environment that's measurably slower per test
// than a typical RNTL smoke test, so both the per-test and `waitFor`
// budgets here are generous rather than the library defaults.
jest.setTimeout(30_000);
const WAIT_OPTS = { timeout: 25_000 };

function feedRow(overrides: Partial<StatsFeedRow> = {}): StatsFeedRow {
  const start = Date.now() - 24 * 60 * 60 * 1000;
  return {
    workoutId: 'w1',
    workoutStartTime: start,
    workoutEndTime: start + 3_600_000,
    exerciseId: 'bench-press',
    exerciseType: 'weight_reps',
    primaryMuscleGroup: 'chest',
    secondaryMuscleGroups: [],
    setType: 'normal',
    weightKg: 100,
    reps: 5,
    isCompleted: true,
    ...overrides,
  };
}

function makeRepository(overrides: Partial<StatsRepository> = {}): StatsRepository {
  return {
    statsFeed: async () => [],
    workoutDates: async () => [],
    ...overrides,
  };
}

async function renderScreen(
  workoutRepository: StatsRepository,
  queryClient: QueryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } }),
) {
  const result = await render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider preference="dark">
        <StatisticsScreen testID="stats-screen" workoutRepository={workoutRepository} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

beforeEach(() => {
  useSettingsStore.setState((state) => ({
    settings: {
      ...state.settings,
      first_day_of_week: 'monday',
      warmup_in_stats: false,
      weekly_goal: null,
      weight_unit: 'kg',
    },
  }));
});

describe('StatisticsScreen — summary tiles', () => {
  it('renders total workouts, total volume, total time, and streak from the fetched feeds', async () => {
    const dateCounts: WorkoutDateCount[] = [{ date: '2026-07-20', count: 2 }, { date: '2026-07-21', count: 1 }];
    const rows = [
      feedRow({ workoutId: 'w1', weightKg: 100, reps: 5 }),
      feedRow({ workoutId: 'w1', weightKg: 105, reps: 3 }),
      feedRow({ workoutId: 'w2', weightKg: 50, reps: 10 }),
    ];
    const workoutRepository = makeRepository({
      statsFeed: async () => rows,
      workoutDates: async () => dateCounts,
    });

    await renderScreen(workoutRepository);

    await waitFor(() => {
      const tile = within(screen.getByTestId('stats-screen-tile-workouts'));
      expect(tile.getByText('3')).toBeTruthy(); // total workouts = 2 + 1
    }, WAIT_OPTS);

    const expectedVolume = 100 * 5 + 105 * 3 + 50 * 10;
    await waitFor(() => {
      const tile = within(screen.getByTestId('stats-screen-tile-volume'));
      expect(tile.getByText(`${expectedVolume} kg`)).toBeTruthy();
    }, WAIT_OPTS);
  });

  it('shows a "0" workouts / "0:00" time / "0 kg" volume / "0 wks" streak for a brand-new user with no history', async () => {
    const workoutRepository = makeRepository();

    await renderScreen(workoutRepository);

    await waitFor(() => {
      expect(within(screen.getByTestId('stats-screen-tile-workouts')).getByText('0')).toBeTruthy();
    }, WAIT_OPTS);
    expect(within(screen.getByTestId('stats-screen-tile-volume')).getByText('0 kg')).toBeTruthy();
    expect(within(screen.getByTestId('stats-screen-tile-time')).getByText('0:00')).toBeTruthy();
    expect(within(screen.getByTestId('stats-screen-tile-streak')).getByText('0 wks')).toBeTruthy();
  });
});

describe('StatisticsScreen — back button (M4-09: Statistics is now a pushed route, not a tab root)', () => {
  it('calls router.back() when the back chevron is pressed', async () => {
    const workoutRepository = makeRepository();

    await renderScreen(workoutRepository);

    await waitFor(() => {
      expect(screen.getByTestId('stats-screen-tile-workouts')).toBeTruthy();
    }, WAIT_OPTS);

    fireEvent.press(screen.getByTestId('stats-screen-back'));

    expect(router.back).toHaveBeenCalledTimes(1);
  });
});

describe('StatisticsScreen — query error (found in M4 milestone-wide review: a genuine statsFeed failure was previously swallowed and rendered as an indistinguishable "0 workouts / 0 kg" brand-new-user dashboard, with no error/retry affordance — 06 §9: repository errors are never silently swallowed)', () => {
  it('shows a retryable error state instead of every tile/chart reading zero when statsFeed rejects', async () => {
    const statsFeed = jest.fn().mockRejectedValue(new Error('disk full'));
    const workoutRepository = makeRepository({ statsFeed });

    await renderScreen(workoutRepository);

    await waitFor(() => expect(screen.getByTestId('stats-screen-error')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByText("Couldn't load statistics")).toBeTruthy();
    expect(screen.queryByTestId('stats-screen-tile-workouts')).toBeNull();

    statsFeed.mockResolvedValue([]);
    await act(async () => {
      fireEvent.press(screen.getByTestId('stats-screen-retry'));
    });
    await waitFor(() => expect(screen.getByTestId('stats-screen-tile-workouts')).toBeTruthy(), WAIT_OPTS);
  });
});

describe('StatisticsScreen — warm-up toggle flips dashboard live (04 §4 acceptance)', () => {
  it('excludes warm-up volume by default, includes it once warmup_in_stats flips on', async () => {
    const rows = [feedRow({ setType: 'warmup', weightKg: 40, reps: 10 })];
    const workoutRepository = makeRepository({ statsFeed: async () => rows });

    await renderScreen(workoutRepository);

    await waitFor(() => {
      expect(within(screen.getByTestId('stats-screen-tile-volume')).getByText('0 kg')).toBeTruthy();
    }, WAIT_OPTS);

    act(() => {
      useSettingsStore.setState((state) => ({ settings: { ...state.settings, warmup_in_stats: true } }));
    });

    await waitFor(() => {
      expect(within(screen.getByTestId('stats-screen-tile-volume')).getByText('400 kg')).toBeTruthy();
    }, WAIT_OPTS);
  });
});
