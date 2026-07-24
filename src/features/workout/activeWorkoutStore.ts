/**
 * `activeWorkoutStore` (M2-03) — 06 §4 item 1 / §5.3 / §9: "the only complex
 * store. Holds the full active workout object ... every mutation is an
 * action that (a) updates the in-memory draft optimistically and (b) awaits
 * the matching `WorkoutRepository` mutator in the same call; on repo
 * failure the action rolls back and surfaces an error toast (§9). SQLite is
 * the durable copy — the store rehydrates from `WorkoutRepository.getActive()`
 * on cold start. No store-level persistence middleware needed (DB *is* the
 * persistence)."
 *
 * ## Shape: `createActiveWorkoutStore()` factory + `useActiveWorkoutStore` singleton
 *
 * Mirrors `settingsStore.ts` (M0-10) exactly: a factory so tests (and the
 * crash-safety suite's "drop the store, rehydrate a fresh one" kill
 * simulation, 08 §4.9) can construct independent store instances backed by
 * the same underlying database, plus one app-wide singleton
 * (`useActiveWorkoutStore`) for real call sites. `rehydrate(repository)`
 * both binds the repository (kept in a closure, exactly like
 * `settingsStore`'s `load(repository)` keeps its own `repository` variable)
 * and performs the cold-start `getActive()` read in one call — every other
 * action requires `rehydrate()` to have run first (same "throw a clear
 * error rather than silently drop the write" convention `settingsStore
 * .setSetting` established for its own pre-`load()` guard).
 *
 * **Repository construction site:** `workout-repository.ts`'s own header
 * says the real `onAutoHeal` -> `src/lib/sentry.ts` wiring "happens where
 * the repository is constructed — `src/features/workout/activeWorkoutStore.ts`
 * (M2-03), which is allowed to depend on both `src/data` and `src/lib`."
 * Read literally that could mean this *file* constructs the
 * `WorkoutRepositoryImpl` singleton itself; this implementation instead
 * keeps `rehydrate(repository: WorkoutRepository)` **parameterized**,
 * exactly mirroring `settingsStore.load(repository)` — the established,
 * already-tested pattern for "this store is handed its repository by the
 * root-layout boot sequence, not by constructing one internally." The real
 * `new WorkoutRepositoryImpl(getAppDriver(), { onAutoHeal: ... })` call
 * (with `onAutoHeal` wired to `recordBreadcrumb`/`captureError`) belongs at
 * that boot call site (`app/_layout.tsx`, alongside `SettingsRepository`'s
 * own construction) — this file only needs the `WorkoutRepository`
 * *interface*, which keeps it trivially testable against fakes/failing
 * drivers without ever importing `WorkoutRepositoryImpl` itself.
 *
 * ## Optimistic-draft vs. "write, then reflect" (read before adding an action)
 *
 * Two different update shapes live here, both satisfying 06 §4.1's "update
 * the draft AND await the matching repo mutator in the same call":
 *
 *  1. **True optimistic + rollback** — every mutator whose target row(s)
 *     already have a known id (`updateSet`, `setSetType`, `setCompleted`,
 *     `removeSet`, `removeExercise`, `reorderExercises`, `replaceExercise`,
 *     `updateExercise`, `updateMeta`, `discard`, `finish`): the draft is
 *     mutated *before* the `await`, a snapshot of the prior draft is kept,
 *     and a thrown repo error restores that exact snapshot plus sets
 *     `error` (a typed {@link DataError}, 06 §9) and reports it via
 *     `captureError` — the crash-safety suite's "rollback-on-repo-failure"
 *     case (08 §4.9) exercises this path with an injected failing driver.
 *  2. **Write, then reflect** — `startEmpty`, `addExercises`, `addSet`:
 *     these mint brand-new row ids *inside* the repository call
 *     (`generateUuid()`, `src/data/shared/uuid.ts`) that this store cannot
 *     predict beforehand, so there is no id to optimistically draft against
 *     — the repository call happens first and its canonical response
 *     becomes the new draft slice. This is still "write-through per
 *     action" (06 §5.3: on-device SQLite writes are sub-millisecond, so the
 *     perceptible-latency motivation for pre-write optimism doesn't apply
 *     here anyway) — a thrown error here simply surfaces `error` with the
 *     draft left exactly as it was (nothing to roll back, since nothing was
 *     drafted yet).
 *
 * Every action reconciles its slice of the draft with the repository's own
 * canonical response on success (never just "trusts" the optimistic value)
 * — the repository is always the source of truth once its call resolves.
 *
 * ## Per-set/per-exercise selectors (06 §8 perf discipline)
 *
 * Every mutation helper below is **structural-sharing immutable**: it
 * rebuilds only the `WorkoutFull` -> `WorkoutExerciseFull` -> `WorkoutSet`
 * spine from the root down to the one changed node, reusing every sibling
 * object/array reference untouched by that particular action. Combined with
 * Zustand's default `Object.is` selector equality, that is what makes
 * {@link selectWorkoutSet}/{@link selectWorkoutExercise} below genuinely
 * cheap: a component subscribed via
 * `useActiveWorkoutStore(selectWorkoutSet(setId))` only re-renders when
 * *that* set's own object identity changes, never on an edit to a sibling
 * set or a different exercise — the exact "SetRow subscribes only to its
 * own slice" shape 06 §8 asks for, ready for M2-06's `SetRow` (not built
 * yet — this task only has to make the store's shape support the pattern).
 */
import { create, type StoreApi, type UseBoundStore } from 'zustand';

import type {
  AddExerciseItem,
  FinishMeta,
  NewSetInput,
  PreviousSetsQuery,
  PreviousSet,
  UpdateExerciseInput,
  UpdateMetaInput,
  UpdateSetInput,
  WorkoutExerciseFull,
  WorkoutFull,
  WorkoutRepository,
  WorkoutSet,
} from '@/data/workouts/types';
import type { SetType } from '@/domain/enums';
import { captureError, recordBreadcrumb } from '@/lib/sentry';

// ---------------------------------------------------------------------------
// DataError — 06 §9's "typed DataError"
// ---------------------------------------------------------------------------

/**
 * Wraps any error thrown by a `WorkoutRepository` mutator so the store's
 * public `error` field has one stable, typed shape regardless of which
 * repository method (or which of its several named `Error` subclasses,
 * `src/data/workouts/errors.ts`) actually threw — 06 §9: "Repository
 * errors ... typed `DataError`; store actions roll back optimistic state,
 * show retryable error toast." `action` names the store action that failed
 * (e.g. `'setCompleted'`) for the future toast copy / breadcrumb; `cause`
 * keeps the original error reachable for logging/debugging without
 * widening this class's own `message` contract.
 */
export class DataError extends Error {
  constructor(
    message: string,
    public readonly action: string,
    public readonly cause: unknown,
  ) {
    super(message);
    this.name = 'DataError';
  }
}

/** Wrap `error` (thrown by a repo mutator) as a {@link DataError}; already-wrapped errors pass through unchanged (idempotent — a `DataError` never gets double-wrapped, e.g. if a future caller re-surfaces one action's error through another). Exported for direct unit coverage of that idempotency; every store action above calls this internally too. */
export function toDataError(error: unknown, action: string): DataError {
  if (error instanceof DataError) {
    return error;
  }
  const detail = error instanceof Error ? error.message : String(error);
  return new DataError(`${action} failed: ${detail}`, action, error);
}

// ---------------------------------------------------------------------------
// Structural-sharing immutable update helpers (internal)
// ---------------------------------------------------------------------------

/** Renumber `sets` to contiguous 0-based `position`, preserving order — mirrors `WorkoutRepositoryImpl`'s `renumberSetPositions`. Reuses each set's own reference when its position doesn't actually change. */
function renumberSets(sets: WorkoutSet[]): WorkoutSet[] {
  return sets.map((s, index) => (s.position === index ? s : { ...s, position: index }));
}

/** Renumber `exercises` to contiguous 0-based `position`, preserving order — mirrors `WorkoutRepositoryImpl`'s `renumberExercisePositions`. */
function renumberExercises(exercises: WorkoutExerciseFull[]): WorkoutExerciseFull[] {
  return exercises.map((ex, index) => (ex.position === index ? ex : { ...ex, position: index }));
}

/** Replace one exercise (by id) in `workout.exercises` via `updater`; every other exercise keeps its exact prior reference. No-op (same `workout` reference) if `workoutExerciseId` isn't found. */
function withExercise(
  workout: WorkoutFull,
  workoutExerciseId: string,
  updater: (exercise: WorkoutExerciseFull) => WorkoutExerciseFull,
): WorkoutFull {
  let changed = false;
  const exercises = workout.exercises.map((exercise) => {
    if (exercise.id !== workoutExerciseId) {
      return exercise;
    }
    changed = true;
    return updater(exercise);
  });
  return changed ? { ...workout, exercises } : workout;
}

/** Replace one set (by id, searched across every exercise) via `updater`; every other set/exercise keeps its exact prior reference. */
function withSet(
  workout: WorkoutFull,
  setId: string,
  updater: (set: WorkoutSet) => WorkoutSet,
): WorkoutFull {
  let changed = false;
  const exercises = workout.exercises.map((exercise) => {
    const index = exercise.sets.findIndex((s) => s.id === setId);
    if (index === -1) {
      return exercise;
    }
    changed = true;
    const sets = exercise.sets.slice();
    sets[index] = updater(sets[index]!);
    return { ...exercise, sets };
  });
  return changed ? { ...workout, exercises } : workout;
}

function findExerciseForSet(workout: WorkoutFull, setId: string): WorkoutExerciseFull | undefined {
  return workout.exercises.find((exercise) => exercise.sets.some((s) => s.id === setId));
}

// ---------------------------------------------------------------------------
// Store shape
// ---------------------------------------------------------------------------

export interface ActiveWorkoutState {
  /** The active workout draft, or `null` when none is active. Durable copy is SQLite — this is a read-through/write-through mirror of it. */
  workout: WorkoutFull | null;
  /** `true` once `rehydrate()` has resolved at least once. */
  loaded: boolean;
  /** The most recent repo-mutator failure, or `null`. Cleared automatically at the start of the next action and via {@link clearError}. */
  error: DataError | null;

  /** Bind `repository` and load the current active workout (06 §5.1 cold-start step; call once at boot, before any other action). Safe to call again (e.g. a manual "resume" after a boot error retry). */
  rehydrate: (repository: WorkoutRepository) => Promise<void>;
  /** Clear a surfaced {@link DataError} (e.g. the toast's dismiss action). */
  clearError: () => void;

  // --- Lifecycle ---------------------------------------------------------
  startEmpty: (input: { title: string; startTime: number }) => Promise<WorkoutFull | null>;
  discard: () => Promise<void>;
  finish: (meta?: FinishMeta) => Promise<WorkoutFull | null>;

  // --- Exercises -----------------------------------------------------------
  addExercises: (items: AddExerciseItem[]) => Promise<WorkoutExerciseFull[]>;
  removeExercise: (workoutExerciseId: string) => Promise<void>;
  reorderExercises: (orderedWorkoutExerciseIds: string[]) => Promise<void>;
  replaceExercise: (workoutExerciseId: string, newExerciseId: string) => Promise<void>;
  updateExercise: (workoutExerciseId: string, patch: UpdateExerciseInput) => Promise<void>;

  // --- Sets ------------------------------------------------------------
  addSet: (workoutExerciseId: string, input?: NewSetInput) => Promise<WorkoutSet | null>;
  /** M2-16 (02 §12): inserts `rows` above the exercise's existing sets — see `WorkoutRepository.insertWarmupSets`'s doc comment for the exact positioning contract. */
  addWarmUpSets: (
    workoutExerciseId: string,
    rows: NewSetInput[],
  ) => Promise<WorkoutExerciseFull | null>;
  updateSet: (setId: string, patch: UpdateSetInput) => Promise<void>;
  removeSet: (setId: string) => Promise<void>;
  setSetType: (setId: string, setType: SetType) => Promise<void>;
  setCompleted: (setId: string, isCompleted: boolean) => Promise<void>;

  // --- Meta ------------------------------------------------------------
  updateMeta: (patch: UpdateMetaInput) => Promise<void>;

  // --- Read-only pass-through (no draft/DB write — a plain repo query) ---
  previousSets: (exerciseId: string, opts?: PreviousSetsQuery) => Promise<PreviousSet[]>;
}

/** Build a fresh, independent active-workout store — see file header for why this is a factory. */
export function createActiveWorkoutStore(): UseBoundStore<StoreApi<ActiveWorkoutState>> {
  let repository: WorkoutRepository | undefined;

  function requireRepository(): WorkoutRepository {
    if (!repository) {
      throw new Error(
        'activeWorkoutStore action called before rehydrate() — boot must call rehydrate() first (06 §5.1).',
      );
    }
    return repository;
  }

  return create<ActiveWorkoutState>((set, get) => {
    /** Require an active draft workout, or throw — every mutator below targets the currently active workout. */
    function requireWorkout(action: string): WorkoutFull {
      const { workout } = get();
      if (!workout) {
        throw new Error(`activeWorkoutStore.${action}() called with no active workout.`);
      }
      return workout;
    }

    return {
      workout: null,
      loaded: false,
      error: null,

      async rehydrate(nextRepository) {
        repository = nextRepository;
        recordBreadcrumb('workout.rehydrate');
        const workout = await nextRepository.getActive();
        set({ workout, loaded: true, error: null });
      },

      clearError() {
        set({ error: null });
      },

      // ---------------------------------------------------------------
      // Lifecycle
      // ---------------------------------------------------------------

      async startEmpty(input) {
        const repo = requireRepository();
        recordBreadcrumb('workout.startEmpty');
        set({ error: null });
        try {
          const workout = await repo.startEmpty(input);
          set({ workout });
          return workout;
        } catch (error) {
          const dataError = toDataError(error, 'startEmpty');
          set({ error: dataError });
          captureError(error);
          return null;
        }
      },

      async discard() {
        const repo = requireRepository();
        const previous = requireWorkout('discard');
        recordBreadcrumb('workout.discard');
        set({ workout: null, error: null });
        try {
          await repo.discard(previous.id);
        } catch (error) {
          const dataError = toDataError(error, 'discard');
          set({ workout: previous, error: dataError });
          captureError(error);
        }
      },

      async finish(meta) {
        const repo = requireRepository();
        const previous = requireWorkout('finish');
        recordBreadcrumb('workout.finish');
        set({ workout: null, error: null });
        try {
          return await repo.finish(previous.id, meta);
        } catch (error) {
          const dataError = toDataError(error, 'finish');
          set({ workout: previous, error: dataError });
          captureError(error);
          return null;
        }
      },

      // ---------------------------------------------------------------
      // Exercises
      // ---------------------------------------------------------------

      async addExercises(items) {
        const repo = requireRepository();
        requireWorkout('addExercises');
        recordBreadcrumb('workout.addExercises');
        set({ error: null });
        try {
          const added = await repo.addExercises(get().workout!.id, items);
          set((state) =>
            state.workout
              ? { workout: { ...state.workout, exercises: [...state.workout.exercises, ...added] } }
              : state,
          );
          return added;
        } catch (error) {
          const dataError = toDataError(error, 'addExercises');
          set({ error: dataError });
          captureError(error);
          return [];
        }
      },

      async removeExercise(workoutExerciseId) {
        const repo = requireRepository();
        const previous = requireWorkout('removeExercise');
        recordBreadcrumb('workout.removeExercise');
        const optimistic: WorkoutFull = {
          ...previous,
          exercises: renumberExercises(
            previous.exercises.filter((exercise) => exercise.id !== workoutExerciseId),
          ),
        };
        set({ workout: optimistic, error: null });
        try {
          await repo.removeExercise(previous.id, workoutExerciseId);
        } catch (error) {
          const dataError = toDataError(error, 'removeExercise');
          set({ workout: previous, error: dataError });
          captureError(error);
        }
      },

      async reorderExercises(orderedWorkoutExerciseIds) {
        const repo = requireRepository();
        const previous = requireWorkout('reorderExercises');
        recordBreadcrumb('workout.reorderExercises');

        const byId = new Map(previous.exercises.map((exercise) => [exercise.id, exercise]));
        const isExactPermutation =
          orderedWorkoutExerciseIds.length === previous.exercises.length &&
          new Set(orderedWorkoutExerciseIds).size === orderedWorkoutExerciseIds.length &&
          orderedWorkoutExerciseIds.every((id) => byId.has(id));

        if (isExactPermutation) {
          const reordered = orderedWorkoutExerciseIds.map((id) => byId.get(id)!);
          set({
            workout: { ...previous, exercises: renumberExercises(reordered) },
            error: null,
          });
        } else {
          // Let the repository be the one to reject a malformed id list
          // (`ReorderMismatchError`) rather than silently no-op-ing here —
          // the catch block below restores `previous` either way.
          set({ error: null });
        }

        try {
          await repo.reorderExercises(previous.id, orderedWorkoutExerciseIds);
        } catch (error) {
          const dataError = toDataError(error, 'reorderExercises');
          set({ workout: previous, error: dataError });
          captureError(error);
        }
      },

      async replaceExercise(workoutExerciseId, newExerciseId) {
        const repo = requireRepository();
        const previous = requireWorkout('replaceExercise');
        recordBreadcrumb('workout.replaceExercise');
        const optimistic = withExercise(previous, workoutExerciseId, (exercise) => ({
          ...exercise,
          exerciseId: newExerciseId,
          sets: exercise.sets.map((s) => ({
            ...s,
            setType: 'normal',
            weightKg: null,
            reps: null,
            distanceMeters: null,
            durationSeconds: null,
            rpe: null,
            customMetric: null,
            isCompleted: false,
          })),
        }));
        set({ workout: optimistic, error: null });
        try {
          const canonical = await repo.replaceExercise(workoutExerciseId, newExerciseId);
          set((state) =>
            state.workout
              ? { workout: withExercise(state.workout, workoutExerciseId, () => canonical) }
              : state,
          );
        } catch (error) {
          const dataError = toDataError(error, 'replaceExercise');
          set({ workout: previous, error: dataError });
          captureError(error);
        }
      },

      async updateExercise(workoutExerciseId, patch) {
        const repo = requireRepository();
        const previous = requireWorkout('updateExercise');
        recordBreadcrumb('workout.updateExercise');
        const optimistic = withExercise(previous, workoutExerciseId, (exercise) => ({
          ...exercise,
          notes: patch.notes !== undefined ? patch.notes : exercise.notes,
          restSeconds: patch.restSeconds !== undefined ? patch.restSeconds : exercise.restSeconds,
          supersetId: patch.supersetId !== undefined ? patch.supersetId : exercise.supersetId,
        }));
        set({ workout: optimistic, error: null });
        try {
          const canonical = await repo.updateExercise(workoutExerciseId, patch);
          set((state) =>
            state.workout
              ? { workout: withExercise(state.workout, workoutExerciseId, () => canonical) }
              : state,
          );
        } catch (error) {
          const dataError = toDataError(error, 'updateExercise');
          set({ workout: previous, error: dataError });
          captureError(error);
        }
      },

      // ---------------------------------------------------------------
      // Sets
      // ---------------------------------------------------------------

      async addSet(workoutExerciseId, input) {
        const repo = requireRepository();
        requireWorkout('addSet');
        recordBreadcrumb('workout.addSet');
        set({ error: null });
        try {
          const added = await repo.addSet(workoutExerciseId, input);
          set((state) =>
            state.workout
              ? {
                  workout: withExercise(state.workout, workoutExerciseId, (exercise) => ({
                    ...exercise,
                    sets: [...exercise.sets, added],
                  })),
                }
              : state,
          );
          return added;
        } catch (error) {
          const dataError = toDataError(error, 'addSet');
          set({ error: dataError });
          captureError(error);
          return null;
        }
      },

      async addWarmUpSets(workoutExerciseId, rows) {
        const repo = requireRepository();
        requireWorkout('addWarmUpSets');
        recordBreadcrumb('workout.addWarmUpSets');
        set({ error: null });
        try {
          // "Write, then reflect" (file header) — `insertWarmupSets` mints
          // new row ids itself and also renumbers every existing sibling
          // set's `position`, so its canonical `WorkoutExerciseFull`
          // response (not just the new rows) becomes the new draft slice,
          // exactly like `replaceExercise`/`updateExercise` already do.
          const canonical = await repo.insertWarmupSets(workoutExerciseId, rows);
          set((state) =>
            state.workout
              ? { workout: withExercise(state.workout, workoutExerciseId, () => canonical) }
              : state,
          );
          return canonical;
        } catch (error) {
          const dataError = toDataError(error, 'addWarmUpSets');
          set({ error: dataError });
          captureError(error);
          return null;
        }
      },

      async updateSet(setId, patch) {
        const repo = requireRepository();
        const previous = requireWorkout('updateSet');
        recordBreadcrumb('workout.updateSet');
        const optimistic = withSet(previous, setId, (s) => ({
          ...s,
          weightKg: patch.weightKg !== undefined ? patch.weightKg : s.weightKg,
          reps: patch.reps !== undefined ? patch.reps : s.reps,
          distanceMeters: patch.distanceMeters !== undefined ? patch.distanceMeters : s.distanceMeters,
          durationSeconds:
            patch.durationSeconds !== undefined ? patch.durationSeconds : s.durationSeconds,
          rpe: patch.rpe !== undefined ? patch.rpe : s.rpe,
          customMetric: patch.customMetric !== undefined ? patch.customMetric : s.customMetric,
        }));
        set({ workout: optimistic, error: null });
        try {
          const canonical = await repo.updateSet(setId, patch);
          set((state) =>
            state.workout ? { workout: withSet(state.workout, setId, () => canonical) } : state,
          );
        } catch (error) {
          const dataError = toDataError(error, 'updateSet');
          set({ workout: previous, error: dataError });
          captureError(error);
        }
      },

      async removeSet(setId) {
        const repo = requireRepository();
        const previous = requireWorkout('removeSet');
        recordBreadcrumb('workout.removeSet');
        const owner = findExerciseForSet(previous, setId);
        if (!owner) {
          throw new Error(`activeWorkoutStore.removeSet(): set "${setId}" not found in the active workout.`);
        }
        const optimistic = withExercise(previous, owner.id, (exercise) => ({
          ...exercise,
          sets: renumberSets(exercise.sets.filter((s) => s.id !== setId)),
        }));
        set({ workout: optimistic, error: null });
        try {
          await repo.removeSet(setId);
        } catch (error) {
          const dataError = toDataError(error, 'removeSet');
          set({ workout: previous, error: dataError });
          captureError(error);
        }
      },

      async setSetType(setId, setType) {
        const repo = requireRepository();
        const previous = requireWorkout('setSetType');
        recordBreadcrumb('workout.setSetType');
        set({ workout: withSet(previous, setId, (s) => ({ ...s, setType })), error: null });
        try {
          const canonical = await repo.setSetType(setId, setType);
          set((state) =>
            state.workout ? { workout: withSet(state.workout, setId, () => canonical) } : state,
          );
        } catch (error) {
          const dataError = toDataError(error, 'setSetType');
          set({ workout: previous, error: dataError });
          captureError(error);
        }
      },

      async setCompleted(setId, isCompleted) {
        const repo = requireRepository();
        const previous = requireWorkout('setCompleted');
        recordBreadcrumb('workout.setCompleted');
        set({ workout: withSet(previous, setId, (s) => ({ ...s, isCompleted })), error: null });
        try {
          const canonical = await repo.setCompleted(setId, isCompleted);
          set((state) =>
            state.workout ? { workout: withSet(state.workout, setId, () => canonical) } : state,
          );
        } catch (error) {
          const dataError = toDataError(error, 'setCompleted');
          set({ workout: previous, error: dataError });
          captureError(error);
        }
      },

      // ---------------------------------------------------------------
      // Meta
      // ---------------------------------------------------------------

      async updateMeta(patch) {
        const repo = requireRepository();
        const previous = requireWorkout('updateMeta');
        recordBreadcrumb('workout.updateMeta');
        const optimistic: WorkoutFull = {
          ...previous,
          title: patch.title !== undefined ? patch.title : previous.title,
          description: patch.description !== undefined ? patch.description : previous.description,
          startTime: patch.startTime !== undefined ? patch.startTime : previous.startTime,
          endTime: patch.endTime !== undefined ? patch.endTime : previous.endTime,
          durationPauseOffsetMs:
            patch.durationPauseOffsetMs !== undefined
              ? patch.durationPauseOffsetMs
              : previous.durationPauseOffsetMs,
        };
        set({ workout: optimistic, error: null });
        try {
          const canonical = await repo.updateMeta(previous.id, patch);
          set({ workout: canonical });
        } catch (error) {
          const dataError = toDataError(error, 'updateMeta');
          set({ workout: previous, error: dataError });
          captureError(error);
        }
      },

      // ---------------------------------------------------------------
      // Read-only
      // ---------------------------------------------------------------

      async previousSets(exerciseId, opts) {
        const repo = requireRepository();
        return repo.previousSets(exerciseId, opts);
      },
    };
  });
}

/** The one active-workout store used by the real app (boot's `rehydrate()` call, the logger screens, `GlobalWorkoutBar`). */
export const useActiveWorkoutStore = createActiveWorkoutStore();

// ---------------------------------------------------------------------------
// Per-set/per-exercise selectors (06 §8) — see file header.
// ---------------------------------------------------------------------------

/** `useActiveWorkoutStore(selectActiveWorkout)` — the whole draft (or `null`). Coarsest-grained selector; prefer {@link selectWorkoutExercise}/{@link selectWorkoutSet} inside a per-row component. */
export function selectActiveWorkout(state: ActiveWorkoutState): WorkoutFull | null {
  return state.workout;
}

/** Curried selector: `useActiveWorkoutStore(selectWorkoutExercise(workoutExerciseId))` re-renders only when that exercise's own object identity changes (add/remove/reorder of *other* exercises, or edits to *other* exercises' sets, never touch this reference). */
export function selectWorkoutExercise(
  workoutExerciseId: string,
): (state: ActiveWorkoutState) => WorkoutExerciseFull | null {
  return (state) =>
    state.workout?.exercises.find((exercise) => exercise.id === workoutExerciseId) ?? null;
}

/** Curried selector: `useActiveWorkoutStore(selectWorkoutSet(setId))` — the per-set subscription a future `SetRow` (M2-06) uses so typing/checking one row never re-renders any other row. */
export function selectWorkoutSet(setId: string): (state: ActiveWorkoutState) => WorkoutSet | null {
  return (state) => {
    if (!state.workout) {
      return null;
    }
    for (const exercise of state.workout.exercises) {
      const found = exercise.sets.find((s) => s.id === setId);
      if (found) {
        return found;
      }
    }
    return null;
  };
}

/** `useActiveWorkoutStore(selectActiveWorkoutError)` — the current {@link DataError}, or `null`; the shape a toast component reads. */
export function selectActiveWorkoutError(state: ActiveWorkoutState): DataError | null {
  return state.error;
}
