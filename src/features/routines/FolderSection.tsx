/**
 * `FolderSection` (M3-02, 04 §1) — one collapsible folder header (chevron,
 * title, routine count, ⋯) plus its routine cards; also renders the
 * implicit "My Routines" bucket (`folder: null`) as a plain, non-collapsible
 * header (no chevron/⋯ — there is nothing to rename/reorder/delete/collapse
 * about it, and no `routine_folders` row backs it to persist a collapse
 * state against, see `RoutinesHubScreen.tsx`'s header) or, per
 * `showHeader={false}`, no header row at all (the zero-real-folders case).
 *
 * **Reorder mode (M3-03)** — `react-native-reanimated-dnd` wiring lives
 * here (not in `RoutineCard`/`RoutinesHubScreen`, see those files' own
 * headers for the split). Two independent drag/drop pairs, both typed
 * against the shared `ReorderDragData` union (`routine-reorder.ts`) so a
 * single `Droppable` can discriminate a routine-shaped drop from a
 * folder-shaped one on `.kind`:
 *
 * - **Routine rows**: each visible `RoutineCard` is wrapped in a
 *   `Droppable` (`routine-drop-<id>` — "insert the dragged routine
 *   immediately before this card, into this card's folder") wrapping a
 *   `Draggable` (`routine-<id>` — this card itself can be picked up). A
 *   folder-shaped drop landing on a routine row is a no-op (folders reorder
 *   against other folder headers only, never against a routine card).
 * - **Folder header**: wrapped in a `Droppable` (`folder-drop-<id or
 *   'my-routines'>`) that accepts *both* shapes — a routine-shaped drop
 *   means "append this routine to this folder" (`beforeRoutineId: null`,
 *   the coarse "drop on the folder generally" case, also how you move a
 *   routine into an otherwise-empty folder or particular position isn't
 *   important); a folder-shaped drop means "reorder folders — insert the
 *   dragged folder immediately before this header." "My Routines" (`folder
 *   === null`) only gets the routine-accepting half — it isn't a real
 *   `routine_folders` row, so it can never itself be dragged or be a
 *   folder-reorder target (mirrors the existing disabled
 *   collapse-toggle/⋯ treatment immediately above this comment block).
 *
 * `RoutinesHubScreen.tsx` owns turning a drop into the actual
 * `RoutineRepository` calls (via `routine-reorder.ts`'s pure position math)
 * plus the `impactLight` pickup/drop haptic (`onDragStart`/`onDrop` both
 * call back up) — this component only translates gesture events into
 * normalized `RoutineDropTarget`/folder-reorder callbacks.
 */
import React from 'react';
import { ChevronDown, ChevronRight, Ellipsis, GripVertical } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';
import { Draggable, Droppable } from 'react-native-reanimated-dnd';

import type { RoutineFolder, RoutineSummary } from '@/data/routines/types';
import { useTheme } from '@/ui/theme-provider';

import { RoutineCard } from './RoutineCard';
import type { FolderDragData, ReorderDragData, RoutineDragData, RoutineDropTarget } from './routine-reorder';

export interface FolderSectionProps {
  folder: RoutineFolder | null;
  routines: RoutineSummary[];
  showHeader: boolean;
  previewByRoutineId: Map<string, string>;
  onToggleCollapsed: (folder: RoutineFolder) => void;
  onFolderMenuPress: (folder: RoutineFolder) => void;
  onStartRoutine: (routine: RoutineSummary) => void;
  onRoutineMenuPress: (routine: RoutineSummary) => void;
  /** M3-03 reorder mode — see file header. Defaults `false` for every existing call site outside `RoutinesHubScreen`'s own tests. */
  reorderMode?: boolean;
  onRoutineDragStart?: () => void;
  onRoutineDrop?: (dragged: RoutineDragData, target: RoutineDropTarget) => void;
  onFolderDragStart?: () => void;
  /** `beforeFolderId: null` = append at the end (dropped past the last header). */
  onFolderDrop?: (draggedFolderId: number, beforeFolderId: number | null) => void;
}

export function FolderSection({
  folder,
  routines,
  showHeader,
  previewByRoutineId,
  onToggleCollapsed,
  onFolderMenuPress,
  onStartRoutine,
  onRoutineMenuPress,
  reorderMode = false,
  onRoutineDragStart,
  onRoutineDrop,
  onFolderDragStart,
  onFolderDrop,
}: FolderSectionProps): React.JSX.Element {
  const { colors, spacing, typography } = useTheme();

  const label = folder?.title ?? 'My Routines';
  const collapsed = folder?.collapsed ?? false;
  const sectionTestId = folder ? `folder-section-${folder.id}` : 'folder-section-my-routines';
  const folderDroppableId = folder ? `folder-drop-${folder.id}` : 'folder-drop-my-routines';

  const handleFolderZoneDrop = (data: ReorderDragData): void => {
    if (data.kind === 'routine') {
      onRoutineDrop?.(data, { targetFolderId: folder?.id ?? null, beforeRoutineId: null });
    } else if (folder && data.folderId !== folder.id) {
      onFolderDrop?.(data.folderId, folder.id);
    }
  };

  const headerRow = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing['2'],
      }}
    >
      <Pressable
        testID={`${sectionTestId}-toggle`}
        accessibilityRole="button"
        accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${label}`}
        disabled={folder == null || reorderMode}
        hitSlop={8}
        onPress={() => {
          if (folder) onToggleCollapsed(folder);
        }}
        style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
      >
        {folder ? (
          collapsed ? (
            <ChevronRight size={18} strokeWidth={1.75} color={colors.text.secondary} />
          ) : (
            <ChevronDown size={18} strokeWidth={1.75} color={colors.text.secondary} />
          )
        ) : null}
        <Text
          style={[typography.headline, { color: colors.text.primary, marginLeft: folder ? spacing['1'] : 0 }]}
        >
          {label}
        </Text>
        <Text style={[typography.footnote, { color: colors.text.tertiary, marginLeft: spacing['2'] }]}>
          {routines.length}
        </Text>
      </Pressable>
      {folder && !reorderMode ? (
        <Pressable
          testID={`${sectionTestId}-menu`}
          accessibilityRole="button"
          accessibilityLabel={`More actions for ${label}`}
          hitSlop={8}
          onPress={() => onFolderMenuPress(folder)}
        >
          <Ellipsis size={20} strokeWidth={1.75} color={colors.text.secondary} />
        </Pressable>
      ) : null}
      {folder && reorderMode ? (
        <Draggable.Handle>
          <View testID={`${sectionTestId}-drag-handle`} hitSlop={8} style={{ padding: spacing['1'] }}>
            <GripVertical size={20} strokeWidth={1.75} color={colors.text.secondary} />
          </View>
        </Draggable.Handle>
      ) : null}
    </View>
  );

  const folderDragData: FolderDragData | null = folder ? { kind: 'folder', folderId: folder.id } : null;

  return (
    <View testID={sectionTestId} style={{ marginBottom: spacing['4'] }}>
      {showHeader ? (
        reorderMode ? (
          <Droppable<ReorderDragData> droppableId={folderDroppableId} onDrop={handleFolderZoneDrop}>
            {folder ? (
              <Draggable<FolderDragData>
                data={folderDragData!}
                draggableId={`folder-${folder.id}`}
                onDragStart={onFolderDragStart}
              >
                {headerRow}
              </Draggable>
            ) : (
              headerRow
            )}
          </Droppable>
        ) : (
          headerRow
        )
      ) : null}

      {!collapsed
        ? routines.map((routine) => {
            if (!reorderMode) {
              return (
                <RoutineCard
                  key={routine.id}
                  testID={`routine-card-${routine.id}`}
                  routine={routine}
                  preview={previewByRoutineId.get(routine.id) ?? ''}
                  onStart={() => onStartRoutine(routine)}
                  onMenuPress={() => onRoutineMenuPress(routine)}
                />
              );
            }

            const routineDragData: RoutineDragData = {
              kind: 'routine',
              routineId: routine.id,
              folderId: routine.folderId,
            };

            return (
              <Droppable<ReorderDragData>
                key={routine.id}
                droppableId={`routine-drop-${routine.id}`}
                onDrop={(data) => {
                  if (data.kind === 'routine' && data.routineId !== routine.id) {
                    onRoutineDrop?.(data, { targetFolderId: routine.folderId, beforeRoutineId: routine.id });
                  }
                }}
              >
                <Draggable<RoutineDragData>
                  data={routineDragData}
                  draggableId={`routine-${routine.id}`}
                  onDragStart={onRoutineDragStart}
                >
                  <RoutineCard
                    testID={`routine-card-${routine.id}`}
                    routine={routine}
                    preview={previewByRoutineId.get(routine.id) ?? ''}
                    onStart={() => onStartRoutine(routine)}
                    onMenuPress={() => onRoutineMenuPress(routine)}
                    reorderMode
                    dragHandle={
                      <Draggable.Handle>
                        <View
                          testID={`routine-card-${routine.id}-drag-handle`}
                          hitSlop={8}
                          style={{ padding: spacing['1'] }}
                        >
                          <GripVertical size={20} strokeWidth={1.75} color={colors.text.secondary} />
                        </View>
                      </Draggable.Handle>
                    }
                  />
                </Draggable>
              </Droppable>
            );
          })
        : null}
    </View>
  );
}
