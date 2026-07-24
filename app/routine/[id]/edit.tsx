/**
 * `/routine/[id]/edit` route (M3-04, 06 §3: "modal") — the routine editor
 * in edit mode. Coexists with a future `/routine/[id]` detail route the
 * same way `app/exercise/[id]/edit.tsx` coexists with `app/exercise/[id]
 * .tsx` (M1-10's header) — expo-router treats `/routine/:id` and
 * `/routine/:id/edit` as distinct patterns, not a conflicting pair. See
 * `app/routine/new.tsx`'s header for the shared wiring rationale.
 */
import React, { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { RoutineRepositoryImpl } from '@/data/routines/routine-repository';
import { getAppDriver } from '@/data/sqlite/boot';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import { useSettingsStore } from '@/features/settings/settings-store';
import { RoutineEditorScreen } from '@/features/routines/RoutineEditorScreen';

export default function EditRoutineRoute(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const routineRepository = useMemo(() => new RoutineRepositoryImpl(getAppDriver()), []);
  const exerciseRepository = useMemo(() => new ExerciseRepositoryImpl(getAppDriver()), []);
  const workoutRepository = useMemo(() => new WorkoutRepositoryImpl(getAppDriver()), []);

  const weightUnit = useSettingsStore((state) => state.settings.weight_unit);
  const distanceUnit = useSettingsStore((state) => state.settings.distance_unit);
  const defaultRestSeconds = useSettingsStore((state) => state.settings.default_rest_seconds);

  return (
    <RoutineEditorScreen
      mode="edit"
      routineId={id}
      routineRepository={routineRepository}
      exerciseRepository={exerciseRepository}
      previousSets={(exerciseId, opts) => workoutRepository.previousSets(exerciseId, opts)}
      weightUnit={weightUnit}
      distanceUnit={distanceUnit}
      defaultRestSeconds={defaultRestSeconds}
    />
  );
}
