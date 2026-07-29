/**
 * `ExerciseRow` (M1-07) — 03 §2's browse-screen row: "44 pt thumbnail
 * (first image, or a colored circle with the exercise's initial as
 * placeholder), name (1 line, tail-truncated), subtitle = primary muscle
 * label; customs show a small 'Custom' tag." Composed entirely from
 * existing `src/ui/` primitives (`ListRow` + `Thumb`, 07 §5's component
 * inventory) — no new visual chrome invented here.
 *
 * Fixed height (`EXERCISE_ROW_HEIGHT`, 06 §8 perf tactic: "fixed row
 * height") rather than left to intrinsic content sizing — every row shows
 * exactly one thumbnail + two lines of text, so a constant height is both
 * correct and (per 06 §8) the deliberate perf choice for the 873-row list.
 *
 * **Picker-mode additions (M2-09, 03 §2 "Picker mode"):** `selected` (shows
 * a trailing checkmark when the row is part of the picker's multi-select)
 * and `onInfoPress` (renders a trailing ⓘ button that opens exercise detail
 * *without* selecting) are both optional and `undefined` by default, so
 * every existing plain-browse call site (`ExerciseBrowseScreen`) is
 * unaffected — `ExercisePickerSheet` is the only caller that passes them,
 * reusing this exact row per this task's own instruction to reuse the
 * M1-07 browse UI rather than hand-rolling a second row component.
 */
import React from 'react';
import { Info, Check } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { MUSCLE_GROUP_LABELS } from '@/domain/enums';
import type { Exercise } from '@/data/exercises/types';

import { resolveExerciseThumbnailSource } from './exercise-thumbnail';
import { Thumb } from '@/ui/Avatar';
import { useTheme } from '@/ui/theme-provider';
import { ListRow } from '@/ui/ListRow';

export const EXERCISE_ROW_HEIGHT = 64;
const THUMBNAIL_SIZE = 44;

export interface ExerciseRowProps {
  exercise: Exercise;
  onPress: (exercise: Exercise) => void;
  hideSeparator?: boolean;
  /** Picker mode only (03 §2) — `undefined` (the default) renders no selection indicator at all. */
  selected?: boolean;
  /** Picker mode only (03 §2: "info button (ⓘ) on the row opens detail without selecting") — renders a trailing ⓘ button that calls this instead of `onPress`. */
  onInfoPress?: (exercise: Exercise) => void;
}

function CustomTag(): React.JSX.Element {
  const { colors, typography, spacing, radii } = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: spacing['2'],
        paddingVertical: 2,
        borderRadius: radii.pill,
        backgroundColor: colors.bg.elevated,
      }}
    >
      <Text style={[typography.caption, { color: colors.text.secondary, fontWeight: '600' }]}>
        Custom
      </Text>
    </View>
  );
}

export function ExerciseRow({
  exercise,
  onPress,
  hideSeparator,
  selected,
  onInfoPress,
}: ExerciseRowProps): React.JSX.Element {
  const { colors, spacing } = useTheme();
  const thumbnailSource = resolveExerciseThumbnailSource(exercise);

  const trailing =
    exercise.isCustom || selected !== undefined || onInfoPress ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing['3'] }}>
        {exercise.isCustom ? <CustomTag /> : null}
        {onInfoPress ? (
          <Pressable
            testID={`exercise-row-${exercise.id}-info`}
            accessibilityRole="button"
            accessibilityLabel={`${exercise.name} details`}
            hitSlop={8}
            onPress={() => onInfoPress(exercise)}
          >
            <Info size={20} strokeWidth={1.75} color={colors.text.tertiary} />
          </Pressable>
        ) : null}
        {selected !== undefined ? (
          <View
            testID={`exercise-row-${exercise.id}-selection`}
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: selected ? 0 : 1.5,
              borderColor: colors.border.input,
              backgroundColor: selected ? colors.accent.primary : 'transparent',
            }}
          >
            {selected ? <Check size={14} strokeWidth={3} color={colors.accent.onAccent} /> : null}
          </View>
        ) : null}
      </View>
    ) : undefined;

  return (
    <ListRow
      testID={`exercise-row-${exercise.id}`}
      title={exercise.name}
      subtitle={MUSCLE_GROUP_LABELS[exercise.primaryMuscleGroup]}
      leading={
        <Thumb source={thumbnailSource} name={exercise.name} size={THUMBNAIL_SIZE} />
      }
      trailing={trailing}
      hideSeparator={hideSeparator}
      onPress={() => onPress(exercise)}
      style={{ height: EXERCISE_ROW_HEIGHT, justifyContent: 'center' }}
    />
  );
}
