/**
 * `Card` — 07 §5: `bg.surface`, radius `md`, padding 16. The base surface
 * primitive routine/exercise/chart cards are built on (07 §5 "used in").
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from './theme-provider';

export interface CardProps {
  children: React.ReactNode;
  /** Additional layout styles (margin, flex, etc.) — merged after the token-driven base style. */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Card({ children, style, testID }: CardProps): React.JSX.Element {
  const { colors, layout, radii } = useTheme();

  return (
    <View
      testID={testID}
      style={[
        {
          backgroundColor: colors.bg.surface,
          borderRadius: radii.md,
          padding: layout.cardPadding,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
