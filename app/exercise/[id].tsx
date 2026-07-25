/**
 * Exercise detail route (M1-08) — matches M1-07's browse-row navigation
 * exactly: `router.push(\`/exercise/${exercise.id}\`)`, a plain string path
 * (not an object with `pathname`/`params`), confirmed in
 * `ExerciseBrowseScreen.tsx`'s `handleRowPress` and its own review note in
 * `docs/plan/EXECUTION-LOG.md` (M1-07 reviewed entry). Wires the real,
 * on-device `ExerciseRepositoryImpl` (same shared `SqliteDriver` connection
 * every other repository consumer reuses post-boot, `src/data/sqlite/boot.ts`)
 * into `src/features/exercises/ExerciseDetailScreen.tsx`, which holds all of
 * this screen's actual logic/layout — kept thin so it stays reusable as a
 * mid-workout sheet later (M2) without this route file changing.
 *
 * M4-09: also constructs a `WorkoutRepositoryImpl` (same cheap, stateless,
 * shared-driver-wrapping construction `ExerciseRepositoryImpl` above already
 * uses) so the screen's History/Charts tabs have a real
 * `exerciseHistory(exerciseId)` feed on this, the primary exercise-detail
 * route (03 §3's own acceptance section).
 */
import React, { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { getAppDriver } from '@/data/sqlite/boot';
import { WorkoutRepositoryImpl } from '@/data/workouts/workout-repository';
import { ExerciseDetailScreen } from '@/features/exercises/ExerciseDetailScreen';

export default function ExerciseDetailRoute(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const repository = useMemo(() => new ExerciseRepositoryImpl(getAppDriver()), []);
  const workoutRepository = useMemo(() => new WorkoutRepositoryImpl(getAppDriver()), []);

  return (
    <ExerciseDetailScreen
      repository={repository}
      workoutRepository={workoutRepository}
      exerciseId={id}
    />
  );
}
