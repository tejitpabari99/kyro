/**
 * `WorkoutRepository`'s public shapes (M2-01/M2-02, extended M4-02) — 05 §6's
 * interface, scoped to exactly what's implemented so far. 05 §6 also lists
 * `update` (edit a past workout wholesale, M4-05/`02` §15) and
 * `workoutDates` (calendar, M4-06) — those are deliberately **not** on this
 * interface yet; they land with the tasks that first need them and get
 * added here then, per that section's own "verbatim signatures, simplified"
 * framing (it documents the interface's *eventual* end state, not a
 * contract every milestone must implement in one shot — exactly how
 * `startFromRoutine` below is present as a stub per M2-01's task text but
 * not implemented until M3-05). `setsForExercise` (records/charts feed) was
 * the one 05 §6 method deliberately kept off entirely through M2/M3 since
 * nothing referenced it even as a stub — M4-02 is the task that first needs
 * it, so it (plus `exerciseHistoryWatermark`, a genuinely new addition on
 * top of 05 §6's own list — see its own doc comment below) lands here now.
 *
 * Field naming mirrors `src/data/sqlite/schema.ts`'s `workouts` /
 * `workout_exercises` / `sets` tables (05 §3.2) field-for-field, camelCase
 * here — the repository implementation owns the snake_case mapping at the
 * SQL boundary, exactly like `src/data/exercises/types.ts` does for
 * `exercises`.
 */
import type { Rpe, SetType } from '@/domain/enums';
import type { HistoricalSet } from '@/domain/records';

/** One row of the `sets` table (05 §3.2), decoded into TS-native shapes. */
export interface WorkoutSet {
  id: string;
  position: number;
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  rpe: Rpe | null;
  customMetric: number | null;
  isCompleted: boolean;
  /**
   * M3-06 review fix: this row's fixed 0-based position among the source
   * `routine_exercise`'s own `routine_sets` (`position ASC`), pinned once
   * by `startFromRoutine` at creation time — the same "pin it at creation
   * time, immune to later renumbering" precedent
   * `WorkoutExerciseFull.routineOccurrenceIndex` established, applied one
   * level down because `finish()`'s `renumberSetPositions` can compact
   * `position` around a skipped non-trailing set, breaking any plain
   * `sets[i] <-> routine_sets[i]` positional correlation. `null` for any
   * set with no routine counterpart (`addSet`/`insertWarmupSets`
   * mid-workout, or a `replaceExercise`d exercise's sets). See
   * `domain/routine-diff.ts`'s file header ("Set correlation") for the full
   * write-up.
   */
  routineSetPosition: number | null;
}

/** One row of the `workout_exercises` table (05 §3.2), hydrated with its `sets` in position order. */
export interface WorkoutExerciseFull {
  id: string;
  workoutId: string;
  exerciseId: string;
  position: number;
  supersetId: number | null;
  notes: string | null;
  restSeconds: number | null;
  /**
   * M3-05 review fix: this row's fixed 0-based occurrence index among the
   * source routine's own exercises sharing `exerciseId`, pinned once by
   * `startFromRoutine` at creation time — immune to later `reorderExercises`
   * calls, unlike a live "current position order" computation (which broke
   * routine-target matching for duplicated exercises after a mid-workout
   * reorder; see `ActiveWorkoutScreen.tsx`'s file header). `null` for any
   * exercise not created from a routine occurrence — added via
   * `addExercises`, or an original routine-sourced row whose identity later
   * changed via `replaceExercise` — so it can never be mistaken for a match
   * against a routine occurrence it didn't actually come from.
   */
  routineOccurrenceIndex: number | null;
  sets: WorkoutSet[];
}

/** A full `workouts` row (05 §3.2) hydrated with its exercises (each hydrated with its sets), in position order — the shape `getActive`/`getFull`/`startEmpty`/`finish` return. */
export interface WorkoutFull {
  id: string;
  title: string;
  description: string | null;
  routineId: string | null;
  state: 'active' | 'completed';
  startTime: number;
  endTime: number | null;
  durationPauseOffsetMs: number;
  createdAt: number;
  updatedAt: number;
  exercises: WorkoutExerciseFull[];
}

/**
 * The lightweight row `listCompleted` returns — deliberately **not**
 * hydrated with exercises/sets (05 §4's query-performance note: "History
 * pagination: `idx_workouts_start` + per-workout hydrate (2 queries/page via
 * `IN` batching)" — that batched hydrate is a later History-screen concern,
 * M4; M2's minimal-history caller, M2-14, can hydrate on demand via
 * `getFull` per row it actually renders).
 */
export interface WorkoutSummary {
  id: string;
  title: string;
  description: string | null;
  routineId: string | null;
  startTime: number;
  endTime: number | null;
  durationPauseOffsetMs: number;
  createdAt: number;
  updatedAt: number;
}

/** `WorkoutRepository.listCompleted`'s paging input (05 §6). */
export interface ListCompletedPage {
  /** Only workouts with `start_time` strictly before this epoch-ms value. */
  before?: number;
  /** Default 20 (matches `06` §8's History FlashList page size). */
  limit?: number;
}

/** `WorkoutRepository.finish`'s meta input (05 §6 `FinishMeta`, 02 §14's save sheet: editable title/description/start-time/duration). `endTime` defaults to "now" when omitted; `duration_pause_offset_ms` is edited separately via `updateMeta` (02 §2's duration sheet), not here. */
export interface FinishMeta {
  title?: string;
  description?: string | null;
  startTime?: number;
  endTime?: number;
}

/** `WorkoutRepository.addExercises`'s per-item input (02 §3). Row/set-count pre-creation is computed internally (02 §3: "same number of set rows as its most recent performance, else one empty normal set") — callers only supply exercise identity + this workout-local slot's own fields. */
export interface AddExerciseItem {
  exerciseId: string;
  supersetId?: number | null;
  notes?: string | null;
  /** Defaults from Settings → Default Rest Timer at add-time (02 §3) — resolved by the caller (store), not this repository, since `src/data` has no settings dependency. */
  restSeconds?: number | null;
}

/** `WorkoutRepository.addSet`'s input — every field optional; omitted value fields stay `NULL` (a bare unchecked row). */
export type NewSetInput = Partial<{
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  rpe: Rpe | null;
  customMetric: number | null;
}>;

/**
 * `WorkoutRepository.updateSet`'s patch — value fields only (`setType` and
 * `isCompleted` are separate mutators, `setSetType`/`setCompleted`, per 05
 * §6's own split). A key's absence (`undefined`) means "leave unchanged";
 * an explicit `null` clears that field — mirrors
 * `ExerciseRepositoryImpl.update`'s `patch.field !== undefined` convention.
 */
export type UpdateSetInput = Partial<{
  weightKg: number | null;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  rpe: Rpe | null;
  customMetric: number | null;
}>;

/** `WorkoutRepository.updateExercise`'s patch (notes / rest timer / superset grouping, 05 §6). Same undefined-vs-null convention as {@link UpdateSetInput}. */
export type UpdateExerciseInput = Partial<{
  notes: string | null;
  restSeconds: number | null;
  supersetId: number | null;
}>;

/** `WorkoutRepository.updateMeta`'s patch (title / times / pause offset, 05 §6, 02 §2's duration sheet). Same undefined-vs-null convention. */
export type UpdateMetaInput = Partial<{
  title: string;
  description: string | null;
  startTime: number;
  endTime: number | null;
  durationPauseOffsetMs: number;
}>;

/**
 * `WorkoutRepository.previousSets`'s query options. 05 §6 lists this as
 * `{routineId?; beforeWorkoutId?}` ("verbatim signatures, simplified" per
 * that section's own header) — `occurrenceIndex` is an intentional addition
 * on top of that simplified shape, required to actually implement 02
 * §16.6's "duplicate exercise twice in one workout ... PREVIOUS matches by
 * occurrence order (1st card ↔ 1st occurrence last session, etc.)": without
 * it there is no way to ask "give me the *second* occurrence of exercise X
 * in its most recent completed workout" for a workout that currently has X
 * added twice. 0-based, default 0 (first/only occurrence — the common
 * case). `beforeWorkoutId`: restricts the search to completed workouts
 * strictly at-or-before that workout's own `start_time` and excludes that
 * workout's own id — the "editing a past workout" case (M2-15/`02` §15),
 * where PREVIOUS must not reference the workout being edited itself or
 * anything chronologically after it. Unknown/absent `beforeWorkoutId`
 * degrades to no restriction (documented on the implementation).
 */
export interface PreviousSetsQuery {
  routineId?: string;
  beforeWorkoutId?: string;
  occurrenceIndex?: number;
}

/**
 * One reference set from `previousSets` (02 §6/§16.6). `bucketIndex` is the
 * 0-based position of this set **within its own type bucket** (warm-up sets
 * are numbered separately from non-warm-up sets, 02 §6: "warm-up rows
 * reference the previous session's warm-up sets by warm-up index") — the
 * caller matches a current-row's own bucket-relative index (its working-set
 * number for non-warm-ups, or its warm-up index for warm-ups) against this
 * field, not against `position`. `setType` is the previous set's own type,
 * carried through for display-formatting decisions (`04` M2-04's
 * `previous-values.ts`) — it does not have to equal the current row's type.
 */
export interface PreviousSet {
  bucketIndex: number;
  isWarmup: boolean;
  setType: SetType;
  weightKg: number | null;
  reps: number | null;
  distanceMeters: number | null;
  durationSeconds: number | null;
  rpe: Rpe | null;
  customMetric: number | null;
}

/**
 * M2-01's slice of the workout repository interface — active-workout
 * lifecycle. Split from {@link WorkoutRepositoryMutators} (M2-02) purely so
 * `WorkoutRepositoryImpl` can `implements WorkoutRepositoryLifecycle` and
 * compile cleanly as a standalone M2-01 commit before the M2-02 mutator
 * methods exist on the class — mirrors how `ExerciseRepository`'s
 * `hasLoggedSets` was added to that interface later, at M1-10, rather than
 * everything being declared upfront in M1-06. {@link WorkoutRepository}
 * below is the merged interface the rest of the app (M2-03 onward) actually
 * consumes.
 */
export interface WorkoutRepositoryLifecycle {
  getActive(): Promise<WorkoutFull | null>;
  startEmpty(input: { title: string; startTime: number }): Promise<WorkoutFull>;
  /**
   * M3-05 (02 §1, §6; 04 §2.3; 05 §3.3/§6): creates an active workout
   * pre-populated from `routineId` — exercises in position order
   * (`exerciseId`/`supersetId`/`notes`/`restSeconds` copied verbatim), each
   * exercise's `routine_sets` copied as bare **unchecked** `sets` rows
   * (`setType`/`position` only — every value field `NULL`, matching
   * `addExercises`'s row-creation shape; see `workout-repository.ts`'s
   * header for why targets themselves are never stored on `sets`).
   * `title` = the routine's title, `description` = the routine's `notes`
   * (02 §1's "routine note pre-fills each run" — mid-workout edits touch
   * only `workouts.description`, never `routines.notes`), `routine_id` set.
   * Same one-active-workout invariant as `startEmpty` (throws
   * {@link ActiveWorkoutExistsError}); throws
   * `RoutineNotFoundForWorkoutError` (`./errors.ts`) when `routineId`
   * doesn't resolve to a `routines` row.
   */
  startFromRoutine(routineId: string): Promise<WorkoutFull>;
  /**
   * M3-07 (02 §1: "Repeat Workout — same as routine start but sourced from
   * a past workout"): creates an active workout pre-populated from
   * `sourceWorkoutId`'s own current structure — exercises in position
   * order (`exerciseId`/`supersetId`/`notes`/`restSeconds` copied
   * verbatim), each exercise's surviving `sets` copied as bare
   * **unchecked** rows (`setType`/`position` only — every value field
   * `NULL`, the identical "targets are a live-render concern, never baked
   * onto `sets`" convention {@link startFromRoutine} already established).
   * `title`/`description` copied from the source workout's own
   * `title`/`description`. **`routine_id` is always `NULL`** on the new
   * workout — a repeat is sourced from a workout, not a routine, so there
   * is no routine to record (a deliberate scope choice, documented in
   * `workout-repository.ts`'s header). Placeholders showing the source
   * workout's own achieved values need no special wiring here: with
   * `routineId` null, `ExerciseSetTableSection`'s PREVIOUS lookup always
   * runs in any_workout mode, which naturally resolves to the source
   * workout (the most recent completed workout containing each exercise)
   * — see that file's own `previousSets` query condition. Same one-active-
   * workout invariant as `startEmpty`/`startFromRoutine` (throws
   * {@link ActiveWorkoutExistsError}); throws `WorkoutNotFoundError`
   * (`./errors.ts`) when `sourceWorkoutId` doesn't resolve to a
   * (non-soft-deleted) `workouts` row.
   */
  startFromWorkout(sourceWorkoutId: string): Promise<WorkoutFull>;
  discard(id: string): Promise<void>;
  finish(id: string, meta?: FinishMeta): Promise<WorkoutFull>;
  getFull(id: string): Promise<WorkoutFull | null>;
  listCompleted(page?: ListCompletedPage): Promise<WorkoutSummary[]>;
  softDelete(id: string): Promise<void>;
}

/** M2-02's slice of the workout repository interface — granular mutators + `previousSets`. See {@link WorkoutRepositoryLifecycle}'s header for why this is split out. */
export interface WorkoutRepositoryMutators {
  addExercises(workoutId: string, items: AddExerciseItem[]): Promise<WorkoutExerciseFull[]>;
  removeExercise(workoutId: string, workoutExerciseId: string): Promise<void>;
  reorderExercises(workoutId: string, orderedWorkoutExerciseIds: string[]): Promise<void>;
  replaceExercise(workoutExerciseId: string, newExerciseId: string): Promise<WorkoutExerciseFull>;
  addSet(workoutExerciseId: string, input?: NewSetInput): Promise<WorkoutSet>;
  /**
   * `WorkoutRepository.insertWarmupSets` (M2-16, 02 §12) — inserts `rows`
   * (typically `setType: 'warmup'`, but not enforced — any `NewSetInput[]`
   * works) **above** every existing set of `workoutExerciseId`: the new
   * rows land at positions `0..rows.length-1` and every pre-existing set
   * shifts down by `rows.length`, ids/relative order otherwise untouched.
   * Unlike `addSet` (always appends at the end), this is the one mutator
   * that inserts at the *front* — "Add Warm-Up Sets ... generated `W` rows
   * inserted above existing sets" (02 §12) needs exactly that, and nothing
   * else in the M2 feature set does. Returns the exercise's full,
   * re-hydrated `WorkoutExerciseFull` (every set, new positions included)
   * rather than just the new rows, since the caller's draft needs to
   * reflect every shifted sibling's new `position` too — same "canonical
   * response becomes the new draft slice" shape `addExercises` already
   * uses (`activeWorkoutStore`'s file header, "write, then reflect").
   * `rows.length === 0` is a no-op read (returns the exercise unchanged).
   */
  insertWarmupSets(workoutExerciseId: string, rows: NewSetInput[]): Promise<WorkoutExerciseFull>;
  updateSet(setId: string, patch: UpdateSetInput): Promise<WorkoutSet>;
  removeSet(setId: string): Promise<void>;
  setSetType(setId: string, setType: SetType): Promise<WorkoutSet>;
  setCompleted(setId: string, isCompleted: boolean): Promise<WorkoutSet>;
  updateExercise(workoutExerciseId: string, patch: UpdateExerciseInput): Promise<WorkoutExerciseFull>;
  updateMeta(workoutId: string, patch: UpdateMetaInput): Promise<WorkoutFull>;
  previousSets(exerciseId: string, opts?: PreviousSetsQuery): Promise<PreviousSet[]>;
  /**
   * `WorkoutRepository.setsForExercise` (M4-02, 05 §6's own "records/charts
   * feed" — the exact method `domain/records.ts`'s file header names as the
   * caller that scopes `HistoricalSet[]` to one exercise before ever
   * reaching the pure PR engine). Every set from every **completed,
   * non-deleted** workout containing `exerciseId`
   * (`workouts.state = 'completed' AND deleted_at IS NULL` — an active
   * workout's own sets are never eligible for PRs, 04 §5.2's "checked...
   * sets" only ever means finished history), ordered
   * `(workoutStartTime, setOrder)` per `domain/records.ts`'s own sort
   * contract. `setOrder` here is this repository's own 0-based index in
   * that exact traversal order (`workouts.start_time ASC,
   * workout_exercises.position ASC, sets.position ASC`), not raw
   * `sets.position` alone — `sets.position` is only unique **within one
   * `workout_exercises` occurrence**, so a duplicated-exercise-in-one-
   * workout case (two `workout_exercises` rows sharing `exerciseId` inside
   * the same workout) would otherwise produce two sets both claiming
   * `setOrder 0`. A synthetic, strictly-increasing index across the whole
   * already-sorted result still satisfies `domain/records.ts`'s own
   * contract verbatim ("only relative order among sets of the *same*
   * workout needs to be correct — values don't need to be globally unique
   * across different workouts").
   */
  setsForExercise(exerciseId: string): Promise<HistoricalSet[]>;
  /**
   * `WorkoutRepository.exerciseHistoryWatermark` (M4-02 addition, not in 05
   * §6's own list — `06` §4.4's "memoized per-exercise cache keyed by
   * `updated_at` watermark" needs a cheap fact this interface didn't
   * otherwise expose) — the single cheapest signal
   * `RecordsService` (`src/features/stats/records-service.ts`) needs to
   * answer "has anything that could move this exercise's PRs changed since
   * I last computed its snapshot": `0` when no *currently non-deleted*
   * completed workout references `exerciseId`; otherwise the max
   * `workouts.updated_at` across **every** completed workout that ever
   * referenced `exerciseId`, deleted or not (M4-02 review fix — see
   * `WorkoutRepositoryImpl.exerciseHistoryWatermark`'s own comment for why
   * a plain `MAX(updated_at) WHERE deleted_at IS NULL` under-invalidates: a
   * `softDelete` of a workout that never held the per-exercise max
   * `updated_at` would otherwise leave the watermark completely unchanged
   * even though that workout's sets just left history — a real stale-cache
   * bug, not a hypothetical one). `workouts.updated_at` is exactly the
   * column every mutation that can move a PR touches — `finish`, the
   * eventual M4-05 `update` (edit past workout), `softDelete` (which always
   * bumps its own row's `updated_at` too, specifically so its deletion is
   * never invisible to this aggregate) — while in-progress
   * `sets`/`workout_exercises` mutations on an *active* workout never bump
   * it (05 §3.2's own DDL has no `updated_at` column on either table), and
   * correctly never invalidate anything: an active workout's own sets
   * aren't part of PR history until `finish()` commits them. One indexed
   * query (`idx_we_exercise` + `idx_workouts_start`, 05 §4) — orders of
   * magnitude cheaper than re-fetching and re-folding every historical set
   * via {@link setsForExercise}, which is the entire point of checking this
   * first.
   */
  exerciseHistoryWatermark(exerciseId: string): Promise<number>;
}

/**
 * The workout repository interface — the M2 subset of 05 §6's full
 * `WorkoutRepository` (see this file's header for what's deferred and why).
 */
export interface WorkoutRepository extends WorkoutRepositoryLifecycle, WorkoutRepositoryMutators {}

/** One auto-heal event (06 §9) — reported via {@link WorkoutRepositoryDeps.onAutoHeal} when `getActive` finds more than one active workout and resolves it. */
export interface AutoHealEvent {
  keptWorkoutId: string;
  healedWorkoutIds: string[];
}

/**
 * Constructor deps for `WorkoutRepositoryImpl`. `onAutoHeal` is the seam for
 * the 06 §9 "log to Sentry as warning" requirement: `src/data` cannot import
 * `src/lib/sentry.ts` directly (06 §2's dependency-direction rule — data
 * depends on domain only), so the repository accepts an injectable reporter
 * instead and defaults to a `console.warn`. The real wiring (`src/lib/sentry`'s
 * `recordBreadcrumb`/`captureError`) happens where the repository is
 * constructed — `src/features/workout/activeWorkoutStore.ts` (M2-03), which
 * is allowed to depend on both `src/data` and `src/lib`.
 */
export interface WorkoutRepositoryDeps {
  onAutoHeal?: (event: AutoHealEvent) => void;
}
