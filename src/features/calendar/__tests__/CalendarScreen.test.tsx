/**
 * `CalendarScreen` tests (M4-06 acceptance gate) — month pager navigation,
 * day-tap sheet (empty day → "Log past workout" retro nav; populated day →
 * tap-through to workout detail), streak header rendering, and reactive
 * recompute off `['calendar']`-prefix Query invalidation (04 §3's "deleting
 * a workout updates ... calendar dots, and streak immediately" — simulated
 * here the same way `HistoryDetailScreen.test.tsx` proves its own delete
 * path invalidates: a real `QueryClient` + `invalidateQueries`, not a fake
 * one).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { WorkoutDateCount, WorkoutRepository, WorkoutSummary } from '@/data/workouts/types';
import { localDateKey } from '@/domain/streaks';
import { useSettingsStore } from '@/features/settings/settings-store';
import { ThemeProvider } from '@/ui/theme-provider';

import { formatMonthLabel } from '../calendar-month-model';
import { CalendarScreen } from '../CalendarScreen';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

function makeSummary(overrides: Partial<WorkoutSummary> = {}): WorkoutSummary {
  return {
    id: 'w-1',
    title: 'Morning Workout',
    description: null,
    routineId: null,
    startTime: Date.now(),
    endTime: Date.now() + 1_000,
    durationPauseOffsetMs: 0,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

async function renderScreen(
  workoutRepository: Pick<WorkoutRepository, 'workoutDates' | 'workoutsForDate'>,
  queryClient: QueryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } }),
) {
  const result = await render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider preference="dark">
        <CalendarScreen testID="calendar-screen" workoutRepository={workoutRepository} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { ...result, queryClient };
}

beforeEach(() => {
  jest.clearAllMocks();
  useSettingsStore.setState((state) => ({
    settings: { ...state.settings, first_day_of_week: 'monday' },
  }));
});

describe('CalendarScreen — smoke render', () => {
  it('renders the Calendar title, current month label, and a streak header', async () => {
    const workoutRepository: Pick<WorkoutRepository, 'workoutDates' | 'workoutsForDate'> = {
      workoutDates: async () => [],
      workoutsForDate: async () => [],
    };

    await renderScreen(workoutRepository);

    expect(screen.getByText('Calendar')).toBeTruthy();
    const now = new Date();
    expect(screen.getByText(formatMonthLabel(now.getFullYear(), now.getMonth()))).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('calendar-screen-streak')).toBeTruthy());
    expect(screen.getByText('No active streak yet')).toBeTruthy();
  });

  it('shows a non-zero streak label once workoutDates resolves with recent weeks', async () => {
    const dates: WorkoutDateCount[] = [{ date: localDateKey(Date.now()), count: 1 }];
    const workoutRepository: Pick<WorkoutRepository, 'workoutDates' | 'workoutsForDate'> = {
      workoutDates: async () => dates,
      workoutsForDate: async () => [],
    };

    await renderScreen(workoutRepository);

    await waitFor(() => expect(screen.getByText('🔥 1-week streak')).toBeTruthy());
  });
});

describe('CalendarScreen — query error (found in M4 milestone-wide review: a genuine workoutDates failure was previously swallowed and rendered as if history were empty — a blank-looking grid and a misleading "No active streak yet" — with no error/retry affordance)', () => {
  it('shows a retryable error state instead of the month grid, and "—" instead of a possibly-false streak, when workoutDates rejects', async () => {
    const workoutDates = jest.fn().mockRejectedValue(new Error('disk full'));
    const workoutRepository: Pick<WorkoutRepository, 'workoutDates' | 'workoutsForDate'> = {
      workoutDates,
      workoutsForDate: async () => [],
    };

    await renderScreen(workoutRepository);

    await waitFor(() => expect(screen.getByTestId('calendar-screen-error')).toBeTruthy());
    expect(screen.getByText("Couldn't load calendar")).toBeTruthy();
    expect(screen.queryByTestId('calendar-screen-month')).toBeNull();
    expect(screen.getByTestId('calendar-screen-streak')).toHaveTextContent('—');
    expect(screen.queryByText('No active streak yet')).toBeNull();

    workoutDates.mockResolvedValue([]);
    fireEvent.press(screen.getByTestId('calendar-screen-retry'));
    await waitFor(() => expect(screen.getByTestId('calendar-screen-month')).toBeTruthy());
  });
});

describe('CalendarScreen — month pager', () => {
  it('pressing the next-month chevron re-queries workoutDates and advances the label', async () => {
    const workoutDates = jest.fn(async () => [] as WorkoutDateCount[]);
    const workoutRepository: Pick<WorkoutRepository, 'workoutDates' | 'workoutsForDate'> = {
      workoutDates,
      workoutsForDate: async () => [],
    };

    await renderScreen(workoutRepository);
    const callsBefore = workoutDates.mock.calls.length;

    fireEvent.press(screen.getByTestId('calendar-screen-month-next-month'));

    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    await waitFor(() => expect(screen.getByText(formatMonthLabel(next.getFullYear(), next.getMonth()))).toBeTruthy());
    expect(workoutDates.mock.calls.length).toBeGreaterThan(callsBefore);
  });

  it('pressing the previous-month chevron re-queries workoutDates and steps back the label', async () => {
    const workoutRepository: Pick<WorkoutRepository, 'workoutDates' | 'workoutsForDate'> = {
      workoutDates: async () => [],
      workoutsForDate: async () => [],
    };

    await renderScreen(workoutRepository);
    fireEvent.press(screen.getByTestId('calendar-screen-month-prev-month'));

    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    await waitFor(() => expect(screen.getByText(formatMonthLabel(prev.getFullYear(), prev.getMonth()))).toBeTruthy());
  });
});

describe('CalendarScreen — day sheet', () => {
  it('tapping an empty day shows "Log past workout", which navigates to the retro logger', async () => {
    const workoutRepository: Pick<WorkoutRepository, 'workoutDates' | 'workoutsForDate'> = {
      workoutDates: async () => [],
      workoutsForDate: async () => [],
    };

    await renderScreen(workoutRepository);

    const [dayCell] = screen.getAllByTestId(/^calendar-screen-month-day-/);
    fireEvent.press(dayCell!);

    await waitFor(() => expect(screen.getByTestId('calendar-screen-log-past-workout')).toBeTruthy());
    fireEvent.press(screen.getByTestId('calendar-screen-log-past-workout'));

    expect(router.push).toHaveBeenCalledTimes(1);
    const target = (router.push as jest.Mock).mock.calls[0]![0] as string;
    expect(target).toMatch(/^\/workout\/active\?retro=1&startTime=\d+$/);
  });

  it('tapping a day with workouts lists them, and tapping a row navigates to its detail', async () => {
    const todayKey = localDateKey(Date.now());
    const summary = makeSummary({ id: 'w-42', title: 'Leg Day' });
    const workoutRepository: Pick<WorkoutRepository, 'workoutDates' | 'workoutsForDate'> = {
      workoutDates: async () => [{ date: todayKey, count: 1 }],
      workoutsForDate: async (date) => (date === todayKey ? [summary] : []),
    };

    await renderScreen(workoutRepository);

    await waitFor(() => expect(screen.getByTestId(`calendar-screen-month-day-${todayKey}`)).toBeTruthy());
    fireEvent.press(screen.getByTestId(`calendar-screen-month-day-${todayKey}`));

    await waitFor(() => expect(screen.getByTestId('calendar-screen-day-workout-w-42')).toBeTruthy());
    expect(screen.getByText('Leg Day')).toBeTruthy();

    fireEvent.press(screen.getByTestId('calendar-screen-day-workout-w-42'));
    expect(router.push).toHaveBeenCalledWith('/history/w-42');
  });
});

describe('CalendarScreen — recomputes off Query invalidation (04 §3 "deleting a workout updates ... calendar dots, and streak immediately")', () => {
  it('re-fetches and re-renders the streak once the calendar-prefixed queries are invalidated', async () => {
    let dates: WorkoutDateCount[] = [];
    const workoutRepository: Pick<WorkoutRepository, 'workoutDates' | 'workoutsForDate'> = {
      workoutDates: async () => dates,
      workoutsForDate: async () => [],
    };

    const { queryClient } = await renderScreen(workoutRepository);
    await waitFor(() => expect(screen.getByText('No active streak yet')).toBeTruthy());

    // Simulate what `invalidateAfterWorkoutMutation` does after a workout
    // mutation elsewhere in the app (e.g. a delete) — this screen itself
    // never calls it directly; it only needs to react to the same broad
    // `['calendar']` prefix every other invalidation-consuming screen does.
    dates = [{ date: localDateKey(Date.now()), count: 1 }];
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['calendar'] });
    });

    await waitFor(() => expect(screen.getByText('🔥 1-week streak')).toBeTruthy());
  });
});
