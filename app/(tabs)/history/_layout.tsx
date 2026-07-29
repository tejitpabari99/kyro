/**
 * History tab segment layout (M0-11) — 06 §9: "root ErrorBoundary per tab".
 * Wraps this tab's route subtree (`<Slot />`) in the shared
 * `ErrorBoundary` (`src/ui/ErrorBoundary.tsx`) so a thrown render error
 * anywhere under this tab renders the themed fallback instead of crashing
 * the whole app; `onError` reports to the local log ring buffer + Sentry
 * via `lib/error-reporting` (kept out of `src/ui`, see that file's
 * header for the layering reason).
 */
import React from 'react';
import { Slot } from 'expo-router';

import { reportBoundaryError } from '@/lib/error-reporting';
import { ErrorBoundary } from '@/ui/ErrorBoundary';

export default function HistoryTabLayout(): React.JSX.Element {
  return (
    <ErrorBoundary boundaryName="tab:history" onError={reportBoundaryError}>
      <Slot />
    </ErrorBoundary>
  );
}
