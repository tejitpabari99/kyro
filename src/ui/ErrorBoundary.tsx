/**
 * `ErrorBoundary` (M0-11) — 06 §9: "React errors: root ErrorBoundary per
 * tab + logger (logger boundary preserves the store — remount re-renders
 * from state; data is already in DB)."
 *
 * A single reusable class component, instantiated once per tab route
 * (`app/(tabs)/<tab>/_layout.tsx` wraps each tab's `<Slot />` with it — see
 * those files) rather than four bespoke boundary components. Catches a
 * thrown render/lifecycle error anywhere in its subtree and renders a
 * themed fallback (`ErrorBoundaryFallback` below) instead of the RN
 * redbox-equivalent, with a "Try again" affordance that clears the caught
 * error and remounts `children`.
 *
 * --- The future logger route (M2) — read before wrapping it --------------
 * The workout logger screen doesn't exist yet; when M2 builds it, wrap its
 * route the same way the tabs do here. 06 §9's parenthetical — "logger
 * boundary preserves the store — remount re-renders from state; data is
 * already in DB" — matters specifically there: `activeWorkoutStore` (a
 * module-level Zustand store, 06 §4) is never torn down by this
 * component's reset (it only resets local `state.error` and re-renders
 * `children`), so a logger crash-and-retry re-renders from whatever the
 * store currently holds, which itself was write-through-persisted to
 * SQLite before the crash (06 §5.2/§5.3) — no special handling is required
 * in *this* file for that guarantee to hold, just don't add any logic here
 * that clears external stores on reset.
 *
 * `ui/` is tokens-only (06 §2/§10: "ui imports its own tokens only — not
 * domain/data/features/lib/app", lint-enforced in `eslint.config.js`), so
 * this component never imports `lib/sentry` or `lib/logger` itself —
 * reporting is done via the optional `onError` callback prop instead. The
 * `app/`-layer call sites (`app/(tabs)/<tab>/_layout.tsx`) are what wire
 * `onError` to `lib/error-reporting`'s `reportBoundaryError` (logs + a
 * Sentry `captureError` call, no-ops without a DSN) — never the error's
 * component stack or any payload content, per 06 §9's no-payload posture.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from './Button';
import { useTheme } from './theme-provider';

export interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Identifies which boundary caught the error to callers of `onError` (e.g. `'tab:workout'`, `'logger'` once M2 wires it) — never workout content. */
  boundaryName: string;
  /** Called once when this boundary catches an error — the app-layer wiring point for logging/Sentry reporting (kept out of `ui/`, see file header). */
  onError?: (boundaryName: string, error: Error) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/** React allows throwing any value, not only `Error` instances — normalize once, used by both lifecycle hooks below. */
function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: toError(error) };
  }

  // Note: React calls `componentDidCatch` with the *raw* thrown value (not
  // the normalized `Error` `getDerivedStateFromError` put in state) — hence
  // `unknown` here and a second `toError()` call, so `onError` always
  // receives a real `Error` regardless of what was thrown.
  componentDidCatch(error: unknown): void {
    this.props.onError?.(this.props.boundaryName, toError(error));
  }

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (this.state.error) {
      return <ErrorBoundaryFallback onReset={this.handleReset} />;
    }
    return this.props.children;
  }
}

function ErrorBoundaryFallback({ onReset }: { onReset: () => void }): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  return (
    <View
      testID="error-boundary-fallback"
      style={[styles.container, { backgroundColor: colors.bg.base, padding: spacing['6'] }]}
    >
      <Text style={[typography.title2, { color: colors.text.primary, textAlign: 'center' }]}>
        Something went wrong
      </Text>
      <Text
        style={[
          typography.subhead,
          { color: colors.text.secondary, textAlign: 'center', marginTop: spacing['2'] },
        ]}
      >
        This screen hit an unexpected error. Your data is safe — try again.
      </Text>
      <Button
        label="Try again"
        onPress={onReset}
        variant="tonal"
        style={{ marginTop: spacing['5'] }}
        testID="error-boundary-retry"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
