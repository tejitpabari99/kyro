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
 *
 * ## M5-06 addition: DATA section — Export CSV only
 *
 * Adds the DATA group M5-04's own comment (just above, left unchanged as
 * the historical record) reserved for whoever built M5-06/07/09 next. Only
 * "Export CSV" lands here — `CsvService.exportAll()`
 * (`features/data-transfer/csv-service.ts`) writes every completed workout
 * to `kyro_workouts.csv` in the cache directory per the *live*
 * `weight_unit`/`distance_unit` settings, then `lib/share-file.ts`'s
 * `shareFile` opens the OS share sheet on it. "Import Hevy CSV"/"Backup &
 * Restore" stay out (M5-07/M5-09's own not-yet-built routes) — same
 * "no dead row pointing at a route that doesn't exist" reasoning M5-04's own
 * comment already gives, applied narrowly now that only one of the three
 * rows actually has a real destination.
 *
 * `exportingCsv` covers the three real failure/edge modes a physical device
 * can hit that a dev-machine smoke test can't: zero workouts (handled
 * upstream by `encodeWorkoutsCsv`'s own header-only-CSV fallback — this
 * screen never special-cases it), a full-disk cache-write failure, and the
 * user dismissing the share sheet without picking a destination (`shareFile`
 * itself can't distinguish "shared" from "dismissed," so this row simply
 * never claims either outcome — it only ever reports "started" -> "done" or
 * "failed"). Every rejected promise in the chain is caught and turned into
 * an `Alert`, never left to reject unhandled.
 *
 * ## M5-09 addition: DATA section — Backup, Restore, monthly reminder
 *
 * "Backup" is a one-shot action, same shape as "Export CSV" right above it
 * (constructs `BackupService` lazily at press-time for the identical reason
 * `handleExportCsv`'s own comment already gives — this screen's test suite
 * renders it against a self-constructed driver that never calls the real
 * `runDbBoot()`), then shares the resulting zip via `shareFile`.
 * "Restore" navigates to `/backup/restore` (`BackupRestoreScreen`) — unlike
 * Backup, restore needs a whole picker → double-confirm → progress → report
 * flow, which doesn't fit this screen's own one-row-one-action shape (the
 * same reasoning "Import Hevy CSV" already established for its own
 * dedicated `/import/hevy` route rather than an inline action).
 *
 * "Monthly Backup Reminder" (`backup_reminder_enabled`, `settings-schema.ts`)
 * schedules/cancels a real local notification directly from this toggle's
 * `onValueChange` — there is no other natural "start" event to hang it off
 * of (unlike `rest_notifications_enabled`, which `restTimerStore` reads
 * lazily when a timer actually starts; a monthly reminder has no equivalent
 * runtime trigger besides the toggle flip itself). Placed in DATA rather
 * than NOTIFICATIONS (where `rest_notifications_enabled` lives) — contextual
 * locality with the Backup/Restore rows it's actually about won over
 * "notifications" as a settings-taxonomy category; either grouping is
 * defensible, this one keeps the whole backup story in one place.
 */
import React, { useState } from 'react';
import { router } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { getAppDriver } from '@/data/sqlite/boot';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import type { FirstDayOfWeek } from '@/domain/enums';
import { createBackupService } from '@/features/data-transfer/backup-service';
import { createCsvService } from '@/features/data-transfer/csv-service';
import { invalidateWeekBoundaryQueries } from '@/features/settings/recompute-hooks';
import { useSettingsStore } from '@/features/settings/settings-store';
import { formatRestSeconds, restTimerSecondsOptions } from '@/features/workout/rest-timer-format';
import { getAppVersion } from '@/lib/app-info';
import { readBackupZipFile, writeCacheBackupZip } from '@/lib/backup-file';
import { shareDiagnostics } from '@/lib/diagnostics-export';
import { cancelBackupReminder, requestNotificationPermission, scheduleMonthlyBackupReminder } from '@/lib/notifications';
import {
  listProgressPhotoFileNames,
  readProgressPhotoFileBase64,
  writeProgressPhotoFileBase64,
} from '@/lib/progress-photos';
import { shareFile } from '@/lib/share-file';
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
  const distanceUnit = useSettingsStore((state) => state.settings.distance_unit);
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
  const backupReminderEnabled = useSettingsStore((state) => state.settings.backup_reminder_enabled);

  const [restTimerSheetVisible, setRestTimerSheetVisible] = useState(false);
  const [weeklyGoalSheetVisible, setWeeklyGoalSheetVisible] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [backingUp, setBackingUp] = useState(false);

  // M5-06 (05 §7.1's export surfaces): write `kyro_workouts.csv` to the
  // cache directory per the *live* unit settings, then open the OS share
  // sheet on it. `CsvService` is constructed here, lazily, at press-time —
  // deliberately **not** a top-level `useMemo` — this route has no separate
  // feature-component/route split (unlike `HistoryDetailScreen`, which
  // receives `csvService` as a prop from its own thin route wrapper), and
  // this screen's own existing test suite renders it against a
  // self-constructed in-memory driver that never calls `runDbBoot()` — a
  // top-level `getAppDriver()` call would throw on every one of those
  // renders, not just the ones that press this row. Constructing it inside
  // the handler means `getAppDriver()` only ever runs when a user actually
  // presses Export CSV. Every failure mode (zero-workout header-only CSV is
  // not a failure — `encodeWorkoutsCsv` handles that upstream; a full-disk
  // write, sharing unavailable, or any other rejection) is caught here so
  // this row never leaves an unhandled promise rejection or a stuck
  // "Exporting..." state.
  const handleExportCsv = (): void => {
    if (exportingCsv) return;
    setExportingCsv(true);
    const csvService = createCsvService({
      workoutRepository: new WorkoutRepositoryImpl(getAppDriver()),
      exerciseRepository: new ExerciseRepositoryImpl(getAppDriver()),
    });
    csvService
      .exportAll({ weightUnit, distanceUnit })
      .then(({ uri }) =>
        shareFile(uri, {
          mimeType: 'text/csv',
          UTI: 'public.comma-separated-values-text',
          dialogTitle: 'Export Workouts',
        }),
      )
      .catch(() => {
        Alert.alert('Export Failed', 'Could not export your workout history. Please try again.');
      })
      .finally(() => {
        setExportingCsv(false);
      });
  };

  /**
   * M5-09 (05 §9) — same lazy-construct-at-press-time shape as
   * `handleExportCsv` right above, one native seam wider: `BackupService`
   * needs the progress-photo file functions (`lib/progress-photos.ts`) and
   * the zip-cache-file functions (`lib/backup-file.ts`) alongside the driver
   * — every one of those five deps is wired here rather than left to a
   * default, matching `app/backup/restore.tsx`'s own identical wiring for
   * the restore side (both routes construct the same shape independently
   * rather than sharing a singleton — same "per-route construction" posture
   * `PhotosGalleryRoute`'s own header names as this codebase's convention).
   */
  const handleBackup = (): void => {
    if (backingUp) return;
    setBackingUp(true);
    const backupService = createBackupService({
      driver: getAppDriver(),
      listPhotoFileNames: listProgressPhotoFileNames,
      readPhotoFileBase64: readProgressPhotoFileBase64,
      writePhotoFileBase64: writeProgressPhotoFileBase64,
      writeCacheZipFile: writeCacheBackupZip,
      readFileBase64: readBackupZipFile,
    });
    backupService
      .export()
      .then(({ uri }) =>
        shareFile(uri, {
          mimeType: 'application/zip',
          UTI: 'public.zip-archive',
          dialogTitle: 'Backup Kyro Data',
        }),
      )
      .catch(() => {
        Alert.alert('Backup Failed', 'Could not create a backup. Please try again.');
      })
      .finally(() => {
        setBackingUp(false);
      });
  };

  /**
   * M5-09, 10 §9 — schedules/cancels the monthly backup-reminder local
   * notification directly off this toggle's flip (see file header, "no
   * other natural start event" — unlike `rest_notifications_enabled`, which
   * `restTimerStore` reads lazily elsewhere). Permission is requested lazily
   * here, on first enable, same "lazy, on first use, with no separate
   * rationale screen for this low-stakes a toggle" posture — a denial simply
   * means the setting is ON but nothing gets scheduled (silently, matching
   * `requestNotificationPermission`'s own "denied" not being treated as an
   * error anywhere else in this codebase); disabling always cancels
   * unconditionally, regardless of whether anything was actually scheduled.
   */
  const handleBackupReminderToggle = (value: boolean): void => {
    void useSettingsStore
      .getState()
      .setSetting('backup_reminder_enabled', value)
      .then(async () => {
        if (value) {
          const status = await requestNotificationPermission();
          if (status === 'granted') {
            await scheduleMonthlyBackupReminder();
          }
        } else {
          await cancelBackupReminder();
        }
      });
  };

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
        {/* M5-10 (08 §6 flow 6, Maestro theme dark<->light sweep): no
            themed-root testID/text anywhere reveals which theme preference
            is active — not Maestro-assertable at all before this. Exposes
            the raw `settings.theme` preference (`'system' | 'light' |
            'dark'`) already read into this screen's own `theme` local
            above, not `useTheme().themeName` (which resolves `'system'`
            against the OS scheme and so can only ever read `'light'`/
            `'dark'`, never `'system'` — the wrong signal for asserting
            *this* screen's own segmented-control selection actually wrote
            through). Same `__DEV__`-gated debug-hook pattern/framing as
            `TimerPill.tsx`'s `-debug-notification-id` hook (flow 07) —
            never rendered in a production/TestFlight build. */}
        {__DEV__ ? (
          <Text
            testID="settings-debug-theme-mode"
            style={[typography.caption, { color: colors.text.tertiary, marginTop: spacing['1'] }]}
          >
            {theme}
          </Text>
        ) : null}
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
        M5-06: Export CSV. M5-07 adds Import Hevy CSV -> `/import/hevy`.
        M5-09 adds Backup, Restore -> `/backup/restore`, and the monthly
        backup-reminder toggle — see file header, "M5-09 addition".
      */}
      <Text
        style={[
          typography.footnote,
          { color: colors.text.secondary, marginBottom: spacing['2'], marginTop: spacing['6'] },
        ]}
      >
        DATA
      </Text>
      <View style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: colors.bg.surface }}>
        <ListRow
          testID="settings-export-csv-row"
          title="Export CSV"
          subtitle={
            exportingCsv ? 'Exporting…' : 'Export your full workout history as a CSV file'
          }
          disabled={exportingCsv}
          onPress={handleExportCsv}
        />
        <ListRow
          testID="settings-import-hevy-csv-row"
          title="Import Hevy CSV"
          subtitle="Import your workout history from a Hevy CSV export"
          chevron
          onPress={() => router.push('/import/hevy')}
        />
        <ListRow
          testID="settings-backup-row"
          title="Backup"
          subtitle={
            backingUp
              ? 'Backing up…'
              : 'Save workouts, routines, measurements, photos, and settings to a file'
          }
          disabled={backingUp}
          onPress={handleBackup}
        />
        <ListRow
          testID="settings-restore-row"
          title="Restore"
          subtitle="Replace all current data from a backup file"
          chevron
          onPress={() => router.push('/backup/restore')}
        />
        <SettingsToggleRow
          testID="settings-backup-reminder-enabled"
          title="Monthly Backup Reminder"
          subtitle="Get a monthly reminder to back up your data"
          hideSeparator
          value={backupReminderEnabled}
          onValueChange={handleBackupReminderToggle}
        />
      </View>

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
