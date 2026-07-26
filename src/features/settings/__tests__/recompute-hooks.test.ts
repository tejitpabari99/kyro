/**
 * `invalidateWeekBoundaryQueries` unit tests (M5-04) — the pure
 * `QueryClient`-invalidation helper `recompute-hooks.ts` exports. The fuller
 * integration proof that this actually fires from the real Settings screen
 * on a `first_day_of_week` change (and that a dependent query key really
 * gets invalidated, not just that this function's own body is correct) is
 * `app/(tabs)/profile/settings/__tests__/index.test.tsx`'s "first-day-of-week
 * recompute hook" describe block — this file only isolates the helper
 * itself, same "unit test the pure helper, integration test the wiring"
 * split `invalidateAfterWorkoutMutation` doesn't have its own dedicated unit
 * test for (it's exercised entirely through its call sites' integration
 * tests) but is worth having here since `recompute-hooks.ts` is a new module.
 */
import { QueryClient } from '@tanstack/react-query';

import { invalidateWeekBoundaryQueries } from '../recompute-hooks';

describe('invalidateWeekBoundaryQueries', () => {
  it('invalidates the stats and calendar prefixes, leaving history untouched', async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { gcTime: Infinity, retry: false } },
    });
    queryClient.setQueryData(['stats', 'summary'], []);
    queryClient.setQueryData(['stats', 'workout-dates'], []);
    queryClient.setQueryData(['calendar', 'month', 2026, 6], []);
    queryClient.setQueryData(['history', 'list'], { pages: [], pageParams: [] });

    await invalidateWeekBoundaryQueries(queryClient);

    expect(queryClient.getQueryState(['stats', 'summary'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['stats', 'workout-dates'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['calendar', 'month', 2026, 6])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['history', 'list'])?.isInvalidated).toBe(false);
  });

  it('resolves cleanly with no matching queries in the cache (no-op, never throws)', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await expect(invalidateWeekBoundaryQueries(queryClient)).resolves.toBeUndefined();
  });
});
