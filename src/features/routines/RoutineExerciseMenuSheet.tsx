/**
 * `RoutineExerciseMenuSheet` (M3-04, 04 §2.1) — the routine editor's own
 * per-exercise ⋯ menu: "reorder/replace/superset/note/rest timer/remove."
 * A dedicated sibling of `src/features/workout/ExerciseCardMenuSheet.tsx`
 * (M2-09) rather than that component reused/parameterized: 04 §2.1 lists
 * exactly six items, deliberately omitting "Add Warm-Up Sets" (a
 * logging-session convenience for pre-filling working-weight-relative warm
 * ups — no such concept applies to a routine target, which has no working
 * weight yet to compute a percentage of) — reusing the logger's menu and
 * threading a `showWarmUpSets` flag through it would make that component's
 * already-large prop surface bear an editor-only branch for one omitted
 * item, versus this ~40-line sibling that just doesn't have it.
 */
import React from 'react';
import { ArrowUpDown, Clock, Link2, Repeat, Trash2, Unlink } from 'lucide-react-native';
import { View } from 'react-native';

import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { useTheme } from '@/ui/theme-provider';

export interface RoutineExerciseMenuSheetProps {
  visible: boolean;
  onDismiss: () => void;
  /** `true` when this exercise already belongs to a superset — swaps the Add/Remove item (02 §8). */
  isGrouped: boolean;
  onReorder: () => void;
  onReplace: () => void;
  onAddToSuperset: () => void;
  onRemoveFromSuperset: () => void;
  onRestTimer: () => void;
  onRemoveExercise: () => void;
  testID?: string;
}

const ICON_SIZE = 20;
const ICON_STROKE_WIDTH = 1.75;

export function RoutineExerciseMenuSheet({
  visible,
  onDismiss,
  isGrouped,
  onReorder,
  onReplace,
  onAddToSuperset,
  onRemoveFromSuperset,
  onRestTimer,
  onRemoveExercise,
  testID = 'routine-exercise-menu-sheet',
}: RoutineExerciseMenuSheetProps): React.JSX.Element {
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
