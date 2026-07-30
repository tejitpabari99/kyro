/**
 * `FolderNameSheet` (M3-02) — the single-text-field `Sheet` used for both
 * "New Folder" (folder-plus icon, 04 §1) and a folder's ⋯ menu "Rename".
 * Feature-local rather than a `src/ui/` primitive, same call `DurationEditSheet`
 * (`src/features/workout/DurationEditSheet.tsx`, M2-05) makes for the identical
 * shape (a `Sheet` + one `TextInput` + Save button) — this is a
 * routines-specific text prompt, not a generic enough pattern to promote to
 * `src/ui/` yet (07 §5's "new primitives go in src/ui/" rule is for
 * cross-feature-reusable components).
 */
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';

import { Button } from '@/ui/Button';
import { ScreenFooter } from '@/ui/ScreenFooter';
import { Sheet } from '@/ui/Sheet';
import { SheetHeader } from '@/ui/SheetHeader';
import { useTheme } from '@/ui/theme-provider';

export interface FolderNameSheetProps {
  visible: boolean;
  onDismiss: () => void;
  /** `'New Folder'` (create) vs `'Rename Folder'` (rename) — also used as the sheet's own title text. */
  title: string;
  initialValue?: string;
  onSave: (title: string) => void;
  testID?: string;
}

export function FolderNameSheet({
  visible,
  onDismiss,
  title,
  initialValue = '',
  onSave,
  testID = 'folder-name-sheet',
}: FolderNameSheetProps): React.JSX.Element {
  const { colors, typography, spacing, radii } = useTheme();

  const [draft, setDraft] = useState(initialValue);
  // Re-seed the draft every time the sheet opens (same mid-render "derive
  // state from a prop change" pattern `DurationEditSheet`
  // already uses) so a stale draft from a previous open (a different
  // folder's rename, or a leftover create draft) never leaks in.
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) {
      setDraft(initialValue);
    }
  }

  const trimmed = draft.trim();
  const canSave = trimmed.length > 0;

  const handleSave = (): void => {
    if (!canSave) return;
    onSave(trimmed);
    onDismiss();
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} testID={testID}>
      <SheetHeader testID={`${testID}-header`} title={title} safeTop={false} />
      <View style={{ paddingHorizontal: spacing['4'], flex: 1 }}>
        <TextInput
          testID={`${testID}-input`}
          value={draft}
          onChangeText={setDraft}
          autoFocus
          placeholder="Folder name"
          placeholderTextColor={colors.text.tertiary}
          style={[
            typography.body,
            {
              color: colors.text.primary,
              backgroundColor: colors.bg.elevated,
              borderRadius: radii.sm,
              padding: spacing['3'],
            },
          ]}
        />
        <ScreenFooter testID={`${testID}-footer`}>
          <Button
            testID={`${testID}-save`}
            label="Save"
            variant="primary"
            disabled={!canSave}
            onPress={handleSave}
          />
        </ScreenFooter>
      </View>
    </Sheet>
  );
}
