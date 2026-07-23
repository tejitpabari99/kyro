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
 * --- DB-ready gate (M0-09), extended by M0-10 ------------------------------
 * 06 §5.1's cold start sequence: "splash -> open DB -> run pending
 * migrations -> ... -> load settings -> ... -> render tabs". `runDbBoot()`
 * (`src/data/sqlite/boot.ts`) opens the on-device DB and runs the migration
 * runner; once that resolves, M0-10 adds one more boot step before the gate
 * flips to `ready`: `useSettingsStore.getState().load(new
 * SettingsRepository(getAppDriver()))` — the settings store is fully
 * populated (not just seeded with code defaults) before any screen renders.
 *  - pending: render nothing (the native splash screen stays up — no JS
 *    splash view needed since Expo's splash already covers this window).
 *  - ready: render the real route tree, `ThemeProvider` controlled by the
 *    now-loaded settings store.
 *  - error: render the blocking error screen stub (06 §9) instead of tabs,
 *    with a "Try again" hook that re-attempts `runDbBoot()`. Settings never
 *    loaded on this path, so `ThemeProvider` stays uncontrolled here (its
 *    pre-M0-10 local-state fallback) — acceptable since there is no
 *    settings UI to reach behind a blocking error screen anyway.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';

import { getAppDriver, runDbBoot } from '@/data/sqlite/boot';
import { SettingsRepository } from '@/data/settings/settings-repository';
import { useSettingsStore } from '@/features/settings/settings-store';
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
        await useSettingsStore.getState().load(new SettingsRepository(getAppDriver()));
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
