/**
 * `RoutineRepository`'s public shapes (M3-01) — 05 §3.3/§6, following the
 * same field-naming convention every sibling repository uses:
 * `src/data/sqlite/schema.ts`'s `routine_folders`/`routines`/
 * `routine_exercises`/`routine_sets` tables map field-for-field to the
 * camelCase interfaces below; the repository implementation owns the
 * snake_case mapping at the SQL boundary (mirrors `ExerciseRepository`'s
 * `types.ts` and `WorkoutRepository`'s `types.ts`).
 *
 * 05 §6 documents `RoutineRepository` only loosely ("folders + routines
 * CRUD, reorder, duplicate, createFromWorkout(workoutId),
 * updateFromWorkout(routineId, workoutId), getFull(id)") — unlike
 * `WorkoutRepository`/`ExerciseRepository`, it gives no verbatim method
 * list. The concrete shape below is this task's own design, filling that
 * gap per `TASKS-INDEX.md`'s "fix the task file when you notice" rule (see
 * `docs/plan/EXECUTION-LOG.md`'s M3-01 entry for the reasoning). Two
 * deliberate design choices worth calling out up front:
 *
 * - **Folder moves are a separate primitive from same-folder reorder.**
 *   `moveToFolder(id, folderId)` relocates one routine to a (possibly
 *   different) folder, appending it at that scope's end; `reorderRoutines
 *   (folderId, orderedIds)` is a strict-permutation reorder *within one
 *   folder scope only* (exactly `WorkoutRepositoryMutators.reorderExercises`'s
 *   pattern — reject anything that isn't an exact permutation of that
 *   scope's current members). A cross-folder drag-drop (04 §1: "routines
 *   reorder within/between folders") composes both calls at the UI layer
 *   (`moveToFolder` then `reorderRoutines` on the destination scope) rather
 *   than this repository trying to guess a caller's intent from a partial
 *   id list that mixes membership-change and order-change semantics.
 * - **`update`'s `exercises` field is replace-all-or-omit**, mirroring
 *   `WorkoutRepository.update`'s existing "edit past workout (replace
 *   content)" shape (05 §6): omitting `exercises` leaves the routine's
 *   structure untouched (a pure title/notes edit); supplying it (even `[]`)
 *   deletes every existing `routine_exercises` row (cascading their
 *   `routine_sets`) and reinserts fresh ones. No granular
 *   add/remove/reorder-single-exercise mutators exist here (unlike
 *   `WorkoutRepositoryMutators`) — the routine editor (M3-04) is a
 *   full-screen modal that saves its whole draft at once, so there is no
 *   caller for finer-grained mutators yet; add them if M3-04 actually needs
 *   them.
 */
import type { SetType } from '@/domain/enums';

/** One row of the `routine_folders` table (05 §3.3). `id` is `INTEGER PRIMARY KEY AUTOINCREMENT` — deliberately NOT the `[sync]` TEXT-uuid form 05's doc narrates as the eventual end state; `src/data/sqlite/schema.ts`'s own header confirms that conversion is MC-03's scope, not M1-01/M3-01's (see this file's header + `docs/plan/EXECUTION-LOG.md`'s M1-01 entry). */
export interface RoutineFolder {
  id: number;
  title: string;
  position: number;
  collapsed: boolean;
  createdAt: number;
  updatedAt: number;
}

/** `RoutineRepository.createFolder`'s input. */
export interface NewRoutineFolderInput {
  title: string;
}

/** `RoutineRepository.deleteFolder`'s required mode — the two paths 04 §1's folder-delete choice dialog offers ("Delete N routines too" vs "Keep routines"). */
export type DeleteFolderMode = 'cascade' | 'moveToMyRoutines';

export interface DeleteFolderOptions {
  mode: DeleteFolderMode;
}

/** One row of the `routine_sets` table (05 §3.3) — a TARGET, not a result. `reps` and `repRangeStart`/`repRangeEnd` are mutually exclusive (the `routine_sets_reps_xor_range_check` CHECK, re-enforced at this repository's boundary — see `RepsXorRangeViolationError`). */
export interface RoutineSet {
  id: string;
  position: number;
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  repRangeStart: number | null;
  repRangeEnd: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  customMetric: number | null;
}

/** `RoutineRepository.create`/`update`/`createFromWorkout`'s per-set input — every field optional; omitted fields store `NULL`. */
export type NewRoutineSetInput = Partial<{
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  repRangeStart: number | null;
  repRangeEnd: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  customMetric: number | null;
}>;

/** One row of the `routine_exercises` table (05 §3.3), hydrated with its `routine_sets` targets in position order. */
export interface RoutineExerciseFull {
  id: string;
  routineId: string;
  exerciseId: string;
  position: number;
  supersetId: number | null;
  notes: string | null;
  restSeconds: number | null;
  sets: RoutineSet[];
}

/** `RoutineRepository.create`/`update`/`duplicate` internals' per-exercise input. */
export interface NewRoutineExerciseInput {
  exerciseId: string;
  supersetId?: number | null;
  notes?: string | null;
  restSeconds?: number | null;
  sets: NewRoutineSetInput[];
}

/** A full `routines` row (05 §3.3) hydrated with its exercises (each hydrated with its target sets), in position order — the shape `getFull`/`create`/`update`/`duplicate`/`createFromWorkout` return. */
export interface RoutineFull {
  id: string;
  title: string;
  notes: string | null;
  folderId: number | null;
  position: number;
  createdAt: number;
  updatedAt: number;
  exercises: RoutineExerciseFull[];
}

/** The lightweight row `list`/`get` return — not hydrated with exercises/sets (mirrors `WorkoutSummary`'s reasoning: `getFull` hydrates on demand per row actually rendered). */
export interface RoutineSummary {
  id: string;
  title: string;
  notes: string | null;
  folderId: number | null;
  position: number;
  createdAt: number;
  updatedAt: number;
}

/** `RoutineRepository.list`'s optional filter. `folderId` omitted = every routine (all folders + My Routines, folders first in `position` order then My Routines last per 04 §1's "implicit My Routines section ... always last"); `folderId: null` = My Routines only; `folderId: <number>` = that folder only. */
export interface RoutineListFilter {
  folderId?: number | null;
}

/** `RoutineRepository.create`'s input. `folderId` omitted/`null` = "My Routines". `exercises` omitted = an empty routine (04 §2.1: "zero-exercise routines are allowed but warned" — the warning itself is a UI concern, not this repository's). */
export interface NewRoutineInput {
  title: string;
  notes?: string | null;
  folderId?: number | null;
  exercises?: NewRoutineExerciseInput[];
}

/** `RoutineRepository.update`'s patch. Same undefined-vs-null convention every sibling repository's update method uses (`ExerciseRepositoryImpl.update`, `WorkoutRepositoryImpl.updateSet`/`updateMeta`): a key's absence means "leave unchanged," an explicit `null` (on `notes`) clears it. `exercises`, if present at all (including `[]`), replaces the routine's entire structure — see this file's header. Folder membership is NOT patchable here — use `moveToFolder`. */
export type UpdateRoutineInput = Partial<{
  title: string;
  notes: string | null;
  exercises: NewRoutineExerciseInput[];
}>;

/** `RoutineRepository.createFromWorkout`'s optional overrides — `title` defaults to the source workout's own title (04 §2.2: "Save as Routine ... opens editor for confirm/rename" — the editor is where the user actually renames; this override exists for programmatic callers/tests), `folderId` defaults to "My Routines". */
export interface CreateRoutineFromWorkoutOptions {
  title?: string;
  folderId?: number | null;
}

/**
 * The routine repository interface (M3-01). See this file's header for the
 * two shape decisions (`moveToFolder`/`reorderRoutines` split,
 * replace-all `update.exercises`) and `routine-repository.ts`'s header for
 * per-method implementation notes.
 */
export interface RoutineRepository {
  // -- Folders --------------------------------------------------------
  listFolders(): Promise<RoutineFolder[]>;
  createFolder(input: NewRoutineFolderInput): Promise<RoutineFolder>;
  renameFolder(id: number, title: string): Promise<RoutineFolder>;
  setFolderCollapsed(id: number, collapsed: boolean): Promise<RoutineFolder>;
  /** Deletes a folder. `mode: 'cascade'` also deletes every routine currently in it (and their exercises/sets, via cascade); `mode: 'moveToMyRoutines'` moves them to `folder_id = NULL` first, appended after existing My Routines routines in their current relative order (04 §1's folder-delete choice dialog). */
  deleteFolder(id: number, options: DeleteFolderOptions): Promise<void>;
  /** Reorders folders among themselves (04 §1). `orderedFolderIds` must be an exact permutation of every existing folder id — throws {@link FolderReorderMismatchError} otherwise (`./errors.ts`). */
  reorderFolders(orderedFolderIds: number[]): Promise<void>;

  // -- Routines ---------------------------------------------------------
  list(filter?: RoutineListFilter): Promise<RoutineSummary[]>;
  get(id: string): Promise<RoutineSummary | null>;
  getFull(id: string): Promise<RoutineFull | null>;
  create(input: NewRoutineInput): Promise<RoutineFull>;
  update(id: string, patch: UpdateRoutineInput): Promise<RoutineFull>;
  /** Relocates one routine to `folderId` (`null` = My Routines), appended at that scope's end; renumbers the routine's *previous* scope back to contiguous positions. No-op (still returns the current state) when `folderId` already equals the routine's current folder. */
  moveToFolder(id: string, folderId: number | null): Promise<RoutineFull>;
  /** Reorders routines within one folder scope (`folderId: null` = My Routines) — strict permutation of that scope's current members only; throws {@link RoutineReorderMismatchError} for a missing/extra/foreign id (same contract as `WorkoutRepositoryMutators.reorderExercises`). Use {@link RoutineRepository.moveToFolder} first for a cross-folder move. */
  reorderRoutines(folderId: number | null, orderedRoutineIds: string[]): Promise<void>;
  /** Deep-copies a routine (new uuid, title suffixed `" copy"`, same folder, appended at that scope's end) including every exercise/set/superset grouping, each with fresh uuids. */
  duplicate(id: string): Promise<RoutineFull>;
  /** Hard-deletes the routine (and cascades its exercises/sets). Past `workouts` rows keep their `routine_id` as a soft reference (no FK — 05 §3.3/§3.2) and must render "(deleted routine)" once `get`/`getFull` returns `null` for that id (04 §2.2). */
  delete(id: string): Promise<void>;
  /** Builds a new routine from a workout's current structure — exercises (order, superset grouping, notes, rest timers) and each surviving set's achieved values (weight/reps/distance/duration/type) as fixed targets (never ranges — see `routine-repository.ts`'s header). 04 §2.2 "Save as Routine". */
  createFromWorkout(
    workoutId: string,
    opts?: CreateRoutineFromWorkoutOptions,
  ): Promise<RoutineFull>;
  /**
   * M3-06 (02 §14.4's update-routine prompt write-back, 04 §2.4): replaces
   * `routineId`'s structure with `workoutId`'s own final structure —
   * exercises (order/superset/rest/notes) and each set's achieved values as
   * new targets, preserving an existing rep-range target only when the
   * achieved reps still falls inside it (see `routine-repository.ts`'s own
   * method doc comment for the full rule). `updated_at` bumped; `title`/
   * routine-level `notes` untouched. Throws `WorkoutNotFoundForRoutineError`
   * for an unknown/deleted `workoutId`, `RoutineNotFoundError` for an
   * unknown `routineId`, `WorkoutRoutineMismatchError` (`./errors.ts`) if
   * `workoutId`'s own `routine_id` isn't `routineId`.
   */
  updateFromWorkout(routineId: string, workoutId: string): Promise<RoutineFull>;
}
