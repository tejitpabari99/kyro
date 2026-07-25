/**
 * `domain/streaks.ts` (M4-06) — 04 §3.2 / 02 §16.3 / 08 §4.8: pure calendar-
 * week streak math for the History → Calendar screen. Pure TS, zero React/
 * RN/Expo/`src/data` imports (06 §2 dependency rule) — the exact same
 * "structurally-compatible input shape, no I/O" posture `domain/records.ts`/
 * `domain/volume.ts` already establish. `src/data/workouts/types.ts` imports
 * {@link WorkoutDateCount} from here (mirrors that file's existing
 * `import type { HistoricalSet } from '@/domain/records'`), and
 * `src/features/calendar/calendar-month-model.ts` imports
 * {@link localDateKey}/{@link startOfWeek} to build the month grid — this
 * module owns every piece of "what local calendar day/week does this
 * timestamp belong to" logic so it's defined exactly once.
 *
 * ## Local calendar days, not UTC (02 §16.3 edge case 2/3)
 *
 * Every timestamp in the schema is a UTC epoch-ms `start_time` (05 §3.2);
 * "which calendar day/week a workout belongs to" is a **local** question —
 * a workout starting at 23:50 belongs to that local evening's day, not
 * whatever UTC day the raw epoch value happens to fall on. {@link
 * localDateKey} does this conversion once via `Date`'s local-timezone
 * accessors (`getFullYear`/`getMonth`/`getDate`) — the exact same
 * `new Date(epochMs)` + local-getter pattern
 * `src/features/history/date-format.ts`'s `startOfDay` already established
 * for the History card's "Today"/"Yesterday" comparison, generalized here
 * to a `'YYYY-MM-DD'` string key so it can be grouped/deduped/compared with
 * `<`/`>`/`===` directly (lexicographic ordering on a zero-padded
 * `YYYY-MM-DD` string matches chronological ordering). Time zone changes or
 * DST mid-workout (02 §16.3 edge case 2: "duration unaffected") never touch
 * this module — bucketing only ever looks at `start_time` in isolation, one
 * timestamp at a time.
 *
 * ## Week buckets respect first-day-of-week (04 §3.2, `settings.first_day_of_week`)
 *
 * {@link startOfWeek} returns the local midnight of the first day of the
 * calendar week containing `date`, per the user's `first_day_of_week`
 * setting (`monday` | `sunday` | `saturday`, `domain/enums.ts`'s
 * `FIRST_DAY_OF_WEEK_VALUES`). Two dates are "the same calendar week" iff
 * `startOfWeek` returns the same day for both — this is the bucketing key
 * {@link computeWeekStreak} groups workout dates by, and the same function
 * `calendar-month-model.ts`'s grid builder uses to find a month's leading/
 * trailing days. Changing the setting reshuffles which days share a bucket
 * (04 §3.2's own acceptance line, "Streak respects first-day-of-week
 * changes ... recomputes") — since this function takes the setting as a
 * plain argument rather than reading a module-level default, a caller that
 * re-derives its streak/grid from a live `first_day_of_week` value (the
 * `useSettingsStore` read in `CalendarScreen.tsx`) recomputes for free on
 * every render, no extra invalidation plumbing needed.
 *
 * ## Streak algorithm (04 §3.2's own prose, worked out precisely)
 *
 * "Consecutive calendar weeks ... with ≥ 1 completed workout, counting
 * backwards from the current week; current week counts if it has a
 * workout or is still in progress (streak shows but doesn't break until
 * the week ends workoutless)."
 *
 * Read literally: the **current** week (the one containing `now`) is
 * special-cased — by construction it is *always* still in progress (`now`
 * is always inside `[startOfWeek(now), startOfWeek(now)+7d)`, so this
 * function is never asked to evaluate a "current" week that has already
 * ended). So the current week either:
 *  - has a workout already → counts as the first (most recent) week of
 *    the streak, exactly like any other week, or
 *  - has no workout **yet** → does not break the streak (it hasn't ended,
 *    so "workoutless" isn't decided yet) and does not count towards `N`
 *    either — it's simply skipped, and counting continues from the
 *    *previous* (already-fully-elapsed) week.
 *
 * Every week strictly before the current one is a normal, already-ended
 * week: a workout continues the count, a gap ends it. {@link
 * computeWeekStreak} walks backward one week at a time from
 * `startOfWeek(now)`, applying exactly that rule, and returns as soon as it
 * hits the first already-ended, workout-less week (or immediately if the
 * (non-current) very first week checked has none).
 */
import type { FirstDayOfWeek } from './enums';

/** 0-based JS `Date#getDay()` index each `FirstDayOfWeek` value corresponds to. */
const FIRST_DAY_INDEX: Record<FirstDayOfWeek, number> = {
  sunday: 0,
  monday: 1,
  saturday: 6,
};

function localMidnight(date: Date): Date {
  const midnight = new Date(date);
  midnight.setHours(0, 0, 0, 0);
  return midnight;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * The local `'YYYY-MM-DD'` calendar-day key for `epochMs` — see file header
 * ("Local calendar days, not UTC"). This is the exact bucketing unit 02
 * §16.3's "midnight-crossing workouts belong to `start_time`'s day" rule
 * describes, and the shape {@link WorkoutDateCount.date} (and hence
 * `WorkoutRepository.workoutDates`'s return rows) uses.
 */
export function localDateKey(epochMs: number): string {
  const date = new Date(epochMs);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Inverse of {@link localDateKey} — parses a `'YYYY-MM-DD'` key back into a
 * local-midnight `Date` for that calendar day. Used by
 * `WorkoutRepositoryImpl.workoutsForDate` to turn a chosen calendar day back
 * into the epoch-ms bounds a SQL range query needs, and by
 * `CalendarScreen.tsx`'s "Log past workout" entry point to build the
 * `retroStartTime` query param (noon of the tapped day, mirroring
 * `ActiveWorkoutScreen.tsx`'s own `defaultRetroStartTime`'s "chosen date
 * 12:00" fallback).
 */
export function parseLocalDateKey(key: string): Date {
  const [year, month, day] = key.split('-').map(Number) as [number, number, number];
  return new Date(year, month - 1, day);
}

/**
 * The local midnight of the first day of the calendar week containing
 * `date`, per `firstDayOfWeek` — see file header ("Week buckets respect
 * first-day-of-week"). Two dates fall in "the same week" iff this returns
 * the same instant for both.
 */
export function startOfWeek(date: Date, firstDayOfWeek: FirstDayOfWeek): Date {
  const midnight = localMidnight(date);
  const target = FIRST_DAY_INDEX[firstDayOfWeek];
  const diff = (midnight.getDay() - target + 7) % 7;
  return addDays(midnight, -diff);
}

/** One local calendar day's completed-workout count — `WorkoutRepository.workoutDates`'s row shape (05 §6), re-exported from `./types.ts` (mirrors that file's existing `HistoricalSet` re-export from `domain/records`). */
export interface WorkoutDateCount {
  /** `'YYYY-MM-DD'` local date — see {@link localDateKey}. */
  date: string;
  /** Number of completed, non-deleted workouts whose `start_time` falls on this local day. Always `>= 1` — a repository never emits a zero-count row (no workout that day simply means no row for that date, an absent-key convention `calendar-month-model.ts`'s `buildMonthGrid` defaults to `0` for). */
  count: number;
}

export interface ComputeWeekStreakOptions {
  firstDayOfWeek: FirstDayOfWeek;
  /** Injectable "now" for deterministic tests — every real call site omits it (defaults to `new Date()`), mirroring `date-format.ts`'s `formatRelativeWorkoutDate`. */
  now?: Date;
}

/**
 * "🔥 N-week streak" (04 §3.2) — see file header for the exact algorithm
 * this implements. `dates` need not be sorted or deduplicated; entries with
 * `count <= 0` are ignored (defensive — a real `workoutDates` result never
 * emits one, per {@link WorkoutDateCount}'s own doc comment, but a caller
 * merging/filtering results elsewhere shouldn't be able to corrupt this).
 */
export function computeWeekStreak(
  dates: readonly WorkoutDateCount[],
  options: ComputeWeekStreakOptions,
): number {
  const { firstDayOfWeek, now = new Date() } = options;

  const weeksWithWorkouts = new Set<string>();
  for (const { date, count } of dates) {
    if (count <= 0) {
      continue;
    }
    const weekStart = startOfWeek(parseLocalDateKey(date), firstDayOfWeek);
    weeksWithWorkouts.add(localDateKey(weekStart.getTime()));
  }

  let cursor = startOfWeek(now, firstDayOfWeek);
  let streak = 0;
  let isCurrentWeek = true;

  for (;;) {
    const hasWorkout = weeksWithWorkouts.has(localDateKey(cursor.getTime()));
    if (hasWorkout) {
      streak += 1;
    } else if (!isCurrentWeek) {
      break;
    }
    cursor = addDays(cursor, -7);
    isCurrentWeek = false;
  }

  return streak;
}
