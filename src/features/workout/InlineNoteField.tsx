/**
 * `InlineNoteField` — always-visible, tap-to-edit-in-place per-exercise note
 * (replaces the old `notes != null` gated row + `NoteEditSheet` modal, see
 * this task's PRD §4.1-4.2). Two render states:
 *  - display: `NoteText` (tappable links) when a note exists, a plain
 *    placeholder otherwise; tapping either enters edit mode.
 *  - edit: a borderless multiline `TextInput`, autofocused, wired to the
 *    shared `KeyboardDoneBar` via `inputAccessoryViewID`. Blur (tap-away or
 *    the Done button, which just calls `Keyboard.dismiss()`) commits the
 *    trimmed draft (empty -> `null`, same rule `NoteEditSheet` used) and
 *    returns to display mode.
 */
import React, { useState } from 'react';
import { Pressable, Text, TextInput } from 'react-native';

import { useTheme } from '@/ui/theme-provider';
import { NoteText } from './NoteText';

export const NOTES_KEYBOARD_ACCESSORY_VIEW_ID = 'kyro-notes-accessory';

export interface InlineNoteFieldProps {
  value: string | null;
  onSave: (note: string | null) => void;
  testID?: string;
}

export function InlineNoteField({
  value,
  onSave,
  testID = 'inline-note-field',
}: InlineNoteFieldProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');

  const beginEdit = (): void => {
    setDraft(value ?? '');
    setEditing(true);
  };

  const commit = (): void => {
    const trimmed = draft.trim();
    onSave(trimmed.length > 0 ? draft : null);
    setEditing(false);
  };

  if (editing) {
    return (
      <TextInput
        testID={`${testID}-input`}
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        multiline
        autoFocus
        inputAccessoryViewID={NOTES_KEYBOARD_ACCESSORY_VIEW_ID}
        placeholder="Add a note for this exercise…"
        placeholderTextColor={colors.text.tertiary}
        style={[
          typography.subhead,
          { color: colors.text.secondary, fontStyle: 'italic', padding: 0, marginBottom: spacing['3'] },
        ]}
      />
    );
  }

  return (
    <Pressable
      testID={`${testID}-row`}
      accessibilityRole="button"
      accessibilityLabel="Edit note"
      onPress={beginEdit}
      style={{ marginBottom: spacing['3'] }}
    >
      {value != null && value.length > 0 ? (
        <NoteText testID={`${testID}-text`} text={value} />
      ) : (
        <Text
          testID={`${testID}-placeholder`}
          style={[typography.subhead, { color: colors.text.tertiary, fontStyle: 'italic' }]}
        >
          Add a note for this exercise…
        </Text>
      )}
    </Pressable>
  );
}
