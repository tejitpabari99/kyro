/**
 * `RecordsService` unit tests (M4-02 acceptance gate) — the pure factory
 * (`createRecordsService`) against a fake `RecordsRepository`, no SQLite
 * involved: watermark cache hit/miss, `evaluateLive`'s "never touches the
 * driver" contract (spy), and `invalidateAfterWorkoutMutation`'s exact
 * query-key set against a real `QueryClient`. Repository-level correctness
 * of `setsForExercise`/`exerciseHistoryWatermark` themselves is
 * `workout-repository.records.test.ts`'s job; `computeRecordsSnapshot`/
 * `evaluateLiveCheck`'s own PR-computation correctness is
 * `domain/records.test.ts`'s (M4-01) — this file only proves the
 * query/cache/invalidation wrapper around both.
 */
import { QueryClient } from '@tanstack/react-query';

import type { HistoricalSet } from '@/domain/records';

import { createRecordsService, invalidateAfterWorkoutMutation, type RecordsRepository } from '../records-service';

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

interface FakeRepo extends RecordsRepository {
  setsForExercise: jest.Mock<Promise<HistoricalSet[]>, [string]>;
  exerciseHistoryWatermark: jest.Mock<Promise<number>, [string]>;
}

function createFakeRepo(opts: { watermark?: number; sets?: HistoricalSet[] } = {}): FakeRepo {
  let watermark = opts.watermark ?? 1;
  let sets = opts.sets ?? [makeSet()];
  return {
    setsForExercise: jest.fn(async () => sets),
    exerciseHistoryWatermark: jest.fn(async () => watermark),
    // test-only setters, not part of RecordsRepository — attached directly
    // on the fake so tests can move the fixture between calls.
    setWatermark: (next: number) => {
      watermark = next;
    },
    setSets: (next: HistoricalSet[]) => {
      sets = next;
    },
  } as unknown as FakeRepo;
}

describe('createRecordsService', () => {
  describe('getSnapshot — watermark cache hit/miss', () => {
    it('cache miss on first call: fetches sets and computes a real snapshot', async () => {
      const repo = createFakeRepo({ watermark: 5, sets: [makeSet({ weightKg: 100 })] });
      const service = createRecordsService(repo);

      const result = await service.getSnapshot('bench');

      expect(repo.exerciseHistoryWatermark).toHaveBeenCalledWith('bench');
      expect(repo.setsForExercise).toHaveBeenCalledWith('bench');
      expect(result.snapshot.heaviestWeightKg).toEqual({ value: 100, setId: 's1', workoutId: 'w1' });
    });

    it('cache hit: an unchanged watermark returns the cached computation without re-fetching sets', async () => {
      const repo = createFakeRepo({ watermark: 5 });
      const service = createRecordsService(repo);

      const first = await service.getSnapshot('bench');
      const second = await service.getSnapshot('bench');

      expect(repo.setsForExercise).toHaveBeenCalledTimes(1);
      expect(repo.exerciseHistoryWatermark).toHaveBeenCalledTimes(2);
      expect(second).toBe(first);
    });

    it('cache miss: a changed watermark re-fetches and recomputes', async () => {
      const repo = createFakeRepo({ watermark: 5, sets: [makeSet({ weightKg: 100 })] });
      const service = createRecordsService(repo);

      const first = await service.getSnapshot('bench');
      expect(first.snapshot.heaviestWeightKg?.value).toBe(100);

      (repo as unknown as { setWatermark: (n: number) => void }).setWatermark(6);
      (repo as unknown as { setSets: (s: HistoricalSet[]) => void }).setSets([
        makeSet({ setId: 's2', weightKg: 110 }),
      ]);

      const second = await service.getSnapshot('bench');

      expect(repo.setsForExercise).toHaveBeenCalledTimes(2);
      expect(second).not.toBe(first);
      expect(second.snapshot.heaviestWeightKg?.value).toBe(110);
    });

    it('caches independently per exerciseId', async () => {
      const repo = createFakeRepo({ watermark: 1 });
      const service = createRecordsService(repo);

      await service.getSnapshot('bench');
      await service.getSnapshot('squat');
      await service.getSnapshot('bench');

      // Two distinct ids -> two misses; the repeat 'bench' call is a hit.
      expect(repo.setsForExercise).toHaveBeenCalledTimes(2);
    });
  });

  describe('peekSnapshot', () => {
    it('is null before getSnapshot has ever resolved for that exercise', () => {
      const service = createRecordsService(createFakeRepo());
      expect(service.peekSnapshot('bench')).toBeNull();
    });

    it('matches the resolved snapshot after getSnapshot warms the cache', async () => {
      const repo = createFakeRepo({ sets: [makeSet({ weightKg: 100 })] });
      const service = createRecordsService(repo);

      const computation = await service.getSnapshot('bench');

      expect(service.peekSnapshot('bench')).toBe(computation.snapshot);
    });
  });

  describe('evaluateLive — no DB hit per check', () => {
    it('returns null when the exercise has never been warmed', () => {
      const repo = createFakeRepo();
      const service = createRecordsService(repo);

      const result = service.evaluateLive('bench', [], makeSet({ weightKg: 999 }));

      expect(result).toBeNull();
      expect(repo.setsForExercise).not.toHaveBeenCalled();
      expect(repo.exerciseHistoryWatermark).not.toHaveBeenCalled();
    });

    it('evaluates against the warmed baseline + in-session sets without ever touching the repository', async () => {
      const repo = createFakeRepo({ watermark: 1, sets: [makeSet({ weightKg: 100 })] });
      const service = createRecordsService(repo);
      await service.getSnapshot('bench');
      (repo.setsForExercise as jest.Mock).mockClear();
      (repo.exerciseHistoryWatermark as jest.Mock).mockClear();

      const noBeat = service.evaluateLive('bench', [], makeSet({ setId: 's-dup', weightKg: 100 }));
      // `reps: null` isolates this to the Heaviest Weight record only (04
      // §5.1's other weight-based records all require a rep count) — keeps
      // this assertion about "one specific award fires" rather than
      // re-deriving `domain/records.ts`'s own multi-record-type behavior,
      // which is M4-01's test suite's job, not this wrapper's.
      const beat = service.evaluateLive(
        'bench',
        [],
        makeSet({ setId: 's-new', weightKg: 102.5, reps: null }),
      );

      expect(noBeat).toEqual([]);
      expect(beat).toEqual([{ recordType: 'heaviest_weight', setId: 's-new', workoutId: 'w1' }]);
      expect(repo.setsForExercise).not.toHaveBeenCalled();
      expect(repo.exerciseHistoryWatermark).not.toHaveBeenCalled();
    });

    it('folds already-checked session sets into the baseline before evaluating the candidate', async () => {
      const repo = createFakeRepo({ watermark: 1, sets: [makeSet({ weightKg: 100 })] });
      const service = createRecordsService(repo);
      await service.getSnapshot('bench');

      const sessionSets = [makeSet({ setId: 's-session-1', weightKg: 101 })];
      const result = service.evaluateLive('bench', sessionSets, makeSet({ setId: 's-session-2', weightKg: 101 }));

      // 101 already beat the 100 baseline via the session set; an equal
      // 101 candidate does not re-award (04 §5.3 strict-greater).
      expect(result).toEqual([]);
    });
  });
});

describe('invalidateAfterWorkoutMutation', () => {
  it('invalidates one records key per (deduped) exercise id, plus history/stats/calendar', async () => {
    const queryClient = new QueryClient();
    const spy = jest.spyOn(queryClient, 'invalidateQueries');

    await invalidateAfterWorkoutMutation(queryClient, ['bench', 'squat', 'bench']);

    expect(spy).toHaveBeenCalledWith({ queryKey: ['records', 'bench'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['records', 'squat'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['history'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['stats'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['calendar'] });
    // Deduped: 'bench' appears twice in the input but only invalidates once.
    expect(spy.mock.calls.filter((call) => call[0]?.queryKey?.[1] === 'bench')).toHaveLength(1);
  });

  it('still invalidates the three broad keys when given an empty exercise-id list', async () => {
    const queryClient = new QueryClient();
    const spy = jest.spyOn(queryClient, 'invalidateQueries');

    await invalidateAfterWorkoutMutation(queryClient, []);

    expect(spy).toHaveBeenCalledWith({ queryKey: ['history'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['stats'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['calendar'] });
    expect(spy.mock.calls.filter((call) => call[0]?.queryKey?.[0] === 'records')).toHaveLength(0);
  });
});
