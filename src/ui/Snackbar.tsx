/**
 * `Snackbar` — 07 §5: Undo affordance, 5 s auto-dismiss. Used for
 * "remove exercise" and other reversible deletions.
 *
 * Mounted only while `visible` is true (same pattern as `Sheet`, also
 * M0-07) — content is provably absent from the tree when dismissed. A
 * timer calls `onDismiss` after `durationMs` (default 5000 ms); pressing
 * the action label calls `onAction` and then `onDismiss` immediately,
 * matching the standard "Undo" snackbar pattern (act now, or the window
 * closes on its own).
 *
 * ## Why `onDismiss`/`onAction` are read through a ref, not a direct effect dep
 * The auto-dismiss `setTimeout` must survive the *host* re-rendering for
 * unrelated reasons (e.g. `ActiveWorkoutScreen`'s once-a-second workout
 * stopwatch tick) without restarting the countdown — a caller that passes
 * an inline `() => ...` closure (the common case; see
 * `ActiveWorkoutScreen.tsx`) hands this component a brand-new function
 * identity on every one of those renders. Naively depending on `onDismiss`
 * in the timer effect's dependency array would clear + reschedule the
 * `setTimeout` on every such render, and under a host that re-renders
 * more often than `durationMs`, the timer would never actually fire —
 * confirmed empirically: driving five separate ~1 s re-renders (mirroring
 * real, non-batched `setInterval` macrotasks — not `advanceTimersByTime`'s
 * single synchronous sweep, which can coalesce them) across a 5000 ms
 * window left the Snackbar still mounted. Latest-ref indirection keeps the
 * effect's own dependency array to just `[visible, durationMs]` — the only
 * two things that should ever restart the countdown — while still calling
 * whatever the *current* `onDismiss` is when the timer fires.
 */
import React, { useEffect, useRef } from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from './theme-provider';

export interface SnackbarProps {
  visible: boolean;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  /** Auto-dismiss delay in ms. Defaults to 5000 (07 §5: "5 s"). */
  durationMs?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const DEFAULT_DURATION_MS = 5000;
const DEFAULT_ACTION_LABEL = 'Undo';

export function Snackbar({
  visible,
  message,
  actionLabel = DEFAULT_ACTION_LABEL,
  onAction,
  onDismiss,
  durationMs = DEFAULT_DURATION_MS,
  style,
  testID,
}: SnackbarProps): React.JSX.Element | null {
  const { colors, typography, spacing, radii } = useTheme();

  // Always the latest `onDismiss` — kept fresh via its own effect (never
  // written during render — this repo's `react-hooks/refs` lint rule
  // forbids mutating a ref's `.current` outside an effect/event handler)
  // without being a dependency of the timer effect below (see file header).
  const onDismissRef = useRef(onDismiss);
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!visible) {
      return undefined;
    }
    const timer = setTimeout(() => onDismissRef.current(), durationMs);
    return () => clearTimeout(timer);
  }, [visible, durationMs]);

  if (!visible) {
    return null;
  }

  const handleAction = (): void => {
    onAction?.();
    onDismiss();
  };

  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 44,
          paddingVertical: spacing['3'],
          paddingHorizontal: spacing['4'],
          borderRadius: radii.md,
          backgroundColor: colors.bg.elevated,
        },
        style,
      ]}
    >
      <Text style={[typography.subhead, { color: colors.text.primary, flex: 1 }]} numberOfLines={2}>
        {message}
      </Text>
      {onAction != null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={handleAction}
          hitSlop={12}
          style={{ marginLeft: spacing['4'] }}
        >
          <Text style={[typography.footnote, { color: colors.accent.text, fontWeight: '600' }]}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
