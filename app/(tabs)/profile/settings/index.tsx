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
 *
 * ## M5-04 additions: General, Notifications, About — Data deliberately omitted
 *
 * Adds three more section groups, same flat-screen/section-header pattern:
 * **GENERAL** (`first_day_of_week` `SegmentedControl` — see
 * `handleFirstDayOfWeekChange` below for the recompute-hook wiring;
 * `weekly_goal` nav row → wheel-picker sheet, `-1` sentinel for "Off" since
 * `0` is already a real, distinct goal value unlike `default_rest_seconds`'s
 * `0`-is-Off case above), **NOTIFICATIONS** (`rest_notifications_enabled`
 * toggle), **ABOUT** (version via `lib/app-info.ts`, `sentry_enabled`
 * toggle — read-once-at-boot, see `app/_layout.tsx`'s own Sentry-init
 * gating and `lib/sentry.ts`'s file header for why this is a genuine
 * next-launch-only exception, not an oversight — "Export Diagnostics" via
 * `lib/diagnostics-export.ts`'s `shareDiagnostics()`, and a "Licenses" nav
 * row → `licenses.tsx`).
 *
 * **Data (Export CSV / Import Hevy CSV / Backup & Restore) is deliberately
 * NOT added here** — `M5-tasks.md`'s M5-04 "How" line says this group
 * should have "entries wiring to M5-06/07/09," but none of those three
 * tasks exist on this branch yet (M5-04 runs before them in the milestone's
 * own dependency order). A settings row that navigates to a route that
 * doesn't exist would 404/throw — a real bug, not a stub worth shipping.
 * See `docs/plan/EXECUTION-LOG.md`'s M5-04 row for the full reasoning.
 */
import React, { useState } from 'react';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import type { FirstDayOfWeek } from '@/domain/enums';
import { invalidateWeekBoundaryQueries } from '@/features/settings/recompute-hooks';
import { useSettingsStore } from '@/features/settings/settings-store';
import { formatRestSeconds, restTimerSecondsOptions } from '@/features/workout/rest-timer-format';
import { getAppVersion } from '@/lib/app-info';
import { shareDiagnostics } from '@/lib/diagnostics-export';
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

const FIRST_DAY_OF_WEEK_OPTIONS: readonly { value: FirstDayOfWeek; label: string }[] = [
  { value: 'monday', label: 'Monday' },
  { value: 'sunday', label: 'Sunday' },
  { value: 'saturday', label: 'Saturday' },
];

/**
 * `weekly_goal` is `number | null` (0-14, `null` = "no goal") — `WheelPicker`
 * only accepts `string | number` values, so `null` needs a sentinel exactly
 * like `default_rest_seconds`'s own `0` = "Off" convention below, except
 * `weekly_goal`'s `0` is already a real, distinct selectable value ("goal:
 * 0 workouts/week" differs from "no goal set") — so this sentinel must sit
 * outside the real 0-14 range. `-1` is never a legal `weekly_goal` (Zod's
 * `.min(0)` rules it out), so it is unambiguous.
 */
const WEEKLY_GOAL_OFF_SENTINEL = -1;
const WEEKLY_GOAL_OPTIONS: readonly { value: number; label: string }[] = [
  { value: WEEKLY_GOAL_OFF_SENTINEL, label: 'Off' },
  ...Array.from({ length: 15 }, (_, goal) => ({ value: goal, label: String(goal) })),
];

function formatWeeklyGoal(goal: number | null): string {
  return goal === null ? 'Off' : `${goal}/week`;
}

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
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const theme = useSettingsStore((state) => state.settings.theme);
  const weightUnit = useSettingsStore((state) => state.settings.weight_unit);
  const firstDayOfWeek = useSettingsStore((state) => state.settings.first_day_of_week);
  const weeklyGoal = useSettingsStore((state) => state.settings.weekly_goal);
  const defaultRestSeconds = useSettingsStore((state) => state.settings.default_rest_seconds);
  const previousValuesMode = useSettingsStore((state) => state.settings.previous_values_mode);
  const rpeEnabled = useSettingsStore((state) => state.settings.rpe_enabled);
  const smartSupersetScroll = useSettingsStore((state) => state.settings.smart_superset_scroll);
  const inlineTimer = useSettingsStore((state) => state.settings.inline_timer);
  const keepAwake = useSettingsStore((state) => state.settings.keep_awake);
  const warmupInStats = useSettingsStore((state) => state.settings.warmup_in_stats);
  const livePrBanner = useSettingsStore((state) => state.settings.live_pr_banner);
  const restNotificationsEnabled = useSettingsStore(
    (state) => state.settings.rest_notifications_enabled,
  );
  const sentryEnabled = useSettingsStore((state) => state.settings.sentry_enabled);

  const [restTimerSheetVisible, setRestTimerSheetVisible] = useState(false);
  const [weeklyGoalSheetVisible, setWeeklyGoalSheetVisible] = useState(false);

  /**
   * M5-04, `M5-tasks.md`'s own M5-04 "How" line: "first day of week ... with
   * recompute hooks — invalidate streaks/stats queries on change." Fires
   * after the write resolves, then invalidates the `'stats'`/`'calendar'`
   * query prefixes via `recompute-hooks.ts`'s helper — see that file's own
   * header for exactly what this call does and does not do (short version:
   * `CalendarScreen`/`StatisticsScreen` already re-bucket correctly via a
   * reactive `useMemo` off this same setting with zero query involvement;
   * this call is the task's own named acceptance case plus defense-in-depth
   * for any future query that does bake the week boundary into its fetch).
   */
  const handleFirstDayOfWeekChange = (value: FirstDayOfWeek): void => {
    void useSettingsStore
      .getState()
      .setSetting('first_day_of_week', value)
      .then(() => invalidateWeekBoundaryQueries(queryClient));
  };

  return (
    <ScrollView
      testID="settings-screen"
      style={[styles.container, { backgroundColor: colors.bg.base }]}
      contentContainerStyle={{
        padding: spacing['4'],
        // BUGFIX-01: `insets.top` clears the status bar/notch — see
        // `app/_layout.tsx`'s header.
        paddingTop: insets.top + spacing['4'],
      }}
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
        GENERAL
      </Text>
      <View
        style={{
          borderRadius: 12,
          overflow: 'hidden',
          backgroundColor: colors.bg.surface,
          marginBottom: spacing['6'],
        }}
      >
        <View style={{ paddingHorizontal: spacing['4'], paddingVertical: spacing['2'] }}>
          <Text
            style={[typography.body, { color: colors.text.primary, marginBottom: spacing['2'] }]}
          >
            First Day of Week
          </Text>
          <SegmentedControl
            testID="settings-first-day-of-week-control"
            options={FIRST_DAY_OF_WEEK_OPTIONS}
            value={firstDayOfWeek}
            onChange={handleFirstDayOfWeekChange}
          />
        </View>

        <ListRow
          testID="settings-weekly-goal-row"
          title="Weekly Workout Goal"
          subtitle={formatWeeklyGoal(weeklyGoal)}
          chevron
          hideSeparator
          onPress={() => setWeeklyGoalSheetVisible(true)}
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

      <Text
        style={[
          typography.footnote,
          { color: colors.text.secondary, marginBottom: spacing['2'], marginTop: spacing['6'] },
        ]}
      >
        NOTIFICATIONS
      </Text>
      <View style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: colors.bg.surface }}>
        <SettingsToggleRow
          testID="settings-rest-notifications-enabled"
          title="Rest Timer Notifications"
          subtitle="Notify when a rest timer finishes"
          hideSeparator
          value={restNotificationsEnabled}
          onValueChange={(value) => {
            void useSettingsStore.getState().setSetting('rest_notifications_enabled', value);
          }}
        />
      </View>

      {/*
        Data (Export CSV / Import Hevy CSV / Backup & Restore) is
        deliberately NOT rendered here — M5-06/M5-07/M5-09 (the tasks that
        would build those flows) haven't landed on this branch yet. A
        settings row that `router.push`es to a route that doesn't exist
        would 404/throw, which is a real bug, not a stub worth shipping
        early. See `docs/plan/EXECUTION-LOG.md`'s M5-04 row for the full
        reasoning — whoever builds M5-06/M5-07/M5-09 next should add a
        "DATA" section here, following this same section-header pattern.
      */}

      <Text
        style={[
          typography.footnote,
          { color: colors.text.secondary, marginBottom: spacing['2'], marginTop: spacing['6'] },
        ]}
      >
        ABOUT
      </Text>
      <View style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: colors.bg.surface }}>
        <ListRow testID="settings-version-row" title="Version" subtitle={getAppVersion()} />

        <SettingsToggleRow
          testID="settings-sentry-enabled"
          title="Crash & Error Reporting"
          subtitle="Sends anonymous crash reports via Sentry — no workout content. Takes effect next launch."
          value={sentryEnabled}
          onValueChange={(value) => {
            void useSettingsStore.getState().setSetting('sentry_enabled', value);
          }}
        />

        <ListRow
          testID="settings-export-diagnostics-row"
          title="Export Diagnostics"
          subtitle="Share recent app log events for debugging"
          onPress={() => {
            void shareDiagnostics();
          }}
        />

        <ListRow
          testID="settings-licenses-link"
          title="Licenses"
          chevron
          hideSeparator
          onPress={() => router.push('/profile/settings/licenses')}
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

      <Sheet
        testID="settings-weekly-goal-sheet"
        visible={weeklyGoalSheetVisible}
        onDismiss={() => setWeeklyGoalSheetVisible(false)}
      >
        <View style={{ paddingHorizontal: spacing['4'], alignItems: 'center' }}>
          <Text
            style={[
              typography.headline,
              { color: colors.text.primary, marginBottom: spacing['3'], alignSelf: 'flex-start' },
            ]}
          >
            Weekly Workout Goal
          </Text>
          <WheelPicker
            testID="settings-weekly-goal-wheel"
            options={WEEKLY_GOAL_OPTIONS}
            value={weeklyGoal ?? WEEKLY_GOAL_OFF_SENTINEL}
            onChange={(value) => {
              void useSettingsStore
                .getState()
                .setSetting('weekly_goal', value === WEEKLY_GOAL_OFF_SENTINEL ? null : value);
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
