/**
 * Root layout (M0-08/M0-09/M0-10) — 06 §3: "root Stack: providers (Query,
 * theme, DB-ready gate), migrations splash".
 *
 * Provider order (outside in): QueryClientProvider (TanStack Query, 06 §4
 * item 4) -> ThemeProvider (src/ui/theme-provider.tsx) -> the DB-ready gate
 * below -> the route `<Stack>`.
 *
 * M0-10 closes the seam `theme-provider.tsx` left open: once the DB-ready
 * gate reaches `ready`, `ThemeProvider` is rendered **controlled** —
 * `preference` reads `settingsStore.settings.theme` and
 * `onPreferenceChange` writes through via `settingsStore.setSetting`. That
 * single wiring point is what makes a theme change instant app-wide (every
 * `useTheme()` consumer shares this one context) and durable across
 * relaunch (the write lands in SQLite via `SettingsRepository` before this
 * component's next render).
 *
 * --- DB-ready gate (M0-09), extended by M0-10 + M1-05 ----------------------
 * 06 §5.1's cold start sequence: "splash -> open DB -> run pending
 * migrations -> seed/refresh dataset if version differs -> load settings ->
 * ... -> render tabs". `runDbBoot()` (`src/data/sqlite/boot.ts`) opens the
 * on-device DB and runs the migration runner; once that resolves, two more
 * boot steps run in that exact order before the gate flips to `ready`:
 *  1. (M1-05) `seedBundledBuiltinExercises(getAppDriver())` — upserts the
 *     bundled `assets/exercise-db.json` built-in exercises by id whenever
 *     the bundled checksum differs from `app_meta.dataset_version`; a pure,
 *     synchronous no-op on every cold start after the first successful seed
 *     (03 §6.4 step 6, `src/data/exercises/seed-builtins.ts`). Runs before
 *     settings load per 06 §5.1's ordering.
 *  2. (M0-10) `useSettingsStore.getState().load(new
 *     SettingsRepository(getAppDriver()))` — the settings store is fully
 *     populated (not just seeded with code defaults) before any screen
 *     renders.
 *  3. (M2-03) `useActiveWorkoutStore.getState().rehydrate(new
 *     WorkoutRepositoryImpl(getAppDriver(), { onAutoHeal }))` — restores
 *     any in-progress workout from `state='active'` (06 §5.1: "rehydrate
 *     active workout + timer" is the cold-start step right after settings
 *     load). `WorkoutRepositoryImpl` is constructed here, not inside
 *     `activeWorkoutStore.ts` itself — mirrors `SettingsRepository`'s own
 *     construction site one line above (`activeWorkoutStore.ts`'s header
 *     explains this choice) — with `onAutoHeal` wired to
 *     `recordBreadcrumb`/`captureError` (`src/lib/sentry.ts`) for the 06 §9
 *     "log to Sentry as warning" requirement `WorkoutRepositoryDeps
 *     .onAutoHeal`'s own doc comment describes.
 * Either step throwing rejects the same boot promise as a migration failure
 * would, landing on the same blocking error screen below (06 §9) — dataset
 * seeding is exactly as boot-critical as migrations: the exercise library
 * must exist before the tabs (in particular the Exercises tab, M1-07+) can
 * render meaningfully.
 *  - pending: render nothing (the native splash screen stays up — no JS
 *    splash view needed since Expo's splash already covers this window).
 *  - ready: render the real route tree, `ThemeProvider` controlled by the
 *    now-loaded settings store.
 *  - error: render the blocking error screen stub (06 §9) instead of tabs,
 *    with a "Try again" hook that re-attempts `runDbBoot()`. Settings never
 *    loaded on this path, so `ThemeProvider` stays uncontrolled here (its
 *    pre-M0-10 local-state fallback) — acceptable since there is no
 *    settings UI to reach behind a blocking error screen anyway.
 *
 * --- Sentry init (M0-11), deferred past first frame -----------------------
 * 06 §5.1/§8: "After first frame (never gating boot)". The
 * `requestAnimationFrame` callback below fires after this component's
 * first commit — regardless of `gate.status` — and only then calls
 * `initSentry()` (`src/lib/sentry.ts`), which itself no-ops entirely when
 * `EXPO_PUBLIC_SENTRY_DSN` is unset (true today — no owner DSN exists yet,
 * O-05 provides the real one by M6). This is deliberately independent of
 * the DB-ready gate: Sentry must never block or be blocked by boot.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';

import { seedBundledBuiltinExercises } from '@/data/exercises/seed-builtins';
import { getAppDriver, runDbBoot } from '@/data/sqlite/boot';
import { SettingsRepository } from '@/data/settings/settings-repository';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import { useSettingsStore } from '@/features/settings/settings-store';
import { useActiveWorkoutStore } from '@/features/workout/activeWorkoutStore';
import { captureError, initSentry, recordBreadcrumb } from '@/lib/sentry';
import { MigrationErrorScreen } from '@/ui/MigrationErrorScreen';
import { ThemeProvider } from '@/ui/theme-provider';

type DbGateState =
  { status: 'pending' } | { status: 'ready' } | { status: 'error'; error: unknown };

export default function RootLayout(): React.JSX.Element | null {
  const queryClient = useMemo(() => new QueryClient(), []);

  const [gate, setGate] = useState<DbGateState>({ status: 'pending' });
  const [attempt, setAttempt] = useState(0);

  // Always called (not gated behind `gate.status === 'ready'`) so hook order
  // stays stable across renders — harmless pre-load since the store starts
  // seeded with `SETTINGS_DEFAULTS` (src/data/settings/settings-schema.ts).
  const themePreference = useSettingsStore((state) => state.settings.theme);
  const handleThemePreferenceChange = useCallback((preference: typeof themePreference) => {
    void useSettingsStore.getState().setSetting('theme', preference);
  }, []);

  useEffect(() => {
    let cancelled = false;

    runDbBoot()
      .then(async () => {
        // M1-05: seed/refresh the bundled exercise dataset before settings
        // load (06 §5.1 ordering). Synchronous under the hood (both
        // `SqliteDriver` backends' `transaction()` are sync) — not awaited,
        // just sequenced before the settings load below.
        seedBundledBuiltinExercises(getAppDriver());
        await useSettingsStore.getState().load(new SettingsRepository(getAppDriver()));
        // M2-03: restore any in-progress workout right after settings load
        // (06 §5.1 cold-start ordering) — `onAutoHeal` reports the rare
        // multiple-active-workouts auto-heal path (06 §9) to Sentry via the
        // same breadcrumb + handled-error convention `reportBoundaryError`
        // (`src/lib/error-reporting.ts`) already established for
        // `ErrorBoundary`.
        const workoutRepository = new WorkoutRepositoryImpl(getAppDriver(), {
          onAutoHeal: (event) => {
            recordBreadcrumb('workout.autoHeal');
            captureError(
              new Error(
                `WorkoutRepository auto-healed ${event.healedWorkoutIds.length} extra active workout(s) (kept "${event.keptWorkoutId}").`,
              ),
            );
          },
        });
        await useActiveWorkoutStore.getState().rehydrate(workoutRepository);
        if (!cancelled) {
          setGate({ status: 'ready' });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setGate({ status: 'error', error });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setGate({ status: 'pending' });
    setAttempt((current) => current + 1);
  }, []);

  // Sentry init, deferred past first frame (see file header) — never
  // gated on `gate.status`, never awaited, never blocks boot.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      initSentry();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  if (gate.status === 'pending') {
    // Native splash screen (app.json's expo-splash-screen plugin) still
    // covers this window — nothing to render here.
    return null;
  }

  if (gate.status === 'error') {
    return (
      <ThemeProvider>
        <MigrationErrorScreen error={gate.error} onRetry={retry} />
      </ThemeProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider preference={themePreference} onPreferenceChange={handleThemePreferenceChange}>
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
