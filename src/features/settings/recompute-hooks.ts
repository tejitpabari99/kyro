/**
 * `invalidateWeekBoundaryQueries` (M5-04, `M5-tasks.md`'s own M5-04 "How"
 * line: "first day of week ... with recompute hooks — invalidate
 * streaks/stats queries on change") — the single-function,
 * multiple-`invalidateQueries`-calls shape `records-service.ts`'s
 * `invalidateAfterWorkoutMutation` already established for the identical
 * "one cross-cutting change, several query prefixes care" problem.
 *
 * ## Why this exists despite `CalendarScreen.tsx`/`StatisticsScreen.tsx`
 * already re-bucketing correctly without it
 *
 * Read both those files' own headers before assuming this function is the
 * thing that makes 04 §3.2/§4.2's "first-day-of-week switch re-buckets
 * weekly charts" acceptance line true — it isn't. Both screens already read
 * `first_day_of_week` live off `useSettingsStore` and fold it into their
 * bucketing calls inside a `useMemo` (`CalendarScreen.tsx`'s `buildMonthGrid`/
 * `computeWeekStreak` calls, `StatisticsScreen.tsx`'s `bucketWorkoutsPerWeek`/
 * `bucketAggregateTrend`/`bucketSetsPerMuscleGroupPerWeek`), never inside a
 * `queryKey` or a `queryFn`'s fetch bounds — so the *query results* those
 * screens hold (`['calendar','month',...]`, `['calendar','streak']`,
 * `['stats','workout-dates']`, `['stats','feed',...]`) never actually depend
 * on the setting at all, only the pure client-side re-bucketing step does,
 * and that already re-runs on every render where the memo's `firstDayOfWeek`
 * dependency changed — which a settings-store write always triggers for any
 * mounted, subscribed component. Calling `queryClient.invalidateQueries`
 * against these keys on a `first_day_of_week` change is therefore a
 * **harmless no-op refetch of identical rows** today, not the mechanism
 * that makes correctness hold.
 *
 * Built anyway, and wired from the Settings screen's `first_day_of_week`
 * control, for two reasons: (1) `M5-tasks.md`'s M5-04 acceptance gate names
 * this exact behavior ("first-day change re-buckets calendar/stats
 * (integration)") as its own tested case, independent of whether the
 * existing reactive-`useMemo` design already covers it; (2) it is *not*
 * fully redundant forever — it is real, useful defense-in-depth for any
 * future query whose `queryFn` or fetch bounds ever come to depend on the
 * week boundary directly (e.g. a future server-side/SQL-level weekly
 * aggregation that groups by week server-side rather than bucketing
 * client-side) — that hypothetical caller would silently serve stale rows on
 * a first-day-of-week change without an invalidation call already wired at
 * the one call site that changes the setting. Cheap insurance, not dead
 * code: the query keys below are the same broad prefixes
 * `invalidateAfterWorkoutMutation` already invalidates from every workout
 * mutation, so this doesn't introduce a new prefix convention either.
 */
import type { QueryClient } from '@tanstack/react-query';

/**
 * Invalidates the `'stats'` and `'calendar'` query-key prefixes — every
 * query either dashboard/calendar screen currently registers
 * (`['stats','summary']`, `['stats','workout-dates']`, `['stats','feed',…]`,
 * `['calendar','month',…]`, `['calendar','streak']`, `['calendar','day',…]`).
 * `'history'` is deliberately **not** included here (unlike
 * `invalidateAfterWorkoutMutation`, which does invalidate it) — nothing in
 * `HistoryListScreen.tsx`'s reverse-chronological list buckets by week at
 * all, so there is no first-day-of-week-shaped data for that screen to ever
 * get wrong; invalidating it on every settings change would just be an
 * extra unnecessary refetch with no correctness or even insurance value.
 *
 * Call this once, right after the `first_day_of_week` `setSetting` write
 * resolves (`app/(tabs)/profile/settings/index.tsx`'s `SegmentedControl`
 * `onChange` handler) — see file header for what this call does and does
 * not do.
 */
export function invalidateWeekBoundaryQueries(queryClient: QueryClient): Promise<void> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ['stats'] }),
    queryClient.invalidateQueries({ queryKey: ['calendar'] }),
  ]).then(() => undefined);
}
