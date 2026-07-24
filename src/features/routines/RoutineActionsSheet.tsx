/**
 * `RoutineActionsSheet` (M3-02) — the shared ⋯-menu `Sheet` shape for both
 * a folder's ⋯ (Rename/Reorder/Delete) and a routine's ⋯ (Start
 * Routine/Edit/Duplicate/Move to Folder/Reorder/Delete, 04 §1). One small
 * generic list-of-actions component rather than two near-duplicate sheets.
 *
 * Rows are plain `Pressable`+`Text` rather than `src/ui/ListRow.tsx` —
 * `ListRow`'s `title` always renders in `colors.text.primary` with no color
 * override, and this menu needs a destructive (danger-red) item ("Delete")
 * alongside plain ones; `ExerciseDetailScreen.tsx`'s own actions sheet
 * (M1-08) sidesteps the same gap by tinting only a leading icon, but 04 §1
 * doesn't call for icons on these six items, so a minimal bespoke row
 * (still built from `Sheet` + theme tokens, no new `src/ui/` primitive
 * needed for six lines of layout) is the simpler fit here.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Sheet } from '@/ui/Sheet';
import { useTheme } from '@/ui/theme-provider';

export interface RoutineActionsSheetItem {
  key: string;
  label: string;
  destructive?: boolean;
  onPress: () => void;
}

export interface RoutineActionsSheetProps {
  visible: boolean;
  onDismiss: () => void;
  items: RoutineActionsSheetItem[];
  testID?: string;
}

export function RoutineActionsSheet({
  visible,
  onDismiss,
  items,
  testID = 'routine-actions-sheet',
}: RoutineActionsSheetProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  return (
    <Sheet visible={visible} onDismiss={onDismiss} testID={testID}>
      {items.map((item, index) => (
        <View key={item.key}>
          <Pressable
            testID={`${testID}-${item.key}`}
            accessibilityRole="button"
            accessibilityLabel={item.label}
            onPress={item.onPress}
            style={({ pressed }) => [
              styles.row,
              {
                paddingHorizontal: spacing['4'],
                backgroundColor: pressed ? colors.bg.elevated : 'transparent',
              },
            ]}
          >
            <Text
              style={[
                typography.body,
                { color: item.destructive ? colors.semantic.danger : colors.text.primary },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
          {index < items.length - 1 ? (
            <View
              style={{
                height: StyleSheet.hairlineWidth,
                backgroundColor: colors.border.hairline,
                marginLeft: spacing['4'],
              }}
            />
          ) : null}
        </View>
      ))}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    justifyContent: 'center',
  },
});
