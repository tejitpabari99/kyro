/**
 * Pure, framework-free reorder-math helpers for `RoutinesHubScreen`'s
 * drag-reorder mode (M3-03, 04 §1: "Reorder mode: drag handles; routines
 * reorder within/between folders; folders reorder among themselves. Order
 * persists via `index` columns."). Kept out of the screen/`FolderSection`
 * components — same "screen/component owns rendering, a sibling module owns
 * pure logic" split `routine-hub-model.ts` already establishes for this
 * feature — so the actual position math is unit-testable without RNTL or a
 * real drag gesture (neither is available for the cross-folder-move case in
 * this headless sandbox, see `docs/plan/BLOCKERS.md`'s M3-03 entry).
 *
 * `RoutinesHubScreen.tsx`'s header documents *why* `react-native-reanimated-dnd`
 * (M3-03's spike winner) is wired the way it is; this file only owns the
 * "given the current routines/folders and a drop, what should the final
 * order be, and does anything actually need persisting" question — the
 * screen then translates a non-null result into the exact
 * `RoutineRepository.moveToFolder`/`reorderRoutines`/`reorderFolders` calls
 * `types.ts`'s header already prescribes for a cross-folder drag ("composes
 * both calls at the UI layer: `moveToFolder` then `reorderRoutines` on the
 * destination scope").
 */
import type { RoutineFolder, RoutineSummary } from '@/data/routines/types';

/** A routine card's drag payload — carries its *current* folder scope so a drop handler can tell a same-folder reorder from a cross-folder move without re-reading screen state. */
export interface RoutineDragData {
  kind: 'routine';
  routineId: string;
  folderId: number | null;
}

/** A folder header's drag payload. */
export interface FolderDragData {
  kind: 'folder';
  folderId: number;
}

/** The union every `Droppable<...>` in this feature is typed against — a drop zone only ever receives one `Draggable`'s `data`, but doesn't know ahead of time whether it was a routine or a folder being dragged, so every `onDrop` discriminates on `.kind` (folder-shaped drops on a routine row are ignored, and vice versa — see `FolderSection.tsx`). */
export type ReorderDragData = RoutineDragData | FolderDragData;

/** Where a dragged routine was released. `beforeRoutineId: null` = append at the end of `targetFolderId`'s scope (dropped on the folder's own header/empty area rather than on another card). */
export interface RoutineDropTarget {
  targetFolderId: number | null;
  beforeRoutineId: string | null;
}

/** The result of {@link computeRoutineReorderPlan} — `orderedIds: null` means the drop was a no-op (dropped back where it already was) and the caller should skip every repository call. */
export interface RoutineReorderPlan {
  /** `true` when the routine's folder membership itself changes — the caller must call `moveToFolder` before `reorderRoutines`. */
  crossFolder: boolean;
  targetFolderId: number | null;
  orderedIds: string[] | null;
}

function arraysEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function scopeIdsInOrder(routines: readonly RoutineSummary[], folderId: number | null): string[] {
  return routines
    .filter((routine) => routine.folderId === folderId)
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((routine) => routine.id);
}

/**
 * Computes the final routine-id order for `target.targetFolderId`'s scope
 * once `dragged` lands there, given the routine list's *current* (pre-drop)
 * state. Handles both a same-folder position swap and a cross-folder move —
 * in both cases the dragged id is removed from wherever it currently sits
 * in the target scope's ordering (a no-op if it wasn't already there, i.e.
 * the cross-folder case) and reinserted immediately before
 * `target.beforeRoutineId` (or appended if `null` or not found in scope —
 * "not found" covers a stale id from a concurrent edit, same defensive
 * fallback `reorderRoutines`'s own strict-permutation contract expects the
 * caller to never hand it in the first place, but computing an append here
 * instead of throwing keeps this function total).
 */
export function computeRoutineReorderPlan(
  routines: readonly RoutineSummary[],
  dragged: RoutineDragData,
  target: RoutineDropTarget,
): RoutineReorderPlan {
  const crossFolder = dragged.folderId !== target.targetFolderId;

  const destinationIds = scopeIdsInOrder(routines, target.targetFolderId).filter(
    (id) => id !== dragged.routineId,
  );

  let insertAt = target.beforeRoutineId != null ? destinationIds.indexOf(target.beforeRoutineId) : -1;
  if (insertAt === -1) insertAt = destinationIds.length;

  const orderedIds = destinationIds.slice();
  orderedIds.splice(insertAt, 0, dragged.routineId);

  if (!crossFolder) {
    const currentIds = scopeIdsInOrder(routines, dragged.folderId);
    if (arraysEqual(currentIds, orderedIds)) {
      return { crossFolder: false, targetFolderId: target.targetFolderId, orderedIds: null };
    }
  }

  return { crossFolder, targetFolderId: target.targetFolderId, orderedIds };
}

/**
 * Computes the final folder-id order once `draggedFolderId` is dropped
 * immediately before `beforeFolderId` (`null` = append at the end — dropped
 * past the last header). Returns `null` (no-op) when the resulting order is
 * identical to the current one, same "skip every repository call" contract
 * as {@link computeRoutineReorderPlan}.
 */
export function computeFolderReorderIds(
  folders: readonly RoutineFolder[],
  draggedFolderId: number,
  beforeFolderId: number | null,
): number[] | null {
  const currentIds = folders
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((folder) => folder.id);

  const remainingIds = currentIds.filter((id) => id !== draggedFolderId);
  let insertAt = beforeFolderId != null ? remainingIds.indexOf(beforeFolderId) : -1;
  if (insertAt === -1) insertAt = remainingIds.length;

  const orderedIds = remainingIds.slice();
  orderedIds.splice(insertAt, 0, draggedFolderId);

  return arraysEqual(currentIds, orderedIds) ? null : orderedIds;
}
