/**
 * `prBannerStore` (M4-10, 04 §5.5) — the tiny presence store between
 * `ConnectedSetRow`'s check-flow (which decides *whether* a live PR was
 * just earned) and `PRBannerHost`/`ui/PRBanner` (which render it) — the
 * exact same "store-in-the-middle" shape `restTimerStore`/
 * `loggerVisibilityStore` already establish for this file's own sibling
 * floating surfaces (`TimerPill`), so `ConnectedSetRow` (deeply nested,
 * several components below `ActiveWorkoutScreen`) never needs a prop bubbled
 * all the way up just to show a banner mounted at the screen's top level.
 *
 * `message: string | null` (not a richer object) — the display string is
 * fully composed at the call site (`records-provider.ts`'s
 * `formatPRBannerMessage`, 04 §5.5's "multiple types combine into one
 * banner") before it ever reaches this store; nothing downstream of `show()`
 * needs to know which record types were involved.
 *
 * Factory + app-wide singleton, mirroring every other small workout store
 * here (`loggerVisibilityStore.ts`'s own header) purely for test isolation
 * even though there's no repository to parameterize.
 */
import { create } from 'zustand';

export interface PRBannerState {
  message: string | null;
  /** Always overwrites — a second `show()` while one banner is still visible replaces it outright (`ui/PRBanner`'s own auto-dismiss effect restarts its 3 s window on any `message` change, see that file's header). */
  show: (message: string) => void;
  dismiss: () => void;
}

/** Build a fresh, independent PR-banner store — see file header for why this is a factory. */
export function createPRBannerStore() {
  return create<PRBannerState>((set) => ({
    message: null,
    show: (message) => set({ message }),
    dismiss: () => set({ message: null }),
  }));
}

/** The one PR-banner store used by the real app (`ConnectedSetRow`, `PRBannerHost`). */
export const usePRBannerStore = createPRBannerStore();
