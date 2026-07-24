/**
 * `records-provider.ts` tests (M2-14) — proves the no-op contract
 * `SaveWorkoutSheet` relies on: always resolves an empty array, never
 * throws, and skips the query entirely for a `null` workout id.
 */
import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import { useWorkoutRecordsEarned } from '../records-provider';

function wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useWorkoutRecordsEarned (M2-14 no-op stub)', () => {
  it('resolves an empty array for a real workout id', async () => {
    const { result } = await renderHook(() => useWorkoutRecordsEarned('workout-1'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it('does not run the query at all for a null workout id', async () => {
    const { result } = await renderHook(() => useWorkoutRecordsEarned(null), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });
});
