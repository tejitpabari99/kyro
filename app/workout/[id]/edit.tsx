/**
 * `/workout/[id]/edit` route (M4-05, 02 §15) — the past-workout editor
 * modal. Same "thin route file wires real repos, `EditWorkoutScreen` owns
 * all logic/layout" split every other feature screen follows
 * (`app/exercise/[id]/edit.tsx`, `app/routine/[id]/edit.tsx`,
 * `app/workout/active.tsx`) — placed at this exact path (top-level, outside
 * `(tabs)`, mirroring the two precedents above) so `HistoryDetailScreen`'s
 * own "Edit Workout" ⋯ menu item (M4-04, built in a parallel branch) can
 * navigate here with `router.push(\`/workout/${workoutId}/edit\`)` once both
 * branches merge — no coordination beyond this path needed, the same seam
 * `app/workout/active.tsx`'s own file header already used for `retro`
 * before its real caller (M4-03's History `+` menu) existed yet.
 *
 * Registered as a `fullScreenModal` in `app/_layout.tsx`, identical
 * presentation to `workout/active`/`routine/new`/`routine/[id]/edit` — 06
 * §3's own navigation map groups every full-logger-shaped screen under this
 * same presentation.
 */
import React, { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { RoutineRepositoryImpl } from '@/data/routines/routine-repository';
import { getAppDriver } from '@/data/sqlite/boot';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import { EditWorkoutScreen } from '@/features/workout/EditWorkoutScreen';

export default function EditWorkoutRoute(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const workoutRepository = useMemo(() => new WorkoutRepositoryImpl(getAppDriver()), []);
  const exerciseRepository = useMemo(() => new ExerciseRepositoryImpl(getAppDriver()), []);
  const routineRepository = useMemo(() => new RoutineRepositoryImpl(getAppDriver()), []);

  return (
    <EditWorkoutScreen
      workoutId={id}
      workoutRepository={workoutRepository}
      exerciseRepository={exerciseRepository}
      getRoutineFull={(routineId) => routineRepository.getFull(routineId)}
    />
  );
}
