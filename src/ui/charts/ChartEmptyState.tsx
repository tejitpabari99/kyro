/**
 * Shared empty-state for the chart cards (07 §7: "Empty chart state: dashed
 * baseline + caption 'No data yet'"). Deliberately plain React Native (no
 * Skia) — a dashed baseline + centered caption doesn't need a canvas, and
 * staying off Skia here keeps this branch trivially RNTL-testable without
 * touching the chart-press/gesture machinery at all.
 */
import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '../theme-provider';

export interface ChartEmptyStateProps {
  height: number;
  /** 07 §7 default copy — override only if a specific chart needs different wording. */
  label?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ChartEmptyState({
  height,
  label = 'No data yet',
  style,
  testID,
}: ChartEmptyStateProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  return (
    <View
      testID={testID}
      style={[{ height, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <View
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: height / 2,
          borderBottomWidth: 1,
          borderStyle: 'dashed',
          borderColor: colors.text.tertiary,
        }}
      />
      <Text
        style={[
          typography.caption,
          {
            color: colors.text.tertiary,
            backgroundColor: colors.bg.surface,
            paddingHorizontal: spacing['2'],
          },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}
