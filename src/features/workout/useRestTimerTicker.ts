/**
 * `useRestTimerTicker` (M2-10) — 06 §4 item 3: "derived remaining-time via
 * a 250 ms ticker hook active only while a timer surface is visible."
 *
 * Pure ticking `now` provider, mirroring `useWorkoutStopwatch`'s
 * pure-derivation shape: this hook never reads or mutates `restTimerStore`
 * itself — the (future, M2-11) timer pill/sheet computes
 * `remainingMs = Math.max(0, timer.endsAt - now)` at its own call site.
 * Keeping the two concerns separate is what makes "active only while a
 * timer surface is visible" trivial to satisfy correctly: pass
 * `active={false}` (or simply don't mount the hook) whenever no such
 * surface is on screen, and the 250 ms interval genuinely doesn't exist —
 * no risk of a background interval outliving its surface, since React tears
 * down the effect on unmount either way.
 *
 * Reactivating (inactive -> active) does not force an instant resync of
 * `now` — it may be stale by up to one `TICK_MS` (250 ms) until the
 * interval's own first callback fires, imperceptible for a countdown
 * display and not worth the complexity: an eager resync would need either
 * a synchronous `Date.now()` call during render (forbidden — React's
 * `react-hooks/purity` rule: components/hooks must be pure during render)
 * or a direct `setState` call in the effect body itself (forbidden —
 * `react-hooks/set-state-in-effect`, the same "extra render-then-
 * immediately-re-render cascade" rationale `ConnectedSetRow.tsx`'s file
 * header documents for its own unrelated mid-render-adjustment case).
 * `setState` calls made from *inside* a callback (the `setInterval`
 * handler below) are outside React's render phase and are exactly the
 * sanctioned pattern both rules expect.
 */
import { useEffect, useState } from 'react';

const TICK_MS = 250;

export function useRestTimerTicker(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!active) {
      return undefined;
    }
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, [active]);

  return now;
}
