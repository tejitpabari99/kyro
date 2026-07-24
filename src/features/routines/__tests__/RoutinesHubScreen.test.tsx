/**
 * `RoutinesHubScreen` behavioral tests (M3-02 acceptance gate, 04 §1).
 *
 * Covers: both-themes smoke render, the empty state (both CTAs), folder
 * collapse/expand + persistence (via the real `FakeRoutineRepository`
 * round-trip, not a mock assertion alone — collapsing then re-rendering
 * genuinely hides the folder's routine cards), both folder-delete paths
 * (cascade vs keep-routines), routine ⋯ menu actions (Duplicate/Move to
 * Folder/Delete calling the right repository methods; Start
 * Routine/Edit/Reorder's navigation/stub seams), and the
 * one-active-workout gate this screen inherited verbatim from the old
 * `app/(tabs)/workout/index.tsx` placeholder (moved here per this task's
 * "route file is now a thin wiring shim" split — see
 * `RoutinesHubScreen.tsx`'s own header and the sibling route test,
 * `app/(tabs)/workout/__tests__/index.test.tsx`).
 *
 * Every `fireEvent.press` is `await`ed (RNTL v14 async fire-event
 * convention, same reasoning `ExerciseBrowseScreen.test.tsx`'s header
 * documents) and every `Alert.alert` button press goes through
 * `pressAlertButton` (copied from the old route test, same act-scope
 * reasoning).
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { WorkoutFull } from '@/data/workouts/types';
import { useActiveWorkoutStore } from '@/features/workout/activeWorkoutStore';
import { useRestTimerStore } from '@/features/workout/restTimerStore';
import { ThemeProvider } from '@/ui/theme-provider';

import { FakeExerciseRepository, FIXTURE_EXERCISES } from '../../exercises/__tests__/exercise-fixtures';
import { RoutinesHubScreen } from '../RoutinesHubScreen';
import { FakeRoutineRepository, fixtureFolder, fixtureRoutine, fixtureRoutineFull } from './routine-fixtures';

jest.mock('@sentry/react-native', () => ({
  init: jest.fn(),
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
}));

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn() },
}));

// Same M2-19 seam the old route test mocked (`confirmDiscardAndStartNew`
// cancels a running rest-timer notification on discard) — see
// `RoutinesHubScreen.tsx`'s copied-verbatim Quick Start logic.
jest.mock('@/lib/notifications');

function newTestQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

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

/** Same helper the old route test used — finds and presses a button by label in the most recent `Alert.alert` call. */
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

function renderHub(routineRepository: FakeRoutineRepository, theme: 'dark' | 'light' = 'dark') {
  const exerciseRepository = new FakeExerciseRepository(FIXTURE_EXERCISES);
  return render(
    <QueryClientProvider client={newTestQueryClient()}>
      <ThemeProvider preference={theme}>
        <RoutinesHubScreen routineRepository={routineRepository} exerciseRepository={exerciseRepository} />
      </ThemeProvider>
    </QueryClientProvider>,
  );
}

const BENCH_ID = FIXTURE_EXERCISES[0]!.id;

describe('RoutinesHubScreen — smoke render (both themes)', () => {
  function fixtureRepo(): FakeRoutineRepository {
    const folder = fixtureFolder({ id: 1, title: 'Push/Pull/Legs' });
    const routine = fixtureRoutine({ id: 'r1', title: 'Push Day', folderId: 1 });
    return new FakeRoutineRepository({
      folders: [folder],
      routines: [routine],
      fulls: [fixtureRoutineFull({ id: 'r1', title: 'Push Day', folderId: 1, exercises: [
        { id: 're-1', routineId: 'r1', exerciseId: BENCH_ID, position: 0, supersetId: null, notes: null, restSeconds: null, sets: [] },
      ] })],
    });
  }

  it('renders in dark theme', async () => {
    await renderHub(fixtureRepo(), 'dark');
    expect(await screen.findByTestId('routine-card-r1')).toBeTruthy();
    expect(screen.getByText('Push Day')).toBeTruthy();
  });

  it('renders in light theme', async () => {
    await renderHub(fixtureRepo(), 'light');
    expect(await screen.findByTestId('routine-card-r1')).toBeTruthy();
  });
});

describe('RoutinesHubScreen — empty state', () => {
  it('renders both CTAs when there are no folders and no routines', async () => {
    await renderHub(new FakeRoutineRepository({}));

    expect(await screen.findByTestId('routines-empty-state')).toBeTruthy();
    expect(screen.getByTestId('start-empty-workout')).toBeTruthy();
    expect(screen.getByTestId('routines-empty-create-routine')).toBeTruthy();
  });

  it('the empty state\'s New Routine CTA navigates to /routine/new (M3-04 seam)', async () => {
    await renderHub(new FakeRoutineRepository({}));
    await screen.findByTestId('routines-empty-state');

    await fireEvent.press(screen.getByTestId('routines-empty-create-routine'));

    expect(router.push).toHaveBeenCalledWith('/routine/new');
  });
});

describe('RoutinesHubScreen — folder collapse/expand + persistence', () => {
  it('collapsing a folder hides its routine cards and persists via setFolderCollapsed', async () => {
    const folder = fixtureFolder({ id: 1, title: 'Push/Pull/Legs', collapsed: false });
    const routine = fixtureRoutine({ id: 'r1', title: 'Push Day', folderId: 1 });
    const repo = new FakeRoutineRepository({
      folders: [folder],
      routines: [routine],
      fulls: [fixtureRoutineFull({ id: 'r1', title: 'Push Day', folderId: 1 })],
    });

    await renderHub(repo);
    await screen.findByTestId('routine-card-r1');

    await fireEvent.press(screen.getByTestId('folder-section-1-toggle'));

    await waitFor(() => expect(screen.queryByTestId('routine-card-r1')).toBeNull());
    expect(repo.folders[0]!.collapsed).toBe(true);
  });
});

describe('RoutinesHubScreen — folder delete (both paths)', () => {
  function repoWithFolderAndRoutine(): FakeRoutineRepository {
    const folder = fixtureFolder({ id: 1, title: 'Push/Pull/Legs' });
    const routine = fixtureRoutine({ id: 'r1', title: 'Push Day', folderId: 1 });
    return new FakeRoutineRepository({
      folders: [folder],
      routines: [routine],
      fulls: [fixtureRoutineFull({ id: 'r1', title: 'Push Day', folderId: 1 })],
    });
  }

  it('"Keep Routines" moves the folder\'s routines to My Routines instead of deleting them', async () => {
    const repo = repoWithFolderAndRoutine();
    await renderHub(repo);
    await screen.findByTestId('routine-card-r1');

    await fireEvent.press(screen.getByTestId('folder-section-1-menu'));
    await fireEvent.press(await screen.findByTestId('folder-actions-sheet-delete'));
    await pressAlertButton('Keep Routines');

    await waitFor(() => expect(repo.folders).toHaveLength(0));
    expect(repo.routines[0]!.folderId).toBeNull();
  });

  it('"Delete N Routines Too" cascades the delete', async () => {
    const repo = repoWithFolderAndRoutine();
    await renderHub(repo);
    await screen.findByTestId('routine-card-r1');

    await fireEvent.press(screen.getByTestId('folder-section-1-menu'));
    await fireEvent.press(await screen.findByTestId('folder-actions-sheet-delete'));
    await pressAlertButton('Delete 1 Routine Too');

    await waitFor(() => expect(repo.folders).toHaveLength(0));
    expect(repo.routines).toHaveLength(0);
  });
});

describe('RoutinesHubScreen — routine ⋯ menu', () => {
  function repoWithRoutine(): FakeRoutineRepository {
    const routine = fixtureRoutine({ id: 'r1', title: 'Push Day', folderId: null });
    return new FakeRoutineRepository({
      routines: [routine],
      fulls: [fixtureRoutineFull({ id: 'r1', title: 'Push Day', folderId: null })],
    });
  }

  it('Start Routine (card button) navigates to the M3-05 seam route', async () => {
    await renderHub(repoWithRoutine());
    await fireEvent.press(await screen.findByTestId('routine-card-r1-start'));

    expect(router.push).toHaveBeenCalledWith('/routine/r1/start');
  });

  it('⋯ → Edit navigates to the M3-04 editor seam route', async () => {
    await renderHub(repoWithRoutine());
    await fireEvent.press(await screen.findByTestId('routine-card-r1-menu'));
    await fireEvent.press(await screen.findByTestId('routine-actions-sheet-edit'));

    expect(router.push).toHaveBeenCalledWith('/routine/r1/edit');
  });

  it('⋯ → Duplicate calls repository.duplicate and refreshes the list', async () => {
    const repo = repoWithRoutine();
    await renderHub(repo);
    await fireEvent.press(await screen.findByTestId('routine-card-r1-menu'));
    await fireEvent.press(await screen.findByTestId('routine-actions-sheet-duplicate'));

    await waitFor(() => expect(repo.routines).toHaveLength(2));
    expect(screen.getByText('Push Day copy')).toBeTruthy();
  });

  it('⋯ → Move to Folder opens the folder-picker sheet and moves the routine on selection', async () => {
    const folder = fixtureFolder({ id: 2, title: 'Legs Day' });
    const repo = repoWithRoutine();
    repo.folders = [folder];
    await renderHub(repo);

    await fireEvent.press(await screen.findByTestId('routine-card-r1-menu'));
    await fireEvent.press(await screen.findByTestId('routine-actions-sheet-move'));
    await fireEvent.press(await screen.findByTestId('move-to-folder-sheet-folder-2'));

    await waitFor(() => expect(repo.routines[0]!.folderId).toBe(2));
  });

  it('⋯ → Reorder shows an inert "coming soon" stub (M3-03 seam, no repository call)', async () => {
    const repo = repoWithRoutine();
    await renderHub(repo);
    await fireEvent.press(await screen.findByTestId('routine-card-r1-menu'));
    await fireEvent.press(await screen.findByTestId('routine-actions-sheet-reorder'));

    expect(Alert.alert).toHaveBeenCalledWith('Reorder', 'Drag-to-reorder is coming soon.');
    expect(repo.routines).toHaveLength(1);
  });

  it('⋯ → Delete confirms then calls repository.delete', async () => {
    const repo = repoWithRoutine();
    await renderHub(repo);
    await fireEvent.press(await screen.findByTestId('routine-card-r1-menu'));
    await fireEvent.press(await screen.findByTestId('routine-actions-sheet-delete'));
    await pressAlertButton('Delete');

    await waitFor(() => expect(repo.routines).toHaveLength(0));
  });
});

describe('RoutinesHubScreen — new folder / new routine', () => {
  it('the folder-plus icon opens the FolderNameSheet and creates a folder via createFolder', async () => {
    const repo = new FakeRoutineRepository({});
    await renderHub(repo);
    await screen.findByTestId('routines-empty-state');

    await fireEvent.press(screen.getByTestId('new-folder-button'));
    await fireEvent.changeText(await screen.findByTestId('folder-name-sheet-input'), 'Push/Pull/Legs');
    await fireEvent.press(screen.getByTestId('folder-name-sheet-save'));

    await waitFor(() => expect(repo.folders).toHaveLength(1));
    expect(repo.folders[0]!.title).toBe('Push/Pull/Legs');
  });

  it('the + icon navigates to /routine/new (M3-04 seam)', async () => {
    await renderHub(new FakeRoutineRepository({}));
    await screen.findByTestId('routines-empty-state');

    await fireEvent.press(screen.getByTestId('new-routine-button'));

    expect(router.push).toHaveBeenCalledWith('/routine/new');
  });
});

describe('RoutinesHubScreen — one-active-workout gate (02 §1, inherited from the old placeholder)', () => {
  it('navigates straight to /workout/active when nothing is active', async () => {
    await renderHub(new FakeRoutineRepository({}));
    await screen.findByTestId('routines-empty-state');

    await fireEvent.press(screen.getByTestId('start-empty-workout'));

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/workout/active');
  });

  it('shows the Resume / Discard-and-start / Cancel action sheet when a workout is already active', async () => {
    useActiveWorkoutStore.setState({ workout: fixtureWorkout({ title: 'Evening Workout' }) });
    await renderHub(new FakeRoutineRepository({}));
    await screen.findByTestId('routines-empty-state');

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

  it('Discard & Start New shows a second (destructive) confirm; confirming discards then navigates', async () => {
    const discard = jest.fn().mockResolvedValue(undefined);
    useActiveWorkoutStore.setState({ workout: fixtureWorkout(), discard });
    await renderHub(new FakeRoutineRepository({}));
    await screen.findByTestId('routines-empty-state');

    await fireEvent.press(screen.getByTestId('start-empty-workout'));
    await pressAlertButton('Discard & Start New');

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

  it('Discard & Start New cancels any pending rest-timer notification on the abandoned workout (M2-19 regression)', async () => {
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

    await renderHub(new FakeRoutineRepository({}));
    await screen.findByTestId('routines-empty-state');
    await fireEvent.press(screen.getByTestId('start-empty-workout'));
    await pressAlertButton('Discard & Start New');
    await pressAlertButton('Discard');

    expect(useRestTimerStore.getState().timer).toBeNull();
    expect(router.push).toHaveBeenCalledWith('/workout/active');
  });
});
