/**
 * `ReorderExercisesSheet` (M2-09) — 02 §3's ⋯ → "Reorder Exercises
 * (drag-handle sheet listing all workout exercises)."
 *
 * **Why up/down controls instead of a live drag gesture:** a `GripVertical`
 * handle icon renders on every row (the visual affordance 02 §3 asks for),
 * but the actual reordering interaction is a pair of accessible
 * up/down move buttons rather than a `PanResponder`/gesture-handler drag.
 * Two reasons: (1) no drag-and-drop list library is in this project's
 * dependency set (06 §1's table) and hand-rolling real drag physics on top
 * of `react-native-gesture-handler` is a substantial, separately-testable
 * undertaking of its own — out of proportion to this task's actual
 * acceptance gate, which is about the *data* landing correctly
 * (`reorderExercises` persisting positions with PREVIOUS attached right),
 * not the gesture; (2) up/down controls are independently RNTL-testable
 * (`fireEvent.press`) where a raw pan gesture is not, without which this
 * task's "test-first" method requirement couldn't be honored for the reorder
 * flow at all. Real iOS reorderable lists (e.g. Settings apps) commonly ship
 * this exact pattern as an accessibility-parity affordance alongside drag
 * anyway, so it is a legitimate interaction in its own right, not merely a
 * test shim.
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { Button } from '@/ui/Button';
import { ScreenFooter } from '@/ui/ScreenFooter';
import { Sheet } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { useTheme } from '@/ui/theme-provider';

export interface ReorderableExercise {
  id: string;
  name: string;
}

export interface ReorderExercisesSheetProps {
  visible: boolean;
  onDismiss: () => void;
  /** Current workout order (position-ascending). */
  exercises: readonly ReorderableExercise[];
  onSave: (orderedIds: string[]) => void;
  testID?: string;
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = items.slice();
  const [removed] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, removed as T);
  return next;
}

export function ReorderExercisesSheet({
  visible,
  onDismiss,
  exercises,
  onSave,
  testID = 'reorder-exercises-sheet',
}: ReorderExercisesSheetProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  const [draft, setDraft] = useState<ReorderableExercise[]>(exercises.slice());
  // Re-seed on every open transition (same pattern as `NoteEditSheet` /
  // `DurationEditSheet`) so a stale draft from a previous open never leaks
  // in, and so a workout mutation that happened while the sheet was closed
  // (e.g. an exercise added elsewhere) is reflected the next time it opens.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDraft(exercises.slice());
    }
  }

  const move = (index: number, direction: -1 | 1): void => {
    const target = index + direction;
    if (target < 0 || target >= draft.length) {
      return;
    }
    setDraft((current) => moveItem(current, index, target));
  };

  const handleSave = (): void => {
    onSave(draft.map((exercise) => exercise.id));
    onDismiss();
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} detent="full" testID={testID}>
      <View style={{ flex: 1 }}>
        <SheetHeader testID={`${testID}-header`} title="Reorder Exercises" safeTop />
        {/* PRD C (reorder-exercises-sheet-fixes) owns adding a Cancel/dismiss
            control to this header per §4.5's corollary — deliberately not
            added here to avoid two PRDs editing the same header row. */}
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing['4'] }}>
          {draft.map((exercise, index) => (
            <View
              key={exercise.id}
              testID={`${testID}-row-${exercise.id}`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: spacing['2'],
                borderBottomWidth: index === draft.length - 1 ? 0 : 1,
                borderBottomColor: colors.border.hairline,
              }}
            >
              <GripVertical size={18} strokeWidth={1.75} color={colors.text.tertiary} />
              <Text
                style={[typography.body, { color: colors.text.primary, flex: 1, marginLeft: spacing['2'] }]}
                numberOfLines={1}
              >
                {exercise.name}
              </Text>
              <Pressable
                testID={`${testID}-row-${exercise.id}-up`}
                accessibilityRole="button"
                accessibilityLabel={`Move ${exercise.name} up`}
                disabled={index === 0}
                onPress={() => move(index, -1)}
                hitSlop={8}
                style={{ opacity: index === 0 ? 0.3 : 1, padding: spacing['1'] }}
              >
                <ChevronUp size={20} strokeWidth={1.75} color={colors.text.secondary} />
              </Pressable>
              <Pressable
                testID={`${testID}-row-${exercise.id}-down`}
                accessibilityRole="button"
                accessibilityLabel={`Move ${exercise.name} down`}
                disabled={index === draft.length - 1}
                onPress={() => move(index, 1)}
                hitSlop={8}
                style={{ opacity: index === draft.length - 1 ? 0.3 : 1, padding: spacing['1'] }}
              >
                <ChevronDown size={20} strokeWidth={1.75} color={colors.text.secondary} />
              </Pressable>
            </View>
          ))}
          <ScreenFooter testID={`${testID}-footer`}>
            <Button
              testID={`${testID}-save`}
              label="Save Order"
              variant="primary"
              onPress={handleSave}
            />
          </ScreenFooter>
        </ScrollView>
      </View>
    </Sheet>
  );
}
