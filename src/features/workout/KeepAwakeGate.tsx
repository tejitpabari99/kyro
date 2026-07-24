/**
 * `KeepAwakeGate` (M2-13) — 06 §6.3: "`useKeepAwake()` mounted in the logger
 * screen only, gated by the setting; released on minimize (mini-bar mode
 * allows sleep — notification covers the timer)."
 *
 * `expo-keep-awake`'s own `useKeepAwake()` hook has no "enabled" parameter —
 * it unconditionally activates on mount and deactivates on unmount (its own
 * source, read directly: the hook's cleanup always calls
 * `deactivateKeepAwake`, keyed to a `tag` that's stable for the life of one
 * mount via `useId()`). React's rules of hooks don't allow calling it
 * conditionally *inside* `ActiveWorkoutScreen` itself, so this tiny wrapper
 * component exists purely to be the thing that's conditionally
 * mounted/unmounted instead — `ActiveWorkoutScreen` renders
 * `{keepAwakeEnabled && <KeepAwakeGate />}`, which both satisfies "gated by
 * the setting" (mounts only while the setting is on, and unmounts the
 * instant it's toggled off mid-workout, calling the library's own
 * deactivate for free) and requires **no separate manual
 * activate/deactivate wiring of this task's own** — the library's
 * documented unmount behavior already covers "released on minimize" too,
 * since minimizing unmounts the whole `ActiveWorkoutScreen` (this gate
 * included) via the same `router.back()` that already tears down every
 * other per-screen effect.
 *
 * **How this was verified** (worth being explicit, since it can't be proven
 * by executing the real hook under Jest — see `KeepAwakeGate.test.tsx`'s own
 * header for why): read `expo-keep-awake@56.0.3`'s actual installed source
 * directly (`node_modules/.../expo-keep-awake/src/index.ts`) rather than
 * trusting its docs — `useKeepAwake`'s own `useEffect` calls
 * `activateKeepAwakeAsync(tagOrDefault)` in its body and
 * `deactivateKeepAwake(tagOrDefault)` in its cleanup, with `tagOrDefault`
 * stable for the life of one mount (either the caller's own `tag` argument,
 * as passed here, or a `useId()` fallback) — confirming activate-on-mount /
 * deactivate-on-unmount is genuinely the library's own unconditional
 * behavior, not something this wrapper needs to reimplement.
 */
import { useKeepAwake } from 'expo-keep-awake';

/** Tag scopes this screen's keep-awake lock distinctly from any other future caller of `useKeepAwake` elsewhere in the app (none exists today) — an explicit, readable tag rather than the hook's own auto-generated `useId()` default. */
const KEEP_AWAKE_TAG = 'active-workout-logger';

export function KeepAwakeGate(): null {
  useKeepAwake(KEEP_AWAKE_TAG);
  return null;
}
