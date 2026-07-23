/**
 * Minimal Settings screen (M0-10) — 06 §3 route: `profile/settings/*`. Only
 * two controls land here: theme (System/Light/Dark) and weight unit
 * (kg/lbs), both wired end-to-end through `settingsStore` ->
 * `SettingsRepository` -> SQLite, and (theme only) up into the root
 * `ThemeProvider`'s controlled `preference` prop (`app/_layout.tsx`) so the
 * change is instant app-wide, per 02 §13 #12 / 04 §7's acceptance criteria.
 *
 * Every other 05 §3.5 settings key already has a typed default and Zod
 * schema (`src/data/settings/settings-schema.ts`) but no UI yet — the full
 * Settings surface (Units/General/Workouts/Notifications/Data/About groups,
 * 04 §7) is M5-04's scope, not this task's.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useSettingsStore } from '@/features/settings/settings-store';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { useTheme, type ThemePreference } from '@/ui/theme-provider';

const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const WEIGHT_UNIT_OPTIONS: readonly { value: 'kg' | 'lbs'; label: string }[] = [
  { value: 'kg', label: 'kg' },
  { value: 'lbs', label: 'lbs' },
];

export default function SettingsScreen(): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  const theme = useSettingsStore((state) => state.settings.theme);
  const weightUnit = useSettingsStore((state) => state.settings.weight_unit);

  return (
    <View
      testID="settings-screen"
      style={[styles.container, { backgroundColor: colors.bg.base, padding: spacing['4'] }]}
    >
      <View style={{ marginBottom: spacing['6'] }}>
        <Text
          style={[
            typography.footnote,
            { color: colors.text.secondary, marginBottom: spacing['2'] },
          ]}
        >
          THEME
        </Text>
        <SegmentedControl
          testID="settings-theme-control"
          options={THEME_OPTIONS}
          value={theme}
          onChange={(value) => {
            void useSettingsStore.getState().setSetting('theme', value);
          }}
        />
      </View>

      <View>
        <Text
          style={[
            typography.footnote,
            { color: colors.text.secondary, marginBottom: spacing['2'] },
          ]}
        >
          WEIGHT UNIT
        </Text>
        <SegmentedControl
          testID="settings-weight-unit-control"
          options={WEIGHT_UNIT_OPTIONS}
          value={weightUnit}
          onChange={(value) => {
            void useSettingsStore.getState().setSetting('weight_unit', value);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
