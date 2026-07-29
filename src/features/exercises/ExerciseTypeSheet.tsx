/**
 * `ExerciseTypeSheet` (M1-09) — 03 §5's exercise-type picker: "picker with
 * column-preview explanation." One required single-select over
 * `EXERCISE_TYPE_OPTIONS` (`src/domain/enums.ts`), each row showing its
 * short `EXERCISE_TYPE_DESCRIPTIONS` line as a subtitle so the form can
 * explain what each type actually logs, not just its bare label. Built on
 * `Sheet` + `ListRow`, the same primitives `FilterOptionSheet` (M1-07)
 * already established for this feature's option-picker sheets — no new
 * sheet chrome. Unlike `FilterOptionSheet`, this field is **required** (03
 * §5: "Exercise type (required...)"), so there is deliberately no `Clear`
 * button here.
 *
 * The **type-immutable-after-first-logged-set** rule (03 §5) is enforced
 * one level up, in `ExerciseFormScreen`: the field that opens this sheet is
 * disabled with an inline explanation instead of ever mounting the sheet,
 * so this component has no "disabled" mode of its own to test.
 */
import React from 'react';
import { Check } from 'lucide-react-native';
import { ScrollView, Text, View } from 'react-native';

import { EXERCISE_TYPE_DESCRIPTIONS, EXERCISE_TYPE_OPTIONS, type ExerciseType } from '@/domain/enums';
import { Sheet } from '@/ui/Sheet';
import { ListRow } from '@/ui/ListRow';
import { useTheme } from '@/ui/theme-provider';

export interface ExerciseTypeSheetProps {
  visible: boolean;
  onDismiss: () => void;
  value: ExerciseType | null;
  onChange: (value: ExerciseType) => void;
  testID?: string;
}

export function ExerciseTypeSheet({
  visible,
  onDismiss,
  value,
  onChange,
  testID,
}: ExerciseTypeSheetProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  const select = (next: ExerciseType): void => {
    onChange(next);
    onDismiss();
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} detent="full" testID={testID}>
      <View style={{ paddingHorizontal: spacing['4'], paddingBottom: spacing['2'] }}>
        <Text style={[typography.headline, { color: colors.text.primary }]}>Exercise Type</Text>
      </View>
      <ScrollView>
        {EXERCISE_TYPE_OPTIONS.map((option, index) => (
          <ListRow
            key={option.value}
            testID={testID ? `${testID}-option-${option.value}` : undefined}
            title={option.label}
            subtitle={EXERCISE_TYPE_DESCRIPTIONS[option.value]}
            trailing={
              value === option.value ? (
                <Check size={20} strokeWidth={2} color={colors.accent.text} />
              ) : undefined
            }
            hideSeparator={index === EXERCISE_TYPE_OPTIONS.length - 1}
            onPress={() => select(option.value)}
          />
        ))}
      </ScrollView>
    </Sheet>
  );
}
