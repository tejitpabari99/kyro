/**
 * `Button` — 07 §5 component inventory row 1.
 *
 * Variants (07 §5): `primary` (accent fill), `tonal` (accent @ 12% bg,
 * accent text), `ghost` (accent text, no fill), `destructive` (danger text
 * by default; pass `emphasis="fill"` for the danger-fill confirm style).
 * Sizes (07 §5): `lg` 50 pt full-width, `md` 40 pt, `sm` 32 pt pill radius.
 *
 * All colors come from `useTheme()` — no raw hex literals in this file (06
 * §2 "ui imports tokens only" boundary). The `tonal` background is derived
 * at 12% accent opacity via `alphaOverlayToRgba` (07 §5 spec value), not a
 * pre-baked token — `bg.accentSubtle` is a *different* documented value (8%,
 * reserved for checked-row tint, 07 §2) so it is intentionally not reused
 * here.
 *
 * Hit target: every size meets the 44 pt minimum (07 §4) — `lg`/`md` reach
 * it via padding, `sm`'s 32 pt pill gets a symmetric `hitSlop` topping the
 * touchable area up to 44 pt without growing the visual pill.
 */
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { alphaOverlayToRgba } from './tokens';
import { useTheme } from './theme-provider';

export type ButtonVariant = 'primary' | 'tonal' | 'ghost' | 'destructive';
export type ButtonSize = 'lg' | 'md' | 'sm';
/** Only meaningful for `variant="destructive"` (07 §5: "danger text / danger fill for confirms"). */
export type ButtonDestructiveEmphasis = 'text' | 'fill';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Only applies to `variant="destructive"`. Defaults to `'text'`. */
  emphasis?: ButtonDestructiveEmphasis;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

const MIN_HIT_TARGET = 44;

const SIZE_HEIGHT: Record<ButtonSize, number> = {
  lg: 50,
  md: 40,
  sm: 32,
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  emphasis = 'text',
  disabled = false,
  loading = false,
  style,
  testID,
  accessibilityLabel,
}: ButtonProps): React.JSX.Element {
  const { colors, typography, spacing, radii } = useTheme();

  const height = SIZE_HEIGHT[size];
  const hitSlopVertical = Math.max(0, (MIN_HIT_TARGET - height) / 2);
  const isDisabled = disabled || loading;

  const isDestructiveFill = variant === 'destructive' && emphasis === 'fill';

  let backgroundColor = 'transparent';
  let pressedBackgroundColor = 'transparent';
  let textColor = colors.accent.text;

  if (variant === 'primary') {
    backgroundColor = colors.accent.primary;
    pressedBackgroundColor = colors.accent.pressed;
    textColor = colors.accent.onAccent;
  } else if (variant === 'tonal') {
    backgroundColor = alphaOverlayToRgba({ hex: colors.accent.primary, opacity: 0.12 });
    pressedBackgroundColor = backgroundColor;
    textColor = colors.accent.text;
  } else if (variant === 'ghost') {
    backgroundColor = 'transparent';
    pressedBackgroundColor = 'transparent';
    textColor = colors.accent.text;
  } else if (variant === 'destructive') {
    if (isDestructiveFill) {
      backgroundColor = colors.semantic.danger;
      pressedBackgroundColor = colors.semantic.danger;
      textColor = colors.accent.onAccent;
    } else {
      backgroundColor = 'transparent';
      pressedBackgroundColor = 'transparent';
      textColor = colors.semantic.danger;
    }
  }

  // `sm` (32 pt pill) is too short for `headline`'s 17 pt line height —
  // step down to `footnote`'s 13 pt, bumped semibold to read as a button
  // label rather than meta text (07 §3 defines `footnote` at regular 400;
  // the doc has no dedicated button-label size for the pill size, so this
  // mirrors `headline`'s semibold weight at the smaller size).
  const labelStyle = {
    ...(size === 'sm'
      ? { ...typography.footnote, fontWeight: '600' as const }
      : typography.headline),
    color: textColor,
  };

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      hitSlop={hitSlopVertical > 0 ? { top: hitSlopVertical, bottom: hitSlopVertical } : undefined}
      style={({ pressed }) => [
        styles.base,
        {
          height,
          paddingHorizontal: spacing['5'],
          borderRadius: size === 'sm' ? radii.pill : radii.md,
          backgroundColor: pressed && !isDisabled ? pressedBackgroundColor : backgroundColor,
          alignSelf: size === 'lg' ? 'stretch' : 'flex-start',
          opacity: isDisabled ? 0.4 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={labelStyle} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
