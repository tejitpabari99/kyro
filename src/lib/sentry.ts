/**
 * Sentry seam (M0-11) — 06 §9 crash-monitoring posture + 00 §P13 ("crash
 * monitoring: Sentry via Expo config plugin") + 10 §6 privacy posture.
 *
 * **Not blocked by the owner:** there is no real Sentry account/DSN yet
 * (O-05 provisions one by M6). `initSentry()` reads the DSN from the
 * `EXPO_PUBLIC_SENTRY_DSN` env var (Expo inlines `EXPO_PUBLIC_*` vars into
 * `process.env` at build time, same mechanism 06 §11 already documents for
 * `EXPO_PUBLIC_SUPABASE_URL`/`_ANON_KEY` — no extra config-reading package
 * needed) and **skips `Sentry.init` entirely** when it is empty/unset —
 * the SDK is then genuinely uninitialized (no client registered), and
 * every other export in this file (`recordBreadcrumb`, `captureError`)
 * degrades to Sentry's own safe no-op behavior when called without a
 * client (they check for a registered client internally and return early —
 * this is standard `@sentry/*` SDK behavior across platforms, not
 * something this file has to special-case). That is what makes "app runs
 * identically with and without DSN set" true.
 *
 * **Deferred past first frame:** `06` §5.1/§8 — "Sentry init after first
 * frame" — never blocks or gates boot. This module only *exposes*
 * `initSentry()`; the call site (`app/_layout.tsx`) is what defers it via
 * `requestAnimationFrame` in a `useEffect`, so this file has zero opinions
 * about *when* it runs, only *what* running it does.
 *
 * **Privacy posture (06 §9, 10 §6):** `sendDefaultPii: false`; this file
 * never calls `Sentry.setUser` anywhere in the app (single-user personal
 * app — there is no user identifier to attach, and none should ever be
 * added later without revisiting the privacy label). Breadcrumbs are
 * restricted to one-line action *names* via `recordBreadcrumb` — no
 * object payloads, no workout content — that function signature is the
 * only sanctioned way to add a breadcrumb; nothing else in the app should
 * call `Sentry.addBreadcrumb` directly.
 */
import * as Sentry from '@sentry/react-native';

/** True once `initSentry()` has actually called `Sentry.init` (DSN was present). */
let initialized = false;

/**
 * Initialize Sentry if — and only if — a DSN is configured. No-ops
 * (leaves the SDK uninitialized) when `EXPO_PUBLIC_SENTRY_DSN` is empty or
 * unset, which is the expected state until O-05 provisions a real DSN
 * (M6). Idempotent: calling this more than once is harmless.
 *
 * TODO(M5-04 or whenever Settings → About ships a toggle): 06 §9 says
 * Sentry should be "toggleable in Settings → About, default on" — the
 * `sentry_enabled` settings key already exists (`SETTINGS_DEFAULTS`,
 * M0-10) but nothing reads it yet (no UI to flip it off exists either).
 * This function does not check it — out of scope for M0-11 (and `lib/`
 * cannot import `features/settings/settings-store` itself per 06 §2's
 * layering rule; whoever wires the toggle should read the setting at the
 * `app/_layout.tsx` call site and skip calling `initSentry()` when false).
 * Harmless today since the DSN is unset regardless.
 */
export function initSentry(): void {
  if (initialized) {
    return;
  }

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    // 06 §9 / 10 §6: never attach IP/device/user identifiers by default.
    sendDefaultPii: false,
  });
  initialized = true;
}

/**
 * Record a one-line breadcrumb naming a user action (e.g. `'workout.start'`,
 * `'set.check'`). Never pass object payloads or workout content — the
 * string-only signature is the enforcement mechanism (06 §9: "breadcrumbs
 * = one-line action names ... no payloads"). Safe to call before
 * `initSentry()` runs or when Sentry never initializes (DSN unset) — the
 * SDK no-ops without a registered client.
 */
export function recordBreadcrumb(actionName: string): void {
  const oneLine = actionName.split('\n', 1)[0];
  Sentry.addBreadcrumb({ category: 'action', message: oneLine, level: 'info' });
}

/**
 * Report a handled error (e.g. a repository `DataError`, 06 §9) to Sentry.
 * Safe to call whether or not Sentry has initialized.
 */
export function captureError(error: unknown): void {
  Sentry.captureException(error);
}

/** Test-only: reset the module's init guard between test cases. */
export function __resetSentryForTests(): void {
  initialized = false;
}
