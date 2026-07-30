/**
 * `StatisticsScreen` (M4-08, 04 §4.1) — the Profile → Statistics dashboard:
 * 4 summary tiles (total workouts, total volume, total time, current
 * streak) + 4 stacked chart cards (workouts/week bars with an optional
 * weekly-goal line, an aggregate Duration|Volume|Reps trend, a muscle-
 * distribution horizontal breakdown, and a top-8+Other stacked weekly
 * muscle-group chart). Every bucketing/aggregation rule lives in
 * `domain/stats-buckets.ts` (M4-08) — this file is the "impure screen
 * wires it" half of the same "pure model, impure screen" split
 * `history-list-model.ts`/`HistoryListScreen.tsx` already established
 * (this file's own header cites that precedent).
 *
 * ## Range controls: one shared dashboard range + the distribution card's own
 *
 * 04 §4.1 states each chart card carries "a time-range segmented control
 * 3M/1Y/All" in its own header (07 §7's own chart-card layout note: "Ranges
 * as `SegmentedControl` ... right-aligned in the card header"), but is
 * silent on whether that's 3 *independent* selections or one shared
 * control repeated visually per card. Judgment call, made explicitly here:
 * "Workouts per week" / "Aggregate trend" / "Sets per muscle group per
 * week" all read `dashboardRange` from one shared `useState` — each still
 * renders its own `SegmentedControl` in its own header (satisfying 07 §7's
 * per-card layout literally), but toggling any one moves all three in
 * sync, matching how virtually every real multi-chart dashboard actually
 * behaves (one "look at the last N" concept, not three independently
 * driftable ones) rather than forcing the user to set the same range three
 * times. "Muscle distribution" (04 §4.1 item 3) is explicitly spelled out
 * with its own, wider range list (`7D/30D/3M/1Y/All`) in both `04` and this
 * task's own brief — it gets its own independent `muscleRange` state.
 *
 * ## Query keys — `['stats', 'feed', <rangeKey>]`, shared across cards for free
 *
 * Every ranged chart's own `useQuery` calls
 * `workoutRepository.statsFeed(rangeQueryBounds(range, now))` keyed on
 * `['stats', 'feed', range]` — when `dashboardRange` and `muscleRange`
 * happen to be the same value (e.g. both default to `'3m'`), TanStack Query
 * dedupes the fetch entirely (one shared cache entry), not just a
 * coincidental perf win but the natural consequence of keying purely on the
 * range string. The summary tiles + streak use their own **unranged**
 * queries (`['stats', 'summary']`, `['stats', 'workout-dates']`) since 04
 * §4.1 gives those tiles no range control at all — they are always
 * all-time. All of the above share the `'stats'` key prefix
 * `invalidateAfterWorkoutMutation` (`records-service.ts`, already wired
 * from every workout mutation that can move history) already invalidates
 * broadly — no new invalidation plumbing needed here (mirrors
 * `CalendarScreen.tsx`'s own identical note for the `'calendar'` prefix).
 *
 * ## Live settings, not a fetch param — warm-up gating, weekly goal, first-day-of-week
 *
 * `warmup_in_stats`/`weekly_goal`/`first_day_of_week` are read live off
 * `useSettingsStore` and folded into the bucketing calls inside a
 * `useMemo`, never baked into a query key — flipping any of them re-buckets
 * the *already-fetched* rows instantly (04 §4 acceptance: "warm-up toggle
 * flips dashboard live", "First-day-of-week switch re-buckets weekly
 * charts") with zero extra network/DB round trips, the same reactive-
 * useMemo pattern `CalendarScreen.tsx` already established for
 * `first_day_of_week`. Records are never touched by any of this —
 * `domain/records.ts` always excludes warm-ups regardless and doesn't
 * import anything from `domain/stats-buckets.ts` (that module's own file
 * header, "Warm-up / checked-set gating").
 */
import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { ChevronLeft, TriangleAlert } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';

import type { WorkoutRepository } from '@/data/workouts/types';
import { MUSCLE_GROUP_LABELS } from '@/domain/enums';
import {
  bucketAggregateTrend,
  bucketSetsPerMuscleGroupPerWeek,
  bucketWorkoutsPerWeek,
  chooseTrendGranularity,
  computeMuscleDistribution,
  computeSummaryTotals,
  displayRangeBounds,
  DASHBOARD_CHART_RANGES,
  MUSCLE_DISTRIBUTION_RANGES,
  OTHER_MUSCLE_SERIES_KEY,
  rangeQueryBounds,
  type AggregateMetric,
  type BucketGranularity,
  type DashboardRangeKey,
} from '@/domain/stats-buckets';
import { computeWeekStreak } from '@/domain/streaks';
import { formatDuration } from '@/domain/units';
import { formatVolumeDisplay } from '@/domain/volume';
import { useSettingsStore } from '@/features/settings/settings-store';
import { BarChart, LineChart, StackedBarChart, type BarChartPoint, type StackedBarSeries } from '@/ui/charts';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { EmptyState } from '@/ui/EmptyState';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { StatTile } from '@/ui/StatColumn';
import { useTheme } from '@/ui/theme-provider';

import { MuscleDistributionBars } from './MuscleDistributionBars';

export type StatsRepository = Pick<WorkoutRepository, 'statsFeed' | 'workoutDates'>;

export interface StatisticsScreenProps {
  workoutRepository: StatsRepository;
  testID?: string;
}

const CHART_HEIGHT = 180;

const DASHBOARD_RANGE_OPTIONS = DASHBOARD_CHART_RANGES.map((value) => ({
  value,
  label: rangeLabel(value),
}));
const MUSCLE_RANGE_OPTIONS = MUSCLE_DISTRIBUTION_RANGES.map((value) => ({
  value,
  label: rangeLabel(value),
}));

const METRIC_OPTIONS: readonly { value: AggregateMetric; label: string }[] = [
  { value: 'duration', label: 'Duration' },
  { value: 'volume', label: 'Volume' },
  { value: 'reps', label: 'Reps' },
];

function rangeLabel(range: DashboardRangeKey): string {
  switch (range) {
    case '7d':
      return '7D';
    case '30d':
      return '30D';
    case '3m':
      return '3M';
    case '1y':
      return '1Y';
    case 'all':
      return 'All';
    default: {
      const exhaustive: never = range;
      throw new Error(`StatisticsScreen: unhandled range "${exhaustive as string}".`);
    }
  }
}

function formatBucketLabel(epochMs: number, granularity: BucketGranularity): string {
  return granularity === 'month'
    ? new Date(epochMs).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })
    : new Date(epochMs).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatStreakTileValue(weeks: number): string {
  return `${weeks} wk${weeks === 1 ? '' : 's'}`;
}

export function StatisticsScreen({
  workoutRepository,
  testID = 'statistics-screen',
}: StatisticsScreenProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  const weightUnit = useSettingsStore((state) => state.settings.weight_unit);
  const warmupInStats = useSettingsStore((state) => state.settings.warmup_in_stats);
  const weeklyGoal = useSettingsStore((state) => state.settings.weekly_goal);
  const firstDayOfWeek = useSettingsStore((state) => state.settings.first_day_of_week);

  const [dashboardRange, setDashboardRange] = useState<DashboardRangeKey>('3m');
  const [muscleRange, setMuscleRange] = useState<DashboardRangeKey>('3m');
  const [trendMetric, setTrendMetric] = useState<AggregateMetric>('duration');

  // Stable per-mount "now" — see file header ("Query keys"): the same
  // instant drives both the SQL range bound and the display bucket-fill
  // bound for a given range, so they never disagree by a render's worth of
  // clock drift.
  const [now] = useState(() => new Date());

  // -- Unranged, all-time queries (summary tiles + streak) --

  const summaryQuery = useQuery({
    queryKey: ['stats', 'summary'],
    queryFn: () => workoutRepository.statsFeed(),
  });

  const workoutDatesQuery = useQuery({
    queryKey: ['stats', 'workout-dates'],
    queryFn: () => workoutRepository.workoutDates(),
  });

  const summaryTotals = useMemo(
    () => computeSummaryTotals(summaryQuery.data ?? [], warmupInStats),
    [summaryQuery.data, warmupInStats],
  );
  const totalWorkouts = useMemo(
    () => (workoutDatesQuery.data ?? []).reduce((sum, d) => sum + d.count, 0),
    [workoutDatesQuery.data],
  );
  const streakWeeks = useMemo(
    () => computeWeekStreak(workoutDatesQuery.data ?? [], { firstDayOfWeek, now }),
    [workoutDatesQuery.data, firstDayOfWeek, now],
  );

  // -- Ranged feed queries (dashboardRange drives 3 cards, muscleRange drives 1) --

  const dashboardFeedQuery = useQuery({
    queryKey: ['stats', 'feed', dashboardRange],
    queryFn: () => workoutRepository.statsFeed(rangeQueryBounds(dashboardRange, now)),
  });

  const muscleFeedQuery = useQuery({
    queryKey: ['stats', 'feed', muscleRange],
    queryFn: () => workoutRepository.statsFeed(rangeQueryBounds(muscleRange, now)),
  });

  // Wrapped in their own `useMemo` (not a bare `?? []`) so every downstream
  // memo keyed on these arrays doesn't see a "changed" dependency on every
  // render just because `?? []` mints a fresh empty-array literal each time
  // `.data` is still `undefined` (react-hooks/exhaustive-deps).
  const dashboardRows = useMemo(() => dashboardFeedQuery.data ?? [], [dashboardFeedQuery.data]);
  const muscleRows = useMemo(() => muscleFeedQuery.data ?? [], [muscleFeedQuery.data]);

  const dashboardBounds = useMemo(
    () => displayRangeBounds(dashboardRange, dashboardRows, now),
    [dashboardRange, dashboardRows, now],
  );
  const trendGranularity = useMemo(
    () => chooseTrendGranularity(dashboardRange, dashboardRows),
    [dashboardRange, dashboardRows],
  );

  const workoutsPerWeekBars = useMemo(
    () => bucketWorkoutsPerWeek(dashboardRows, dashboardBounds, firstDayOfWeek, weeklyGoal),
    [dashboardRows, dashboardBounds, firstDayOfWeek, weeklyGoal],
  );

  const trendBuckets = useMemo(
    () =>
      bucketAggregateTrend(
        dashboardRows,
        dashboardBounds,
        firstDayOfWeek,
        trendGranularity,
        trendMetric,
        warmupInStats,
      ),
    [dashboardRows, dashboardBounds, firstDayOfWeek, trendGranularity, trendMetric, warmupInStats],
  );

  const muscleStack = useMemo(
    () => bucketSetsPerMuscleGroupPerWeek(dashboardRows, dashboardBounds, firstDayOfWeek, warmupInStats),
    [dashboardRows, dashboardBounds, firstDayOfWeek, warmupInStats],
  );

  const muscleDistribution = useMemo(
    () => computeMuscleDistribution(muscleRows, warmupInStats),
    [muscleRows, warmupInStats],
  );

  // -- Chart data shaping --

  const workoutsBarData: BarChartPoint[] = workoutsPerWeekBars.map((bar) => ({
    x: bar.bucketStart,
    y: bar.count,
    goalMet: bar.goalMet,
  }));

  const trendLineData = trendBuckets.map((bucket) => ({ x: bucket.bucketStart, y: bucket.value }));

  const formatTrendYLabel = (value: number): string => {
    if (trendMetric === 'duration') return `${Math.round(value / 60)}m`;
    if (trendMetric === 'volume') return `${Math.round(formatVolumeDisplay(value, weightUnit))}`;
    return `${Math.round(value)}`;
  };

  const stackedSeries: StackedBarSeries[] = [
    ...muscleStack.topMuscleGroups.map((muscleGroup) => ({
      key: muscleGroup,
      label: MUSCLE_GROUP_LABELS[muscleGroup],
    })),
    { key: OTHER_MUSCLE_SERIES_KEY, label: 'Other', color: colors.text.tertiary },
  ];
  const stackedData = muscleStack.points.map((point) => ({ x: point.bucketStart, values: point.values }));

  // 06 §9: repository/query errors are never silently swallowed as an
  // empty/zero dashboard — a genuine `statsFeed`/`workoutDates` failure
  // (e.g. SQLite error) surfaces as a retryable error state instead of
  // rendering every tile/chart as if history were genuinely empty (found
  // in the M4 milestone-wide review; see EXECUTION-LOG.md's `M4 | reviewed`
  // row).
  const hasError =
    summaryQuery.isError || workoutDatesQuery.isError || dashboardFeedQuery.isError || muscleFeedQuery.isError;
  const handleRetry = (): void => {
    if (summaryQuery.isError) void summaryQuery.refetch();
    if (workoutDatesQuery.isError) void workoutDatesQuery.refetch();
    if (dashboardFeedQuery.isError) void dashboardFeedQuery.refetch();
    if (muscleFeedQuery.isError) void muscleFeedQuery.refetch();
  };

  if (hasError) {
    return (
      <View testID={testID} style={{ flex: 1, backgroundColor: colors.bg.base }}>
        <EmptyState
          testID={`${testID}-error`}
          icon={<TriangleAlert size={40} strokeWidth={1.75} color={colors.semantic.danger} />}
          title="Couldn't load statistics"
          caption="Something went wrong loading your workout history."
          cta={<Button label="Retry" variant="tonal" onPress={handleRetry} testID={`${testID}-retry`} />}
          style={{ flex: 1, justifyContent: 'center' }}
        />
      </View>
    );
  }

  return (
    <ScrollView
      testID={testID}
      style={{ flex: 1, backgroundColor: colors.bg.base }}
      contentContainerStyle={{
        padding: spacing['4'],
        // BUGFIX-01: `insets.top` clears the status bar/notch — see
        // `app/_layout.tsx`'s header.
        paddingTop: insets.top + spacing['4'],
        paddingBottom: spacing['10'],
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing['4'] }}>
        <Pressable
          testID={`${testID}-back`}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={8}
          onPress={() => router.back()}
          style={{ marginRight: spacing['3'] }}
        >
          <ChevronLeft size={24} strokeWidth={1.75} color={colors.text.primary} />
        </Pressable>
        <Text style={[typography.title2, { color: colors.text.primary }]}>Statistics</Text>
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing['3'], marginBottom: spacing['4'] }}>
        <StatTile
          testID={`${testID}-tile-workouts`}
          label="Total Workouts"
          value={String(totalWorkouts)}
          style={{ flexGrow: 1, flexBasis: '45%' }}
        />
        <StatTile
          testID={`${testID}-tile-volume`}
          label="Total Volume"
          value={`${Math.round(formatVolumeDisplay(summaryTotals.totalVolumeKg, weightUnit))} ${weightUnit}`}
          style={{ flexGrow: 1, flexBasis: '45%' }}
        />
        <StatTile
          testID={`${testID}-tile-time`}
          label="Total Time"
          value={formatDuration(Math.round(summaryTotals.totalDurationSeconds)) ?? '0:00'}
          style={{ flexGrow: 1, flexBasis: '45%' }}
        />
        <StatTile
          testID={`${testID}-tile-streak`}
          label="Current Streak"
          value={formatStreakTileValue(streakWeeks)}
          style={{ flexGrow: 1, flexBasis: '45%' }}
        />
      </View>

      <Card testID={`${testID}-workouts-per-week`} style={{ marginBottom: spacing['3'] }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: spacing['3'],
          }}
        >
          <Text style={[typography.headline, { color: colors.text.primary }]}>Workouts per week</Text>
          <SegmentedControl
            testID={`${testID}-dashboard-range`}
            options={DASHBOARD_RANGE_OPTIONS}
            value={dashboardRange}
            onChange={setDashboardRange}
          />
        </View>
        <BarChart
          testID={`${testID}-workouts-chart`}
          data={workoutsBarData}
          height={CHART_HEIGHT}
          goalValue={weeklyGoal ?? undefined}
          formatXLabel={(x) => formatBucketLabel(x, 'week')}
        />
      </Card>

      <Card testID={`${testID}-trend`} style={{ marginBottom: spacing['3'] }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: spacing['3'],
          }}
        >
          <Text style={[typography.headline, { color: colors.text.primary }]}>Aggregate trend</Text>
          <SegmentedControl
            testID={`${testID}-trend-range`}
            options={DASHBOARD_RANGE_OPTIONS}
            value={dashboardRange}
            onChange={setDashboardRange}
          />
        </View>
        <SegmentedControl
          testID={`${testID}-trend-metric`}
          options={METRIC_OPTIONS}
          value={trendMetric}
          onChange={setTrendMetric}
          style={{ marginBottom: spacing['3'], alignSelf: 'flex-start' }}
        />
        <LineChart
          testID={`${testID}-trend-chart`}
          data={trendLineData}
          height={CHART_HEIGHT}
          formatXLabel={(x) => formatBucketLabel(x, trendGranularity)}
          formatYLabel={formatTrendYLabel}
        />
      </Card>

      <Card testID={`${testID}-muscle-distribution`} style={{ marginBottom: spacing['3'] }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: spacing['3'],
          }}
        >
          <Text style={[typography.headline, { color: colors.text.primary }]}>Muscle distribution</Text>
          <SegmentedControl
            testID={`${testID}-muscle-range`}
            options={MUSCLE_RANGE_OPTIONS}
            value={muscleRange}
            onChange={setMuscleRange}
          />
        </View>
        <MuscleDistributionBars testID={`${testID}-muscle-bars`} entries={muscleDistribution} />
      </Card>

      <Card testID={`${testID}-muscle-per-week`}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: spacing['3'],
          }}
        >
          <Text style={[typography.headline, { color: colors.text.primary }]}>Sets per muscle group / week</Text>
          <SegmentedControl
            testID={`${testID}-muscle-week-range`}
            options={DASHBOARD_RANGE_OPTIONS}
            value={dashboardRange}
            onChange={setDashboardRange}
          />
        </View>
        <StackedBarChart
          testID={`${testID}-muscle-week-chart`}
          data={stackedData}
          series={stackedSeries}
          height={CHART_HEIGHT}
          formatXLabel={(x) => formatBucketLabel(x, 'week')}
        />
      </Card>
    </ScrollView>
  );
}
