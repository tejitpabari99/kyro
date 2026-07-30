/**
 * Home tab (M2-14) — 09 M2 scope: minimal saved-workout list to verify
 * saves (the real History tab — search/calendar/filters/CSV — is M4).
 * Replaces the M0-08 placeholder. Wires the real, on-device
 * `WorkoutRepositoryImpl`/`ExerciseRepositoryImpl` (both backed by the
 * single app-wide `SqliteDriver`, `src/data/sqlite/boot.ts`) into
 * `src/features/history/HistoryListScreen.tsx`, which holds all of this
 * screen's actual logic/layout — the established "feature component owns
 * data + layout, route file only wires real deps" split
 * (`ExerciseBrowseScreen`/M1-07, `ActiveWorkoutScreen`/M2-05).
 */
import React, { useMemo } from 'react';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { getAppDriver } from '@/data/sqlite/boot';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import { HistoryListScreen } from '@/features/history/HistoryListScreen';

export default function HistoryScreen(): React.JSX.Element {
  const workoutRepository = useMemo(() => new WorkoutRepositoryImpl(getAppDriver()), []);
  const exerciseRepository = useMemo(() => new ExerciseRepositoryImpl(getAppDriver()), []);

  return (
    <HistoryListScreen workoutRepository={workoutRepository} exerciseRepository={exerciseRepository} />
  );
}
