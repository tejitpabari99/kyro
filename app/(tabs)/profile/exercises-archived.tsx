/**
 * `/profile/exercises-archived` route (M1-10) — 03 §5 / 04 §7's Profile →
 * Exercises → Archived shortcut. Wires the real, on-device
 * `ExerciseRepositoryImpl` into `ArchivedExercisesScreen`, same thin-route
 * pattern every other exercise route in this milestone uses.
 */
import React, { useMemo } from 'react';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { getAppDriver } from '@/data/sqlite/boot';
import { ArchivedExercisesScreen } from '@/features/exercises/ArchivedExercisesScreen';

export default function ArchivedExercisesRoute(): React.JSX.Element {
  const repository = useMemo(() => new ExerciseRepositoryImpl(getAppDriver()), []);

  return <ArchivedExercisesScreen repository={repository} />;
}
