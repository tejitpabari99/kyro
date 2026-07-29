/**
 * Exercises tab (M1-07) — 03 §2's full library browse screen. Wires the
 * real, on-device `ExerciseRepositoryImpl` (backed by the single app-wide
 * `SqliteDriver`, `src/data/sqlite/boot.ts` — the same connection every
 * other repository consumer reuses post-boot) into
 * `src/features/exercises/ExerciseBrowseScreen.tsx`, which holds all of
 * this screen's actual logic/layout so it stays trivially reusable as a
 * picker sheet later (M2-09) without this route file changing.
 *
 * Replaces the M0-08 placeholder (`EmptyState` stub) that shipped before
 * the exercise data layer (M1-01..M1-06) existed.
 */
import React, { useMemo } from 'react';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { getAppDriver } from '@/data/sqlite/boot';
import { ExerciseBrowseScreen } from '@/features/exercises/ExerciseBrowseScreen';

export default function ExercisesScreen(): React.JSX.Element {
  const repository = useMemo(() => new ExerciseRepositoryImpl(getAppDriver()), []);

  return <ExerciseBrowseScreen repository={repository} />;
}
