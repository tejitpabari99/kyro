/**
 * Shared minimal date formatting for the M2-14 history list/detail screens.
 * No `domain/` date-format util exists yet (Calendar/History proper are
 * later milestones, `09` M2 scope note) — kept here, local to
 * `src/features/history/`, rather than invented in `domain/` for a single
 * caller; a real shared helper can absorb this once M4's Calendar/History
 * work needs the same formatting from multiple places.
 */
export function formatWorkoutDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
