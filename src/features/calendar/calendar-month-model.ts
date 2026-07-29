/**
 * `calendar-month-model.ts` (M4-06, 04 §3.2 / 07 §5's `CalendarMonth`
 * component-inventory row) — the pure "which month grid/streak label do we
 * show" logic that bridges `domain/streaks.ts`'s calendar-week math and
 * `WorkoutRepository.workoutDates`'s raw `{date; count}[]` rows to
 * `src/ui/CalendarMonth.tsx`'s presentational grid props. Lives in
 * `src/features/` (not `src/domain/`) purely because `src/ui/**` may only
 * depend on its own tokens (06 §2's lint-enforced boundary,
 * `eslint.config.js`'s "ui: tokens only" zone) — `CalendarMonth.tsx`
 * therefore cannot import this file directly, so `CalendarScreen.tsx` calls
 * {@link buildMonthGrid} here and passes the resulting plain data down as
 * props, exactly the "feature bridges domain+ui" split
 * `domain/set-table-columns.ts`'s own file header documents for
 * `SetTable`/`SetRow`. Everything here is still pure TS (no React/RN
 * imports) — kept feature-local rather than domain-local only for the
 * import-boundary reason above, not because it needs any app-side
 * capability.
 */
import type { FirstDayOfWeek } from '@/domain/enums';
import { localDateKey, startOfWeek, type WorkoutDateCount } from '@/domain/streaks';

/** One day cell in a rendered month grid — structurally mirrors `CalendarMonth.tsx`'s own local `CalendarMonthDayCell` prop type (ui can't import this file, so that type is a hand-mirrored duplicate, same "mirror a type across the boundary" convention `domain/set-table-columns.ts`'s header names for `SetRowColumn`). */
export interface CalendarDayCell {
  /** `'YYYY-MM-DD'` local date — see `domain/streaks.ts`'s `localDateKey`. */
  date: string;
  dayOfMonth: number;
  /** `false` for the leading/trailing days of adjacent months that fill out a full 7-day week. */
  inCurrentMonth: boolean;
  isToday: boolean;
  workoutCount: number;
  /** "Friday, July 10, today, 2 workouts" — 07 §9: "calendar days read date + workout count." Precomputed here (full weekday/month names, locale-aware) rather than in `CalendarMonth.tsx` since the `ui` layer only has this cell's own already-narrowed fields to work with, not a `Date` object. */
  accessibilityLabel: string;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Builds a full-weeks month grid for `year`/`month` (0-based, JS `Date`
 * convention), padded with adjacent-month leading/trailing days so every
 * row is exactly 7 days (`inCurrentMonth: false` on the padding), bucketed
 * per `firstDayOfWeek` via `domain/streaks.ts`'s `startOfWeek`.
 * `workoutDates` need only cover the rendered grid's own date span — the
 * padded window `CalendarScreen.tsx`'s query fetches (month ± 7 days,
 * generous enough for any `firstDayOfWeek` offset) already guarantees that,
 * decoupling the *data fetch* from the setting entirely (no need to key the
 * query by `firstDayOfWeek` — only this pure re-bucketing step depends on
 * it, and it re-runs for free on every render via a `useMemo` dependency on
 * the live settings value, satisfying 04 §3.2's "Streak respects
 * first-day-of-week changes ... recomputes").
 */
export function buildMonthGrid(
  year: number,
  month: number,
  firstDayOfWeek: FirstDayOfWeek,
  workoutDates: readonly WorkoutDateCount[],
  today: Date = new Date(),
): CalendarDayCell[][] {
  const counts = new Map<string, number>();
  for (const { date, count } of workoutDates) {
    counts.set(date, count);
  }

  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);
  const gridStart = startOfWeek(firstOfMonth, firstDayOfWeek);
  const gridEndWeekStart = startOfWeek(lastOfMonth, firstDayOfWeek);
  const todayKey = localDateKey(today.getTime());

  const weeks: CalendarDayCell[][] = [];
  let weekStart = gridStart;
  do {
    const week: CalendarDayCell[] = [];
    for (let i = 0; i < 7; i += 1) {
      const day = addDays(weekStart, i);
      const key = localDateKey(day.getTime());
      const workoutCount = counts.get(key) ?? 0;
      const isToday = key === todayKey;
      const dateLabel = day.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
      const countLabel =
        workoutCount === 0 ? 'no workouts' : workoutCount === 1 ? '1 workout' : `${workoutCount} workouts`;
      week.push({
        date: key,
        dayOfMonth: day.getDate(),
        inCurrentMonth: day.getMonth() === month && day.getFullYear() === year,
        isToday,
        workoutCount,
        accessibilityLabel: `${dateLabel}${isToday ? ', today' : ''}, ${countLabel}`,
      });
    }
    weeks.push(week);
    weekStart = addDays(weekStart, 7);
  } while (weekStart.getTime() <= gridEndWeekStart.getTime());

  return weeks;
}

/**
 * 7 short weekday header labels (`toLocaleDateString(..., {weekday:
 * 'short'})`, matching `date-format.ts`'s own locale-formatting
 * convention), starting from `firstDayOfWeek`. `2023-01-01` is a fixed
 * reference Sunday — only its day-of-week matters, the actual year is
 * irrelevant since this never renders a date, only the weekday name.
 */
export function weekdayLabels(firstDayOfWeek: FirstDayOfWeek): string[] {
  const referenceSunday = new Date(2023, 0, 1);
  const firstDayIndex: Record<FirstDayOfWeek, number> = { sunday: 0, monday: 1, saturday: 6 };
  const startIndex = firstDayIndex[firstDayOfWeek];

  return Array.from({ length: 7 }, (_, i) => {
    const day = addDays(referenceSunday, (startIndex + i) % 7);
    return day.toLocaleDateString(undefined, { weekday: 'short' });
  });
}

/** "July 2026" — the `CalendarMonth` header label. */
export function formatMonthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

/**
 * "🔥 N-week streak" (04 §3.2, literal string). `weeks <= 0` renders a
 * neutral, flame-less caption instead — the spec's own worked example is
 * always `N >= 1`; a literal "🔥 0-week streak" would read as broken copy,
 * so this is a deliberate, minimal generalization for the zero case (07
 * §10: "no lorem fluff," never a nonsensical number).
 */
export function formatStreakLabel(weeks: number): string {
  return weeks > 0 ? `🔥 ${weeks}-week streak` : 'No active streak yet';
}
