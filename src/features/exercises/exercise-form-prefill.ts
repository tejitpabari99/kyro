/**
 * `exercise-form-prefill` (M1-10) — the param contract for **Duplicate as
 * Custom**: `ExerciseDetailScreen`'s built-in ⋯ menu needs to hand a full
 * field set (name + " (Copy)", type, muscles, equipment, instructions,
 * `usesCustomMetric`) over to `/exercise/new`, which is more than a single
 * string can carry through `expo-router`'s typed-route query params without
 * either URL-encoding a JSON blob (fragile against length limits/encoding
 * edge cases for an in-app-only navigation, never a deep link) or widening
 * `new.tsx`'s param contract beyond the plain `name` string M1-07 already
 * established and other callers (the empty-search shortcut, the bare `+`
 * button) still rely on unchanged.
 *
 * Chosen shape instead: a tiny in-memory, single-slot store. The duplicate
 * action calls {@link setExerciseFormPrefill} immediately before
 * `router.push('/exercise/new')` (no query param in that call); `new.tsx`
 * calls {@link consumeExerciseFormPrefill} on mount, which **reads and
 * clears** the slot in one step — so back-navigating into `/exercise/new`
 * a second time (e.g. via the tab bar, not through the duplicate action)
 * never resurfaces a stale prefill from an earlier duplicate. `new.tsx`
 * falls back to the M1-07 `name` query-param contract whenever the slot is
 * empty, so both callers keep working unmodified through the same route.
 *
 * A plain module-scope variable (not `zustand`/context) is deliberate: this
 * is a one-shot hand-off between two screens in the same navigation stack,
 * not shared UI state anything renders from directly — the simplest thing
 * that works, and trivially unit-testable (`__tests__/exercise-form-
 * prefill.test.ts`) without any provider/render setup.
 */
import type { Equipment, ExerciseType, MuscleGroup } from '@/domain/enums';

export interface ExerciseFormPrefill {
  name: string;
  exerciseType: ExerciseType;
  primaryMuscleGroup: MuscleGroup;
  secondaryMuscleGroups: MuscleGroup[];
  equipment: Equipment;
  instructions: string[];
  usesCustomMetric: boolean;
}

let pendingPrefill: ExerciseFormPrefill | null = null;

/** Stashes `prefill` for the next `/exercise/new` mount to consume. Call immediately before `router.push('/exercise/new')`. */
export function setExerciseFormPrefill(prefill: ExerciseFormPrefill): void {
  pendingPrefill = prefill;
}

/** Reads and clears the pending prefill (if any) — a second call in the same navigation returns `null`. */
export function consumeExerciseFormPrefill(): ExerciseFormPrefill | null {
  const prefill = pendingPrefill;
  pendingPrefill = null;
  return prefill;
}

/** Test-only escape hatch — mirrors other module-singleton reset helpers in this codebase (e.g. `lib/sentry.ts`'s `__resetSentryForTests`). */
export function __resetExerciseFormPrefillForTests(): void {
  pendingPrefill = null;
}
