/**
 * `GlobalWorkoutBar` behavioral tests (M2-13, 02 §10 / 06 §3). This file
 * replaces the pre-M2-13 "renders nothing" smoke test — the component is a
 * real mini-player now.
 *
 * Manipulates the app-wide `useActiveWorkoutStore`/`useRestTimerStore`
 * singletons directly via `setState` (rather than driving them through a
 * real repository/DB round trip, `ActiveWorkoutScreen.test.tsx`'s own
 * convention): this component only ever *reads* those stores, never
 * mutates them, so a direct state seed is the simplest correct fixture and
 * keeps this suite fast and dependency-free (no `better-sqlite3`, no
 * notification mocking for a timer that's never actually `start()`-ed).
 * Every test resets both singletons in `afterEach` so no state leaks
 * between cases or into other test files that import the same singletons.
 *
 * **`act()` usage (read before adding a case):** a `setState` call made
 * *before* the tree is mounted must NOT be wrapped in `act()` — there is no
 * fiber tree yet for `act` to flush, and wrapping it anyway was observed
 * (while writing this suite) to corrupt React 19's act-queue bookkeeping
 * for the *next* `render()` call badly enough that the component's own
 * function body never even executed (confirmed by a temporary
 * `console.log` at the top of `GlobalWorkoutBar`'s render — it never
 * fired). Only state changes made *after* `renderBar()` has resolved
 * (e.g. the "logger minimized" and tick-advance cases below) are wrapped
 * in `act()`, matching every other test file in this repo that mutates a
 * store post-render.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { router } from 'expo-router';

import type { WorkoutFull } from '@/data/workouts/types';
import { colors } from '@/ui/tokens';
import { ThemeProvider } from '@/ui/theme-provider';

import { GlobalWorkoutBar } from '../GlobalWorkoutBar';
import { useActiveWorkoutStore } from '../activeWorkoutStore';
import { useLoggerVisibilityStore } from '../loggerVisibilityStore';
import { useRestTimerStore } from '../restTimerStore';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

function fakeWorkout(overrides: Partial<WorkoutFull> = {}): WorkoutFull {
  return {
    id: 'w1',
    title: 'Evening Workout',
    description: null,
    routineId: null,
    state: 'active',
    startTime: Date.now() - 65_000,
    endTime: null,
    durationPauseOffsetMs: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    exercises: [],
    ...overrides,
  };
}

function renderBar() {
  return render(
    <ThemeProvider preference="dark">
      <GlobalWorkoutBar />
    </ThemeProvider>,
  );
}

// Fake timers ARE enabled globally (matching `useWorkoutStopwatch.test.ts`'s
// own convention) — `useRestTimerTicker`'s `setInterval` must be registered
// under the same fake-timer regime `jest.advanceTimersByTime` later drives,
// or the advance is a no-op against a real interval nothing is stepping.
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  useActiveWorkoutStore.setState({ workout: null, loaded: false, error: null });
  useLoggerVisibilityStore.setState({ visible: false });
  useRestTimerStore.setState({ timer: null, permissionDeniedNoticePending: false });
});

describe('GlobalWorkoutBar (M2-13)', () => {
  it('renders nothing when no workout is active', async () => {
    const result = await renderBar();
    expect(result.toJSON()).toBeNull();
  });

  it('renders nothing while the logger is visible, even with an active workout', async () => {
    useActiveWorkoutStore.setState({ workout: fakeWorkout(), loaded: true });
    useLoggerVisibilityStore.setState({ visible: true });

    const result = await renderBar();
    expect(result.toJSON()).toBeNull();
  });

  it('appears the instant the logger is minimized (loggerVisible flips false)', async () => {
    useActiveWorkoutStore.setState({ workout: fakeWorkout(), loaded: true });
    useLoggerVisibilityStore.setState({ visible: true });

    await renderBar();
    expect(screen.queryByTestId('global-workout-bar')).toBeNull();

    await act(async () => {
      useLoggerVisibilityStore.setState({ visible: false });
    });
    expect(await screen.findByTestId('global-workout-bar')).toBeTruthy();
  });

  it('shows the workout title and a live elapsed time', async () => {
    useActiveWorkoutStore.setState({
      workout: fakeWorkout({ startTime: Date.now() - 65_000, durationPauseOffsetMs: 0 }),
      loaded: true,
    });

    await renderBar();

    expect(screen.getByTestId('global-workout-bar-title')).toHaveTextContent('Evening Workout');
    // 65 s elapsed -> "1:05"
    expect(screen.getByTestId('global-workout-bar-time')).toHaveTextContent('1:05');
  });

  it('elapsed time ticks upward (shares the same now-minus-start-minus-offset math as the logger)', async () => {
    useActiveWorkoutStore.setState({
      workout: fakeWorkout({ startTime: Date.now(), durationPauseOffsetMs: 0 }),
      loaded: true,
    });

    await renderBar();
    expect(screen.getByTestId('global-workout-bar-time')).toHaveTextContent('0:00');

    await act(async () => {
      jest.advanceTimersByTime(3_000);
    });
    expect(screen.getByTestId('global-workout-bar-time')).toHaveTextContent('0:03');
  });

  it('shows remaining rest-timer time (accent-colored) instead of elapsed when a timer is running', async () => {
    const now = Date.now();
    useActiveWorkoutStore.setState({
      workout: fakeWorkout({ startTime: now - 120_000, durationPauseOffsetMs: 0 }),
      loaded: true,
    });
    useRestTimerStore.setState({
      timer: { endsAt: now + 45_000, exerciseId: 'ex1', setId: 'set1', notificationId: null },
    });

    await renderBar();

    // Elapsed (120s -> "2:00") would show if the timer weren't active — the
    // timer's own remaining time (45s -> "0:45") must win instead.
    const timeNode = screen.getByTestId('global-workout-bar-time');
    expect(timeNode).toHaveTextContent('0:45');
    expect(timeNode).not.toHaveTextContent('2:00');

    // Accent color, not the plain secondary-text color elapsed uses.
    const flat = Array.isArray(timeNode.props.style)
      ? Object.assign({}, ...timeNode.props.style)
      : timeNode.props.style;
    expect(flat.color).toBe(colors.dark.accent.text);
    expect(flat.color).not.toBe(colors.dark.text.secondary);
  });

  it('remaining-timer countdown ticks downward', async () => {
    const now = Date.now();
    useActiveWorkoutStore.setState({ workout: fakeWorkout(), loaded: true });
    useRestTimerStore.setState({
      timer: { endsAt: now + 10_000, exerciseId: 'ex1', setId: 'set1', notificationId: null },
    });

    await renderBar();
    expect(screen.getByTestId('global-workout-bar-time')).toHaveTextContent('0:10');

    await act(async () => {
      jest.advanceTimersByTime(4_000);
    });
    expect(screen.getByTestId('global-workout-bar-time')).toHaveTextContent('0:06');
  });

  it('tapping the bar re-presents /workout/active', async () => {
    useActiveWorkoutStore.setState({ workout: fakeWorkout(), loaded: true });

    await renderBar();

    fireEvent.press(screen.getByTestId('global-workout-bar'));
    expect(router.push).toHaveBeenCalledWith('/workout/active');
  });

  it('long titles truncate to one line rather than wrapping/pushing the time off-screen', async () => {
    useActiveWorkoutStore.setState({
      workout: fakeWorkout({
        title: 'A Very Long Workout Title That Would Otherwise Wrap Across Multiple Lines',
      }),
      loaded: true,
    });

    await renderBar();
    expect(screen.getByTestId('global-workout-bar-title').props.numberOfLines).toBe(1);
  });
});
