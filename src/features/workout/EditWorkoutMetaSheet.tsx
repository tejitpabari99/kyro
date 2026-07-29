/**
 * `EditWorkoutMetaSheet` (M4-05, 02 §15: "Editable: everything") — the past-
 * workout editor's own start-date/start-time/duration control. Deliberately
 * **not** a reuse of `DurationEditSheet` (M2-05): that sheet's `onSaveDuration`
 * contract solves for `startTime = now - editedSeconds - pauseOffset` (per
 * `useWorkoutStopwatch`'s own file header) — correct for a *live*, ticking
 * workout where "now" is meaningful, actively wrong for a past, already-
 * `completed` workout being retro-edited, where there is no "now" in the
 * formula at all: editing duration here must solve for `endTime`, given a
 * fixed `startTime`, not solve for `startTime` given a fixed "now." Same
 * "minimal editable-time affordance, no WheelPicker/CalendarMonth primitive
 * yet" posture `DurationEditSheet`'s own header already established (07 §5
 * lists both as not-yet-built) — plain numeric Y/M/D + H/M + H/M/S fields,
 * one `Save` commits all three (date, start time, duration) together as a
 * single `onSave(nextStartTime, nextEndTime)` call, computed as:
 *
 *   nextStartTime = (Y, M, D, H, m) as a local Date
 *   nextEndTime   = nextStartTime + (duration H*3600 + M*60 + S) * 1000
 *
 * `durationPauseOffsetMs` is deliberately left untouched by this sheet — a
 * past workout's pause offset (if any, from when it was actively logged) is
 * display-inert once duration is being set explicitly here; `EditWorkoutScreen`
 * always computes displayed duration as `endTime - startTime -
 * durationPauseOffsetMs` for consistency with every other duration
 * computation in the app (`HistoryDetailScreen.tsx`'s own identical formula),
 * so a stale nonzero offset would silently shift the *next* time this sheet
 * re-seeds from the just-saved values — out of scope for this task to fix
 * generally (pause offsets are a live-logging concept), noted here so a
 * future reader isn't surprised.
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';

import { Button } from '@/ui/Button';
import { NumericInput } from '@/ui/NumericInput';
import { Sheet } from '@/ui/Sheet';
import { useTheme } from '@/ui/theme-provider';

export interface EditWorkoutMetaSheetProps {
  visible: boolean;
  onDismiss: () => void;
  startTime: number;
  /** The workout's current `endTime` — always non-null for a `completed` workout (`finish()`'s own invariant) in practice; `startTime` is the fallback for the (unreachable through the real UI) case it's somehow null. */
  endTime: number | null;
  durationPauseOffsetMs: number;
  onSave: (nextStartTime: number, nextEndTime: number) => void;
  testID?: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function EditWorkoutMetaSheet({
  visible,
  onDismiss,
  startTime,
  endTime,
  durationPauseOffsetMs,
  onSave,
  testID = 'edit-workout-meta-sheet',
}: EditWorkoutMetaSheetProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  const seedFrom = (): {
    year: string;
    month: string;
    day: string;
    hour: string;
    minute: string;
    hours: string;
    minutes: string;
    seconds: string;
  } => {
    const start = new Date(startTime);
    const totalSeconds = Math.max(
      0,
      Math.floor(((endTime ?? startTime) - startTime - durationPauseOffsetMs) / 1000),
    );
    return {
      year: String(start.getFullYear()),
      month: pad2(start.getMonth() + 1),
      day: pad2(start.getDate()),
      hour: pad2(start.getHours()),
      minute: pad2(start.getMinutes()),
      hours: String(Math.floor(totalSeconds / 3600)),
      minutes: String(Math.floor((totalSeconds % 3600) / 60)),
      seconds: String(totalSeconds % 60),
    };
  };

  const [fields, setFields] = useState(seedFrom);
  // Re-seed every time the sheet transitions to open — mirrors
  // `DurationEditSheet`'s own "derive from a visible transition, not every
  // render" pattern (that file's own header) so a still-open sheet doesn't
  // fight the user's in-progress edits.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setFields(seedFrom());
    }
  }

  const setField = (key: keyof typeof fields) => (text: string) =>
    setFields((prev) => ({ ...prev, [key]: text }));

  const handleSave = (): void => {
    const year = parseInt(fields.year, 10) || start().getFullYear();
    const month = Math.min(12, Math.max(1, parseInt(fields.month, 10) || 1));
    const day = Math.min(31, Math.max(1, parseInt(fields.day, 10) || 1));
    const hour = Math.min(23, Math.max(0, parseInt(fields.hour, 10) || 0));
    const minute = Math.min(59, Math.max(0, parseInt(fields.minute, 10) || 0));
    const hours = Math.max(0, parseInt(fields.hours, 10) || 0);
    const minutes = Math.max(0, parseInt(fields.minutes, 10) || 0);
    const seconds = Math.max(0, parseInt(fields.seconds, 10) || 0);

    const nextStart = new Date(year, month - 1, day, hour, minute, 0, 0);
    const nextStartTime = nextStart.getTime();
    const durationSeconds = hours * 3600 + minutes * 60 + seconds;
    const nextEndTime = nextStartTime + durationSeconds * 1000;

    onSave(nextStartTime, nextEndTime);
  };

  function start(): Date {
    return new Date(startTime);
  }

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
          Edit Date & Duration
        </Text>

        <View style={{ marginBottom: spacing['5'] }}>
          <Text style={sectionLabelStyle}>Date & Start Time</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing['2'] }}>
            <NumericInput
              testID={`${testID}-year`}
              mode="integer"
              value={fields.year}
              onChangeText={setField('year')}
              placeholder="YYYY"
              style={{ width: 72 }}
              accessibilityLabel="Year"
            />
            <NumericInput
              testID={`${testID}-month`}
              mode="integer"
              value={fields.month}
              onChangeText={setField('month')}
              placeholder="MM"
              style={{ width: 56 }}
              accessibilityLabel="Month"
            />
            <NumericInput
              testID={`${testID}-day`}
              mode="integer"
              value={fields.day}
              onChangeText={setField('day')}
              placeholder="DD"
              style={{ width: 56 }}
              accessibilityLabel="Day"
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing['2'], marginTop: spacing['2'] }}>
            <NumericInput
              testID={`${testID}-hour`}
              mode="integer"
              value={fields.hour}
              onChangeText={setField('hour')}
              placeholder="HH"
              style={{ width: 64 }}
              accessibilityLabel="Start hour"
            />
            <Text style={[typography.title2, { color: colors.text.secondary }]}>:</Text>
            <NumericInput
              testID={`${testID}-minute`}
              mode="integer"
              value={fields.minute}
              onChangeText={setField('minute')}
              placeholder="MM"
              style={{ width: 64 }}
              accessibilityLabel="Start minute"
            />
          </View>
        </View>

        <View style={{ marginBottom: spacing['5'] }}>
          <Text style={sectionLabelStyle}>Duration</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing['2'] }}>
            <NumericInput
              testID={`${testID}-hours`}
              mode="integer"
              value={fields.hours}
              onChangeText={setField('hours')}
              placeholder="H"
              style={{ width: 56 }}
              accessibilityLabel="Duration hours"
            />
            <NumericInput
              testID={`${testID}-minutes`}
              mode="integer"
              value={fields.minutes}
              onChangeText={setField('minutes')}
              placeholder="M"
              style={{ width: 56 }}
              accessibilityLabel="Duration minutes"
            />
            <NumericInput
              testID={`${testID}-seconds`}
              mode="integer"
              value={fields.seconds}
              onChangeText={setField('seconds')}
              placeholder="S"
              style={{ width: 56 }}
              accessibilityLabel="Duration seconds"
            />
          </View>
        </View>

        <Button testID={`${testID}-save`} label="Save" variant="primary" onPress={handleSave} />
      </View>
    </Sheet>
  );
}
