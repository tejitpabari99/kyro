/**
 * `MoveToFolderSheet` (M3-02, 04 §1's routine ⋯ menu "Move to Folder ...
 * sheet of folders + 'My Routines'"). Feature-local list-picker `Sheet`,
 * same "not generic enough for src/ui/ yet" reasoning as `FolderNameSheet`.
 */
import React from 'react';
import { Folder } from 'lucide-react-native';

import type { RoutineFolder } from '@/data/routines/types';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { useTheme } from '@/ui/theme-provider';

export interface MoveToFolderSheetProps {
  visible: boolean;
  onDismiss: () => void;
  folders: RoutineFolder[];
  /** The routine's current folder (`null` = already in My Routines) — rendered without a press handler since selecting it would be a no-op (mirrors `RoutineRepository.moveToFolder`'s own no-op-when-unchanged contract). */
  currentFolderId: number | null;
  onSelect: (folderId: number | null) => void;
  testID?: string;
}

export function MoveToFolderSheet({
  visible,
  onDismiss,
  folders,
  currentFolderId,
  onSelect,
  testID = 'move-to-folder-sheet',
}: MoveToFolderSheetProps): React.JSX.Element {
  const { colors } = useTheme();

  const handleSelect = (folderId: number | null): void => {
    if (folderId === currentFolderId) {
      onDismiss();
      return;
    }
    onSelect(folderId);
    onDismiss();
  };

  return (
    <Sheet visible={visible} onDismiss={onDismiss} testID={testID}>
      <ListRow
        testID={`${testID}-my-routines`}
        title="My Routines"
        leading={<Folder size={20} strokeWidth={1.75} color={colors.text.secondary} />}
        disabled={currentFolderId === null}
        onPress={() => handleSelect(null)}
      />
      {folders.map((folder, index) => (
        <ListRow
          key={folder.id}
          testID={`${testID}-folder-${folder.id}`}
          title={folder.title}
          leading={<Folder size={20} strokeWidth={1.75} color={colors.text.secondary} />}
          disabled={currentFolderId === folder.id}
          hideSeparator={index === folders.length - 1}
          onPress={() => handleSelect(folder.id)}
        />
      ))}
    </Sheet>
  );
}
