/**
 * `records-provider.ts` tests (M2-14 no-op -> M4-10 real wiring) — proves
 * `useWorkoutRecordsEarned` resolves `[]` both when unconfigured (no
 * regression against the old M2-14 no-op contract for tests that don't
 * boot the RecordsService) and for a genuinely empty result, then the real
 * per-exercise-fold behavior once `configureRecordsService` runs, plus the
 * shared label/value/banner-message formatting helpers `ConnectedSetRow.tsx`
 * also consumes.
 */
import { renderHook, waitFor } from '@testing-library/react-native';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { HistoricalSet, RecordAward as DomainRecordAward } from '@/domain/records';
import { configureRecordsService } from '@/features/stats/records-service';

import {
  formatPRBannerMessage,
  formatRecordAwardValue,
  formatRecordTypeLabel,
  useWorkoutRecordsEarned,
  type WorkoutRecordsEarnedExerciseInput,
} from '../records-provider';

function wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
  const queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('useWorkoutRecordsEarned — unconfigured / null / empty (no regression against the old no-op contract)', () => {
  it('does not run the query at all for a null workout id', async () => {
    const { result } = await renderHook(() => useWorkoutRecordsEarned(null, [], 'kg'), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.data).toBeUndefined();
  });

  it('resolves an empty array when no exercises are passed', async () => {
    const { result } = await renderHook(() => useWorkoutRecordsEarned('workout-1', [], 'kg'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe('useWorkoutRecordsEarned — real computation once RecordsService is configured (04 §5.4)', () => {
  function makeSet(id: string, weightKg: number, reps: number) {
    return { id, position: 0, setType: 'normal' as const, weightKg, reps, durationSeconds: null };
  }

  it('returns a row per newly-earned award, formatted for display', async () => {
    configureRecordsService({
      setsForExercise: async () => [
        {
          setId: 'hist',
          workoutId: 'w-hist',
          workoutStartTime: 1,
          setOrder: 0,
          exerciseType: 'weight_reps',
          setType: 'normal',
          isCompleted: true,
          weightKg: 100,
          reps: 5,
          durationSeconds: null,
        },
      ],
      exerciseHistoryWatermark: async () => 1,
    });

    const exercises: WorkoutRecordsEarnedExerciseInput[] = [
      {
        exerciseId: 'bench',
        exerciseName: 'Bench Press',
        exerciseType: 'weight_reps',
        sets: [makeSet('new-1', 102.5, 5)],
      },
    ];

    const { result } = await renderHook(() => useWorkoutRecordsEarned('w-new', exercises, 'kg'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const rows = result.current.data!;
    expect(rows.length).toBeGreaterThan(0);
    const heaviest = rows.find((r) => r.kind === 'Heaviest Weight');
    expect(heaviest).toEqual({
      exerciseId: 'bench',
      exerciseName: 'Bench Press',
      kind: 'Heaviest Weight',
      value: '102.5 kg',
    });
  });

  it('a workout with no sets beating history resolves an empty array', async () => {
    configureRecordsService({
      setsForExercise: async () => [
        {
          setId: 'hist',
          workoutId: 'w-hist',
          workoutStartTime: 1,
          setOrder: 0,
          exerciseType: 'weight_reps',
          setType: 'normal',
          isCompleted: true,
          weightKg: 150,
          reps: 5,
          durationSeconds: null,
        },
      ],
      exerciseHistoryWatermark: async () => 1,
    });

    const exercises: WorkoutRecordsEarnedExerciseInput[] = [
      {
        exerciseId: 'bench',
        exerciseName: 'Bench Press',
        exerciseType: 'weight_reps',
        sets: [makeSet('new-1', 100, 5)],
      },
    ];

    const { result } = await renderHook(() => useWorkoutRecordsEarned('w-new', exercises, 'kg'), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });
});

describe('formatRecordTypeLabel', () => {
  it('uses 04 §5.1\'s own names for every non-set-record type', () => {
    expect(formatRecordTypeLabel({ recordType: 'heaviest_weight', setId: 's', workoutId: 'w' })).toBe(
      'Heaviest Weight',
    );
    expect(formatRecordTypeLabel({ recordType: 'best_1rm', setId: 's', workoutId: 'w' })).toBe(
      'Best Estimated 1RM',
    );
    expect(formatRecordTypeLabel({ recordType: 'best_set_volume', setId: 's', workoutId: 'w' })).toBe(
      'Best Set Volume',
    );
    expect(formatRecordTypeLabel({ recordType: 'most_reps', setId: 's', workoutId: 'w' })).toBe('Most Reps');
    expect(formatRecordTypeLabel({ recordType: 'longest_duration', setId: 's', workoutId: 'w' })).toBe(
      'Longest Duration',
    );
  });

  it('appends the rep-count bucket for set_record', () => {
    expect(
      formatRecordTypeLabel({ recordType: 'set_record', bucket: 5, setId: 's', workoutId: 'w' }),
    ).toBe('Set Record (5)');
    expect(
      formatRecordTypeLabel({ recordType: 'set_record', bucket: '10+', setId: 's', workoutId: 'w' }),
    ).toBe('Set Record (10+)');
  });
});

describe('formatRecordAwardValue', () => {
  const weightAward: DomainRecordAward = { recordType: 'heaviest_weight', setId: 's', workoutId: 'w' };

  it('formats weight-based types in kg', () => {
    expect(formatRecordAwardValue(weightAward, 102.5, 'kg')).toBe('102.5 kg');
  });

  it('formats weight-based types in lbs', () => {
    expect(formatRecordAwardValue(weightAward, 100, 'lbs')).toMatch(/lbs$/);
  });

  it('formats most_reps as a rep count', () => {
    expect(
      formatRecordAwardValue({ recordType: 'most_reps', setId: 's', workoutId: 'w' }, 8, 'kg'),
    ).toBe('8 reps');
  });

  it('formats longest_duration via domain/units formatDuration', () => {
    expect(
      formatRecordAwardValue({ recordType: 'longest_duration', setId: 's', workoutId: 'w' }, 90, 'kg'),
    ).toBe('1:30');
  });
});

describe('formatPRBannerMessage (04 §5.5: "multiple types combine into one banner")', () => {
  const candidate: HistoricalSet = {
    setId: 's-new',
    workoutId: 'w-new',
    workoutStartTime: 1,
    setOrder: 0,
    exerciseType: 'weight_reps',
    setType: 'normal',
    isCompleted: true,
    weightKg: 102.5,
    reps: 5,
    durationSeconds: null,
  };

  it('one award formats as a single clause', () => {
    const awards: DomainRecordAward[] = [{ recordType: 'heaviest_weight', setId: 's-new', workoutId: 'w-new' }];
    expect(formatPRBannerMessage(awards, candidate, 'kg')).toBe('Heaviest Weight PR — 102.5 kg');
  });

  it('multiple awards combine into one semicolon-joined banner string', () => {
    const awards: DomainRecordAward[] = [
      { recordType: 'heaviest_weight', setId: 's-new', workoutId: 'w-new' },
      { recordType: 'best_set_volume', setId: 's-new', workoutId: 'w-new' },
    ];
    const message = formatPRBannerMessage(awards, candidate, 'kg');
    expect(message).toContain('Heaviest Weight PR — 102.5 kg');
    expect(message).toContain('Best Set Volume PR — 512.5 kg');
    expect(message.split('; ')).toHaveLength(2);
  });
});
