/**
 * `SaveWorkoutSheet` (M2-14) — 02 §14 step 2's Save screen: editable
 * title/description/start-time/duration fields, a computed stats row
 * (Duration · Volume · Sets), the Records-earned section (rendered only
 * when {@link useWorkoutRecordsEarned} returns non-empty data — a no-op
 * today, M4-10 fills it in per that module's own file header), and the
 * primary `Save Workout` button.
 *
 * Structurally mirrors `DurationEditSheet.tsx` (M2-05)'s "Sheet + form
 * fields + Button" shape: the same hour/minute-only start-time affordance
 * (no `CalendarMonth`/day picker primitive exists yet, 07 §5 — same
 * documented limitation that file already carries) and the same
 * "re-seed every draft only on the visible:false->true transition" pattern
 * (`DurationEditSheet`/`NoteEditSheet`'s own file headers) so a still-open
 * sheet never fights the user's in-progress edits.
 *
 * **Volume/Sets are fixed** — the caller (`ActiveWorkoutScreen`) computes
 * them once, from the workout's already-checked sets, using the exact same
 * `domain/volume.ts`/`isStatsEligibleSet` numbers its own meta row already
 * shows (02 §2) — editing title/description/start-time/duration in this
 * sheet never changes them, since unchecked sets are dropped by `finish()`
 * regardless of what this sheet's fields say. **Duration is the one live
 * field**: its hours/minutes/seconds inputs double as both the editable
 * override (folded into `endTime` on save) and the stats row's own Duration
 * figure, recomputed on every keystroke.
 *
 * `onSave` receives a `FinishMeta` (`src/data/workouts/types.ts`) ready to
 * hand straight to `activeWorkoutStore.finish()` — this component never
 * imports the store or the repository itself (kept a dumb, fully controlled
 * sheet, consistent with `DurationEditSheet`).
 */
import React, { useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { Trophy } from 'lucide-react-native';

import type { FinishMeta } from '@/data/workouts/types';
import { formatDuration } from '@/domain/units';
import { Button } from '@/ui/Button';
import { NumericInput } from '@/ui/NumericInput';
import { Sheet } from '@/ui/Sheet';
import { StatColumn } from '@/ui/StatColumn';
import { useTheme } from '@/ui/theme-provider';

import { useWorkoutRecordsEarned } from './records-provider';

export interface SaveWorkoutSheetProps {
  visible: boolean;
  onDismiss: () => void;
  /** The (still-active, pre-finish) workout's own id — threaded through to {@link useWorkoutRecordsEarned}, never persisted from here. */
  workoutId: string;
  initialTitle: string;
  initialDescription: string | null;
  /** The workout's current `start_time` (epoch ms) — seeds the hour/minute fields. */
  startTime: number;
  /** Live elapsed ms at the moment Finish was tapped — seeds the duration fields. */
  elapsedMs: number;
  /** Already unit-converted/rounded volume display, e.g. `"480 kg"` — fixed (see file header). */
  volumeLabel: string;
  /** Checked-sets count — fixed (see file header), same source as the logger's own Sets stat. */
  setsCount: number;
  onSave: (meta: FinishMeta) => void;
  testID?: string;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function SaveWorkoutSheet({
  visible,
  onDismiss,
  workoutId,
  initialTitle,
  initialDescription,
  startTime,
  elapsedMs,
  volumeLabel,
  setsCount,
  onSave,
  testID = 'save-workout-sheet',
}: SaveWorkoutSheetProps): React.JSX.Element {
  const { colors, typography, spacing, radii } = useTheme();

  const [titleDraft, setTitleDraft] = useState(initialTitle);
  const [descriptionDraft, setDescriptionDraft] = useState(initialDescription ?? '');

  const startDate = new Date(startTime);
  const [hourText, setHourText] = useState(() => pad2(startDate.getHours()));
  const [minuteText, setMinuteText] = useState(() => pad2(startDate.getMinutes()));

  const totalElapsedSeconds = Math.floor(elapsedMs / 1000);
  const [hoursText, setHoursText] = useState(() => String(Math.floor(totalElapsedSeconds / 3600)));
  const [minutesText, setMinutesText] = useState(() =>
    String(Math.floor((totalElapsedSeconds % 3600) / 60)),
  );
  const [secondsText, setSecondsText] = useState(() => String(totalElapsedSeconds % 60));

  // Re-seed every draft exactly once per visible:false->true transition —
  // see file header. Mid-render state adjustment (not a `useEffect`), the
  // established pattern for "derive state from a prop change" in this
  // codebase (`DurationEditSheet.tsx`/`NoteEditSheet.tsx`).
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setTitleDraft(initialTitle);
      setDescriptionDraft(initialDescription ?? '');
      const nextStart = new Date(startTime);
      setHourText(pad2(nextStart.getHours()));
      setMinuteText(pad2(nextStart.getMinutes()));
      const seconds = Math.floor(elapsedMs / 1000);
      setHoursText(String(Math.floor(seconds / 3600)));
      setMinutesText(String(Math.floor((seconds % 3600) / 60)));
      setSecondsText(String(seconds % 60));
    }
  }

  // M2-14 "How": "Records earned section renders only when the records
  // provider returns data — wire to a no-op provider now, M4-10 fills it."
  // `visible ? workoutId : null` skips the (no-op, but still a real Query
  // call) hook entirely while the sheet is closed.
  const recordsQuery = useWorkoutRecordsEarned(visible ? workoutId : null);
  const awards = recordsQuery.data ?? [];

  const durationSeconds =
    Math.max(0, parseInt(hoursText, 10) || 0) * 3600 +
    Math.max(0, parseInt(minutesText, 10) || 0) * 60 +
    Math.max(0, parseInt(secondsText, 10) || 0);
  const durationLabel = formatDuration(durationSeconds) ?? '0:00';

  const handleSave = (): void => {
    const hour = Math.min(23, Math.max(0, parseInt(hourText, 10) || 0));
    const minute = Math.min(59, Math.max(0, parseInt(minuteText, 10) || 0));
    const nextStart = new Date(startTime);
    nextStart.setHours(hour, minute, 0, 0);
    const nextStartTime = nextStart.getTime();

    const trimmedTitle = titleDraft.trim();
    const trimmedDescription = descriptionDraft.trim();

    onSave({
      title: trimmedTitle.length > 0 ? trimmedTitle : initialTitle,
      description: trimmedDescription.length > 0 ? trimmedDescription : null,
      startTime: nextStartTime,
      endTime: nextStartTime + durationSeconds * 1000,
    });
  };

  const sectionLabelStyle = {
    ...typography.footnote,
    color: colors.text.tertiary,
    marginBottom: spacing['2'],
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} detent="full" testID={testID}>
      <ScrollView
        style={{ paddingHorizontal: spacing['4'] }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[typography.title2, { color: colors.text.primary, marginBottom: spacing['4'] }]}>
          Save Workout
        </Text>

        <View style={{ marginBottom: spacing['4'] }}>
          <Text style={sectionLabelStyle}>Title</Text>
          <TextInput
            testID={`${testID}-title`}
            value={titleDraft}
            onChangeText={setTitleDraft}
            style={[
              typography.body,
              {
                color: colors.text.primary,
                backgroundColor: colors.bg.elevated,
                borderRadius: radii.sm,
                padding: spacing['3'],
              },
            ]}
          />
        </View>

        <View style={{ marginBottom: spacing['4'] }}>
          <Text style={sectionLabelStyle}>Description</Text>
          <TextInput
            testID={`${testID}-description`}
            value={descriptionDraft}
            onChangeText={setDescriptionDraft}
            multiline
            placeholder="Add a description…"
            placeholderTextColor={colors.text.tertiary}
            style={[
              typography.body,
              {
                color: colors.text.primary,
                backgroundColor: colors.bg.elevated,
                borderRadius: radii.sm,
                padding: spacing['3'],
                minHeight: 80,
                textAlignVertical: 'top',
              },
            ]}
          />
        </View>

        <View style={{ marginBottom: spacing['4'] }}>
          <Text style={sectionLabelStyle}>Start Time</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing['2'] }}>
            <NumericInput
              testID={`${testID}-start-hour`}
              mode="integer"
              value={hourText}
              onChangeText={setHourText}
              placeholder="HH"
              style={{ width: 64 }}
              accessibilityLabel="Start hour"
            />
            <Text style={[typography.title2, { color: colors.text.secondary }]}>:</Text>
            <NumericInput
              testID={`${testID}-start-minute`}
              mode="integer"
              value={minuteText}
              onChangeText={setMinuteText}
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
              testID={`${testID}-duration-hours`}
              mode="integer"
              value={hoursText}
              onChangeText={setHoursText}
              placeholder="H"
              style={{ width: 56 }}
              accessibilityLabel="Duration hours"
            />
            <NumericInput
              testID={`${testID}-duration-minutes`}
              mode="integer"
              value={minutesText}
              onChangeText={setMinutesText}
              placeholder="M"
              style={{ width: 56 }}
              accessibilityLabel="Duration minutes"
            />
            <NumericInput
              testID={`${testID}-duration-seconds`}
              mode="integer"
              value={secondsText}
              onChangeText={setSecondsText}
              placeholder="S"
              style={{ width: 56 }}
              accessibilityLabel="Duration seconds"
            />
          </View>
        </View>

        <View
          testID={`${testID}-stats`}
          style={{
            flexDirection: 'row',
            justifyContent: 'space-around',
            backgroundColor: colors.bg.elevated,
            borderRadius: radii.md,
            paddingVertical: spacing['4'],
            marginBottom: spacing['5'],
          }}
        >
          <StatColumn
            testID={`${testID}-stat-duration`}
            label="Duration"
            value={durationLabel}
            align="center"
          />
          <StatColumn
            testID={`${testID}-stat-volume`}
            label="Volume"
            value={volumeLabel}
            align="center"
          />
          <StatColumn testID={`${testID}-stat-sets`} label="Sets" value={String(setsCount)} align="center" />
        </View>

        {awards.length > 0 ? (
          <View testID={`${testID}-records`} style={{ marginBottom: spacing['5'] }}>
            <Text style={sectionLabelStyle}>Records Earned</Text>
            {awards.map((award, index) => (
              <View
                key={`${award.exerciseId}-${award.kind}-${index}`}
                testID={`${testID}-record-${index}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: spacing['2'],
                  gap: spacing['2'],
                }}
              >
                <Trophy size={18} strokeWidth={1.75} color={colors.semantic.warning} />
                <Text style={[typography.body, { color: colors.text.primary }]}>
                  {award.exerciseName} — new {award.kind} PR: {award.value}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <Button
          testID={`${testID}-save`}
          label="Save Workout"
          variant="primary"
          size="lg"
          onPress={handleSave}
          style={{ marginBottom: spacing['6'] }}
        />
      </ScrollView>
    </Sheet>
  );
}
