/**
 * `ErrorBoundary` reporting wiring (M0-11) — `src/ui/ErrorBoundary.tsx`
 * cannot import `lib/*` itself (06 §2 "ui imports its own tokens only",
 * lint-enforced), so its `onError` callback prop is wired at the `app/`
 * layer to this function instead: one line to the local log ring buffer
 * (`lib/logger`) plus a Sentry report (`lib/sentry`'s `captureError`,
 * no-ops without a DSN) — never the error's component stack or any
 * workout-content payload (06 §9).
 */
import { captureError } from './sentry';
import { logger } from './logger';

/** `ErrorBoundary`'s `onError` handler: log + report `error` caught by the boundary named `boundaryName`. */
export function reportBoundaryError(boundaryName: string, error: Error): void {
  logger.error(`ErrorBoundary(${boundaryName}) caught: ${error.message}`);
  captureError(error);
}
