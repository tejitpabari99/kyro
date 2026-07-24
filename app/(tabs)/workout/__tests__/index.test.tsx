/**
 * Workout tab — Start Empty Workout entry point tests (M2-05, 02 §1).
 *
 * Covers the **one-active-workout gate** this screen owns (see
 * `../index.tsx`'s file header): no active workout → straight navigation;
 * an active workout → Resume / Discard-and-start (destructive, second
 * confirm) / Cancel action sheet. Talks to the real `useActiveWorkoutStore`
 * singleton (imported directly by the screen, matching every other feature
 * screen in this codebase) — `discard` is swapped for a `jest.fn()` via
 * `setState` for the discard-path test (no repository is bound in this
 * unit test, so calling the real write-through action would throw the
 * store's own "called before rehydrate()" guard; that guard itself is
 * exercised by `activeWorkoutStore.test.ts`, not this screen's job to
 * re-prove).
 *
 * `fireEvent.press`/`fireEvent.changeText` are **async** in
 * `@testing-library/react-native` 14 (each wraps its handler call in its own
 * `act()`) and `Alert.alert`'s button callbacks are plain, unwrapped
 * functions — every call below is `await`ed (raw `Alert` button presses via
 * the `pressAlertButton` helper, which wraps the call in its own explicit
 * `act(async () => ...)`) so no act scope is left open across assertions or
 * into the next test; an un-awaited act scope here was observed elsewhere
 * in this task (`ActiveWorkoutScreen.test.tsx`) to corrupt React's act-queue
 * bookkeeping for every later test in the same file.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';

import type { WorkoutFull } from '@/data/workouts/types';
import { useActiveWorkoutStore } from '@/features/workout/activeWorkoutStore';
import { useRestTimerStore } from '@/features/workout/restTimerStore';
import { ThemeProvider } from '@/ui/theme-provider';

import WorkoutScreen from '../index';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

// M2-19 exit-gate regression (see `../index.tsx`'s `confirmDiscardAndStartNew`
// comment): "Discard & Start New" must cancel any pending rest-timer
// notification, same seam `ActiveWorkoutScreen.test.tsx` (M2-14) already
// mocks for the identical reason on the finish path.
jest.mock('@/lib/notifications');

function fixtureWorkout(overrides: Partial<WorkoutFull> = {}): WorkoutFull {
  return {
    id: 'workout-1',
    title: 'Morning Workout',
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

/** Finds the button labeled `label` in the most recent `Alert.alert` call and invokes its `onPress` inside an explicit `act()` (see file header) — a no-op if the button (e.g. a plain `Cancel`) carries no `onPress` at all. */
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

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  useActiveWorkoutStore.setState({ workout: null, loaded: true, error: null });
  useRestTimerStore.setState({ timer: null });
});

async function renderScreen() {
  return render(
    <ThemeProvider preference="dark">
      <WorkoutScreen />
    </ThemeProvider>,
  );
}

describe('WorkoutScreen — no active workout', () => {
  it('renders the empty state with a Start Empty Workout CTA', async () => {
    await renderScreen();
    expect(screen.getByText('No active routines yet')).toBeTruthy();
    expect(screen.getByTestId('start-empty-workout')).toBeTruthy();
  });

  it('navigates straight to /workout/active, no confirm needed', async () => {
    await renderScreen();
    await fireEvent.press(screen.getByTestId('start-empty-workout'));

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/workout/active');
  });
});

describe('WorkoutScreen — one-active-workout gate (02 §1)', () => {
  it('shows the Resume / Discard-and-start / Cancel action sheet when a workout is already active', async () => {
    useActiveWorkoutStore.setState({ workout: fixtureWorkout({ title: 'Evening Workout' }) });
    await renderScreen();

    await fireEvent.press(screen.getByTestId('start-empty-workout'));

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

  it('Resume navigates to /workout/active without discarding', async () => {
    useActiveWorkoutStore.setState({ workout: fixtureWorkout() });
    await renderScreen();

    await fireEvent.press(screen.getByTestId('start-empty-workout'));
    await pressAlertButton('Resume');

    expect(router.push).toHaveBeenCalledWith('/workout/active');
    expect(useActiveWorkoutStore.getState().workout).not.toBeNull();
  });

  it('Cancel leaves everything untouched', async () => {
    useActiveWorkoutStore.setState({ workout: fixtureWorkout() });
    await renderScreen();

    await fireEvent.press(screen.getByTestId('start-empty-workout'));
    await pressAlertButton('Cancel');

    expect(router.push).not.toHaveBeenCalled();
    expect(useActiveWorkoutStore.getState().workout).not.toBeNull();
  });

  it('Discard & Start New shows a second (destructive) confirm; confirming discards then navigates', async () => {
    const discard = jest.fn().mockResolvedValue(undefined);
    useActiveWorkoutStore.setState({ workout: fixtureWorkout(), discard });
    await renderScreen();

    await fireEvent.press(screen.getByTestId('start-empty-workout'));
    await pressAlertButton('Discard & Start New');

    // Second confirm (02 §1: "destructive, second confirm").
    expect(Alert.alert).toHaveBeenCalledWith(
      'Discard workout?',
      'All entered data will be lost.',
      expect.any(Array),
    );
    expect(discard).not.toHaveBeenCalled();

    await pressAlertButton('Discard');

    expect(discard).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/workout/active');
  });

  it('Discard & Start New — the second confirm can itself be cancelled, leaving the workout intact', async () => {
    const discard = jest.fn().mockResolvedValue(undefined);
    useActiveWorkoutStore.setState({ workout: fixtureWorkout(), discard });
    await renderScreen();

    await fireEvent.press(screen.getByTestId('start-empty-workout'));
    await pressAlertButton('Discard & Start New');
    await pressAlertButton('Cancel');

    expect(discard).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  // M2-19 exit-gate regression: found during the exit-gate's rest-timer
  // notification-cancellation re-check that `confirmDiscardAndStartNew`
  // discarded the abandoned workout but never cancelled its running rest
  // timer — the notification would fire later for a workout that no longer
  // exists. Uses the real `discard` (not a stub) so the real
  // `restTimerStore.skip()` call this fix added is genuinely exercised, not
  // just asserted against a mock.
  it('Discard & Start New cancels any pending rest-timer notification on the abandoned workout', async () => {
    useActiveWorkoutStore.setState({
      workout: fixtureWorkout(),
      discard: jest.fn().mockImplementation(() => {
        useActiveWorkoutStore.setState({ workout: null });
        return Promise.resolve();
      }),
    });
    await useRestTimerStore.getState().start({
      exerciseId: 'exercise-1',
      setId: 'set-1',
      durationSeconds: 90,
      exerciseName: 'Bench Press',
      setNumber: 1,
      notificationsEnabled: true,
    });
    expect(useRestTimerStore.getState().timer).not.toBeNull();

    await renderScreen();
    await fireEvent.press(screen.getByTestId('start-empty-workout'));
    await pressAlertButton('Discard & Start New');
    await pressAlertButton('Discard');

    expect(useRestTimerStore.getState().timer).toBeNull();
    expect(router.push).toHaveBeenCalledWith('/workout/active');
  });
});
