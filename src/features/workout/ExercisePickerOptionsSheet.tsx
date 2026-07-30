/**
 * `ExercisePickerOptionsSheet` — opened from the gear icon in
 * `ExercisePickerSheet`'s header (docs/agent_files/tasks/2026-07-28/
 * 04-exercise-picker-settings-icon/PRD.md). Two rows only: "Reset Filters"
 * (clears this picker's own equipment/muscle `Chip` selections — local
 * component state, not a global setting) and "More Settings" (deep-links to
 * the existing app-wide `/profile/settings` screen for anything that
 * actually affects workout behavior — RPE, rest timer, etc. — rather than
 * duplicating any of that here). See the PRD's §9.1/§9.2 for why the scope
 * stops at these two rows.
 */
import React from 'react';

import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';

export interface ExercisePickerOptionsSheetProps {
  visible: boolean;
  onDismiss: () => void;
  /** Disables "Reset Filters" when neither chip has a value — nothing to reset. */
  filtersActive: boolean;
  onResetFilters: () => void;
  onOpenAppSettings: () => void;
  testID?: string;
}

export function ExercisePickerOptionsSheet({
  visible,
  onDismiss,
  filtersActive,
  onResetFilters,
  onOpenAppSettings,
  testID,
}: ExercisePickerOptionsSheetProps): React.JSX.Element {
  return (
    <Sheet visible={visible} onDismiss={onDismiss} detent="half" testID={testID}>
      <ListRow
        testID={testID ? `${testID}-reset-filters` : undefined}
        title="Reset Filters"
        subtitle="Clear equipment and muscle filters"
        disabled={!filtersActive}
        onPress={onResetFilters}
      />
      <ListRow
        testID={testID ? `${testID}-app-settings` : undefined}
        title="More Settings"
        subtitle="Rest timer, RPE, and other workout preferences"
        chevron
        hideSeparator
        onPress={onOpenAppSettings}
      />
    </Sheet>
  );
}
