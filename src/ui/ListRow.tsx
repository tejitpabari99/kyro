/**
 * `ListRow` — 07 §5: leading icon/thumb slot, title/subtitle, trailing
 * accessory, chevron, hairline separator inset 16 from the left (07 §4).
 * Used across settings, pickers, history.
 */
import React from 'react';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from './theme-provider';

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Leading icon or thumbnail slot (e.g. a lucide icon or `Avatar/Thumb`). */
  leading?: React.ReactNode;
  /** Trailing accessory slot (e.g. a value, switch, badge) — rendered before the chevron, if any. */
  trailing?: React.ReactNode;
  /** Shows a trailing chevron (navigational rows). Defaults to `false`. */
  chevron?: boolean;
  /** Hides the bottom hairline separator — set on a list's last row. Defaults to `false` (shown). */
  hideSeparator?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const ICON_SIZE = 20;
const ICON_STROKE_WIDTH = 1.75;

export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  chevron = false,
  hideSeparator = false,
  onPress,
  disabled = false,
  style,
  testID,
}: ListRowProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  const content = (
    <View style={[styles.row, { paddingHorizontal: spacing['4'], opacity: disabled ? 0.4 : 1 }]}>
      {leading != null ? <View style={{ marginRight: spacing['3'] }}>{leading}</View> : null}
      <View style={styles.textColumn}>
        <Text style={[typography.body, { color: colors.text.primary }]} numberOfLines={1}>
          {title}
        </Text>
        {subtitle != null ? (
          <Text
            style={[
              typography.subhead,
              { color: colors.text.secondary, marginTop: spacing['0.5'] },
            ]}
            numberOfLines={1}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing != null ? <View style={{ marginLeft: spacing['3'] }}>{trailing}</View> : null}
      {chevron ? (
        <ChevronRight
          size={ICON_SIZE}
          strokeWidth={ICON_STROKE_WIDTH}
          color={colors.text.tertiary}
          style={{ marginLeft: spacing['2'] }}
        />
      ) : null}
    </View>
  );

  return (
    <View testID={testID} style={style}>
      {onPress != null ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onPress}
          style={({ pressed }) => [
            styles.pressable,
            { backgroundColor: pressed ? colors.bg.elevated : 'transparent' },
          ]}
        >
          {content}
        </Pressable>
      ) : (
        content
      )}
      {!hideSeparator ? (
        <View
          style={{
            height: StyleSheet.hairlineWidth,
            backgroundColor: colors.border.hairline,
            marginLeft: spacing['4'],
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pressable: {
    minHeight: 44,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: 8,
  },
  textColumn: {
    flex: 1,
    justifyContent: 'center',
  },
});
