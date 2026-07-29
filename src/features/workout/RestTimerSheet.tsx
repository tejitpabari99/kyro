/**
 * `RestTimerSheet` (M2-09) — 02 §3's rest-timer row tap target: "wheel
 * picker sheet, Off / 5 s–5 min in 5 s steps up to 1 min then 15 s steps."
 * Thin wiring over `WheelPicker` (built by this same task) +
 * `rest-timer-format.ts`'s option list/formatter — the sheet's only job is
 * translating between the caller's `number | null` (`null` = Off, matching
 * `workout_exercises.rest_seconds`, 05 §3.2) and the `WheelPicker`'s own
 * `string | number` value constraint (a `0` sentinel stands in for "Off"
 * internally, translated back at the boundary — `0` is never a real rest
 * duration since the shortest real option is 5 s).
 *
 * This is only the picker UI — it does **not** start/stop a live countdown
 * (that engine is M2-10's `restTimerStore`, landing in parallel); selecting
 * a value here only updates `workout_exercises.rest_seconds` via the
 * caller's `onChange` (`ExerciseCard`'s `updateExercise({restSeconds})`
 * call).
 */
import React, { useMemo } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { useTheme } from '@/ui/theme-provider';
import { WheelPicker } from '@/ui/WheelPicker';

import { formatRestSeconds, restTimerSecondsOptions, type RestSeconds } from './rest-timer-format';

const OFF_SENTINEL = 0;

export interface RestTimerSheetProps {
  visible: boolean;
  onDismiss: () => void;
  value: RestSeconds;
  onChange: (value: RestSeconds) => void;
  testID?: string;
}

export function RestTimerSheet({
  visible,
  onDismiss,
  value,
  onChange,
  testID = 'rest-timer-sheet',
}: RestTimerSheetProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  const options = useMemo(
    () => [
      { value: OFF_SENTINEL, label: 'Off' },
      ...restTimerSecondsOptions().map((seconds) => ({
        value: seconds,
        label: formatRestSeconds(seconds),
      })),
    ],
    [],
  );

  const wheelValue = value ?? OFF_SENTINEL;

  const handleChange = (next: number): void => {
    onChange(next === OFF_SENTINEL ? null : next);
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} testID={testID}>
      <View style={{ paddingHorizontal: spacing['4'], alignItems: 'center' }}>
        <Text
          style={[
            typography.headline,
            { color: colors.text.primary, marginBottom: spacing['3'], alignSelf: 'flex-start' },
          ]}
        >
          Rest Timer
        </Text>
        <WheelPicker
          testID={`${testID}-wheel`}
          options={options}
          value={wheelValue}
          onChange={handleChange}
        />
        <Button
          testID={`${testID}-done`}
          label="Done"
          variant="tonal"
          onPress={onDismiss}
          style={{ marginTop: spacing['4'], alignSelf: 'stretch' }}
        />
      </View>
    </Sheet>
  );
}
