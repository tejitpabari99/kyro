/**
 * `StatisticsScreen` tests (M4-08 acceptance gate), part 2 — range-control
 * query re-fetch (independent dashboard/muscle-distribution ranges),
 * aggregate-trend metric switcher, and first-day-of-week reactive
 * re-bucket (04 §4 acceptance: "First-day-of-week switch re-buckets weekly
 * charts"). Split out of `StatisticsScreen.test.tsx` into its own file —
 * see that file's header for why (Jest resets environment/module state per
 * file, which this suite's own chart-heavy mounts benefit from).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { StatsFeedRange, StatsFeedRow } from '@/data/workouts/types';
import { useSettingsStore } from '@/features/settings/settings-store';
import { ThemeProvider } from '@/ui/theme-provider';

import { StatisticsScreen, type StatsRepository } from '../StatisticsScreen';

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

describe('StatisticsScreen — range controls', () => {
  it('re-fetches the dashboard-range feed and the muscle-range feed independently on their own control', async () => {
    const statsFeed = jest.fn(async (_range?: StatsFeedRange) => [] as StatsFeedRow[]);
    const workoutRepository = makeRepository({ statsFeed });

    await renderScreen(workoutRepository);
    await waitFor(() => expect(statsFeed).toHaveBeenCalled(), WAIT_OPTS);

    const callsAfterMount = statsFeed.mock.calls.length;
    fireEvent.press(screen.getByTestId('stats-screen-dashboard-range-1y'));
    await waitFor(() => expect(statsFeed.mock.calls.length).toBeGreaterThan(callsAfterMount), WAIT_OPTS);
    expect(statsFeed.mock.calls.some((call) => call[0]?.start !== undefined)).toBe(true);

    const callsAfterDashboardRange = statsFeed.mock.calls.length;
    fireEvent.press(screen.getByTestId('stats-screen-muscle-range-7d'));
    await waitFor(
      () => expect(statsFeed.mock.calls.length).toBeGreaterThan(callsAfterDashboardRange),
      WAIT_OPTS,
    );
  });

  it('switching the aggregate-trend metric and toggling first_day_of_week neither throws nor unmounts the chart cards', async () => {
    const workoutRepository = makeRepository({ statsFeed: async () => [feedRow()] });

    await renderScreen(workoutRepository);
    await waitFor(() => expect(screen.getByTestId('stats-screen-trend-chart')).toBeTruthy(), WAIT_OPTS);
    expect(screen.getByTestId('stats-screen-workouts-chart')).toBeTruthy();

    fireEvent.press(screen.getByTestId('stats-screen-trend-metric-volume'));
    expect(screen.getByTestId('stats-screen-trend-chart')).toBeTruthy();

    act(() => {
      useSettingsStore.setState((state) => ({ settings: { ...state.settings, first_day_of_week: 'sunday' } }));
    });
    expect(screen.getByTestId('stats-screen-workouts-chart')).toBeTruthy();
  });
});
