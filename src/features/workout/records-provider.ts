/**
 * `records-provider.ts` (M2-14) — the no-op Records-earned seam the Save
 * sheet (02 §14's finish flow, `SaveWorkoutSheet.tsx`) reads. PR banner /
 * records-earned *content* is explicitly **M4 scope**
 * (`docs/plan/tasks/M2-tasks.md`'s own milestone note: "The finish screen
 * ships here with the records section hidden/empty-capable (M2-14) and gets
 * populated in M4-10"). This file exists purely so `SaveWorkoutSheet` has a
 * stable hook to call today, matching the shape 06 §4.4 describes for the
 * eventual real thing closely enough that M4-10 can replace this function's
 * body with a real `RecordsService` lookup without touching any caller:
 *
 *   > `domain/records.ts` pure functions + a memoized per-exercise cache
 *   > keyed by `updated_at` watermark. Exposed via Query
 *   > (`['records', exerciseId]`); invalidation per above.
 *
 * `useWorkoutRecordsEarned` is the workout-level aggregate a finish screen
 * actually needs (every exercise's awards for *this* workout, not one
 * exercise at a time) — its query key deliberately keeps the same
 * `'records'` root 06 §4.4 specifies so a future per-exercise
 * `['records', exerciseId]` cache and this workout-level query can share one
 * invalidation call (`queryClient.invalidateQueries({queryKey: ['records']})`)
 * once M4-10 wires both up for real.
 *
 * Always resolves `[]` today — `SaveWorkoutSheet` renders its Records
 * Earned section only when this returns non-empty data, so it is correctly
 * hidden for the whole of M2 (this task's own "How": "wire to a no-op
 * provider now, M4-10 fills it").
 */
import { useQuery, type UseQueryResult } from '@tanstack/react-query';

/** One trophy row (04 §5's PR evaluation output) — real shape lands with M4-10's `RecordsService`; this is the minimal contract `SaveWorkoutSheet` needs to render a row today, and the no-op provider below never actually produces one. */
export interface RecordAward {
  exerciseId: string;
  exerciseName: string;
  /** e.g. `'weight'` / `'reps'` / `'volume'` / `'1rm'` — the real enum lands with M4-10's `RecordsService` (04 §5); kept as a plain string here so this file never has to import a domain enum that doesn't exist yet. */
  kind: string;
  value: number;
}

/**
 * `useWorkoutRecordsEarned(workoutId)` — the hook `SaveWorkoutSheet` calls.
 * Always resolves `[]` (no-op) regardless of `workoutId`; `null` skips the
 * query entirely (mirrors every other conditional `useQuery` in this
 * codebase, e.g. `ExerciseSetTableSection`'s own `enabled` usage).
 */
export function useWorkoutRecordsEarned(workoutId: string | null): UseQueryResult<RecordAward[]> {
  return useQuery({
    queryKey: ['records', 'workout', workoutId],
    queryFn: async (): Promise<RecordAward[]> => [],
    enabled: workoutId != null,
  });
}
