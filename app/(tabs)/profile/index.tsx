/**
 * Profile tab route (M0-08 placeholder, completed M5-04) — wires the real
 * `WorkoutRepositoryImpl`/`ExerciseRepositoryImpl` into
 * `src/features/profile/ProfileScreen.tsx`, which now holds all of this
 * screen's actual data/layout — the established "feature component owns
 * data + layout, route file only wires real deps" split
 * (`HistoryScreen`/M2-14, `ProfileStatisticsRoute`/M4-08).
 */
import React, { useMemo } from 'react';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { getAppDriver } from '@/data/sqlite/boot';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import { ProfileScreen } from '@/features/profile/ProfileScreen';

export default function ProfileRoute(): React.JSX.Element {
  const workoutRepository = useMemo(() => new WorkoutRepositoryImpl(getAppDriver()), []);
  const exerciseRepository = useMemo(() => new ExerciseRepositoryImpl(getAppDriver()), []);

  return (
    <ProfileScreen workoutRepository={workoutRepository} exerciseRepository={exerciseRepository} />
  );
}
