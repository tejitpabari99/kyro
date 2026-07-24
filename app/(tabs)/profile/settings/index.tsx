/**
 * Settings screen — Theme + Weight Unit (M0-10) plus, from this task
 * (M2-17, 02 §13/04 §7), the Settings → Workouts group: the 12 items 02
 * §13 lists (11 rendered here directly + Weight Unit above, which already
 * covers item 12 "Units" for this M2 subset — distance/body-measurement
 * units are 04 §7's fuller Units group, a later milestone).
 *
 * Kept as a single flat screen with a "WORKOUTS" section header rather than
 * a separate sub-route: ~13 rows total reads fine as one scroll, and
 * inventing a nested `Workouts` route just for this task would be Settings
 * navigation structure 04 §7/M5-04 hasn't specified yet. `Sounds` is the one
 * exception — it bundles 4 sub-settings (`sounds.timer_sound` + three
 * volumes), so it gets its own nav row → `sounds.tsx`, same "settings
 * screen writes, feature consumer reads" split as the existing Plate
 * Calculator / Warm-up Calculator nav rows (M2-15/M2-16, already built —
 * this task only adds the `ListRow` entries that link to them).
 *
 * Every row reads its value via a reactive `useSettingsStore` selector, so
 * flipping a toggle here is what makes it "apply live mid-workout" for any
 * other component subscribed to the same key (`ActiveWorkoutScreen.tsx`
 * already selects `weight_unit`/`rpe_enabled`/`previous_values_mode`/
 * `warmup_in_stats`/`default_rest_seconds`/`plate_calc.enabled`/
 * `keep_awake` this way, and `ConnectedSetRow.tsx` selects `inline_timer` —
 * verified by inspection for this task, not modified here since that file
 * belongs to a parallel M2-14 task).
 */
import React, { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSettingsStore } from '@/features/settings/settings-store';
import { formatRestSeconds, restTimerSecondsOptions } from '@/features/workout/rest-timer-format';
import { ListRow } from '@/ui/ListRow';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { SettingsToggleRow } from '@/ui/SettingsToggleRow';
import { Sheet } from '@/ui/Sheet';
import { useTheme, type ThemePreference } from '@/ui/theme-provider';
import { WheelPicker } from '@/ui/WheelPicker';

const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const WEIGHT_UNIT_OPTIONS: readonly { value: 'kg' | 'lbs'; label: string }[] = [
  { value: 'kg', label: 'kg' },
  { value: 'lbs', label: 'lbs' },
];

const PREVIOUS_VALUES_OPTIONS: readonly {
  value: 'any_workout' | 'same_routine';
  label: string;
}[] = [
  { value: 'any_workout', label: 'Any Workout' },
  { value: 'same_routine', label: 'Same Routine' },
];

/** `0` (rather than `null`) is the "Off" sentinel for `default_rest_seconds` — it's a plain, non-nullable `number` (05 §3.5), unlike `workout_exercises.rest_seconds`. */
const DEFAULT_REST_TIMER_OPTIONS = [
  { value: 0, label: 'Off' },
  ...restTimerSecondsOptions().map((seconds) => ({ value: seconds, label: formatRestSeconds(seconds) })),
];

function formatDefaultRestSeconds(seconds: number): string {
  return seconds === 0 ? 'Off' : formatRestSeconds(seconds);
}

export default function SettingsScreen(): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  const theme = useSettingsStore((state) => state.settings.theme);
  const weightUnit = useSettingsStore((state) => state.settings.weight_unit);
  const defaultRestSeconds = useSettingsStore((state) => state.settings.default_rest_seconds);
  const previousValuesMode = useSettingsStore((state) => state.settings.previous_values_mode);
  const rpeEnabled = useSettingsStore((state) => state.settings.rpe_enabled);
  const smartSupersetScroll = useSettingsStore((state) => state.settings.smart_superset_scroll);
  const inlineTimer = useSettingsStore((state) => state.settings.inline_timer);
  const keepAwake = useSettingsStore((state) => state.settings.keep_awake);
  const warmupInStats = useSettingsStore((state) => state.settings.warmup_in_stats);
  const livePrBanner = useSettingsStore((state) => state.settings.live_pr_banner);

  const [restTimerSheetVisible, setRestTimerSheetVisible] = useState(false);

  return (
    <ScrollView
      testID="settings-screen"
      style={[styles.container, { backgroundColor: colors.bg.base }]}
      contentContainerStyle={{ padding: spacing['4'] }}
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

      <View style={{ marginBottom: spacing['6'] }}>
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

      <Text
        style={[typography.footnote, { color: colors.text.secondary, marginBottom: spacing['2'] }]}
      >
        WORKOUTS
      </Text>
      <View style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: colors.bg.surface }}>
        <ListRow
          testID="settings-default-rest-timer-row"
          title="Default Rest Timer"
          subtitle={formatDefaultRestSeconds(defaultRestSeconds)}
          chevron
          onPress={() => setRestTimerSheetVisible(true)}
        />

        <View style={{ paddingHorizontal: spacing['4'], paddingVertical: spacing['2'] }}>
          <Text
            style={[typography.body, { color: colors.text.primary, marginBottom: spacing['2'] }]}
          >
            Previous Workout Values
          </Text>
          <SegmentedControl
            testID="settings-previous-values-control"
            options={PREVIOUS_VALUES_OPTIONS}
            value={previousValuesMode}
            onChange={(value) => {
              void useSettingsStore.getState().setSetting('previous_values_mode', value);
            }}
          />
        </View>

        <SettingsToggleRow
          testID="settings-rpe-enabled"
          title="RPE Tracking"
          subtitle="Show an RPE column on the set table"
          value={rpeEnabled}
          onValueChange={(value) => {
            void useSettingsStore.getState().setSetting('rpe_enabled', value);
          }}
        />

        <SettingsToggleRow
          testID="settings-smart-superset-scroll"
          title="Smart Superset Scrolling"
          value={smartSupersetScroll}
          onValueChange={(value) => {
            void useSettingsStore.getState().setSetting('smart_superset_scroll', value);
          }}
        />

        <SettingsToggleRow
          testID="settings-inline-timer"
          title="Inline Timer"
          value={inlineTimer}
          onValueChange={(value) => {
            void useSettingsStore.getState().setSetting('inline_timer', value);
          }}
        />

        <SettingsToggleRow
          testID="settings-keep-awake"
          title="Keep Awake During Workout"
          value={keepAwake}
          onValueChange={(value) => {
            void useSettingsStore.getState().setSetting('keep_awake', value);
          }}
        />

        <ListRow
          testID="settings-sounds-link"
          title="Sounds"
          chevron
          onPress={() => router.push('/profile/settings/sounds')}
        />

        <SettingsToggleRow
          testID="settings-warmup-in-stats"
          title="Warm-Up Sets in Stats"
          subtitle="Include warm-up sets in volume/sets stats"
          value={warmupInStats}
          onValueChange={(value) => {
            void useSettingsStore.getState().setSetting('warmup_in_stats', value);
          }}
        />

        <ListRow
          testID="settings-plate-calc-link"
          title="Plate Calculator"
          chevron
          onPress={() => router.push('/profile/settings/plate-calculator')}
        />

        <ListRow
          testID="settings-warmup-calc-link"
          title="Warm-up Calculator"
          chevron
          onPress={() => router.push('/profile/settings/warmup-calculator')}
        />

        <SettingsToggleRow
          testID="settings-live-pr-banner"
          title="Live PR Notification"
          hideSeparator
          value={livePrBanner}
          onValueChange={(value) => {
            void useSettingsStore.getState().setSetting('live_pr_banner', value);
          }}
        />
      </View>

      <Sheet
        testID="settings-default-rest-timer-sheet"
        visible={restTimerSheetVisible}
        onDismiss={() => setRestTimerSheetVisible(false)}
      >
        <View style={{ paddingHorizontal: spacing['4'], alignItems: 'center' }}>
          <Text
            style={[
              typography.headline,
              { color: colors.text.primary, marginBottom: spacing['3'], alignSelf: 'flex-start' },
            ]}
          >
            Default Rest Timer
          </Text>
          <WheelPicker
            testID="settings-default-rest-timer-wheel"
            options={DEFAULT_REST_TIMER_OPTIONS}
            value={defaultRestSeconds}
            onChange={(value) => {
              void useSettingsStore.getState().setSetting('default_rest_seconds', value);
            }}
          />
        </View>
      </Sheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
