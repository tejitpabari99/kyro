/**
 * Root layout (M0-08) — 06 §3: "root Stack: providers (Query, theme, DB-ready
 * gate), migrations splash".
 *
 * Provider order (outside in): QueryClientProvider (TanStack Query, 06 §4
 * item 4) -> ThemeProvider (src/ui/theme-provider.tsx, uncontrolled/local
 * fallback mode until M0-10 wires `settingsStore.theme` as the controlled
 * `preference`/`onPreferenceChange` pair, see that file's header) -> the
 * DB-ready gate below -> the route `<Stack>`.
 */
import { useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';

import { ThemeProvider } from '@/ui/theme-provider';

export default function RootLayout(): React.JSX.Element {
  const queryClient = useMemo(() => new QueryClient(), []);

  // --- DB-ready gate seam (M0-09 wires this in) ---------------------------
  // M0-09 lands the SQLite + Drizzle migration runner (06 §5.1: "splash ->
  // open DB -> run pending migrations -> ... -> render tabs"). Until then,
  // this is a placeholder boolean that defaults to `true` so the app boots
  // straight to the tabs today. M0-09 should replace this `useState` with
  // real migration-runner state (e.g. `'pending' | 'ready' | 'error'`) and
  // render the splash/blocking-error screen (06 §9) while not ready, gating
  // the `<Stack>` below on it exactly as this seam already does.
  const [isDbReady] = useState(true);

  if (!isDbReady) {
    // Placeholder branch — never reached today (isDbReady defaults to
    // `true`), kept here so the gating shape is obvious for M0-09.
    return null as unknown as React.JSX.Element;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
