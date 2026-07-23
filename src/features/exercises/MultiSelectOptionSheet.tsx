/**
 * `MultiSelectOptionSheet` (M1-09) — 03 §5's secondary-muscles field:
 * "secondary muscle groups (multi-select, optional)." A generic
 * multi-select sheet parameterized over the option value type (mirrors
 * `FilterOptionSheet`'s single-select generic, M1-07), so it can serve any
 * future multi-select need without a second bespoke component. Unlike
 * `FilterOptionSheet` (select-and-immediately-close), each row toggles its
 * own checkmark and stays open — a `Done` button commits and dismisses,
 * matching the standard "pick several, then confirm" multi-select pattern
 * (03 §5 doesn't specify chrome beyond "multi-select", so this follows the
 * same `Sheet` + `ListRow` construction `FilterOptionSheet`/
 * `ExerciseTypeSheet` already use for every other option-picker in this
 * feature).
 */
import React, { useState } from 'react';
import { Check } from 'lucide-react-native';
import { ScrollView, Text, View } from 'react-native';

import { Sheet } from '@/ui/Sheet';
import { ListRow } from '@/ui/ListRow';
import { Button } from '@/ui/Button';
import { useTheme } from '@/ui/theme-provider';

export interface MultiSelectOption<T extends string> {
  value: T;
  label: string;
}

export interface MultiSelectOptionSheetProps<T extends string> {
  visible: boolean;
  onDismiss: () => void;
  title: string;
  options: readonly MultiSelectOption<T>[];
  value: readonly T[];
  onChange: (value: T[]) => void;
  testID?: string;
}

export function MultiSelectOptionSheet<T extends string>({
  visible,
  onDismiss,
  title,
  options,
  value,
  onChange,
  testID,
}: MultiSelectOptionSheetProps<T>): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  // Local draft so toggles don't commit until `Done` — reset from `value`
  // every time the sheet transitions to open (matches `FilterOptionSheet`'s
  // "one option list, opened fresh each time" mental model). Mid-render
  // state adjustment (same pattern `ExerciseMedia.tsx`, M1-08, already
  // established in this codebase for "derive state from a prop change")
  // rather than a `useEffect` — calling `setState` unconditionally inside
  // an effect body triggers an extra render-then-immediately-re-render
  // cascade every commit, flagged by this repo's
  // `react-hooks/set-state-in-effect` lint rule.
  const [draft, setDraft] = useState<T[]>(value as T[]);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDraft(value as T[]);
    }
  }

  const toggle = (option: T): void => {
    setDraft((current) =>
      current.includes(option) ? current.filter((v) => v !== option) : [...current, option],
    );
  };

  const commit = (): void => {
    onChange(draft);
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
        <Button label="Done" variant="ghost" size="sm" testID={testID ? `${testID}-done` : undefined} onPress={commit} />
      </View>
      <ScrollView>
        {options.map((option, index) => (
          <ListRow
            key={option.value}
            testID={testID ? `${testID}-option-${option.value}` : undefined}
            title={option.label}
            trailing={
              draft.includes(option.value) ? (
                <Check size={20} strokeWidth={2} color={colors.accent.text} />
              ) : undefined
            }
            hideSeparator={index === options.length - 1}
            onPress={() => toggle(option.value)}
          />
        ))}
      </ScrollView>
    </Sheet>
  );
}
