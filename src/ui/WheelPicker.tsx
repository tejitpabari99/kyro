/**
 * `WheelPicker` — 07 §5: "duration/rest picker" primitive, built here for
 * the first time by M2-09 (07 §5 lists it as not-yet-built; `DurationEditSheet`,
 * M2-05, explicitly left its own start-time fields as a stopgap "until this
 * primitive exists").
 *
 * A fixed-row-height vertical list with a centered selection band: scroll +
 * snap (`snapToInterval`) picks the nearest row on release, exactly like a
 * native wheel/date picker. Every row is **also** directly `Pressable` —
 * tapping any visible row selects it immediately and animates the list to
 * center it — both because that is the more reliable *and* more accessible
 * interaction (VoiceOver users can't perform a momentum-scroll gesture),
 * and because it is what makes this component synchronously testable with
 * RNTL's `fireEvent.press` (native `onMomentumScrollEnd`/`contentOffset`
 * math is exercised by `WheelPicker.test.tsx` too, but the tap path is the
 * one every *consumer* test — `RestTimerSheet`, this task's own acceptance
 * gate — actually drives). Same "make the option list directly pressable
 * rather than relying purely on a native gesture" convention this codebase
 * already uses for `FilterOptionSheet`/`MultiSelectOptionSheet`.
 */
import React, { useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { useTheme } from './theme-provider';

export interface WheelPickerOption<T extends string | number> {
  value: T;
  label: string;
}

export interface WheelPickerProps<T extends string | number> {
  options: readonly WheelPickerOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Rows visible in the wheel viewport — should be odd so exactly one row centers. Defaults to 5. */
  visibleRows?: number;
  testID?: string;
}

/** Fixed row height (the "fixed row height" perf/layout-math convention 06 §8 already establishes for `ExerciseRow`). */
export const WHEEL_PICKER_ROW_HEIGHT = 40;

export function WheelPicker<T extends string | number>({
  options,
  value,
  onChange,
  visibleRows = 5,
  testID = 'wheel-picker',
}: WheelPickerProps<T>): React.JSX.Element {
  const { colors, typography, radii } = useTheme();
  const scrollRef = useRef<ScrollView>(null);

  const viewportHeight = WHEEL_PICKER_ROW_HEIGHT * visibleRows;
  const bandOffset = (viewportHeight - WHEEL_PICKER_ROW_HEIGHT) / 2;
  const selectedIndex = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  const commit = (index: number, animated: boolean): void => {
    const option = options[index];
    if (!option) {
      return;
    }
    if (option.value !== value) {
      onChange(option.value);
    }
    scrollRef.current?.scrollTo({ y: index * WHEEL_PICKER_ROW_HEIGHT, animated });
  };

  const handleMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const rawIndex = Math.round(event.nativeEvent.contentOffset.y / WHEEL_PICKER_ROW_HEIGHT);
    const clamped = Math.min(options.length - 1, Math.max(0, rawIndex));
    commit(clamped, true);
  };

  return (
    <View
      testID={testID}
      style={[styles.viewport, { height: viewportHeight, borderRadius: radii.sm }]}
    >
      {/* Purely visual centered selection band — sits under the scroll content. */}
      <View
        pointerEvents="none"
        testID={`${testID}-band`}
        style={[
          styles.band,
          {
            top: bandOffset,
            height: WHEEL_PICKER_ROW_HEIGHT,
            backgroundColor: colors.bg.elevated,
            borderColor: colors.border.hairline,
          },
        ]}
      />
      <ScrollView
        ref={scrollRef}
        testID={`${testID}-scroll`}
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_PICKER_ROW_HEIGHT}
        decelerationRate="fast"
        contentContainerStyle={{ paddingVertical: bandOffset }}
        contentOffset={{ x: 0, y: selectedIndex * WHEEL_PICKER_ROW_HEIGHT }}
        onMomentumScrollEnd={handleMomentumScrollEnd}
      >
        {options.map((option, index) => {
          const isSelected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              testID={`${testID}-option-${option.value}`}
              accessibilityRole="button"
              accessibilityLabel={option.label}
              accessibilityState={{ selected: isSelected }}
              onPress={() => commit(index, true)}
              style={styles.row}
            >
              <Text
                style={[
                  typography.body,
                  {
                    color: isSelected ? colors.text.primary : colors.text.tertiary,
                    fontWeight: isSelected ? '600' : '400',
                  },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    overflow: 'hidden',
  },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    height: WHEEL_PICKER_ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
