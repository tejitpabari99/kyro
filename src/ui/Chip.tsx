/**
 * `Chip` — 07 §5: filter chip with a dropdown caret and active accent
 * tint. Used for library filters. The active tint reuses the same
 * "accent @ 12%" derivation as `Button`'s `tonal` variant (07 §5) — kept
 * local rather than a shared constant since each component derives it from
 * the same token-level primitive (`alphaOverlayToRgba`), not a duplicated
 * literal.
 */
import React from 'react';
import { ChevronDown } from 'lucide-react-native';
import { Pressable, Text, type StyleProp, type ViewStyle } from 'react-native';

import { alphaOverlayToRgba } from './tokens';
import { useTheme } from './theme-provider';

export interface ChipProps {
  label: string;
  active?: boolean;
  /** Shows the trailing dropdown caret (07 §5). Defaults to `true`. */
  showCaret?: boolean;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const MIN_HIT_TARGET = 44;
const CHIP_HEIGHT = 32;
const CARET_SIZE = 16;
const ICON_STROKE_WIDTH = 1.75;

export function Chip({
  label,
  active = false,
  showCaret = true,
  onPress,
  disabled = false,
  style,
  testID,
}: ChipProps): React.JSX.Element {
  const { colors, typography, spacing, radii } = useTheme();

  const hitSlopVertical = (MIN_HIT_TARGET - CHIP_HEIGHT) / 2;
  const activeTint = alphaOverlayToRgba({ hex: colors.accent.primary, opacity: 0.12 });
  const textColor = active ? colors.accent.text : colors.text.secondary;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ top: hitSlopVertical, bottom: hitSlopVertical }}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          height: CHIP_HEIGHT,
          paddingHorizontal: spacing['3'],
          borderRadius: radii.pill,
          borderWidth: active ? 0 : 1,
          borderColor: colors.border.input,
          backgroundColor: active ? activeTint : colors.bg.elevated,
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <Text
        style={[typography.footnote, { color: textColor, fontWeight: '600' }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      {showCaret ? (
        <ChevronDown
          size={CARET_SIZE}
          strokeWidth={ICON_STROKE_WIDTH}
          color={textColor}
          style={{ marginLeft: spacing['1'] }}
        />
      ) : null}
    </Pressable>
  );
}
