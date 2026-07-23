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
 */
import React, { useEffect } from 'react';
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

  useEffect(() => {
    if (!visible) {
      return undefined;
    }
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [visible, durationMs, onDismiss]);

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
