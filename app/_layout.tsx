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
 *  3b. (M4-02) `configureRecordsService(workoutRepository)` — injects the
 *     same `WorkoutRepositoryImpl` instance into the app-wide
 *     `RecordsService` singleton (`src/features/stats/records-service.ts`,
 *     06 §4.4), mirroring step 3's own boot-injection shape exactly (see
 *     that file's header for why it isn't self-constructed instead). Order
 *     relative to step 3 doesn't matter (no data dependency) — placed right
 *     after so both `workoutRepository`-consuming boot steps stay adjacent.
 *  4. (M2-10) `useRestTimerStore.getState().restore(openExpoKvStore())` —
 *     restores any in-progress rest timer (06 §5.1's "... + timer", same
 *     step as #3 above). Wrapped in its own try/catch, deliberately
 *     **not** part of the boot promise chain that steps 1–3 share: a
 *     kv-store read failure is a minor, recoverable UX gap (worst case, no
 *     timer resumes), not the data-integrity risk a DB/settings failure is
 *     — it must never turn into the blocking error screen below.
 * Either of steps 1–3 throwing rejects the same boot promise as a migration failure
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
 * --- `GestureHandlerRootView` + `SafeAreaProvider` (BUGFIX-01) ------------
 * Two infra gaps fixed together since both need to sit outside every screen
 * in the tree: (1) `GestureDetector` (`Sheet.tsx`/`SetRow.tsx`/
 * `CalendarMonth.tsx`/`ActiveWorkoutScreen.tsx`) throws "must be used as a
 * descendant of GestureHandlerRootView" at runtime without this — installed
 * per react-native-gesture-handler's own docs
 * (https://docs.swmansion.com/react-native-gesture-handler/docs/fundamentals/installation),
 * `style={{flex: 1}}`, as the single outermost wrapper so it's an ancestor
 * of literally everything, including the `error`-gate branch below. (2)
 * `SafeAreaProvider` — every screen in this app renders `headerShown: false`
 * (root `<Stack>` below, `(tabs)/_layout.tsx`) plus its own custom header
 * View starting at the very top of its own layout, so without a
 * `SafeAreaProvider` ancestor those headers render under the iOS status
 * bar/notch (confirmed: zero usage of `SafeAreaProvider`/`SafeAreaView`/
 * `useSafeAreaInsets` anywhere in `app/`/`src/` before this fix — two
 * existing code comments, `GlobalWorkoutBar.tsx` and `PRBanner.tsx`,
 * explicitly flagged this as a deliberately deferred gap). Placed *inside*
 * `GestureHandlerRootView` (order doesn't functionally matter between these
 * two providers, but nesting it here keeps the outermost wrapper limited to
 * the one thing that must be first per gesture-handler's own docs).
 * `initialMetrics={initialWindowMetrics}` (best-effort synchronous first-
 * frame insets read from the native module's constants, per
 * `react-native-safe-area-context`'s own documented pattern) avoids an
 * extra blank frame while the real `onInsetsChange` native event resolves;
 * consuming screens read live values via `useSafeAreaInsets()`, never a
 * `SafeAreaView`, since they already build their own header Views with
 * their own background/padding styles (a padding fix, not a structural
 * rework) — each just adds `insets.top` to its existing top padding.
 *
 * --- Foreground rest-timer reconciliation (M2-13) --------------------------
 * 06 §5.4: "On `AppState → active`: ... reconcile timer (fire 'ended while
 * away' state silently)." `useForegroundReconciliation()`
 * (`src/features/workout/useForegroundReconciliation.ts`) is called
 * unconditionally below (same reasoning as the `themePreference` selector
 * above — stable hook order across gate-state transitions) — it subscribes
 * to `AppState` for the life of the app and silently completes an already-
 * expired rest timer on every foreground transition, regardless of which
 * tab/screen is currently showing (the mini-bar can display a running timer
 * on any of the 4 tabs, not just the logger, so this belongs at the root,
 * not tied to `ActiveWorkoutScreen`'s own mount lifecycle).
 *
 * --- Sentry init (M0-11), deferred past first frame -----------------------
 * 06 §5.1/§8: "After first frame (never gating boot)". The
 * `requestAnimationFrame` callback below only calls `initSentry()`
 * (`src/lib/sentry.ts`), which itself no-ops entirely when
 * `EXPO_PUBLIC_SENTRY_DSN` is unset (true today — no owner DSN exists yet,
 * O-05 provides the real one by M6) — it never blocks or gates boot either
 * way, `initSentry()` itself is synchronous and cannot fail/await anything.
 * The effect's own scheduling **is** now gated on `gate.status === 'ready'`
 * (M5-04 fix, see that effect's own comment) purely so the `sentry_enabled`
 * check it does before calling `initSentry()` reads the real loaded
 * setting rather than the pre-load default — that is a correctness
 * dependency on settings having loaded, not a "Sentry must wait for boot"
 * policy change; `gate.status === 'ready'` already implies settings have
 * loaded (this file's own boot-step ordering above), and by that point the
 * DB-ready gate has already stopped blocking anything, so nothing about
 * this waits any longer than boot itself already takes.
 *
 * --- Progress-photo orphan sweep (M5-03), deferred past first frame -------
 * 05 §8: "an orphan sweep runs on app start (files without DB rows ->
 * delete; rows without files -> placeholder render + warning log)." Wired
 * as its own `requestAnimationFrame`-deferred `useEffect`, same posture as
 * Sentry init / `preloadChimes` right above/below it: never gates the
 * DB-ready splash gate, never awaited by the boot promise chain steps 1-3
 * share. This task's own acceptance wording is "runs without measurable
 * boot cost" — deferring it past first frame is what makes that true
 * structurally (it cannot add to time-to-first-tab, being scheduled after
 * that frame has already committed), on top of `photo-orphan-sweep.ts`'s
 * own cheap per-item work (one directory listing + one DB query + a handful
 * of file-exists checks — see that file's integration test for a timed
 * assertion on a representative small photo set). Failures are swallowed
 * (breadcrumb + Sentry capture only, same posture the rest-timer restore
 * above already uses) — a missed sweep pass is a minor, recoverable gap
 * (one more stale orphan file, or one more not-yet-flagged missing-file row
 * until the next launch), never a data-integrity risk.
 *
 * --- `workout/active`'s fullScreenModal presentation (M2-05) --------------
 * 06 §3: "workout/active.tsx # ACTIVE LOGGER — fullScreenModal,
 * slide-from-bottom". Every other route gets the `<Stack>`'s own
 * `screenOptions={{headerShown: false}}` default (still true here); this
 * one route additionally needs `presentation: 'fullScreenModal'` +
 * `animation: 'slide_from_bottom'`, so it's declared as an explicit
 * `<Stack.Screen>` child — expo-router merges an explicitly declared
 * screen's options with the rest of the file-system-derived route tree,
 * it doesn't replace it (every other route stays auto-registered).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { initialWindowMetrics, SafeAreaProvider } from 'react-native-safe-area-context';

import { seedBundledBuiltinExercises } from '@/data/exercises/seed-builtins';
import { MeasurementRepositoryImpl } from '@/data/measurements/measurement-repository';
import { getAppDriver, runDbBoot } from '@/data/sqlite/boot';
import { SettingsRepository } from '@/data/settings/settings-repository';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import { sweepOrphanProgressPhotos } from '@/features/measurements/photo-orphan-sweep';
import { useSettingsStore } from '@/features/settings/settings-store';
import { configureRecordsService } from '@/features/stats/records-service';
import { useActiveWorkoutStore } from '@/features/workout/activeWorkoutStore';
import { useRestTimerStore } from '@/features/workout/restTimerStore';
import { useForegroundReconciliation } from '@/features/workout/useForegroundReconciliation';
import { openExpoKvStore } from '@/lib/kv-store.expo';
import {
  deleteProgressPhotoFile,
  listProgressPhotoFileNames,
  progressPhotoFileExists,
} from '@/lib/progress-photos';
import { captureError, initSentry, recordBreadcrumb } from '@/lib/sentry';
import { preloadChimes } from '@/lib/sound';
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

  // M2-13 (06 §5.4) — see file header. Unconditional, same reasoning as the
  // `themePreference` selector above.
  useForegroundReconciliation();

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
        // M4-02 (06 §4.4): `RecordsService` is injected the exact same way
        // as the store above — one shared `WorkoutRepositoryImpl` instance,
        // configured once at boot before any screen can read
        // `getRecordsService()`.
        configureRecordsService(workoutRepository);
        await useActiveWorkoutStore.getState().rehydrate(workoutRepository);
        // M2-10: restore any in-progress rest timer right after the active
        // workout itself (06 §5.1: "rehydrate active workout + timer").
        // Best-effort, wrapped separately from the rest of boot: a kv-store
        // read failure (corrupt entry, storage unavailable) must not turn
        // into a blocking migration-error screen the way a DB/settings
        // failure does — losing a rest-timer restore is a minor, recoverable
        // UX gap (worst case: no timer resumes), not a data-integrity risk
        // (mirrors `lib/logger.ts`'s "persistence failure must never affect
        // the source of truth" posture).
        try {
          await useRestTimerStore.getState().restore(openExpoKvStore());
        } catch (error) {
          recordBreadcrumb('restTimer.restore.failed');
          captureError(error instanceof Error ? error : new Error(String(error)));
        }
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
  // blocks boot, but (M5-04 fix, found in M5-04 review) *does* need to wait
  // for `gate.status === 'ready'` before reading `sentry_enabled`, not just
  // "past first frame": this component's very first commit happens while
  // `gate.status` is still `'pending'` (native splash still up), which is
  // long before `runDbBoot()` -> seed -> `useSettingsStore.load()` resolves
  // (real SQLite I/O across the native bridge — reliably slower than one
  // `requestAnimationFrame` tick). The original `[]`-dep effect fired its
  // RAF on that first commit unconditionally, so `useSettingsStore
  // .getState().settings.sentry_enabled` was read while the store still
  // held its pre-load `SETTINGS_DEFAULTS` seed (`sentry_enabled: true`) —
  // meaning a user who had disabled and persisted the toggle would
  // silently get Sentry re-initialized on every single cold start, the
  // opposite of the "next-launch-only" behavior this was meant to honor.
  // Keying the effect on `gate.status` instead means the RAF now only
  // schedules once settings have actually finished loading from disk, so
  // the flag it reads is the real persisted value. `Sentry.init`/
  // `Sentry.close()` mid-session still isn't a supported flip (a *later*
  // in-session toggle still only affects the next launch, per the
  // Settings screen's own subtitle on this control) — this only fixes
  // which value the next launch's check itself sees.
  useEffect(() => {
    if (gate.status !== 'ready') {
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      if (useSettingsStore.getState().settings.sentry_enabled) {
        initSentry();
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [gate.status]);

  // M2-11 (06 §6.4): "`lib/sound.ts` preloads timer/check chimes" — same
  // "deferred past first frame, never gates boot" posture as Sentry init
  // above; `preloadChimes()` itself is synchronous and side-effect-only
  // (creates cached `AudioPlayer`s, never throws — see that file's header),
  // so there is nothing to await or clean up beyond the animation frame.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      preloadChimes();
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // (M5-03, 05 §8) Progress-photo orphan sweep — "files without DB rows ->
  // delete; rows without files -> placeholder + warning, runs on app
  // start." Same "deferred past first frame, never gates boot" posture as
  // Sentry init / `preloadChimes` above: this is boot-cost-sensitive per
  // this task's own acceptance wording ("runs without measurable boot
  // cost"), and nothing downstream of the DB-ready gate depends on it
  // having finished (a stale orphan file or an as-yet-unflagged missing-file
  // row is harmless for exactly one more sweep). `MeasurementRepositoryImpl`
  // constructed with no deps here — this pass only ever calls `.photos()`
  // (read-only), never `addPhoto`/`deletePhoto`, so the save/delete file
  // hooks are irrelevant to it. Errors are swallowed (breadcrumb + Sentry
  // capture only) for the same reason the rest-timer restore above is: a
  // failed sweep is a minor, recoverable gap (worst case, one more stale
  // orphan file or unflagged missing-file row until the next launch), never
  // a data-integrity risk that should escalate to the blocking error screen.
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const repository = new MeasurementRepositoryImpl(getAppDriver());
      sweepOrphanProgressPhotos(repository, {
        listPhotoFileNames: listProgressPhotoFileNames,
        fileExists: progressPhotoFileExists,
        deleteOrphanFile: deleteProgressPhotoFile,
        onMissingFile: (photo) => {
          recordBreadcrumb('measurements.photoOrphanSweep.missingFile');
          captureError(
            new Error(
              `Progress photo "${photo.id}" (date ${photo.date}) has a database row but its file is missing on disk.`,
            ),
          );
        },
      }).catch((error: unknown) => {
        recordBreadcrumb('measurements.photoOrphanSweep.failed');
        captureError(error instanceof Error ? error : new Error(String(error)));
      });
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
      <GestureHandlerRootView style={styles.flex}>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <ThemeProvider>
            <MigrationErrorScreen error={gate.error} onRetry={retry} />
          </ThemeProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    );
  }

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider preference={themePreference} onPreferenceChange={handleThemePreferenceChange}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen
                name="workout/active"
                options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
              />
              {/* M3-04, 04 §2.1 / 06 §3: "Full-screen modal" — same presentation
                  as workout/active above. */}
              <Stack.Screen
                name="routine/new"
                options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen
                name="routine/[id]/edit"
                options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
              />
              {/* M4-05, 02 §15: the past-workout editor — same fullScreenModal
                  presentation as every other full-logger-shaped screen above. */}
              <Stack.Screen
                name="workout/[id]/edit"
                options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
              />
              {/* M5-07, 05 §7.2/06 §3: the Hevy CSV import flow — same
                  cross-tab, fullScreenModal presentation as every route
                  above (04 §2.1's "cross-tab flows live outside (tabs),
                  presented as a modal" convention). */}
              <Stack.Screen
                name="import/hevy"
                options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
              />
            </Stack>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
