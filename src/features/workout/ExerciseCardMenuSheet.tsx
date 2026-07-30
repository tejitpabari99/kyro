/**
 * `ExerciseCardMenuSheet` (M2-09) — 02 §3's exercise-card ⋯ menu: "Reorder
 * Exercises ... Replace Exercise ... Add to Superset / Remove from Superset
 * ... Add Warm-Up Sets ... Rest Timer ... Remove Exercise
 * (no confirm; snackbar with Undo)." Every item is a plain callback prop —
 * this component owns no state or navigation itself, `ExerciseCard` decides
 * what each press actually does (open a sub-sheet, bubble to the screen for
 * cross-card operations, etc.).
 */
import React from 'react';
import {
  ArrowUpDown,
  Clock,
  Flame,
  Link2,
  Repeat,
  Trash2,
  Unlink,
} from 'lucide-react-native';
import { View } from 'react-native';

import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { useTheme } from '@/ui/theme-provider';

export interface ExerciseCardMenuSheetProps {
  visible: boolean;
  onDismiss: () => void;
  /** `true` when this exercise already belongs to a superset — swaps the Add/Remove item (02 §8). */
  isGrouped: boolean;
  onReorder: () => void;
  onReplace: () => void;
  onAddToSuperset: () => void;
  onRemoveFromSuperset: () => void;
  onAddWarmUpSets: () => void;
  onRestTimer: () => void;
  onRemoveExercise: () => void;
  testID?: string;
}

const ICON_SIZE = 20;
const ICON_STROKE_WIDTH = 1.75;

export function ExerciseCardMenuSheet({
  visible,
  onDismiss,
  isGrouped,
  onReorder,
  onReplace,
  onAddToSuperset,
  onRemoveFromSuperset,
  onAddWarmUpSets,
  onRestTimer,
  onRemoveExercise,
  testID = 'exercise-card-menu-sheet',
}: ExerciseCardMenuSheetProps): React.JSX.Element {
  const { colors } = useTheme();

  const dismissThen = (action: () => void) => (): void => {
    onDismiss();
    action();
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} testID={testID}>
      <View>
        <ListRow
          testID={`${testID}-reorder`}
          title="Reorder Exercises"
          leading={<ArrowUpDown size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} color={colors.text.secondary} />}
          onPress={dismissThen(onReorder)}
        />
        <ListRow
          testID={`${testID}-replace`}
          title="Replace Exercise"
          leading={<Repeat size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} color={colors.text.secondary} />}
          onPress={dismissThen(onReplace)}
        />
        {isGrouped ? (
          <ListRow
            testID={`${testID}-remove-from-superset`}
            title="Remove from Superset"
            leading={<Unlink size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} color={colors.text.secondary} />}
            onPress={dismissThen(onRemoveFromSuperset)}
          />
        ) : (
          <ListRow
            testID={`${testID}-add-to-superset`}
            title="Add to Superset"
            leading={<Link2 size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} color={colors.text.secondary} />}
            onPress={dismissThen(onAddToSuperset)}
          />
        )}
        <ListRow
          testID={`${testID}-warmup-sets`}
          title="Add Warm-Up Sets"
          leading={<Flame size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} color={colors.text.secondary} />}
          onPress={dismissThen(onAddWarmUpSets)}
        />
        <ListRow
          testID={`${testID}-rest-timer`}
          title="Rest Timer"
          leading={<Clock size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} color={colors.text.secondary} />}
          onPress={dismissThen(onRestTimer)}
        />
        <ListRow
          testID={`${testID}-remove-exercise`}
          title="Remove Exercise"
          leading={<Trash2 size={ICON_SIZE} strokeWidth={ICON_STROKE_WIDTH} color={colors.semantic.danger} />}
          hideSeparator
          onPress={dismissThen(onRemoveExercise)}
        />
      </View>
    </Sheet>
  );
}
