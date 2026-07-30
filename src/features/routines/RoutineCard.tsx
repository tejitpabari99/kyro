/**
 * `RoutineCard` (M3-02, 04 §1) — title, 2-line grey exercise-name preview,
 * ⋯ menu trigger, full-width **tonal** `Start Routine` button (07 §5/§6:
 * "Routine card: Start Routine as full-width tonal button ... tonal keeps
 * single-accent hierarchy under the page-level primary"). Built as a plain
 * `View` + bottom hairline divider (07-history-routines-list-decarding PRD
 * §4.1) — no `Card` surface, matching `ListRow`'s hairline-divider idiom
 * used elsewhere in this codebase.
 *
 * **Reorder mode (M3-03):** when `reorderMode` is true the ⋯ trigger and
 * `Start Routine` button are replaced by `dragHandle` (a
 * `Draggable.Handle`-wrapped grip icon `FolderSection.tsx` supplies — this
 * component itself stays dnd-library-agnostic, matching `RoutineCard`'s
 * existing "dumb, presentational" role; all `react-native-reanimated-dnd`
 * wiring lives one level up) and the preview line is hidden to declutter
 * the row while dragging. Tapping neither Start nor ⋯ while mid-drag is a
 * deliberate simplification, not an oversight — both actions are
 * meaningless mid-reorder (starting a workout or opening a menu while a
 * drag gesture might be in flight on the same row).
 */
import React from 'react';
import { Ellipsis } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { RoutineSummary } from '@/data/routines/types';
import { Button } from '@/ui/Button';
import { useTheme } from '@/ui/theme-provider';

export interface RoutineCardProps {
  routine: RoutineSummary;
  /** The 2-line preview line's text — `''` renders no preview row at all (still-loading case, `buildExercisePreview`'s contract). */
  preview: string;
  onStart: () => void;
  onMenuPress: () => void;
  /** M3-03 reorder mode — see file header. */
  reorderMode?: boolean;
  /** Rendered in place of the ⋯ trigger when `reorderMode` is true; ignored otherwise. */
  dragHandle?: React.ReactNode;
  testID?: string;
}

export function RoutineCard({
  routine,
  preview,
  onStart,
  onMenuPress,
  reorderMode = false,
  dragHandle,
  testID = 'routine-card',
}: RoutineCardProps): React.JSX.Element {
  const { colors, spacing, typography } = useTheme();

  return (
    <View
      testID={testID}
      style={{
        paddingVertical: spacing['3'],
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border.hairline,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text
          style={[typography.headline, { color: colors.text.primary, flex: 1 }]}
          numberOfLines={1}
        >
          {routine.title}
        </Text>
        {reorderMode ? (
          dragHandle
        ) : (
          <Pressable
            testID={`${testID}-menu`}
            accessibilityRole="button"
            accessibilityLabel={`More actions for ${routine.title}`}
            hitSlop={8}
            onPress={onMenuPress}
          >
            <Ellipsis size={22} strokeWidth={1.75} color={colors.text.primary} />
          </Pressable>
        )}
      </View>
      {!reorderMode && preview.length > 0 ? (
        <Text
          testID={`${testID}-preview`}
          style={[typography.footnote, { color: colors.text.secondary, marginTop: spacing['1'] }]}
          numberOfLines={2}
        >
          {preview}
        </Text>
      ) : null}
      {reorderMode ? null : (
        <Button
          testID={`${testID}-start`}
          label="Start Routine"
          variant="tonal"
          size="md"
          onPress={onStart}
          style={{ marginTop: spacing['2'], alignSelf: 'stretch' }}
        />
      )}
    </View>
  );
}
