/**
 * `PRBanner` (M4-10, 07 §5's own inventory row: "top toast, `bg.surface` +
 * accent border-left, trophy icon"; not built by M0 — TASKS-INDEX's PRD-gap
 * #9 names this exact case: a primitive named in 07 §5 but missing from M0's
 * own primitive list gets built in the milestone that first needs it, which
 * is this one) — the live PR check's banner surface (04 §5.5).
 *
 * Self-positioning (`position: 'absolute'`, top-anchored), unlike
 * `Snackbar` (which the *caller* places inline/with margin): a "toast" reads
 * as floating above whatever's on screen, exactly like `TimerPill`'s own
 * bottom-anchored floating pill — the connected host
 * (`src/features/workout/PRBannerHost.tsx`) just mounts this unconditionally
 * next to `TimerPill`, no layout slot needed. No `react-native-safe-area
 * -context` inset: `GlobalWorkoutBar.tsx`'s own file header already
 * documents why (no `SafeAreaProvider` anywhere in this app yet, confirmed
 * by search; adding one app-wide is out of scope for the task that first
 * needs a top-anchored floating surface) — `TOP_OFFSET` is the same kind of
 * flat, documented approximation that file's `TAB_BAR_HEIGHT_APPROX` is.
 *
 * Auto-dismiss (3 s, 07 §5/§8) mirrors `Snackbar`'s own latest-ref timer
 * pattern (see that file's header for the full "why a ref, not a direct
 * effect dep" rationale) — with one addition: the effect also depends on
 * `message` itself, not just `visible`/`durationMs`. Unlike `Snackbar`
 * (one dismissal always fully unmounts it before the next `visible:true`),
 * a rapid second PR within the same 3 s window swaps `message` while
 * `visible` never toggles false in between (`PRBannerHost` keeps the
 * connected `<PRBanner>` mounted continuously) — without `message` in the
 * dependency array, the second banner would silently inherit whatever was
 * left of the first banner's countdown instead of getting its own full 3 s.
 *
 * A11y (07 §9): "PR banner is announced politely" — `accessibilityRole="alert"`
 * (matches `Snackbar`'s own established convention in this codebase) plus an
 * explicit `accessibilityLiveRegion="polite"` for the "politely" half 07 §9
 * calls out specifically (as opposed to a stronger/interrupting assertive
 * announcement).
 */
import React, { useEffect, useRef } from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Trophy } from 'lucide-react-native';

import { useTheme } from './theme-provider';

export interface PRBannerProps {
  visible: boolean;
  /** e.g. `"Heaviest Weight PR — 102.5 kg"`; multiple types combined into one string already (04 §5.5) — this component never does that composition itself. */
  message: string;
  onDismiss: () => void;
  /** Auto-dismiss delay in ms. Defaults to 3000 (04 §5.5/07 §5: "3 s"). */
  durationMs?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const DEFAULT_DURATION_MS = 3000;
/** Flat top-inset approximation — see file header. */
const TOP_OFFSET = 56;

export function PRBanner({
  visible,
  message,
  onDismiss,
  durationMs = DEFAULT_DURATION_MS,
  style,
  testID = 'pr-banner',
}: PRBannerProps): React.JSX.Element | null {
  const { colors, typography, spacing, radii } = useTheme();

  // Always the latest `onDismiss` — see file header / `Snackbar.tsx`'s own
  // identical rationale.
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
  }, [visible, message, durationMs]);

  if (!visible) {
    return null;
  }

  return (
    <View
      testID={testID}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[
        {
          position: 'absolute',
          top: TOP_OFFSET,
          left: spacing['4'],
          right: spacing['4'],
          flexDirection: 'row',
          alignItems: 'center',
          minHeight: 44,
          paddingVertical: spacing['3'],
          paddingHorizontal: spacing['4'],
          borderRadius: radii.md,
          backgroundColor: colors.bg.surface,
          borderLeftWidth: 4,
          borderLeftColor: colors.semantic.success,
          gap: spacing['2'],
        },
        style,
      ]}
    >
      <Trophy size={20} strokeWidth={1.75} color={colors.semantic.success} />
      <Text style={[typography.subhead, { color: colors.text.primary, flex: 1 }]} numberOfLines={2}>
        {message}
      </Text>
    </View>
  );
}
