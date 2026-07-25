/**
 * Shared selection tooltip card for `LineChart`/`BarChart` (07 §7: "tooltip
 * card `bg.elevated`, radius sm, statSmall value + caption date"). Plain RN
 * overlay positioned via a Reanimated `useAnimatedStyle` reading the
 * `victory-native` press-state position `SharedValue`s directly — Skia
 * `<Canvas>` content can't host RN `<Text>` (it's a separate Skia-JSI
 * render tree, not the RN view tree), so the tooltip is drawn as a normal
 * `Animated.View` absolutely positioned over the canvas rather than inside
 * it. Position tracks the touch smoothly on the UI thread; visibility +
 * text content are plain JS/React state (`useChartSelection`) since text
 * formatting isn't worklet-safe.
 */
import React from 'react';
import { Text, type TextStyle } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { useTheme } from '../theme-provider';

export interface ChartTooltipProps {
  visible: boolean;
  xPosition: SharedValue<number>;
  yPosition: SharedValue<number>;
  valueText: string;
  dateText: string;
  testID?: string;
}

const TOOLTIP_WIDTH = 100;
const TOOLTIP_Y_OFFSET = 48;

export function ChartTooltip({
  visible,
  xPosition,
  yPosition,
  valueText,
  dateText,
  testID,
}: ChartTooltipProps): React.JSX.Element | null {
  const { colors, typography, spacing, radii } = useTheme();

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: xPosition.value - TOOLTIP_WIDTH / 2 },
      { translateY: yPosition.value - TOOLTIP_Y_OFFSET },
    ],
  }));

  if (!visible) {
    return null;
  }

  // `statSmall`/`caption` carry a readonly `fontVariant` tuple (tokens.ts
  // header) — copy into a mutable array to satisfy RN's `TextStyle`, same
  // pattern as `StatColumn`.
  const valueStyle: TextStyle = {
    ...typography.statSmall,
    fontVariant: typography.statSmall.fontVariant ? [...typography.statSmall.fontVariant] : undefined,
  };

  return (
    <Animated.View
      testID={testID}
      pointerEvents="none"
      style={[
        animatedStyle,
        {
          position: 'absolute',
          top: 0,
          left: 0,
          width: TOOLTIP_WIDTH,
          backgroundColor: colors.bg.elevated,
          borderRadius: radii.sm,
          paddingVertical: spacing['1'],
          paddingHorizontal: spacing['2'],
          alignItems: 'center',
        },
      ]}
    >
      <Text style={[valueStyle, { color: colors.text.primary }]} numberOfLines={1}>
        {valueText}
      </Text>
      <Text style={[typography.caption, { color: colors.text.tertiary }]} numberOfLines={1}>
        {dateText}
      </Text>
    </Animated.View>
  );
}
