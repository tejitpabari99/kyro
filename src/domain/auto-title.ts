/**
 * `domain/auto-title.ts` (M2-05) — 02 §1: "Workout tab → `Start Empty
 * Workout` ... creates an active workout with no exercises, `start_time =
 * now`, auto title by time of day (\"Morning Workout\" 4:00–11:59, \"Midday
 * Workout\" 12:00–16:59, \"Evening Workout\" 17:00–20:59, \"Night Workout\"
 * otherwise)." Verbatim copy from the doc — note the task brief's own prose
 * paraphrases this as "Morning/Afternoon/Evening/Night Workout", but 02 §1's
 * own literal boundary table says "Midday", not "Afternoon"; this module
 * follows the doc (the authoritative source per the task's own instruction
 * to "check exact copy in 02 §1"), not the paraphrase.
 *
 * Pure TS, zero React/RN/Expo imports (06 §2 dependency rule) — takes an
 * hour-of-day integer rather than a `Date` at its core so the boundary table
 * is trivially exhaustively testable without faking the system clock;
 * {@link autoTitleForDate} is the thin `Date`-accepting convenience wrapper
 * real call sites (the Workout tab's Start Empty Workout button, M2-05) use.
 */

/** 02 §1's four boundaries, in order — `end` is exclusive except the last (which wraps through midnight back to `start` of the first). */
const AUTO_TITLE_BOUNDARIES: readonly { start: number; end: number; title: string }[] = [
  { start: 4, end: 12, title: 'Morning Workout' },
  { start: 12, end: 17, title: 'Midday Workout' },
  { start: 17, end: 21, title: 'Evening Workout' },
];

const NIGHT_TITLE = 'Night Workout';

/** Auto-title for a given local hour-of-day (0–23), per 02 §1's exact boundaries. Any hour outside the three named daytime bands (i.e. 21:00–3:59) is "Night Workout". */
export function autoTitleForHour(hour: number): string {
  const match = AUTO_TITLE_BOUNDARIES.find((band) => hour >= band.start && hour < band.end);
  return match ? match.title : NIGHT_TITLE;
}

/** Auto-title for `date`'s local hour — the real call-site convenience (Start Empty Workout, M2-05). */
export function autoTitleForDate(date: Date): string {
  return autoTitleForHour(date.getHours());
}
