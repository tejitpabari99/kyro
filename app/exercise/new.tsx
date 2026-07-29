/**
 * `/exercise/new` route (M1-09/M1-10) — the custom-exercise create form.
 * Two prefill sources, checked in order:
 *
 *  1. `exercise-form-prefill.ts`'s in-memory store — Duplicate-as-Custom
 *     (M1-10, `ExerciseDetailScreen`'s built-in ⋯ menu) stashes a full field
 *     set here immediately before navigating; `consumeExerciseFormPrefill`
 *     reads and clears it so a later, unrelated visit to this route never
 *     resurfaces a stale prefill.
 *  2. The `name` query param (M1-07's empty-search-shortcut/`+`-button
 *     contract, unchanged) — used only when the prefill store is empty.
 *
 * Wires the real, on-device `ExerciseRepositoryImpl` the same way every
 * other exercise route does (`app/exercise/[id].tsx`, M1-08).
 */
import React, { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { getAppDriver } from '@/data/sqlite/boot';
import { consumeExerciseFormPrefill } from '@/features/exercises/exercise-form-prefill';
import { ExerciseFormScreen } from '@/features/exercises/ExerciseFormScreen';

export default function NewExerciseRoute(): React.JSX.Element {
  const { name } = useLocalSearchParams<{ name?: string }>();
  const repository = useMemo(() => new ExerciseRepositoryImpl(getAppDriver()), []);
  // Consumed once, on first mount of this route instance — not re-read on
  // every render (that would clear-then-miss it on the very next render).
  const prefill = useMemo(() => consumeExerciseFormPrefill(), []);

  return (
    <ExerciseFormScreen
      repository={repository}
      mode="create"
      initialName={name}
      prefill={prefill}
    />
  );
}
