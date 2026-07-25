/**
 * `RoutinesHubScreen` behavioral tests (M3-02 acceptance gate, 04 §1).
 *
 * Covers: both-themes smoke render, the empty state (both CTAs), folder
 * collapse/expand + persistence (via the real `FakeRoutineRepository`
 * round-trip, not a mock assertion alone — collapsing then re-rendering
 * genuinely hides the folder's routine cards), both folder-delete paths
 * (cascade vs keep-routines), routine ⋯ menu actions (Duplicate/Move to
 * Folder/Delete calling the right repository methods; Start
 * Routine/Edit/Reorder's navigation/stub seams), the one-active-workout
 * gate this screen inherited verbatim from the old
 * `app/(tabs)/workout/index.tsx` placeholder (moved here per this task's
 * "route file is now a thin wiring shim" split — see
 * `RoutinesHubScreen.tsx`'s own header and the sibling route test,
 * `app/(tabs)/workout/__tests__/index.test.tsx`), and (M3-03) reorder
 * mode's toggle + drag/drop-callback-to-repository wiring (see the
 * `react-native-reanimated-dnd` mock below — real pan gestures aren't
 * driveable in RNTL, `docs/plan/BLOCKERS.md`'s M3-03 entry).
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
import { dragReorder } from '@/lib/haptics';
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

// 08 §5 native-seam mocking pattern (`src/lib/__mocks__/haptics.ts`) — M3-03
// wires `dragReorder()` into reorder-mode pickup/drop.
jest.mock('@/lib/haptics');

// `react-native-reanimated-dnd` (M3-03) drives real pan gestures, which
// RNTL cannot fire — `docs/plan/BLOCKERS.md`'s M3-03 entry / this task's
// own brief both call that expected. This mock replaces `Draggable`/
// `Droppable`/`DropProvider` with plain, gesture-free stand-ins so the
// *reachable* logic (reorder-mode toggle, and the repository-call wiring a
// drop triggers) stays testable: each mock `Draggable` renders an extra
// hidden `Pressable` (`mock-pickup-<draggableId>`) that, when pressed,
// stashes that `Draggable`'s `data` in module state and calls
// `onDragStart` — simulating "pick this item up"; each mock `Droppable`
// renders an extra hidden `Pressable` (`mock-drop-<droppableId>`) that
// calls its `onDrop` with whatever is currently stashed — simulating
// "release the held item here." A real drag's continuous gesture becomes
// two discrete `fireEvent.press` calls, but the exact same `onDragStart`/
// `onDrop` callback props `FolderSection.tsx` wires to the real library are
// exercised, so this proves the wiring, not just the pure math
// `routine-reorder.test.ts` already covers independently.
let mockDraggedData: unknown = null;
jest.mock('react-native-reanimated-dnd', () => {
  const RN = jest.requireActual('react-native');
  const ReactActual = jest.requireActual('react');

  function MockDraggable({ data, draggableId, onDragStart, children }: any) {
    return ReactActual.createElement(
      ReactActual.Fragment,
      null,
      ReactActual.createElement(RN.Pressable, {
        testID: `mock-pickup-${draggableId}`,
        onPress: () => {
          mockDraggedData = data;
          onDragStart?.(data);
        },
      }),
      children,
    );
  }
  MockDraggable.Handle = ({ children }: any) => children;

  function MockDroppable({ droppableId, onDrop, children }: any) {
    return ReactActual.createElement(
      ReactActual.Fragment,
      null,
      ReactActual.createElement(RN.Pressable, {
        testID: `mock-drop-${droppableId}`,
        onPress: () => onDrop(mockDraggedData),
      }),
      children,
    );
  }

  function MockDropProvider({ children }: any) {
    return children;
  }

  return { Draggable: MockDraggable, Droppable: MockDroppable, DropProvider: MockDropProvider };
});

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
  mockDraggedData = null;
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

// M3-08 milestone-QA-sweep addition: folder ⋯ → Rename had a fully-wired
// repository method (`renameFolder`, integration-tested since M3-01's own
// `routine-repository.folders.test.ts`) and fully-wired UI handler
// (`handleFolderNameSave`'s "rename" branch, `RoutinesHubScreen.tsx`) but —
// unlike its Create/Delete siblings just above — no RNTL test ever drove
// the ⋯ → Rename → `FolderNameSheet` (pre-filled with the folder's current
// title, `title="Rename Folder"`) → save → `repository.renameFolder` path
// end to end. 04 §1's own acceptance line is "Create/rename/delete folder"
// — a real, spec-named behavior with a real coverage gap, the same shape
// M2-19's exit-gate found for the crash-safety action set (working code,
// missing wiring-level test), not a broken feature. No bug found once
// traced (`renameFolder` itself, `RoutinesHubScreen`'s handler, and
// `FolderNameSheet`'s `initialValue` prefill all read correct) — this is a
// pure coverage-completeness addition, not a fix.
describe('RoutinesHubScreen — folder rename (04 §1 acceptance, M3-08 coverage gap closed)', () => {
  it('⋯ → Rename pre-fills the current title and renames via repository.renameFolder', async () => {
    const folder = fixtureFolder({ id: 1, title: 'Push/Pull/Legs' });
    const routine = fixtureRoutine({ id: 'r1', title: 'Push Day', folderId: 1 });
    const repo = new FakeRoutineRepository({
      folders: [folder],
      routines: [routine],
      fulls: [fixtureRoutineFull({ id: 'r1', title: 'Push Day', folderId: 1 })],
    });
    await renderHub(repo);
    await screen.findByTestId('routine-card-r1');

    await fireEvent.press(screen.getByTestId('folder-section-1-menu'));
    await fireEvent.press(await screen.findByTestId('folder-actions-sheet-rename'));

    const input = await screen.findByTestId('folder-name-sheet-input');
    expect(input.props.value).toBe('Push/Pull/Legs');

    await fireEvent.changeText(input, 'Upper Body');
    await fireEvent.press(screen.getByTestId('folder-name-sheet-save'));

    await waitFor(() => expect(repo.folders[0]!.title).toBe('Upper Body'));
    // The folder's own id is untouched by a rename — only the title changes.
    expect(repo.folders[0]!.id).toBe(1);
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

  it('Start Routine (card button) navigates straight to /workout/active?routineId=... when nothing is active (M3-05)', async () => {
    await renderHub(repoWithRoutine());
    await fireEvent.press(await screen.findByTestId('routine-card-r1-start'));

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith('/workout/active?routineId=r1');
  });

  it('⋯ → Start Routine navigates the same way as the card button (both routes share handleStartRoutine)', async () => {
    await renderHub(repoWithRoutine());
    await fireEvent.press(await screen.findByTestId('routine-card-r1-menu'));
    await fireEvent.press(await screen.findByTestId('routine-actions-sheet-start'));

    expect(router.push).toHaveBeenCalledWith('/workout/active?routineId=r1');
  });

  it('Start Routine while a workout is already active shows the Resume / Discard-and-start / Cancel gate, scoped to the chosen routine (M3-05, 02 §1)', async () => {
    useActiveWorkoutStore.setState({ workout: fixtureWorkout({ title: 'Evening Workout' }) });
    await renderHub(repoWithRoutine());

    await fireEvent.press(await screen.findByTestId('routine-card-r1-start'));

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

  it('Start Routine — Discard & Start New discards the active workout then navigates to the CHOSEN routine, never an empty workout (M3-05 fix)', async () => {
    const discard = jest.fn().mockResolvedValue(undefined);
    useActiveWorkoutStore.setState({ workout: fixtureWorkout(), discard });
    await renderHub(repoWithRoutine());

    await fireEvent.press(await screen.findByTestId('routine-card-r1-start'));
    await pressAlertButton('Discard & Start New');

    expect(Alert.alert).toHaveBeenCalledWith(
      'Discard workout?',
      'All entered data will be lost.',
      expect.any(Array),
    );
    expect(discard).not.toHaveBeenCalled();

    await pressAlertButton('Discard');

    expect(discard).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith('/workout/active?routineId=r1');
  });

  it('Start Routine — Resume navigates to the existing active workout, not the newly-chosen routine', async () => {
    useActiveWorkoutStore.setState({ workout: fixtureWorkout({ title: 'Evening Workout' }) });
    await renderHub(repoWithRoutine());

    await fireEvent.press(await screen.findByTestId('routine-card-r1-start'));
    await pressAlertButton('Resume');

    expect(router.push).toHaveBeenCalledWith('/workout/active');
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

    // Wait on the rendered DOM, not just the fake repo's internal array —
    // `duplicate()` mutates `repo.routines` synchronously on resolution,
    // but the screen only reflects it once the post-mutation
    // `invalidateQueries` refetch actually lands and re-renders. Asserting
    // on `repo.routines` alone raced the render and made this test flaky
    // (found in M3-02 review).
    expect(await screen.findByText('Push Day copy')).toBeTruthy();
    expect(repo.routines).toHaveLength(2);
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

  it('⋯ → Reorder enters reorder mode (M3-03) — no repository call by itself', async () => {
    const repo = repoWithRoutine();
    await renderHub(repo);
    await fireEvent.press(await screen.findByTestId('routine-card-r1-menu'));
    await fireEvent.press(await screen.findByTestId('routine-actions-sheet-reorder'));

    expect(await screen.findByTestId('reorder-done-button')).toBeTruthy();
    expect(screen.getByTestId('routine-card-r1-drag-handle')).toBeTruthy();
    expect(screen.queryByTestId('routine-card-r1-start')).toBeNull();
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

describe('RoutinesHubScreen — reorder mode (M3-03)', () => {
  function repoWithTwoFoldersAndRoutines(): FakeRoutineRepository {
    const folderA = fixtureFolder({ id: 1, title: 'Folder A', position: 0 });
    const folderB = fixtureFolder({ id: 2, title: 'Folder B', position: 1 });
    const r1 = fixtureRoutine({ id: 'r1', title: 'Push Day', folderId: 1, position: 0 });
    const r2 = fixtureRoutine({ id: 'r2', title: 'Pull Day', folderId: 1, position: 1 });
    const r3 = fixtureRoutine({ id: 'r3', title: 'Leg Day', folderId: 2, position: 0 });
    return new FakeRoutineRepository({
      folders: [folderA, folderB],
      routines: [r1, r2, r3],
      fulls: [
        fixtureRoutineFull({ id: 'r1', title: 'Push Day', folderId: 1 }),
        fixtureRoutineFull({ id: 'r2', title: 'Pull Day', folderId: 1 }),
        fixtureRoutineFull({ id: 'r3', title: 'Leg Day', folderId: 2 }),
      ],
    });
  }

  it('folder ⋯ → Reorder also enters reorder mode (same screen-wide mode as the routine ⋯ item)', async () => {
    const repo = repoWithTwoFoldersAndRoutines();
    await renderHub(repo);
    await screen.findByTestId('routine-card-r1');

    await fireEvent.press(screen.getByTestId('folder-section-1-menu'));
    await fireEvent.press(await screen.findByTestId('folder-actions-sheet-reorder'));

    expect(await screen.findByTestId('reorder-done-button')).toBeTruthy();
    expect(screen.getByTestId('folder-section-1-drag-handle')).toBeTruthy();
    // New-folder/new-routine icons are replaced by Done while reordering —
    // nowhere to create a folder/routine mid-drag (file header).
    expect(screen.queryByTestId('new-folder-button')).toBeNull();
    expect(screen.queryByTestId('new-routine-button')).toBeNull();
  });

  it('Done exits reorder mode and restores the ⋯ menus / Start Routine buttons', async () => {
    const repo = repoWithTwoFoldersAndRoutines();
    await renderHub(repo);
    await fireEvent.press(await screen.findByTestId('routine-card-r1-menu'));
    await fireEvent.press(await screen.findByTestId('routine-actions-sheet-reorder'));
    await screen.findByTestId('reorder-done-button');

    await fireEvent.press(screen.getByTestId('reorder-done-button'));

    expect(screen.queryByTestId('reorder-done-button')).toBeNull();
    expect(screen.getByTestId('routine-card-r1-start')).toBeTruthy();
    expect(screen.getByTestId('new-folder-button')).toBeTruthy();
  });

  it('dragging a routine before another routine within the same folder calls reorderRoutines with the new order', async () => {
    const repo = repoWithTwoFoldersAndRoutines();
    await renderHub(repo);
    await fireEvent.press(await screen.findByTestId('routine-card-r1-menu'));
    await fireEvent.press(await screen.findByTestId('routine-actions-sheet-reorder'));
    await screen.findByTestId('reorder-done-button');

    // Pick up r2, drop it on r1's row — "insert before r1" within folder 1.
    await fireEvent.press(screen.getByTestId('mock-pickup-routine-r2'));
    await fireEvent.press(screen.getByTestId('mock-drop-routine-drop-r1'));

    await waitFor(() => {
      const ordered = repo.routines
        .filter((r) => r.folderId === 1)
        .sort((a, b) => a.position - b.position)
        .map((r) => r.id);
      expect(ordered).toEqual(['r2', 'r1']);
    });
    expect(dragReorder).toHaveBeenCalled();
  });

  it('dragging a routine onto a different folder\'s header moves it there (moveToFolder) and persists the new order (reorderRoutines) — 04 §1 acceptance', async () => {
    const repo = repoWithTwoFoldersAndRoutines();
    await renderHub(repo);
    await fireEvent.press(await screen.findByTestId('routine-card-r1-menu'));
    await fireEvent.press(await screen.findByTestId('routine-actions-sheet-reorder'));
    await screen.findByTestId('reorder-done-button');

    // Pick up r1 (folder 1), drop it on folder 2's header zone.
    await fireEvent.press(screen.getByTestId('mock-pickup-routine-r1'));
    await fireEvent.press(screen.getByTestId('mock-drop-folder-drop-2'));

    await waitFor(() => expect(repo.routines.find((r) => r.id === 'r1')?.folderId).toBe(2));
    // Appended after folder 2's existing routine (r3), not inserted before it.
    const orderedInFolder2 = repo.routines
      .filter((r) => r.folderId === 2)
      .sort((a, b) => a.position - b.position)
      .map((r) => r.id);
    expect(orderedInFolder2).toEqual(['r3', 'r1']);
    // Folder 1's remaining routine (r2) is still there, unaffected.
    expect(repo.routines.find((r) => r.id === 'r2')?.folderId).toBe(1);
  });

  it('dropping a routine on its own row is a no-op (no repository call)', async () => {
    const repo = repoWithTwoFoldersAndRoutines();
    await renderHub(repo);
    await fireEvent.press(await screen.findByTestId('routine-card-r1-menu'));
    await fireEvent.press(await screen.findByTestId('routine-actions-sheet-reorder'));
    await screen.findByTestId('reorder-done-button');

    const before = repo.routines.map((r) => ({ id: r.id, folderId: r.folderId, position: r.position }));
    await fireEvent.press(screen.getByTestId('mock-pickup-routine-r1'));
    await fireEvent.press(screen.getByTestId('mock-drop-routine-drop-r1'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(repo.routines.map((r) => ({ id: r.id, folderId: r.folderId, position: r.position }))).toEqual(
      before,
    );
  });

  it('dragging a folder before another folder calls reorderFolders with the new order', async () => {
    const repo = repoWithTwoFoldersAndRoutines();
    await renderHub(repo);
    await fireEvent.press(await screen.findByTestId('folder-section-2-menu'));
    await fireEvent.press(await screen.findByTestId('folder-actions-sheet-reorder'));
    await screen.findByTestId('reorder-done-button');

    // Pick up folder B (id 2), drop it on folder A's (id 1) header — "insert before folder A".
    await fireEvent.press(screen.getByTestId('mock-pickup-folder-2'));
    await fireEvent.press(screen.getByTestId('mock-drop-folder-drop-1'));

    await waitFor(() => {
      const ordered = repo.folders.slice().sort((a, b) => a.position - b.position).map((f) => f.id);
      expect(ordered).toEqual([2, 1]);
    });
    expect(dragReorder).toHaveBeenCalled();
  });

  it('dropping a folder-shaped drag onto a routine row is ignored (folders only reorder against folder headers)', async () => {
    const repo = repoWithTwoFoldersAndRoutines();
    await renderHub(repo);
    await fireEvent.press(await screen.findByTestId('folder-section-2-menu'));
    await fireEvent.press(await screen.findByTestId('folder-actions-sheet-reorder'));
    await screen.findByTestId('reorder-done-button');

    const foldersBefore = repo.folders.map((f) => ({ id: f.id, position: f.position }));
    await fireEvent.press(screen.getByTestId('mock-pickup-folder-2'));
    await fireEvent.press(screen.getByTestId('mock-drop-routine-drop-r1'));
    await act(async () => {
      await Promise.resolve();
    });

    expect(repo.folders.map((f) => ({ id: f.id, position: f.position }))).toEqual(foldersBefore);
  });
});
