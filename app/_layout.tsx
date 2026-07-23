/**
 * Root layout (M0-08/M0-09) — 06 §3: "root Stack: providers (Query, theme,
 * DB-ready gate), migrations splash".
 *
 * Provider order (outside in): QueryClientProvider (TanStack Query, 06 §4
 * item 4) -> ThemeProvider (src/ui/theme-provider.tsx, uncontrolled/local
 * fallback mode until M0-10 wires `settingsStore.theme` as the controlled
 * `preference`/`onPreferenceChange` pair, see that file's header) -> the
 * DB-ready gate below -> the route `<Stack>`.
 *
 * --- DB-ready gate (M0-09) -------------------------------------------------
 * 06 §5.1's cold start sequence: "splash -> open DB -> run pending
 * migrations -> ... -> render tabs". `runDbBoot()` (`src/data/sqlite/
 * boot.ts`) opens the on-device DB and runs the migration runner
 * (`src/data/sqlite/migrator.ts`); this component gates the tab `<Stack>`
 * on that promise settling:
 *  - pending: render nothing (the native splash screen stays up — no JS
 *    splash view needed since Expo's splash already covers this window).
 *  - ready: render the real route tree.
 *  - error: render the blocking error screen stub (06 §9) instead of tabs,
 *    with a "Try again" hook that re-attempts `runDbBoot()`.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';

import { runDbBoot } from '@/data/sqlite/boot';
import { MigrationErrorScreen } from '@/ui/MigrationErrorScreen';
import { ThemeProvider } from '@/ui/theme-provider';

type DbGateState =
  { status: 'pending' } | { status: 'ready' } | { status: 'error'; error: unknown };

export default function RootLayout(): React.JSX.Element | null {
  const queryClient = useMemo(() => new QueryClient(), []);

  const [gate, setGate] = useState<DbGateState>({ status: 'pending' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    runDbBoot()
      .then(() => {
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
      <ThemeProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
