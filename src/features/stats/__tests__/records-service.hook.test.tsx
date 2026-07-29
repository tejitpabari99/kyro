/**
 * `useRecordsSnapshot` + singleton wiring tests (M4-02) — mirrors
 * `../../workout/__tests__/records-provider.test.tsx`'s
 * `renderHook`-through-a-real-`QueryClientProvider` pattern. Proves the
 * `['records', exerciseId]` query key, the `enabled: exerciseId != null`
 * skip-when-null convention, and `getRecordsService()`'s "throw until
 * configured" guard.
 */
import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { HistoricalSet } from '@/domain/records';

import { configureRecordsService, getRecordsService, useRecordsSnapshot } from '../records-service';

// Jest gives each test *file* its own fresh module registry (not each
// individual `it`), so this describe block's assertion only holds because
// it is declared — and therefore runs — before the `useRecordsSnapshot`
// describe block below ever calls `configureRecordsService` in its own
// `beforeEach`. Sibling top-level `describe` blocks in one file run their
// `it`s in declaration order (no `.only`/`concurrent` here), so this is
// deterministic, not a race.

function makeSet(overrides: Partial<HistoricalSet> = {}): HistoricalSet {
  return {
    setId: 's1',
    workoutId: 'w1',
    workoutStartTime: 1_000,
    setOrder: 0,
    exerciseType: 'weight_reps',
    setType: 'normal',
    isCompleted: true,
    weightKg: 100,
    reps: 5,
    durationSeconds: null,
    ...overrides,
  };
}

function wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('getRecordsService (singleton guard)', () => {
  it('throws a clear error before configureRecordsService has run', () => {
    expect(() => getRecordsService()).toThrow(/not configured/i);
  });
});

describe('useRecordsSnapshot', () => {
  beforeEach(() => {
    configureRecordsService({
      setsForExercise: async () => [makeSet({ weightKg: 100 })],
      exerciseHistoryWatermark: async () => 1,
    });
  });

  it('resolves a real RecordsComputation for a given exercise id', async () => {
    const { result } = await renderHook(() => useRecordsSnapshot('bench'), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.snapshot.heaviestWeightKg).toEqual({
      value: 100,
      setId: 's1',
      workoutId: 'w1',
    });
  });

  it('does not run the query at all for a null exercise id', async () => {
    const { result } = await renderHook(() => useRecordsSnapshot(null), { wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });

  it('getRecordsService() returns the configured singleton after configureRecordsService', async () => {
    const service = getRecordsService();
    const snapshot = await service.getSnapshot('bench');
    expect(snapshot.snapshot.heaviestWeightKg?.value).toBe(100);
  });
});
