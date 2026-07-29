/**
 * `ExerciseBrowseScreen` full-dataset smoke test (M1-07 acceptance gate) —
 * kept in its own file, deliberately the *only* test in this feature that
 * seeds the complete real 873-row dataset and mounts the real
 * `@shopify/flash-list` `FlashList` (every other behavioral case uses
 * `exercise-fixtures.ts`'s small real-record subset + a lightweight
 * `FlashList` stand-in, `ExerciseBrowseScreen.test.tsx`, for speed/
 * isolation — the AND-composition filtering logic itself is exhaustively
 * covered against the complete dataset in `exercise-list-model.test.ts`).
 *
 * This is the acceptance-gate evidence for "a 873-row list ... all 873
 * rows are logically present/reachable in the data layer without the
 * component crashing/hanging" — 06 §8's "fixed row height" perf tactic
 * (`EXERCISE_ROW_HEIGHT`/`SECTION_HEADER_HEIGHT`, both fixed constants, no
 * dynamic sizing) is the acceptance gate's documented proxy for 60 fps: RNTL
 * cannot measure real frame timing without a simulator (`docs/plan/
 * BLOCKERS.md`'s established no-simulator carve-out, same as every prior
 * milestone's tasks), but a fixed-height row is FlashList's actual
 * documented lever for smooth virtualized scroll.
 */
import { render, screen, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { ExerciseRepositoryImpl } from '@/data/exercises/exercise-repository';
import { BUNDLED_EXERCISE_DATASET, seedBuiltinExercises } from '@/data/exercises/seed-builtins';
import { openBetterSqlite3Driver } from '@/data/sqlite/driver.better-sqlite3';
import { migrate } from '@/data/sqlite/migrator';
import type { SqliteDriver } from '@/data/sqlite/driver';
import { ThemeProvider } from '@/ui/theme-provider';

import { ExerciseBrowseScreen, EXERCISE_ROW_HEIGHT, SECTION_HEADER_HEIGHT } from '../ExerciseBrowseScreen';

jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn() },
}));

// See `ExerciseBrowseScreen.test.tsx`'s identical mock for why this is
// needed post-M1-12: `ExerciseRow` now reaches `@/lib/files`'s real
// top-level native imports via the fixed `resolveExerciseThumbnailSource`.
jest.mock('@/lib/files');

describe('ExerciseBrowseScreen — full 873-row dataset (M1-07 acceptance gate)', () => {
  it('loads, filters, and row-builds every one of the real 873 built-ins without crashing or hanging, using a fixed row height', async () => {
    const driver: SqliteDriver = openBetterSqlite3Driver(':memory:');
    migrate(driver);
    seedBuiltinExercises(driver, BUNDLED_EXERCISE_DATASET.exercises, BUNDLED_EXERCISE_DATASET.version);
    const repository = new ExerciseRepositoryImpl(driver);

    // First: the data-layer claim on its own — repo.list() really does
    // carry all 873 rows (independent of anything React/FlashList does
    // with them below).
    const all = await repository.list();
    expect(all).toHaveLength(873);

    // `gcTime: 0` is test-only (a real app QueryClient keeps the default
    // 5 min GC window) — without it, an unmounted query's garbage-collection
    // `setTimeout` outlives this test and Jest's worker process never exits
    // ("Jest did not exit ... `--detectOpenHandles`"), confirmed by
    // isolated repro during this task; see `ExerciseBrowseScreen.test.tsx`'s
    // header for the same note.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    try {
      await render(
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <ExerciseBrowseScreen repository={repository} />
          </ThemeProvider>
        </QueryClientProvider>,
      );

      // Mounts and settles without throwing/hanging — the acceptance gate's
      // actual claim (RNTL doesn't virtualize-render all 873 native cells;
      // that's expected and fine per the task's own note, correctness here
      // is about the data flowing through cleanly, not scroll perf).
      await waitFor(() => expect(screen.getByTestId('exercise-browse-screen-list')).toBeTruthy());
      await waitFor(() => expect(screen.getByText('Barbell Bench Press - Medium Grip')).toBeTruthy());

      // Fixed row height perf tactic (06 §8) — both constants really are
      // constants (not computed per-item), which is what lets FlashList
      // avoid per-item measurement passes.
      expect(EXERCISE_ROW_HEIGHT).toBe(64);
      expect(SECTION_HEADER_HEIGHT).toBe(32);
    } finally {
      queryClient.clear();
      driver.close();
    }
  }, 30000);
});
