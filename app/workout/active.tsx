/**
 * `/workout/active` route (M2-05) — 06 §3: "ACTIVE LOGGER — fullScreenModal,
 * slide-from-bottom." All real logic/layout lives in
 * `ActiveWorkoutScreen` (`src/features/workout/ActiveWorkoutScreen.tsx`) —
 * this file only wires the real `ExerciseRepositoryImpl` and reads the
 * optional retro-log query params, the same thin-route-file pattern every
 * other route follows (`app/exercise/[id].tsx`, M1-08). `activeWorkoutStore`
 * / `settingsStore` are read directly inside the screen component (both are
 * already-booted app-wide singletons, same as every other feature screen).
 *
 * The `presentation: 'fullScreenModal'` / `animation: 'slide_from_bottom'`
 * screen options live on the `<Stack.Screen name="workout/active">` entry
 * in `app/_layout.tsx`, not here — expo-router/react-navigation's
 * native-stack only exposes named animation presets, not a literal
 * numeric spring curve, so 06 §3's "350 ms spring, damping 0.85" (an
 * OS-driven iOS modal-presentation curve) isn't independently
 * parameterizable through this API; `slide_from_bottom` is the closest
 * preset and what `fullScreenModal` already uses on iOS by default.
 *
 * `retro`/`startTime` query params: no retro-log entry point exists yet
 * (Calendar/History are later milestones) — these are read now so a
 * future M4-05 entry point can navigate here with
 * `router.push('/workout/active?retro=1&startTime=...')` without this
 * route file changing.
 *
 * `routineId` query param (M3-05, 02 §1): `RoutinesHubScreen`'s "Start
 * Routine" navigates here with `router.push('/workout/active?routineId=...')`
 * — the exact same query-param convention as `retro`/`startTime` above,
 * rather than a dedicated `/routine/[id]/start` route (see
 * `RoutinesHubScreen.tsx`'s own file header for the reasoning: this route
 * already exists and `ActiveWorkoutScreen` already owns the "how do I start
 * a workout" mount-effect logic, so a routine-start is just a third branch
 * of that same effect, not a new screen). This file now also constructs the
 * real `RoutineRepositoryImpl` (mirrors `app/(tabs)/workout/index.tsx`'s own
 * construction) — needed both to *start* from a routine and, via
 * `getRoutineFull`, to resolve routine-target placeholders on every render
 * of a routine-started workout (including a resumed one).
 */
import React, { useMemo } from 'react';
import { useLocalSearchParams } from 'expo-router';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { RoutineRepositoryImpl } from '@/data/routines/routine-repository';
import { getAppDriver } from '@/data/sqlite/boot';
import { ActiveWorkoutScreen } from '@/features/workout/ActiveWorkoutScreen';

export default function ActiveWorkoutRoute(): React.JSX.Element {
  const { retro, startTime, routineId } = useLocalSearchParams<{
    retro?: string;
    startTime?: string;
    routineId?: string;
  }>();
  const repository = useMemo(() => new ExerciseRepositoryImpl(getAppDriver()), []);
  const routineRepository = useMemo(() => new RoutineRepositoryImpl(getAppDriver()), []);

  const parsedStartTime = startTime ? Number(startTime) : undefined;

  return (
    <ActiveWorkoutScreen
      exerciseRepository={repository}
      retro={retro === '1'}
      retroStartTime={
        parsedStartTime !== undefined && Number.isFinite(parsedStartTime)
          ? parsedStartTime
          : undefined
      }
      routineId={routineId}
      getRoutineFull={(id) => routineRepository.getFull(id)}
    />
  );
}
