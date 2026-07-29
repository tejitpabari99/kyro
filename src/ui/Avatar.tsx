/**
 * `Avatar` / `Thumb` — 07 §5: exercise thumbnail with initial-letter
 * fallback circle. Used in the exercise library and cards.
 *
 * `Avatar` is the base primitive (circular by default); `Thumb` is a thin
 * square-shaped alias for the exercise-thumbnail use case (07 §5 names them
 * as one inventory row — same component, two shapes). Images render via
 * `expo-image` (06 §1 dependency table) when `source` is given; otherwise
 * both fall back to a `bg.elevated` circle/square showing the first letter
 * of `name`, uppercased.
 */
import React from 'react';
import { Image, type ImageSource, type ImageStyle } from 'expo-image';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from './theme-provider';

export type AvatarShape = 'circle' | 'square';

export interface AvatarProps {
  /** Omit to render the initial-letter fallback. */
  source?: ImageSource | string | number | null;
  /** Used both as the accessibility label and to derive the fallback initial. */
  name: string;
  /** Diameter (circle) or side length (square) in pt. Defaults to 40. */
  size?: number;
  shape?: AvatarShape;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const DEFAULT_SIZE = 40;

export function Avatar({
  source,
  name,
  size = DEFAULT_SIZE,
  shape = 'circle',
  style,
  testID,
}: AvatarProps): React.JSX.Element {
  const { colors, radii } = useTheme();

  const borderRadius = shape === 'circle' ? size / 2 : radii.sm;
  // Deliberately not typed as `ViewStyle` — that would pull in `ViewStyle`-only
  // fields (e.g. `overflow: 'scroll'`) incompatible with `expo-image`'s
  // `ImageStyle`. Left as an inferred plain object so it structurally
  // satisfies both `StyleProp<ViewStyle>` (fallback `View`) and
  // `StyleProp<ImageStyle>` (`Image`) below.
  const baseStyle = {
    width: size,
    height: size,
    borderRadius,
    backgroundColor: colors.bg.elevated,
  };

  if (source != null) {
    return (
      <Image
        testID={testID}
        source={source}
        accessible
        accessibilityLabel={name}
        contentFit="cover"
        // `style` is typed `StyleProp<ViewStyle>` in the public API (the
        // common case: layout props like margin, shared with `ImageStyle`)
        // — cast at this one call site rather than widening the prop type,
        // since `ViewStyle`'s `overflow: 'scroll'` is the only value
        // `ImageStyle` doesn't accept and no caller passes that here.
        style={[baseStyle, style as StyleProp<ImageStyle>]}
      />
    );
  }

  const initial = name.trim().charAt(0).toUpperCase() || '?';

  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={name}
      style={[baseStyle, { alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <Text
        style={{
          fontSize: Math.round(size * 0.4),
          fontWeight: '600',
          color: colors.text.secondary,
        }}
      >
        {initial}
      </Text>
    </View>
  );
}

/** Exercise-thumbnail alias of `Avatar` — same primitive, square shape. */
export function Thumb(props: Omit<AvatarProps, 'shape'>): React.JSX.Element {
  return <Avatar {...props} size={props.size ?? DEFAULT_SIZE} shape="square" />;
}
