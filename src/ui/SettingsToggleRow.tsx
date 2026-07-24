/**
 * `SettingsToggleRow` (M2-17) — thin `ListRow` + `Switch` convenience
 * wrapper, cut to avoid repeating the same "title + trailing `Switch`"
 * shape six times across Settings → Workouts (02 §13: RPE Tracking, Smart
 * Superset Scrolling, Inline Timer, Keep Awake, Warm-Up Sets in stats, Live
 * PR Notification). No dedicated wrapper existed before this (`Switch` is
 * used directly, inline, in `plate-calculator.tsx`'s single Enabled row) —
 * this only exists because M2-17 has enough near-identical boolean rows to
 * justify it.
 *
 * `testID` lands on the `Switch` itself (not the row container) so tests
 * can `fireEvent(getByTestId(testID), 'valueChange', next)` directly,
 * matching every existing settings-toggle test in this codebase (e.g.
 * `plate-calculator.tsx`'s `settings-plate-calc-enabled`).
 */
import React from 'react';
import { Switch } from 'react-native';

import { ListRow } from './ListRow';

export interface SettingsToggleRowProps {
  title: string;
  subtitle?: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  hideSeparator?: boolean;
  testID?: string;
}

export function SettingsToggleRow({
  title,
  subtitle,
  value,
  onValueChange,
  hideSeparator = false,
  testID,
}: SettingsToggleRowProps): React.JSX.Element {
  return (
    <ListRow
      testID={testID ? `${testID}-row` : undefined}
      title={title}
      subtitle={subtitle}
      hideSeparator={hideSeparator}
      trailing={<Switch testID={testID} value={value} onValueChange={onValueChange} />}
    />
  );
}
