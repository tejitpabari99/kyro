/**
 * `AddToSupersetSheet` (M2-09) — 02 §8 / this task's superset stub: "⋯ →
 * `Add to Superset` → sheet lists other exercises in the workout
 * (checkboxes) → confirm groups them under the lowest involved position."
 *
 * Full superset domain (label A/B/C assignment, 6-color palette cycling,
 * dissolution-on-shrink-to-one) is M2-12's job, landing separately — per
 * this task's own scoping note ("stub the superset grouping call if
 * M2-12's domain isn't built yet, just call the store action signature").
 * This sheet implements exactly the one piece 02 §8's own text specifies
 * plainly enough to not require that domain layer: the new group's id is
 * the lowest `position` among every involved exercise (current card +
 * whatever's checked here) — `onConfirm` receives that already-computed id
 * plus the full member id list, and the caller (`ExerciseCard`/screen)
 * fires one `updateExercise({supersetId})` per member via the same store
 * action M2-12 will keep using; nothing here is hardcoded to be replaced
 * wholesale later, just extended (colors/labels) on top.
 */
import React, { useState } from 'react';
import { Check } from 'lucide-react-native';
import { ScrollView, Text, View } from 'react-native';

import { Button } from '@/ui/Button';
import { ListRow } from '@/ui/ListRow';
import { ScreenFooter } from '@/ui/ScreenFooter';
import { Sheet } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { useTheme } from '@/ui/theme-provider';

export interface SupersetCandidate {
  id: string;
  name: string;
  position: number;
}

export interface AddToSupersetSheetProps {
  visible: boolean;
  onDismiss: () => void;
  /** Every *other* workout exercise (the current card is excluded by the caller). */
  candidates: readonly SupersetCandidate[];
  onConfirm: (selectedIds: string[]) => void;
  testID?: string;
}

export function AddToSupersetSheet({
  visible,
  onDismiss,
  candidates,
  onConfirm,
  testID = 'add-to-superset-sheet',
}: AddToSupersetSheetProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  const [selected, setSelected] = useState<string[]>([]);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setSelected([]);
    }
  }

  const toggle = (id: string): void => {
    setSelected((current) => (current.includes(id) ? current.filter((v) => v !== id) : [...current, id]));
  };

  const handleConfirm = (): void => {
    if (selected.length === 0) {
      return;
    }
    onConfirm(selected);
    onDismiss();
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} testID={testID}>
      <View style={{ flex: 1 }}>
        <SheetHeader testID={`${testID}-header`} title="Add to Superset" safeTop={false} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing['4'] }}>
          {candidates.length === 0 ? (
            <Text style={[typography.subhead, { color: colors.text.secondary }]}>
              No other exercises in this workout yet.
            </Text>
          ) : (
            candidates.map((candidate, index) => (
              <ListRow
                key={candidate.id}
                testID={`${testID}-option-${candidate.id}`}
                title={candidate.name}
                trailing={
                  selected.includes(candidate.id) ? (
                    <Check size={20} strokeWidth={2} color={colors.accent.text} />
                  ) : undefined
                }
                hideSeparator={index === candidates.length - 1}
                onPress={() => toggle(candidate.id)}
              />
            ))
          )}
          <ScreenFooter testID={`${testID}-footer`}>
            <Button
              testID={`${testID}-confirm`}
              label={selected.length > 0 ? `Group ${selected.length + 1} Exercises` : 'Group Exercises'}
              variant="primary"
              disabled={selected.length === 0}
              onPress={handleConfirm}
            />
          </ScreenFooter>
        </ScrollView>
      </View>
    </Sheet>
  );
}
