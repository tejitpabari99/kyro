/**
 * History workout detail route (M2-14) — read-only detail reached from
 * `HistoryListScreen`'s row tap (`router.push(\`/history/${id}\`)`) and from
 * the finish flow's own post-save `router.replace` (`ActiveWorkoutScreen
 * .tsx`'s `handleSaveWorkout`). Sits alongside `index.tsx` under this same
 * `app/(tabs)/history/` directory (its `_layout.tsx` already wraps both in
 * one `ErrorBoundary` via `<Slot />`) rather than as a top-level
 * `app/history/[id].tsx` — deliberately avoiding a second, colliding
 * "history" route root (unlike `app/exercise/[id].tsx`, which is top-level
 * *because* `(tabs)/exercises/` is a different, plural directory name; here
 * both routes want the exact same `/history` segment, so they have to share
 * one directory to avoid an ambiguous route tree). Wires the real
 * `WorkoutRepositoryImpl`/`ExerciseRepositoryImpl` into
 * `src/features/history/HistoryDetailScreen.tsx`.
 *
 * M3-07 addition: also constructs a real `RoutineRepositoryImpl` — that
 * screen's new ⋯ menu needs `createFromWorkout` ("Save as Routine") and
 * `get` (the routine-name/"(deleted routine)" subtitle), mirroring
 * `app/workout/active.tsx`'s own `RoutineRepositoryImpl` construction.
 */
import React, { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { RoutineRepositoryImpl } from '@/data/routines/routine-repository';
import { getAppDriver } from '@/data/sqlite/boot';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import { HistoryDetailScreen } from '@/features/history/HistoryDetailScreen';

export default function HistoryDetailRoute(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workoutRepository = useMemo(() => new WorkoutRepositoryImpl(getAppDriver()), []);
  const exerciseRepository = useMemo(() => new ExerciseRepositoryImpl(getAppDriver()), []);
  const routineRepository = useMemo(() => new RoutineRepositoryImpl(getAppDriver()), []);

  return (
    <HistoryDetailScreen
      workoutId={id}
      workoutRepository={workoutRepository}
      exerciseRepository={exerciseRepository}
      routineRepository={routineRepository}
    />
  );
}
