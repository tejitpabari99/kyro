/**
 * `DurationEditSheet` (M2-05) — 02 §2: "Duration ... tap → sheet: edit start
 * date/time, duration, pause/resume stopwatch." Three independent actions,
 * each with its own explicit save step (no implicit "everything commits
 * together" — matches 06 §5.3's write-through-per-action model):
 *
 *  1. **Start time** — hour/minute fields (same calendar day as the
 *     workout's current `start_time`; there is no `WheelPicker`/
 *     `CalendarMonth` primitive yet, 07 §5 lists both as not-yet-built, so
 *     M2-05 ships the minimal editable-time affordance the doc's own
 *     acceptance gate needs — "editing start time... updates the meta row
 *     and persists" — rather than a full date-day picker; a future task can
 *     extend this once that primitive exists) → `onSaveStartTime(nextStartTimeMs)`.
 *  2. **Duration** — hours/minutes/seconds override, pre-filled from the
 *     live `elapsedMs` → `onSaveDuration(totalSeconds)`. The caller
 *     (`ActiveWorkoutScreen`) is responsible for turning that into the
 *     `updateMeta({startTime})` call per `useWorkoutStopwatch`'s own file
 *     header (`newStartTime = now - editedMs - durationPauseOffsetMs`) —
 *     this component only collects the edited total seconds.
 *  3. **Pause/Resume** — a single toggle button; `onPause`/`onResume` are
 *     the `useWorkoutStopwatch` actions directly (the caller persists
 *     `resume()`'s returned offset via `updateMeta`).
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/ui/Button';
import { NumericInput } from '@/ui/NumericInput';
import { Sheet } from '@/ui/Sheet';
import { useTheme } from '@/ui/theme-provider';

export interface DurationEditSheetProps {
  visible: boolean;
  onDismiss: () => void;
  /** The workout's current `start_time` (epoch ms) — seeds the hour/minute fields. */
  startTime: number;
  /** Live elapsed ms (from `useWorkoutStopwatch`) — seeds the duration fields. */
  elapsedMs: number;
  isPaused: boolean;
  onSaveStartTime: (nextStartTimeMs: number) => void;
  onSaveDuration: (totalSeconds: number) => void;
  onPause: () => void;
  onResume: () => void;
  testID?: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function DurationEditSheet({
  visible,
  onDismiss,
  startTime,
  elapsedMs,
  isPaused,
  onSaveStartTime,
  onSaveDuration,
  onPause,
  onResume,
  testID = 'duration-edit-sheet',
}: DurationEditSheetProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  const startDate = new Date(startTime);
  const [hourText, setHourText] = useState(() => pad2(startDate.getHours()));
  const [minuteText, setMinuteText] = useState(() => pad2(startDate.getMinutes()));

  const totalElapsedSeconds = Math.floor(elapsedMs / 1000);
  const [hoursText, setHoursText] = useState(() => String(Math.floor(totalElapsedSeconds / 3600)));
  const [minutesText, setMinutesText] = useState(() =>
    String(Math.floor((totalElapsedSeconds % 3600) / 60)),
  );
  const [secondsText, setSecondsText] = useState(() => String(totalElapsedSeconds % 60));

  // Re-seed every time the sheet *transitions to* open (not on every parent
  // re-render) so a still-open sheet doesn't fight the user's own
  // in-progress edits. Mid-render state adjustment — the established
  // pattern in this codebase for "derive state from a prop change"
  // (`ExerciseMedia.tsx`/`MultiSelectOptionSheet.tsx`) — rather than a
  // `useEffect`: calling `setState` unconditionally inside an effect body
  // triggers an extra render-then-immediately-re-render cascade every
  // commit, flagged by this repo's `react-hooks/set-state-in-effect` rule.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      const nextStart = new Date(startTime);
      setHourText(pad2(nextStart.getHours()));
      setMinuteText(pad2(nextStart.getMinutes()));
      const seconds = Math.floor(elapsedMs / 1000);
      setHoursText(String(Math.floor(seconds / 3600)));
      setMinutesText(String(Math.floor((seconds % 3600) / 60)));
      setSecondsText(String(seconds % 60));
    }
  }

  const handleSaveStartTime = (): void => {
    const hour = Math.min(23, Math.max(0, parseInt(hourText, 10) || 0));
    const minute = Math.min(59, Math.max(0, parseInt(minuteText, 10) || 0));
    const next = new Date(startTime);
    next.setHours(hour, minute, 0, 0);
    onSaveStartTime(next.getTime());
  };

  const handleSaveDuration = (): void => {
    const hours = Math.max(0, parseInt(hoursText, 10) || 0);
    const minutes = Math.max(0, parseInt(minutesText, 10) || 0);
    const seconds = Math.max(0, parseInt(secondsText, 10) || 0);
    onSaveDuration(hours * 3600 + minutes * 60 + seconds);
  };

  const sectionLabelStyle = {
    ...typography.footnote,
    color: colors.text.tertiary,
    marginBottom: spacing['2'],
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} testID={testID}>
      <View style={{ paddingHorizontal: spacing['4'] }}>
        <Text style={[typography.title2, { color: colors.text.primary, marginBottom: spacing['4'] }]}>
          Edit Duration
        </Text>

        <View style={{ marginBottom: spacing['5'] }}>
          <Text style={sectionLabelStyle}>Start Time</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing['2'] }}>
            <NumericInput
              testID={`${testID}-hour`}
              mode="integer"
              value={hourText}
              onChangeText={setHourText}
              placeholder="HH"
              style={{ width: 64 }}
              accessibilityLabel="Start hour"
            />
            <Text style={[typography.title2, { color: colors.text.secondary }]}>:</Text>
            <NumericInput
              testID={`${testID}-minute`}
              mode="integer"
              value={minuteText}
              onChangeText={setMinuteText}
              placeholder="MM"
              style={{ width: 64 }}
              accessibilityLabel="Start minute"
            />
            <Button
              testID={`${testID}-save-start-time`}
              label="Update Start Time"
              variant="tonal"
              size="sm"
              onPress={handleSaveStartTime}
              style={{ marginLeft: spacing['2'] }}
            />
          </View>
        </View>

        <View style={{ marginBottom: spacing['5'] }}>
          <Text style={sectionLabelStyle}>Duration</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing['2'] }}>
            <NumericInput
              testID={`${testID}-hours`}
              mode="integer"
              value={hoursText}
              onChangeText={setHoursText}
              placeholder="H"
              style={{ width: 56 }}
              accessibilityLabel="Duration hours"
            />
            <NumericInput
              testID={`${testID}-minutes`}
              mode="integer"
              value={minutesText}
              onChangeText={setMinutesText}
              placeholder="M"
              style={{ width: 56 }}
              accessibilityLabel="Duration minutes"
            />
            <NumericInput
              testID={`${testID}-seconds`}
              mode="integer"
              value={secondsText}
              onChangeText={setSecondsText}
              placeholder="S"
              style={{ width: 56 }}
              accessibilityLabel="Duration seconds"
            />
          </View>
          <Button
            testID={`${testID}-save-duration`}
            label="Update Duration"
            variant="tonal"
            size="sm"
            onPress={handleSaveDuration}
            style={{ marginTop: spacing['3'], alignSelf: 'flex-start' }}
          />
        </View>

        <Button
          testID={`${testID}-pause-resume`}
          label={isPaused ? 'Resume Workout' : 'Pause Workout'}
          variant="tonal"
          onPress={isPaused ? onResume : onPause}
        />
      </View>
    </Sheet>
  );
}
