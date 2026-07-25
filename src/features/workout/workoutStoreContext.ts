/**
 * `WorkoutStoreContext` / `EditWorkoutModeContext` (M4-05, 02 §15) — the seam
 * that lets `ConnectedSetRow`/`ExerciseCard`/`ExerciseSetTableSection`/
 * `AddWarmUpSetsSheet` (the shared "full logger" chrome `ActiveWorkoutScreen`
 * assembles) be reused, unchanged in behavior, by `EditWorkoutScreen` — the
 * past-workout editor — **without** either screen ever touching the other's
 * data.
 *
 * Before this file existed, those four components all hardcoded the
 * app-wide `useActiveWorkoutStore` singleton directly (`import {
 * useActiveWorkoutStore } from './activeWorkoutStore'`) — correct for the
 * live logger (there is only ever one real active workout, by the
 * one-active-workout invariant, 05 §3.2), but wrong for editing a *past*,
 * already-`completed` workout: reusing that same singleton for an edit
 * session would mean editing a past workout **is** touching "the" active
 * workout slot, which is exactly the thing 02 §15's "editing while another
 * workout is active is allowed... must not violate one-active invariant"
 * rules out. `EditWorkoutScreen` needs its own, independent
 * `activeWorkoutStore`-shaped instance (`createActiveWorkoutStore()`,
 * already a factory for exactly this "independent instance, same
 * repository-backed shape" reason — see that function's own file-header)
 * loaded via `loadForEdit` (M4-05 addition) rather than `rehydrate`
 * (`getActive()`-bound, i.e. always "the" active workout) — but the shared
 * child components need to read/write *that* instance instead of the
 * singleton whenever they're rendered inside the editor.
 *
 * `WorkoutStoreContext`'s default value is the real singleton
 * (`useActiveWorkoutStore`) — every existing call site (the live
 * `/workout/active` logger, which renders none of these components inside a
 * `<WorkoutStoreContext.Provider>`) keeps reading/writing the singleton
 * exactly as before, with zero code change and zero new provider required.
 * `EditWorkoutScreen` is the **one** place that renders a
 * `<WorkoutStoreContext.Provider value={editStore}>` around this same
 * shared subtree, swapping every descendant's store for its own
 * `loadForEdit`-bound instance.
 *
 * `EditWorkoutModeContext` (default `false`) is the sibling flag
 * `ConnectedSetRow`'s check-handler reads to skip starting a rest timer (02
 * §15: "no rest timers") — the *only* per-check behavior that differs
 * between the two modes (everything else — check/uncheck, value edits,
 * add/remove sets/exercises, reorder, notes, supersets — already works
 * identically against either store instance, since none of
 * `WorkoutRepositoryMutators`'s methods gate on workout `state`).
 */
import { createContext, useContext } from 'react';
import type { StoreApi, UseBoundStore } from 'zustand';

import type { ActiveWorkoutState } from './activeWorkoutStore';
import { useActiveWorkoutStore } from './activeWorkoutStore';

/** The exact bound-store shape `createActiveWorkoutStore()` returns — both the app-wide singleton and any independent instance `EditWorkoutScreen` constructs share this same type. */
export type WorkoutStoreHook = UseBoundStore<StoreApi<ActiveWorkoutState>>;

/** Defaults to the real singleton — see file header. */
export const WorkoutStoreContext = createContext<WorkoutStoreHook>(useActiveWorkoutStore);

/** `ConnectedSetRow`/`ExerciseCard`/`ExerciseSetTableSection`/`AddWarmUpSetsSheet` call this instead of importing `useActiveWorkoutStore` directly — see file header. */
export function useWorkoutStore(): WorkoutStoreHook {
  return useContext(WorkoutStoreContext);
}

/** Defaults to `false` (the live logger). `EditWorkoutScreen` provides `true`. */
export const EditWorkoutModeContext = createContext<boolean>(false);

/** See file header, "no rest timers." */
export function useIsEditWorkoutMode(): boolean {
  return useContext(EditWorkoutModeContext);
}
