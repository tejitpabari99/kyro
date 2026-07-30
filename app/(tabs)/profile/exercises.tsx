/**
 * Profile → Exercises route (PRD I §4.2) — relocation of the former
 * `(tabs)/exercises` tab root now that Exercises is no longer its own tab
 * (the tab bar dropped to 3 tabs: Home, Workout, Profile). Reached via
 * `ProfileScreen.tsx`'s "Exercises" shortcut
 * (`router.push('/profile/exercises')`) rather than a `Tabs.Screen`.
 * Wires the same real, on-device `ExerciseRepositoryImpl` (backed by the
 * single app-wide `SqliteDriver`, `src/data/sqlite/boot.ts`) into
 * `src/features/exercises/ExerciseBrowseScreen.tsx`, unchanged from the
 * old route's own construction — the established "feature component owns
 * data + layout, route file only wires real deps" split
 * (`ProfileStatisticsRoute`/M4-08, `ActiveWorkoutScreen`/M2-05).
 */
import React, { useMemo } from 'react';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { getAppDriver } from '@/data/sqlite/boot';
import { ExerciseBrowseScreen } from '@/features/exercises/ExerciseBrowseScreen';

export default function ProfileExercisesRoute(): React.JSX.Element {
  const repository = useMemo(() => new ExerciseRepositoryImpl(getAppDriver()), []);

  return <ExerciseBrowseScreen repository={repository} />;
}
