/**
 * `RoutinesHubScreen` (M3-02) — the real Workout-tab routines hub, 04 §1:
 * large title, Quick Start `+ Start Empty Workout`, Routines section
 * (folder-plus = new folder, `+` = new routine), folder-grouped collapsible
 * routine list with an implicit "My Routines" section always last, routine
 * cards (title/preview/⋯ menu/tonal Start Routine), folder delete's
 * two-path choice dialog, and the empty state with both CTAs. Replaces the
 * M0-08/M2-05 placeholder that used to live directly in
 * `app/(tabs)/workout/index.tsx` — that route file is now a thin wiring
 * shim (mirrors `app/workout/active.tsx`'s split, M2-05) that constructs
 * the real `RoutineRepositoryImpl`/`ExerciseRepositoryImpl` and renders
 * this component; `app/(tabs)/workout/__tests__/index.test.tsx` now only
 * proves that wiring (real `active.test.tsx` pattern), while this file's
 * own `__tests__/RoutinesHubScreen.test.tsx` owns every behavioral case
 * (including the one-active-workout gate this screen inherited verbatim
 * from the old placeholder).
 *
 * --- Data flow --------------------------------------------------------
 * Three independent TanStack Query reads: `routineRepository.listFolders()`
 * (`['routines','folders']`), `routineRepository.list()` (`['routines',
 * 'list']`, unfiltered — already folder-position-then-My-Routines-last
 * ordered per `RoutineRepository.list()`'s own doc comment, M3-01's
 * `c7aab44` fix), and `exerciseRepository.list()` (`['exercises',
 * 'routine-hub-names']` — a *separate* cache entry from
 * `ExerciseBrowseScreen`'s own `['exercises','browse-all']` key, kept
 * independent deliberately so this screen's cache lifetime/invalidation
 * never has to reason about that screen's, even though both ultimately
 * read the same table).
 *
 * `RoutineRepository.list()`'s `RoutineSummary` rows carry no exercise
 * data (confirmed by reading `src/data/routines/types.ts` — deliberately
 * lightweight, same reasoning as `WorkoutSummary`), so the card's 2-line
 * preview (04 §1) needs each routine's hydrated `getFull` row too. Rather
 * than adding a new bulk "preview" method to `RoutineRepository` (out of
 * this task's scope — M3-01 is done, and 04 §1 doesn't mandate a
 * particular data-access shape), this screen fires one `getFull` query per
 * visible routine via `useQueries` (`['routines','full', id]` — sharing
 * the `'routines'` key prefix means a single `invalidateQueries({queryKey:
 * ['routines']})` after any mutation below refetches folders, the list,
 * *and* every open preview in one call). This is an N+1 read pattern,
 * deliberately accepted for now: 04 §1 sets no perf budget for the hub
 * (unlike e.g. 04 §4.3's explicit "< 300 ms" chart budget), M3-03's own
 * task text is where a 30-routine-list perf check is scoped ("no frame
 * drops on a 30-routine list"), and a real bulk-preview repository method
 * can be added later without this screen's public shape changing if it
 * ever becomes a measured problem.
 *
 * --- Deliberate navigation seams (M3-04/M3-05, don't build fake screens) --
 * `+` New Routine and a routine's ⋯ → Edit push to `/routine/new` /
 * `/routine/[id]/edit` — routes M3-04 builds; a routine's ⋯ → Start
 * Routine and the card's own bottom `Start Routine` button push to
 * `/routine/[id]/start` — a route M3-05 builds (starting a routine for
 * real, 04 §2.3, needs its own target screen this task must not fabricate;
 * `/routine/[id]/start` is this task's own choice of path, not spec text —
 * picked over reusing `/workout/active?routineId=...` because that route
 * already exists and would *silently* ignore an unrecognized `routineId`
 * param today, i.e. tapping "Start Routine" would launch a blank empty
 * workout with no error — exactly the "fabricate a fake working screen"
 * outcome the task text says to avoid; a 404-style not-yet-built route is
 * the honest seam instead, same convention `ExerciseBrowseScreen.tsx`
 * documents for `/exercise/new`).
 *
 * --- Reorder mode (M3-03, 04 §1) --------------------------------------
 * Both routine and folder ⋯ menus' "Reorder" item now enters a single
 * screen-wide `reorderMode` (there is one "Reorder mode," not a per-item
 * one — dragging a routine *between* folders needs every folder visible
 * and drag-handled at once, so a per-item mode wouldn't make sense) rather
 * than navigating anywhere; a "Done" text button (replacing the
 * folder-plus/`+` icons while active, so there's nowhere to create a
 * folder/routine mid-drag) exits it. `FolderSection.tsx` owns the actual
 * `react-native-reanimated-dnd` `Draggable`/`Droppable` wiring per-row (see
 * its own header); this screen owns turning a drop into real
 * `RoutineRepository` calls via `routine-reorder.ts`'s pure position math
 * (`computeRoutineReorderPlan`/`computeFolderReorderIds`) plus the
 * `impactLight` pickup/drop haptic (07 §8, `src/lib/haptics.ts`'s
 * `dragReorder`).
 *
 * **Library choice — `react-native-reanimated-dnd` over
 * `react-native-draggable-flatlist`** (06 §1's spike, done as part of this
 * task): `npm view` on 2026-07-24 showed `react-native-reanimated-dnd`
 * (2.0.0, published 2026-03-16) declares peer deps
 * `react-native-reanimated >=4.2.0` / `react-native-worklets >=0.7.0` /
 * `react-native >=0.80.0` — an exact match for this repo's installed
 * versions (4.3.1 / 0.8.3 / 0.85.3) — and its README states it is "Built
 * for the modern React Native architecture," explicitly targets Expo SDK
 * 55+/RN 0.83+, and migrated to Reanimated 4 + `react-native-worklets`.
 * `react-native-draggable-flatlist` (latest 4.0.3, published 2025-05-06 —
 * 14 months stale relative to this task) declares only
 * `react-native-reanimated >=2.8.0` and never mentions the New Architecture,
 * Reanimated 4, or `react-native-worklets` anywhere in its README —
 * Reanimated 4 replaced the old `react-native-reanimated/plugin` worklet
 * pipeline with the separate `react-native-worklets` package, a breaking
 * change libraries built against Reanimated 2/3 commonly don't survive
 * un-updated. Both installed cleanly with zero peer-dependency warnings on
 * this repo's exact dependency set, so this wasn't the deciding factor —
 * the *currency* of each library's own stated Reanimated-4/New-Architecture
 * support was. `react-native-reanimated-dnd`'s own README also disclosed
 * (under its own roadmap section) that true cross-list "Kanban" dragging
 * between independent lists is NOT yet shipped (listed under "Next
 * Release," not current) — its high-level `Sortable`/`SortableItem`
 * components only reorder within one list's own internal state. Rather
 * than depend on an unshipped feature, this screen builds the
 * within-folder-reorder *and* cross-folder-move cases uniformly on the
 * library's lower-level `Draggable`/`Droppable`/`DropProvider` primitives
 * (confirmed shipped, used in the README's own most basic Quick Start
 * example, not the roadmap section) — see `FolderSection.tsx`'s header for
 * exactly how. This also sidesteps `Sortable`'s documented
 * internal-state-ownership model ("do NOT update external state... in
 * `onMove`"), which fit poorly against this app's existing
 * TanStack-Query-is-the-source-of-truth architecture anyway.
 * **Deferred to physical-device verification** (no iOS Simulator in this
 * sandbox, `docs/plan/BLOCKERS.md`): actual on-device gesture feel/frame
 * rate — this spike is a desk review of the library's shipped API surface
 * and peer-dependency currency, not an empirical stability test.
 *
 * **Exercise reorder sheet (`ReorderExercisesSheet.tsx`, M2-09) — NOT
 * migrated.** That sheet deliberately uses up/down move buttons instead of
 * a drag gesture (its own header explains why: no dnd library existed in
 * this project's dependency set at the time, and up/down buttons stay
 * RNTL-testable where a raw pan gesture wouldn't). Now that
 * `react-native-reanimated-dnd` is installed, migrating it *would* be
 * possible, but this task's own brief calls it optional ("if it wins," not
 * a hard requirement) and explicitly warns against "a risky wide-blast-
 * radius migration of working, tested M2 code just for the sake of it if
 * the payoff is marginal." The payoff here is marginal: that sheet is a
 * full-screen modal over a single flat list (no cross-folder-equivalent
 * concept, no "between two lists" case this task's dnd work was actually
 * chosen to solve) and its up/down buttons are independently accessible
 * (screen-reader/switch-control users get a working reorder affordance for
 * free, which a drag-only interaction would regress) — left as-is.
 */
import React, { useMemo, useState } from 'react';
import { Dumbbell, FolderPlus, Plus } from 'lucide-react-native';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { DropProvider } from 'react-native-reanimated-dnd';

import type { ExerciseRepository } from '@/data/exercises/types';
import type { RoutineFolder, RoutineRepository, RoutineSummary } from '@/data/routines/types';
import { selectActiveWorkout, useActiveWorkoutStore } from '@/features/workout/activeWorkoutStore';
import { useRestTimerStore } from '@/features/workout/restTimerStore';
import { dragReorder } from '@/lib/haptics';
import { Button } from '@/ui/Button';
import { EmptyState } from '@/ui/EmptyState';
import { useTheme } from '@/ui/theme-provider';

import { FolderNameSheet } from './FolderNameSheet';
import { FolderSection } from './FolderSection';
import { MoveToFolderSheet } from './MoveToFolderSheet';
import { RoutineActionsSheet } from './RoutineActionsSheet';
import { buildExercisePreview, buildFolderSections } from './routine-hub-model';
import { computeFolderReorderIds, computeRoutineReorderPlan } from './routine-reorder';
import type { RoutineDragData, RoutineDropTarget } from './routine-reorder';

export interface RoutinesHubScreenProps {
  routineRepository: RoutineRepository;
  exerciseRepository: ExerciseRepository;
  testID?: string;
}

function navigateToLogger(): void {
  router.push('/workout/active' as never);
}

type FolderNameSheetState =
  | { mode: 'create' }
  | { mode: 'rename'; folder: RoutineFolder }
  | null;

export function RoutinesHubScreen({
  routineRepository,
  exerciseRepository,
  testID = 'routines-hub-screen',
}: RoutinesHubScreenProps): React.JSX.Element {
  const { colors, spacing, typography } = useTheme();
  const queryClient = useQueryClient();
  const activeWorkout = useActiveWorkoutStore(selectActiveWorkout);

  const foldersQuery = useQuery({
    queryKey: ['routines', 'folders'],
    queryFn: () => routineRepository.listFolders(),
  });
  const routinesQuery = useQuery({
    queryKey: ['routines', 'list'],
    queryFn: () => routineRepository.list(),
  });
  const exercisesQuery = useQuery({
    queryKey: ['exercises', 'routine-hub-names'],
    queryFn: () => exerciseRepository.list(),
  });

  const folders = useMemo(() => foldersQuery.data ?? [], [foldersQuery.data]);
  const routines = useMemo(() => routinesQuery.data ?? [], [routinesQuery.data]);

  // See file header — one `getFull` per visible routine to build the
  // preview line, sharing the `'routines'` key prefix with the two queries
  // above so one `invalidateQueries` call refreshes everything.
  const previewQueries = useQueries({
    queries: routines.map((routine) => ({
      queryKey: ['routines', 'full', routine.id],
      queryFn: () => routineRepository.getFull(routine.id),
      enabled: routinesQuery.isSuccess,
    })),
  });

  const exerciseNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const exercise of exercisesQuery.data ?? []) {
      map.set(exercise.id, exercise.name);
    }
    return map;
  }, [exercisesQuery.data]);

  const previewByRoutineId = useMemo(() => {
    const map = new Map<string, string>();
    routines.forEach((routine, index) => {
      const full = previewQueries[index]?.data;
      map.set(routine.id, buildExercisePreview(full, exerciseNameById));
    });
    return map;
  }, [routines, previewQueries, exerciseNameById]);

  const sections = useMemo(() => buildFolderSections(folders, routines), [folders, routines]);
  const isEmpty =
    !foldersQuery.isLoading && !routinesQuery.isLoading && folders.length === 0 && routines.length === 0;

  const invalidateRoutineQueries = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ['routines'] }).then(() => undefined);

  const reportError = (message: string): void => {
    Alert.alert('Something went wrong', message);
  };

  // -- Quick Start / one-active-workout gate (02 §1) — verbatim logic from
  // the M0-08/M2-05 placeholder this screen replaces, see file header. ----
  const confirmDiscardAndStartNew = (): void => {
    Alert.alert('Discard workout?', 'All entered data will be lost.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Discard',
        style: 'destructive',
        onPress: () => {
          void useActiveWorkoutStore
            .getState()
            .discard()
            .then(async () => {
              await useRestTimerStore.getState().skip();
              navigateToLogger();
            });
        },
      },
    ]);
  };

  const handleStartEmptyPress = (): void => {
    if (!activeWorkout) {
      navigateToLogger();
      return;
    }
    Alert.alert('Workout in Progress', `"${activeWorkout.title}" is still active.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Resume', onPress: navigateToLogger },
      { text: 'Discard & Start New', style: 'destructive', onPress: confirmDiscardAndStartNew },
    ]);
  };

  // -- Reorder mode (M3-03, 04 §1) — see file header for the design. ---
  const [reorderMode, setReorderMode] = useState(false);

  const handleRoutineDrop = (dragged: RoutineDragData, target: RoutineDropTarget): void => {
    dragReorder(); // 07 §8 "Drag reorder pickup/drop" → impactLight, drop half.
    const plan = computeRoutineReorderPlan(routines, dragged, target);
    if (plan.orderedIds === null) return; // Dropped back where it already was.
    const orderedIds = plan.orderedIds;
    const persist = async (): Promise<void> => {
      // `moveToFolder` then `reorderRoutines` on the destination scope —
      // exactly the composition `data/routines/types.ts`'s header
      // prescribes for a cross-folder drag-drop.
      if (plan.crossFolder) {
        await routineRepository.moveToFolder(dragged.routineId, plan.targetFolderId);
      }
      await routineRepository.reorderRoutines(plan.targetFolderId, orderedIds);
    };
    persist()
      .then(invalidateRoutineQueries)
      .catch(() => reportError('This routine could not be reordered. Please try again.'));
  };

  const handleFolderDrop = (draggedFolderId: number, beforeFolderId: number | null): void => {
    dragReorder();
    const orderedIds = computeFolderReorderIds(folders, draggedFolderId, beforeFolderId);
    if (orderedIds === null) return;
    routineRepository
      .reorderFolders(orderedIds)
      .then(invalidateRoutineQueries)
      .catch(() => reportError('These folders could not be reordered. Please try again.'));
  };

  // -- Folder mutations -----------------------------------------------
  const [folderNameSheet, setFolderNameSheet] = useState<FolderNameSheetState>(null);
  const [folderActionsFolder, setFolderActionsFolder] = useState<RoutineFolder | null>(null);

  const handleCreateFolder = (): void => setFolderNameSheet({ mode: 'create' });

  const handleFolderNameSave = (title: string): void => {
    const mode = folderNameSheet;
    if (mode == null) return;
    if (mode.mode === 'create') {
      routineRepository
        .createFolder({ title })
        .then(invalidateRoutineQueries)
        .catch(() => reportError('This folder could not be created. Please try again.'));
    } else {
      routineRepository
        .renameFolder(mode.folder.id, title)
        .then(invalidateRoutineQueries)
        .catch(() => reportError('This folder could not be renamed. Please try again.'));
    }
  };

  const handleToggleCollapsed = (folder: RoutineFolder): void => {
    routineRepository
      .setFolderCollapsed(folder.id, !folder.collapsed)
      .then(invalidateRoutineQueries)
      .catch(() => reportError('This folder could not be updated. Please try again.'));
  };

  const handleFolderReorderPress = (): void => {
    setFolderActionsFolder(null);
    setReorderMode(true);
  };

  const performDeleteFolder = (folder: RoutineFolder, mode: 'cascade' | 'moveToMyRoutines'): void => {
    routineRepository
      .deleteFolder(folder.id, { mode })
      .then(invalidateRoutineQueries)
      .catch(() => reportError('This folder could not be deleted. Please try again.'));
  };

  const handleDeleteFolderPress = (folder: RoutineFolder): void => {
    const count = routines.filter((routine) => routine.folderId === folder.id).length;
    Alert.alert(
      'Delete Folder?',
      `"${folder.title}" has ${count} routine${count === 1 ? '' : 's'}. What should happen to ${
        count === 1 ? 'it' : 'them'
      }?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Keep Routines', onPress: () => performDeleteFolder(folder, 'moveToMyRoutines') },
        {
          text: `Delete ${count} Routine${count === 1 ? '' : 's'} Too`,
          style: 'destructive',
          onPress: () => performDeleteFolder(folder, 'cascade'),
        },
      ],
    );
  };

  // -- Routine mutations / navigation seams ----------------------------
  const [routineActions, setRoutineActions] = useState<RoutineSummary | null>(null);
  const [moveToFolderRoutine, setMoveToFolderRoutine] = useState<RoutineSummary | null>(null);

  const handleCreateRoutine = (): void => {
    // Seam for M3-04 (routine editor route, not built yet) — see file
    // header.
    router.push('/routine/new' as never);
  };

  const handleStartRoutine = (routine: RoutineSummary): void => {
    setRoutineActions(null);
    // Seam for M3-05 (starting a routine for real, not built yet) — see
    // file header.
    router.push(`/routine/${routine.id}/start` as never);
  };

  const handleEditRoutine = (routine: RoutineSummary): void => {
    setRoutineActions(null);
    // Seam for M3-04 (routine editor route, not built yet) — see file
    // header.
    router.push(`/routine/${routine.id}/edit` as never);
  };

  const handleDuplicateRoutine = (routine: RoutineSummary): void => {
    setRoutineActions(null);
    routineRepository
      .duplicate(routine.id)
      .then(invalidateRoutineQueries)
      .catch(() => reportError('This routine could not be duplicated. Please try again.'));
  };

  const handleRoutineReorderPress = (): void => {
    setRoutineActions(null);
    setReorderMode(true);
  };

  const handleMoveToFolderPress = (routine: RoutineSummary): void => {
    setRoutineActions(null);
    setMoveToFolderRoutine(routine);
  };

  const handleMoveToFolderSelect = (folderId: number | null): void => {
    if (!moveToFolderRoutine) return;
    routineRepository
      .moveToFolder(moveToFolderRoutine.id, folderId)
      .then(invalidateRoutineQueries)
      .catch(() => reportError('This routine could not be moved. Please try again.'));
  };

  const performDeleteRoutine = (routine: RoutineSummary): void => {
    routineRepository
      .delete(routine.id)
      .then(invalidateRoutineQueries)
      .catch(() => reportError('This routine could not be deleted. Please try again.'));
  };

  const handleDeleteRoutinePress = (routine: RoutineSummary): void => {
    setRoutineActions(null);
    Alert.alert('Delete Routine?', `Delete "${routine.title}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => performDeleteRoutine(routine) },
    ]);
  };

  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: colors.bg.base }}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing['8'] }}>
        <Text
          style={[
            typography.display,
            { color: colors.text.primary, paddingHorizontal: spacing['4'], paddingTop: spacing['4'] },
          ]}
        >
          Workout
        </Text>

        <View style={{ paddingHorizontal: spacing['4'], marginTop: spacing['5'] }}>
          <Text style={[typography.title3, { color: colors.text.primary, marginBottom: spacing['3'] }]}>
            Quick Start
          </Text>
          <Button
            testID="start-empty-workout"
            label="+ Start Empty Workout"
            variant="primary"
            size="lg"
            onPress={handleStartEmptyPress}
          />
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: spacing['4'],
            marginTop: spacing['6'],
            marginBottom: spacing['3'],
          }}
        >
          <Text style={[typography.title3, { color: colors.text.primary }]}>Routines</Text>
          {reorderMode ? (
            <Pressable
              testID="reorder-done-button"
              accessibilityRole="button"
              accessibilityLabel="Done reordering"
              hitSlop={8}
              onPress={() => setReorderMode(false)}
            >
              <Text style={[typography.headline, { color: colors.accent.text }]}>Done</Text>
            </Pressable>
          ) : (
            <View style={{ flexDirection: 'row', gap: spacing['4'] }}>
              <Pressable
                testID="new-folder-button"
                accessibilityRole="button"
                accessibilityLabel="New folder"
                hitSlop={8}
                onPress={handleCreateFolder}
              >
                <FolderPlus size={22} strokeWidth={1.75} color={colors.accent.text} />
              </Pressable>
              <Pressable
                testID="new-routine-button"
                accessibilityRole="button"
                accessibilityLabel="New routine"
                hitSlop={8}
                onPress={handleCreateRoutine}
              >
                <Plus size={22} strokeWidth={1.75} color={colors.accent.text} />
              </Pressable>
            </View>
          )}
        </View>

        {isEmpty ? (
          <EmptyState
            testID="routines-empty-state"
            icon={<Dumbbell size={40} strokeWidth={1.75} color={colors.text.tertiary} />}
            title="No routines yet"
            caption="Create a routine or start an empty workout."
            cta={
              <Button
                testID="routines-empty-create-routine"
                label="+ New Routine"
                variant="tonal"
                onPress={handleCreateRoutine}
              />
            }
          />
        ) : (
          <View style={{ paddingHorizontal: spacing['4'] }}>
            <DropProvider>
              {sections.map((section) => (
                <FolderSection
                  key={section.folder?.id ?? 'my-routines'}
                  folder={section.folder}
                  routines={section.routines}
                  // 04 §1: "My Routines" only reads as its own header when a
                  // real folder also exists — see `buildFolderSections`'s doc
                  // comment / this file's header for the full reasoning.
                  showHeader={section.folder !== null || folders.length > 0}
                  previewByRoutineId={previewByRoutineId}
                  onToggleCollapsed={handleToggleCollapsed}
                  onFolderMenuPress={setFolderActionsFolder}
                  onStartRoutine={handleStartRoutine}
                  onRoutineMenuPress={setRoutineActions}
                  reorderMode={reorderMode}
                  onRoutineDragStart={dragReorder}
                  onRoutineDrop={handleRoutineDrop}
                  onFolderDragStart={dragReorder}
                  onFolderDrop={handleFolderDrop}
                />
              ))}
            </DropProvider>
          </View>
        )}
      </ScrollView>

      <FolderNameSheet
        testID="folder-name-sheet"
        visible={folderNameSheet != null}
        onDismiss={() => setFolderNameSheet(null)}
        title={folderNameSheet?.mode === 'rename' ? 'Rename Folder' : 'New Folder'}
        initialValue={folderNameSheet?.mode === 'rename' ? folderNameSheet.folder.title : ''}
        onSave={handleFolderNameSave}
      />

      {folderActionsFolder ? (
        <RoutineActionsSheet
          testID="folder-actions-sheet"
          visible
          onDismiss={() => setFolderActionsFolder(null)}
          items={[
            {
              key: 'rename',
              label: 'Rename',
              onPress: () => {
                const folder = folderActionsFolder;
                setFolderActionsFolder(null);
                setFolderNameSheet({ mode: 'rename', folder });
              },
            },
            { key: 'reorder', label: 'Reorder', onPress: handleFolderReorderPress },
            {
              key: 'delete',
              label: 'Delete',
              destructive: true,
              onPress: () => {
                const folder = folderActionsFolder;
                setFolderActionsFolder(null);
                handleDeleteFolderPress(folder);
              },
            },
          ]}
        />
      ) : null}

      {routineActions ? (
        <RoutineActionsSheet
          testID="routine-actions-sheet"
          visible
          onDismiss={() => setRoutineActions(null)}
          items={[
            { key: 'start', label: 'Start Routine', onPress: () => handleStartRoutine(routineActions) },
            { key: 'edit', label: 'Edit', onPress: () => handleEditRoutine(routineActions) },
            { key: 'duplicate', label: 'Duplicate', onPress: () => handleDuplicateRoutine(routineActions) },
            {
              key: 'move',
              label: 'Move to Folder',
              onPress: () => handleMoveToFolderPress(routineActions),
            },
            { key: 'reorder', label: 'Reorder', onPress: handleRoutineReorderPress },
            {
              key: 'delete',
              label: 'Delete',
              destructive: true,
              onPress: () => handleDeleteRoutinePress(routineActions),
            },
          ]}
        />
      ) : null}

      <MoveToFolderSheet
        testID="move-to-folder-sheet"
        visible={moveToFolderRoutine != null}
        onDismiss={() => setMoveToFolderRoutine(null)}
        folders={folders}
        currentFolderId={moveToFolderRoutine?.folderId ?? null}
        onSelect={handleMoveToFolderSelect}
      />
    </View>
  );
}
