/**
 * Workout tab (M3-02) — 04 §1's real routines hub. Replaces the
 * M0-08/M2-05 placeholder that used to render its own `EmptyState` +
 * Start-Empty-Workout button directly in this file; all of that logic
 * (including the one-active-workout gate, 02 §1) now lives in
 * `RoutinesHubScreen` (`src/features/routines/RoutinesHubScreen.tsx`) —
 * this file is now a thin wiring shim that constructs the real
 * `RoutineRepositoryImpl`/`ExerciseRepositoryImpl` against the app-wide
 * `SqliteDriver` and hands them down, the exact same "route file only
 * wires real deps, feature screen owns logic/layout" split
 * `app/(tabs)/exercises/index.tsx` (M1-07) and `app/workout/active.tsx`
 * (M2-05) already established.
 *
 * `app/(tabs)/workout/__tests__/index.test.tsx` now only proves this
 * wiring (mirrors `app/workout/__tests__/active.test.tsx`'s route-test
 * pattern); the full one-active-workout-gate behavioral suite moved to
 * `src/features/routines/__tests__/RoutinesHubScreen.test.tsx` along with
 * every other new behavioral case this task adds.
 */
import React, { useMemo } from 'react';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { RoutineRepositoryImpl } from '@/data/routines/routine-repository';
import { getAppDriver } from '@/data/sqlite/boot';
import { RoutinesHubScreen } from '@/features/routines/RoutinesHubScreen';

export default function WorkoutScreen(): React.JSX.Element {
  const routineRepository = useMemo(() => new RoutineRepositoryImpl(getAppDriver()), []);
  const exerciseRepository = useMemo(() => new ExerciseRepositoryImpl(getAppDriver()), []);

  return (
    <RoutinesHubScreen routineRepository={routineRepository} exerciseRepository={exerciseRepository} />
  );
}
