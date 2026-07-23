/**
 * `/exercise/[id]/edit` route (M1-10) — the custom-exercise edit form.
 * Reached from `ExerciseDetailScreen`'s "Edit" affordance (customs only —
 * built-ins never render an Edit entry point, 03 §3/§5). Wires the real,
 * on-device `ExerciseRepositoryImpl` the same way every other exercise
 * route does (`app/exercise/[id].tsx`, M1-08; `app/exercise/new.tsx`,
 * M1-09) — this file coexists with `app/exercise/[id].tsx` because
 * expo-router treats `/exercise/:id` and `/exercise/:id/edit` as distinct
 * route patterns, not a conflicting pair.
 */
import React, { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { getAppDriver } from '@/data/sqlite/boot';
import { ExerciseFormScreen } from '@/features/exercises/ExerciseFormScreen';

export default function EditExerciseRoute(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const repository = useMemo(() => new ExerciseRepositoryImpl(getAppDriver()), []);

  return <ExerciseFormScreen repository={repository} mode="edit" exerciseId={id} />;
}
