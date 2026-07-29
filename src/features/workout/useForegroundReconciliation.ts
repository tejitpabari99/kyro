/**
 * `useForegroundReconciliation` (M2-13) — 06 §5.4: "On `AppState → active`:
 * recompute stopwatch/timer displays from wall clock; reconcile timer (fire
 * 'ended while away' state silently)."
 *
 * **The "recompute ... from wall clock" half is already true by
 * construction, not something this hook needs to do:** both
 * `useWorkoutStopwatch` (logger) and `GlobalWorkoutBar` (mini-bar) derive
 * their displayed elapsed/remaining values from `Date.now()` fresh on every
 * tick — never from a cached/accumulated counter — so the very next 1 s (or
 * 250 ms, mini-bar's rest-timer tick) interval callback after a foreground
 * transition already recomputes a correct value with no help from this file.
 * (RN throttles/pauses JS timers while backgrounded; on resume the interval
 * simply resumes and its next callback reads a fresh `Date.now()` — at most
 * one tick's worth of staleness, the same imperceptible bound
 * `useRestTimerTicker.ts`'s own header already accepts for "reactivating
 * doesn't force an instant resync.")
 *
 * **The one genuinely actionable piece is silent reconciliation of an
 * already-expired rest timer** — `restTimerStore.timer.endsAt` may have
 * passed while the app was backgrounded (with no mounted timer surface to
 * have caught `remaining <= 0` itself, since M2-11's visible timer pill
 * doesn't exist yet and even once it does, it's simply not mounted while
 * backgrounded). `restTimerStore.complete()` already does exactly what "fire
 * ... silently" asks for: it cancels the (now-redundant, possibly
 * already-fired) scheduled notification and clears `timer` — with **no**
 * sound/haptic of its own (`restTimerStore.ts`'s own doc comment: `complete`
 * is "the foreground natural-completion hook point for M2-11's visible timer
 * surface" — any chime/haptic-on-completion is that future surface's job to
 * add when it calls this same method for its own on-screen "hit zero" case,
 * not this hook's).
 *
 * Deliberately a plain function (`reconcileExpiredRestTimerOnForeground`)
 * plus a thin `AppState`-subscribing hook around it, rather than one fused
 * hook — the function is what's actually worth unit testing precisely (three
 * cases: expired / not-yet-expired / no timer at all), while the
 * `AppState.addEventListener` wiring itself is thin RN glue, tested
 * separately and lightly (mirrors this codebase's established split of pure
 * decision logic from thin native-lifecycle glue, e.g. `shouldStartRestTimer`
 * vs. its `ConnectedSetRow.tsx` call site).
 */
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useRestTimerStore } from './restTimerStore';

/**
 * If a rest timer is running and its `endsAt` has already passed relative to
 * `now`, completes it silently (cancels the notification, clears state — no
 * sound/haptic, see file header). No-op if no timer is running, or if one is
 * running but hasn't reached zero yet (that case is left for the normal
 * foreground-completion path — a mounted timer surface, or this same
 * reconciliation the *next* time the app backgrounds/foregrounds past its
 * `endsAt` — to handle).
 */
export function reconcileExpiredRestTimerOnForeground(now: number = Date.now()): void {
  const { timer, complete } = useRestTimerStore.getState();
  if (timer && timer.endsAt <= now) {
    void complete();
  }
}

/**
 * Subscribes to `AppState` for the lifetime of the mounting component and
 * calls {@link reconcileExpiredRestTimerOnForeground} every time the app
 * transitions to `'active'` (foreground) — mount once, app-wide, at the root
 * layout (not tied to any one screen's lifecycle, since the mini-bar can be
 * showing a running timer on any tab, not just the logger).
 */
export function useForegroundReconciliation(): void {
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        reconcileExpiredRestTimerOnForeground();
      }
    });
    return () => subscription.remove();
  }, []);
}
