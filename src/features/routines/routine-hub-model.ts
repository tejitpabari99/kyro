/**
 * Pure, framework-free helpers for `RoutinesHubScreen` (M3-02, 04 §1) —
 * kept out of the screen component so they're trivially unit-testable
 * without RNTL, matching `exercise-list-model.ts`'s (M1-07) split between
 * "screen owns rendering" and "model owns list-shaping logic."
 */
import type { RoutineFolder, RoutineFull, RoutineSummary } from '@/data/routines/types';

/** One renderable group in the hub's routine list — a real folder, or the implicit "My Routines" bucket (`folder: null`). */
export interface RoutineFolderSection {
  folder: RoutineFolder | null;
  routines: RoutineSummary[];
}

/**
 * Groups `routines` (already folder-position-then-My-Routines-last ordered
 * by `RoutineRepository.list()`'s unfiltered query, 04 §1's "implicit 'My
 * Routines' section ... always last") into per-folder sections, appending
 * an explicit `folder: null` "My Routines" section last whenever there is
 * anything to show there — either because a real folder exists (so "My
 * Routines" needs its own header to read as a distinct bucket, and to stay
 * a valid drop target for a future cross-folder move even while empty) or
 * because there are ungrouped routines to show even with zero folders.
 * When there are zero folders AND zero ungrouped routines, no "My
 * Routines" section is appended at all — the caller's empty state covers
 * that case instead of an empty, headerless bucket.
 */
export function buildFolderSections(
  folders: RoutineFolder[],
  routines: RoutineSummary[],
): RoutineFolderSection[] {
  const sections: RoutineFolderSection[] = folders.map((folder) => ({
    folder,
    routines: routines.filter((routine) => routine.folderId === folder.id),
  }));

  const myRoutines = routines.filter((routine) => routine.folderId === null);
  if (folders.length > 0 || myRoutines.length > 0) {
    sections.push({ folder: null, routines: myRoutines });
  }

  return sections;
}

/**
 * Builds the routine card's 2-line grey preview line (04 §1: "grey preview
 * line of exercise names comma-joined, 2-line clamp") from a hydrated
 * `RoutineFull` (the card's own `getFull` preview query, see
 * `RoutinesHubScreen.tsx`'s header for why `list()` alone can't supply
 * this) plus an id→name lookup built from `ExerciseRepository.list()`.
 * Returns `''` while the preview hasn't loaded yet (`full` undefined) so
 * the caller can render nothing rather than a misleading empty-routine
 * message; returns the "no exercises" copy only once the full row has
 * genuinely loaded with zero exercises.
 */
export function buildExercisePreview(
  full: RoutineFull | null | undefined,
  exerciseNameById: Map<string, string>,
): string {
  if (full == null) return '';
  if (full.exercises.length === 0) return 'No exercises yet';
  return full.exercises
    .map((exercise) => exerciseNameById.get(exercise.exerciseId) ?? 'Unknown exercise')
    .join(', ');
}
