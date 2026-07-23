/**
 * `FilterOptionSheet` (M1-07) — 03 §2's equipment/muscle filter chip
 * sheets: "each opens a bottom sheet of options ..., single-select per
 * chip ...; `Clear` resets." One generic component parameterized over the
 * option value type so `ExerciseBrowseScreen` instantiates it twice
 * (equipment / muscle) with the labeled option lists already defined in
 * `src/domain/enums.ts` (`EQUIPMENT_OPTIONS`/`MUSCLE_GROUP_OPTIONS`, 05
 * §2.3/§2.4) rather than hand-rolling a second option list here.
 *
 * Built on `src/ui/Sheet.tsx` (bottom sheet primitive) + `ListRow` (each
 * option row, trailing checkmark when selected) — no new sheet chrome.
 */
import React from 'react';
import { Check } from 'lucide-react-native';
import { ScrollView, Text, View } from 'react-native';

import { Sheet } from '@/ui/Sheet';
import { ListRow } from '@/ui/ListRow';
import { Button } from '@/ui/Button';
import { useTheme } from '@/ui/theme-provider';

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

export interface FilterOptionSheetProps<T extends string> {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  options: readonly FilterOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  testID?: string;
}

export function FilterOptionSheet<T extends string>({
  visible,
  onDismiss,
  title,
  options,
  value,
  onChange,
  testID,
}: FilterOptionSheetProps<T>): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  const select = (next: T): void => {
    onChange(next);
    onDismiss();
  };

  const clear = (): void => {
    onChange(null);
    onDismiss();
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} detent="full" testID={testID}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing['4'],
          paddingBottom: spacing['2'],
        }}
      >
        <Text style={[typography.headline, { color: colors.text.primary }]}>{title}</Text>
        <Button
          label="Clear"
          variant="ghost"
          size="sm"
          testID={testID ? `${testID}-clear` : undefined}
          onPress={clear}
        />
      </View>
      <ScrollView>
        {options.map((option, index) => (
          <ListRow
            key={option.value}
            testID={testID ? `${testID}-option-${option.value}` : undefined}
            title={option.label}
            trailing={
              value === option.value ? (
                <Check size={20} strokeWidth={2} color={colors.accent.text} />
              ) : undefined
            }
            hideSeparator={index === options.length - 1}
            onPress={() => select(option.value)}
          />
        ))}
      </ScrollView>
    </Sheet>
  );
}
