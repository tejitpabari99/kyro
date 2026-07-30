/**
 * Profile tab segment layout (M0-11) — 06 §9: "root ErrorBoundary per tab".
 * Wraps this tab's route subtree (`<Stack />`) in the shared
 * `ErrorBoundary` (`src/ui/ErrorBoundary.tsx`) so a thrown render error
 * anywhere under this tab renders the themed fallback instead of crashing
 * the whole app; `onError` reports to the local log ring buffer + Sentry
 * via `lib/error-reporting` (kept out of `src/ui`, see that file's
 * header for the layering reason).
 *
 * Uses a native `<Stack>` (not `<Slot>`) so nested routes under this
 * segment (Statistics, Measures, Settings, the relocated Exercise browse
 * route, etc.) get a real push/pop stack with a swipe-back gesture to
 * attach their back buttons to — PRD I §4.4 (tabs-navigation-restructure).
 */
import React from 'react';
import { Stack } from 'expo-router';

import { reportBoundaryError } from '@/lib/error-reporting';
import { ErrorBoundary } from '@/ui/ErrorBoundary';

export default function ProfileTabLayout(): React.JSX.Element {
  return (
    <ErrorBoundary boundaryName="tab:profile" onError={reportBoundaryError}>
      <Stack screenOptions={{ headerShown: false, gestureEnabled: true }} />
    </ErrorBoundary>
  );
}
