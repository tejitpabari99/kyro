/**
 * Shared date formatting for the history list/detail screens. No `domain/`
 * date-format util exists yet (Calendar/History proper are later
 * milestones, `09` M2 scope note) — kept here, local to
 * `src/features/history/`, rather than invented in `domain/` for a single
 * caller; a real shared helper can absorb this once M4's Calendar work
 * needs the same formatting from multiple places.
 */
export function formatWorkoutDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function startOfDay(date: Date): Date {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start;
}

/**
 * The History-card relative date line (M4-03, 04 §3.1): "Today"/"Yesterday"
 * for the two nearest days, else "Tue, 15 Jul" (weekday + day + month, no
 * year — unless `epochMs` falls in a different calendar year than `now`,
 * where the year is appended so an old workout's card is never ambiguous
 * about which year it happened in; 04 §3.1's own two worked examples
 * ("Yesterday", "Tue, 15 Jul") don't cover that case explicitly, so this is
 * a deliberate, minimal generalization rather than a literal spec quote).
 * Calendar-day comparison (not a raw 24h/48h difference) so "Yesterday"
 * means the previous calendar day regardless of what time either workout
 * started, matching how `formatWorkoutDate`/every other absolute-date
 * display in this codebase already reasons in local calendar days.
 * `now` is injectable (defaults to `new Date()`) purely for deterministic
 * tests — every real call site omits it.
 */
export function formatRelativeWorkoutDate(epochMs: number, now: Date = new Date()): string {
  const date = new Date(epochMs);
  const diffDays = Math.round(
    (startOfDay(now).getTime() - startOfDay(date).getTime()) / (24 * 60 * 60 * 1000),
  );

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';

  const weekday = date.toLocaleDateString(undefined, { weekday: 'short' });
  const day = date.toLocaleDateString(undefined, { day: 'numeric' });
  const month = date.toLocaleDateString(undefined, { month: 'short' });
  const yearSuffix = date.getFullYear() !== now.getFullYear() ? ` ${date.getFullYear()}` : '';
  return `${weekday}, ${day} ${month}${yearSuffix}`;
}
