/**
 * `/routine/new` route (M3-04, 06 §3: "modal") — the routine editor in
 * create mode. Thin wiring shim, same split `app/exercise/new.tsx` (M1-09)
 * established: constructs the real repositories and settings, renders
 * `RoutineEditorScreen`. `WorkoutRepositoryImpl` is only ever used here for
 * its `previousSets` method (`RoutineExerciseCard.tsx`'s own header
 * explains why this screen can't reach `activeWorkoutStore.previousSets`
 * instead) — never constructed to mutate anything.
 */
import React, { useMemo } from 'react';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { RoutineRepositoryImpl } from '@/data/routines/routine-repository';
import { getAppDriver } from '@/data/sqlite/boot';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import { useSettingsStore } from '@/features/settings/settings-store';
import { RoutineEditorScreen } from '@/features/routines/RoutineEditorScreen';

export default function NewRoutineRoute(): React.JSX.Element {
  const routineRepository = useMemo(() => new RoutineRepositoryImpl(getAppDriver()), []);
  const exerciseRepository = useMemo(() => new ExerciseRepositoryImpl(getAppDriver()), []);
  const workoutRepository = useMemo(() => new WorkoutRepositoryImpl(getAppDriver()), []);

  const weightUnit = useSettingsStore((state) => state.settings.weight_unit);
  const distanceUnit = useSettingsStore((state) => state.settings.distance_unit);
  const defaultRestSeconds = useSettingsStore((state) => state.settings.default_rest_seconds);

  return (
    <RoutineEditorScreen
      mode="create"
      routineRepository={routineRepository}
      exerciseRepository={exerciseRepository}
      previousSets={(exerciseId, opts) => workoutRepository.previousSets(exerciseId, opts)}
      weightUnit={weightUnit}
      distanceUnit={distanceUnit}
      defaultRestSeconds={defaultRestSeconds}
    />
  );
}
