/**
 * `RecordsService` (M4-02, 06 §4.4) — the query-layer wrapper around
 * `domain/records.ts` (M4-01) that makes PRs cheap everywhere: a
 * per-exercise in-memory cache keyed by `WorkoutRepository
 * .exerciseHistoryWatermark(exerciseId)` (`./
 * ../../data/workouts/types.ts`'s own doc comment — the cheapest signal
 * "has anything that could move this exercise's PRs changed"), exposed to
 * React via TanStack Query (`['records', exerciseId]`, 06 §4 item 4's own
 * query-key namespacing convention), plus the central
 * `invalidateAfterWorkoutMutation` helper 06 §4 names directly ("a single
 * `invalidateAfterWorkoutMutation(exerciseIds)` helper centralizes the
 * recompute story").
 *
 * ## Two independent cache layers, on purpose
 *
 * TanStack Query's own `['records', exerciseId]` cache (staleTime 0,
 * default `gcTime`) is *not* redundant with this module's own `Map` — they
 * solve different problems:
 *
 *  - **Query's cache** dedupes concurrent/rapid re-renders of the *same*
 *    hook call and is the thing `invalidateAfterWorkoutMutation` actually
 *    triggers a refetch through (exactly like every other feature's
 *    `queryClient.invalidateQueries({queryKey: [...]})` call, e.g.
 *    `RoutinesHubScreen.tsx`/`ExerciseFormScreen.tsx`) — but it is
 *    per-QueryClient-key, garbage-collected when unused, and never shared
 *    with a `getSnapshot()` call made *outside* a `useRecordsSnapshot` hook
 *    (e.g. a future History-card page query computing "🏆 N PRs" per
 *    workout needs each of that workout's distinct exercises' snapshots
 *    *inside its own queryFn* — `HistoryListScreen.tsx`'s existing
 *    per-row `exerciseRepository.get(id)` N+1 pattern is the established
 *    precedent for exactly this shape, documented in that file's own header
 *    as "acceptable now, M4 replaces").
 *  - **This module's `Map`** is the thing that survives both of those
 *    gaps: it lives for the process lifetime (no `gcTime` eviction) and is
 *    reachable from any caller holding a `RecordsServiceApi` reference, not
 *    just React components subscribed to one specific query key. Its own
 *    entries self-invalidate via the watermark check inside
 *    {@link createRecordsService}'s `getSnapshot` — no explicit
 *    `.invalidate()` API is needed or exposed: a cache "hit" is *defined*
 *    as "the watermark I have on file still matches the DB's," so asking
 *    the DB for the current watermark (cheap, 05 §4) *is* the invalidation
 *    check, every single call. `invalidateAfterWorkoutMutation` only has
 *    to make TanStack Query actually call `getSnapshot` again (mutations
 *    already bump `workouts.updated_at`, `types.ts`'s own doc comment) —
 *    it never needs to reach into this module's cache directly.
 *
 * ## Live check (04 §5.5, 08 §4.1 cases 10/13): synchronous, cache-only
 *
 * {@link RecordsServiceApi.evaluateLive} never awaits anything and never
 * touches `repository` — it reads straight off this module's own `Map` via
 * {@link RecordsServiceApi.peekSnapshot} and folds
 * `domain/records.ts`'s `evaluateLiveCheck` over it. This is the "no DB
 * hit per check" the task's own acceptance gate names: the *warming* read
 * (`getSnapshot`, awaited once when a caller starts caring about an
 * exercise — e.g. when its card mounts in the active workout) is the only
 * place a DB round trip happens; every keystroke/check after that is pure
 * in-memory folding. A cold cache (never warmed, or evicted — this never
 * happens today since entries live forever, but the contract holds
 * regardless) returns `null`, not a best-effort empty-history guess — a
 * `null` is "not ready, don't evaluate yet," never silently treated as "no
 * PRs exist" (which would risk a false-positive PR banner for an exercise
 * that actually has real history the caller just hasn't warmed).
 *
 * ## Singleton wiring — mirrors `settingsStore`/`activeWorkoutStore`
 *
 * `createRecordsService(repository)` is a pure factory (used directly by
 * every test in `__tests__/records-service.test.ts` — no singleton
 * involved). The app-wide instance is injected once at boot exactly like
 * `useSettingsStore.getState().load(repository)` /
 * `useActiveWorkoutStore.getState().rehydrate(repository)` already are
 * (`app/_layout.tsx`, same boot step, reusing the very same
 * `WorkoutRepositoryImpl` instance constructed there for
 * `activeWorkoutStore`) — `configureRecordsService`/`getRecordsService`
 * below are that same "factory + boot-injected singleton" shape without
 * Zustand, since nothing needs to reactively subscribe to the cache's own
 * internal state (all UI reactivity flows through TanStack Query instead).
 */
import { useQuery, type QueryClient, type UseQueryResult } from '@tanstack/react-query';

import type { WorkoutRepository } from '@/data/workouts/types';
import {
  computeRecordsSnapshot,
  evaluateLiveCheck,
  type HistoricalSet,
  type RecordAward,
  type RecordsComputation,
  type RecordsSnapshot,
} from '@/domain/records';

/** The slice of `WorkoutRepository` this module needs — mirrors every other feature's `Pick<Repository, '...'>` prop-typing convention (`HistoryListScreen.tsx`, `HistoryDetailScreen.tsx`). */
export type RecordsRepository = Pick<WorkoutRepository, 'setsForExercise' | 'exerciseHistoryWatermark'>;

interface CacheEntry {
  watermark: number;
  computation: RecordsComputation;
}

export interface RecordsServiceApi {
  /**
   * The full-history snapshot + awards list for `exerciseId` (M4-09's
   * Records tab, M4-03/M4-04's PR-count/trophy surfaces). Checks
   * `repository.exerciseHistoryWatermark(exerciseId)` first (one cheap
   * indexed query); returns the cached {@link RecordsComputation} unchanged
   * on a match, otherwise fetches `repository.setsForExercise(exerciseId)`
   * and re-runs `domain/records.ts`'s `computeRecordsSnapshot`, caching the
   * new result under the new watermark before returning it.
   */
  getSnapshot(exerciseId: string): Promise<RecordsComputation>;
  /** The cached snapshot for `exerciseId` if `getSnapshot` has resolved for it at least once since the last watermark change, else `null`. Synchronous, no DB access — the primitive {@link evaluateLive} is built on. */
  peekSnapshot(exerciseId: string): RecordsSnapshot | null;
  /**
   * The live-banner evaluator (04 §5.5): folds `sessionCheckedSets` (in
   * check order) over the cached baseline snapshot, then evaluates
   * `candidate` against the result — `domain/records.ts`'s
   * `evaluateLiveCheck`, exactly. Returns `null` when `exerciseId` hasn't
   * been warmed via {@link getSnapshot} yet (see file header) rather than
   * evaluating against an assumed-empty baseline.
   */
  evaluateLive(
    exerciseId: string,
    sessionCheckedSets: readonly HistoricalSet[],
    candidate: HistoricalSet,
  ): RecordAward[] | null;
}

/** Pure factory — no module-level state, safe to construct fresh per test (mirrors `createSettingsStore`/`createActiveWorkoutStore`). */
export function createRecordsService(repository: RecordsRepository): RecordsServiceApi {
  const cache = new Map<string, CacheEntry>();

  async function getSnapshot(exerciseId: string): Promise<RecordsComputation> {
    const watermark = await repository.exerciseHistoryWatermark(exerciseId);
    const cached = cache.get(exerciseId);
    if (cached && cached.watermark === watermark) {
      return cached.computation;
    }

    const sets = await repository.setsForExercise(exerciseId);
    const computation = computeRecordsSnapshot(sets);
    cache.set(exerciseId, { watermark, computation });
    return computation;
  }

  function peekSnapshot(exerciseId: string): RecordsSnapshot | null {
    return cache.get(exerciseId)?.computation.snapshot ?? null;
  }

  function evaluateLive(
    exerciseId: string,
    sessionCheckedSets: readonly HistoricalSet[],
    candidate: HistoricalSet,
  ): RecordAward[] | null {
    const baseline = peekSnapshot(exerciseId);
    if (!baseline) {
      return null;
    }
    return evaluateLiveCheck(baseline, sessionCheckedSets, candidate);
  }

  return { getSnapshot, peekSnapshot, evaluateLive };
}

let singleton: RecordsServiceApi | null = null;

/** Boot wiring (file header) — call once from `app/_layout.tsx` after `WorkoutRepositoryImpl` exists, before any screen reads `getRecordsService()`. Returns the new instance for convenience (unused by the real boot call site, handy in tests that want to configure-and-hold in one line). */
export function configureRecordsService(repository: RecordsRepository): RecordsServiceApi {
  singleton = createRecordsService(repository);
  return singleton;
}

/** The app-wide instance `useRecordsSnapshot`/any non-hook caller reads. Throws if `configureRecordsService` hasn't run yet — the same "throw a clear error rather than silently drop the read" posture `settingsStore.setSetting`'s pre-`load()` guard established, surfaced immediately at the call site instead of a confusing downstream `undefined`. */
export function getRecordsService(): RecordsServiceApi {
  if (!singleton) {
    throw new Error(
      'RecordsService not configured — call configureRecordsService(repository) at boot before use.',
    );
  }
  return singleton;
}

/**
 * `useRecordsSnapshot(exerciseId)` — the hook M4-09 (Records tab charts)
 * and M4-04 (per-exercise lookups feeding workout-detail trophies) consume
 * directly; `['records', exerciseId]` matches 06 §4's own key-namespacing
 * example verbatim, so `invalidateAfterWorkoutMutation` below invalidates
 * exactly this. `null` skips the query entirely, same convention
 * `useWorkoutRecordsEarned` (`../workout/records-provider.ts`) and
 * `ExerciseSetTableSection`'s own conditional `useQuery` calls already use.
 */
export function useRecordsSnapshot(exerciseId: string | null): UseQueryResult<RecordsComputation> {
  return useQuery({
    queryKey: ['records', exerciseId],
    queryFn: () => getRecordsService().getSnapshot(exerciseId as string),
    enabled: exerciseId != null,
  });
}

/**
 * The central invalidation helper 06 §4 names directly: "Mutations (finish
 * workout, edit, import, routine CRUD) invalidate affected keys; a single
 * `invalidateAfterWorkoutMutation(exerciseIds)` helper centralizes the
 * recompute story (PR caches + query invalidation, `04` §5.6)." Invalidates
 * one `['records', exerciseId]` query per id in `exerciseIds` (deduped —
 * an edit's "union of old+new exercise ids," 08 §4.9, may contain repeats)
 * plus the three broad, workout-scoped keys every history/stats/calendar
 * surface reads through (`['history']`, `['stats']`, `['calendar']`) —
 * those three are never narrowed to a per-exercise key because every
 * existing consumer of them (`HistoryListScreen.tsx`'s `['history','list']`,
 * the future M4-06 calendar, M4-08 stats dashboard) is itself an aggregate
 * over potentially every exercise, exactly like `RoutinesHubScreen.tsx`'s
 * own `['routines']`-prefix-invalidates-everything precedent (that file's
 * own header: "a single key prefix means one `invalidateQueries` call").
 * Called from every workout mutation that can move a PR — today, just the
 * active-workout finish flow (`ActiveWorkoutScreen.tsx`'s `finishSave`);
 * M4-05/M5's edit/delete/import call sites reuse this same helper once they
 * exist, per this task's own scoping note.
 */
export function invalidateAfterWorkoutMutation(
  queryClient: QueryClient,
  exerciseIds: readonly string[],
): Promise<void> {
  const uniqueExerciseIds = Array.from(new Set(exerciseIds));
  return Promise.all([
    ...uniqueExerciseIds.map((exerciseId) =>
      queryClient.invalidateQueries({ queryKey: ['records', exerciseId] }),
    ),
    queryClient.invalidateQueries({ queryKey: ['history'] }),
    queryClient.invalidateQueries({ queryKey: ['stats'] }),
    queryClient.invalidateQueries({ queryKey: ['calendar'] }),
  ]).then(() => undefined);
}
