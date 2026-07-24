/**
 * `loggerVisibilityStore` (M2-13) — 06 §3's literal `GlobalWorkoutBar`
 * condition: "appears whenever `activeWorkout != null && !loggerVisible`."
 * `activeWorkoutStore` already answers the first half; this tiny store is
 * the second half — a pure UI-presence flag, deliberately kept separate from
 * `activeWorkoutStore` (which holds real workout *data*, 06 §4 item 1) since
 * "is the full-screen logger route currently mounted" has nothing to do with
 * the workout itself and would otherwise force every unrelated
 * `activeWorkoutStore` action to reason about a concern it doesn't own.
 *
 * Mirrors `settingsStore.ts`/`activeWorkoutStore.ts`'s "factory + app-wide
 * singleton" shape purely for consistency and test isolation, even though
 * this store has no repository to parameterize.
 *
 * **Set from `ActiveWorkoutScreen`'s own mount/unmount effect** (not from
 * `handleMinimize`/individual dismiss call sites): the logger can be
 * dismissed via the chevron button, a swipe-down gesture, or a plain
 * `router.back()` from anywhere else (e.g. the Discard confirm) — tying
 * visibility to the screen component's own React lifecycle (mount ->
 * `true`, unmount -> `false`) is what makes every one of those paths correct
 * automatically, with no risk of a call site forgetting to flip the flag
 * back.
 */
import { create } from 'zustand';

export interface LoggerVisibilityState {
  /** `true` while `ActiveWorkoutScreen` (the `workout/active` fullScreenModal) is mounted. */
  visible: boolean;
  setVisible: (visible: boolean) => void;
}

/** Build a fresh, independent logger-visibility store — see file header for why this is a factory. */
export function createLoggerVisibilityStore() {
  return create<LoggerVisibilityState>((set) => ({
    visible: false,
    setVisible: (visible) => set({ visible }),
  }));
}

/** The one logger-visibility store used by the real app (`ActiveWorkoutScreen`, `GlobalWorkoutBar`). */
export const useLoggerVisibilityStore = createLoggerVisibilityStore();
