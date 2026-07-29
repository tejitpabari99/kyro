/**
 * `NoteEditSheet` (M2-09) — 02 §3's "Add a Note" ⋯ menu item / note-row tap
 * target: a free-text multiline note saved on the workout exercise (02 §9:
 * "free text, multiline ... Routine note pre-fills each run; editing it
 * mid-workout affects only this workout"). Saving an all-whitespace/empty
 * draft clears the note (`null`) rather than persisting an empty string, so
 * the card's note row (which only renders when `notes != null`, `ExerciseCard`'s
 * own contract) disappears again exactly like it would if the note had
 * never been set.
 */
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';

import { Button } from '@/ui/Button';
import { ScreenFooter } from '@/ui/ScreenFooter';
import { Sheet } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { useTheme } from '@/ui/theme-provider';

export interface NoteEditSheetProps {
  visible: boolean;
  onDismiss: () => void;
  initialValue: string;
  onSave: (note: string | null) => void;
  testID?: string;
}

export function NoteEditSheet({
  visible,
  onDismiss,
  initialValue,
  onSave,
  testID = 'note-edit-sheet',
}: NoteEditSheetProps): React.JSX.Element {
  const { colors, typography, spacing, radii } = useTheme();

  const [draft, setDraft] = useState(initialValue);
  // Re-seed the draft every time the sheet transitions to open (same
  // mid-render "derive state from a prop change" pattern `DurationEditSheet`
  // / `MultiSelectOptionSheet` already use) so a stale draft from the
  // *previous* time this sheet was opened for a *different* exercise never
  // leaks in.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDraft(initialValue);
    }
  }

  const handleSave = (): void => {
    const trimmed = draft.trim();
    onSave(trimmed.length > 0 ? draft : null);
    onDismiss();
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} testID={testID}>
      <SheetHeader testID={`${testID}-header`} title="Note" safeTop={false} />
      <View style={{ paddingHorizontal: spacing['4'], flex: 1 }}>
        <TextInput
          testID={`${testID}-input`}
          value={draft}
          onChangeText={setDraft}
          multiline
          autoFocus
          placeholder="Add a note for this exercise…"
          placeholderTextColor={colors.text.tertiary}
          style={[
            typography.body,
            {
              color: colors.text.primary,
              backgroundColor: colors.bg.elevated,
              borderRadius: radii.sm,
              padding: spacing['3'],
              minHeight: 120,
              textAlignVertical: 'top',
            },
          ]}
        />
      </View>
      <ScreenFooter testID={`${testID}-footer`}>
        <Button testID={`${testID}-save`} label="Save" variant="primary" onPress={handleSave} />
      </ScreenFooter>
    </Sheet>
  );
}
