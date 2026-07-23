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
 */
import React from 'react';
import { Text, View } from 'react-native';

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
}: ExerciseRowProps): React.JSX.Element {
  const thumbnailSource = resolveExerciseThumbnailSource(exercise);

  return (
    <ListRow
      testID={`exercise-row-${exercise.id}`}
      title={exercise.name}
      subtitle={MUSCLE_GROUP_LABELS[exercise.primaryMuscleGroup]}
      leading={
        <Thumb source={thumbnailSource} name={exercise.name} size={THUMBNAIL_SIZE} />
      }
      trailing={exercise.isCustom ? <CustomTag /> : undefined}
      hideSeparator={hideSeparator}
      onPress={() => onPress(exercise)}
      style={{ height: EXERCISE_ROW_HEIGHT, justifyContent: 'center' }}
    />
  );
}
