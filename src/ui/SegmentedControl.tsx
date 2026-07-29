/**
 * `SegmentedControl` — 07 §5: iOS-style segmented control. Used for detail
 * tabs, chart ranges, and the theme selector (System/Light/Dark, M0-10).
 *
 * Visual: a `bg.elevated` track (radius sm) with each segment a pressable
 * cell; the selected segment gets a `bg.surface` pill behind its label
 * (mirroring iOS's raised-thumb look) and `text.primary`/semibold, while
 * unselected segments read `text.secondary`/regular — no separate
 * animated-thumb layer, kept as plain per-segment styling (like `Chip`'s
 * active state) rather than a measured/interpolated slide, since nothing in
 * 07 §5 calls for a sliding-thumb animation specifically.
 */
import React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from './theme-provider';

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const TRACK_HEIGHT = 36;
const SEGMENT_MIN_HIT_HEIGHT = 44;

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  disabled = false,
  style,
  testID,
}: SegmentedControlProps<T>): React.JSX.Element {
  const { colors, typography, spacing, radii } = useTheme();

  const hitSlopVertical = Math.max(0, (SEGMENT_MIN_HIT_HEIGHT - TRACK_HEIGHT) / 2);

  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={[
        {
          flexDirection: 'row',
          height: TRACK_HEIGHT,
          padding: 2,
          borderRadius: radii.sm,
          backgroundColor: colors.bg.elevated,
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={testID ? `${testID}-${option.value}` : undefined}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={option.label}
            disabled={disabled}
            hitSlop={{ top: hitSlopVertical, bottom: hitSlopVertical }}
            onPress={() => onChange(option.value)}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: Math.max(radii.sm - 2, 0),
              paddingHorizontal: spacing['2'],
              backgroundColor: selected ? colors.bg.surface : 'transparent',
            }}
          >
            <Text
              style={[
                typography.footnote,
                {
                  fontWeight: selected ? '600' : '400',
                  color: selected ? colors.text.primary : colors.text.secondary,
                },
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
