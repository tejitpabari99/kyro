/**
 * `HistoryListScreen` (M4-03, 04 §3.1) — the real History tab: FlashList +
 * paged Query (20/page, `WorkoutRepository.listCompleted({before, limit})`),
 * each card = title, relative date, a Duration · Volume · 🏆 N PRs stats
 * strip (trophy segment omitted at 0), and one "N × Name (Equipment) —
 * best …" line per exercise. Header: a Calendar icon button (→ M4-06's
 * calendar, not built yet) and a `+` button opening a one-item action sheet
 * ("Log past workout" → the retro-logger entry point `app/workout
 * /active.tsx` already documents and reads `retro`/`startTime` query params
 * for, per that file's own header — this is the first *real* caller of
 * that plumbing). Replaces M2-14's minimal list (title/date/volume only,
 * `getFull` + an `ExerciseRepository.get` per row — this file's own
 * previous header called that "acceptable now, M4 replaces", and
 * `records-service.ts`'s file header names this exact screen/pattern by
 * name for the same reason).
 *
 * ## Data flow (06 §8's History perf row: "computed in the page query,
 * cached by Query")
 *
 * Two independent, independently-cached queries:
 *
 *  - `['exercises', 'all-including-archived']` — every exercise
 *    (`ExerciseRepository.list({includeArchived: true})`, one query,
 *    "~870 rows trivially fits" per 06 §8's Exercise-list row) kept as an
 *    in-memory `Map`. Archived exercises must still resolve here (03 §5:
 *    "still rendered in history/stats/old routines") — the default
 *    `list()` excludes them, so `includeArchived: true` is required, not
 *    the same call `ExerciseBrowseScreen` makes. Shares the `['exercises']`
 *    prefix every create/archive/restore mutation already invalidates
 *    (`ExerciseFormScreen.tsx`/`ArchivedExercisesScreen.tsx`), so a newly
 *    created/archived exercise's name/equipment stays correct here too
 *    without this screen needing its own invalidation call.
 *  - `['history', 'list']` (`useInfiniteQuery`) — one page at a time. Each
 *    page's `queryFn`: `listCompleted({before, limit: 20})`, then exactly
 *    two more `IN`-batched queries via the new
 *    `getExercisesForWorkouts(workoutIds)` repository method (`./types.ts`'s
 *    own doc comment — this is the "2 queries/page via IN batching" 05 §4
 *    calls for, replacing `getFull` × 20), then one
 *    `getRecordsService().getSnapshot(exerciseId)` per **distinct**
 *    exercise across the whole page (RecordsService's own in-memory cache,
 *    `records-service.ts`, makes repeat calls across pages/renders cheap —
 *    "no DB hit" once warmed). `history-list-model.ts`'s `buildHistoryCard`
 *    then folds all of that into one `HistoryCardData` per workout — pure,
 *    unit-tested there, not re-tested here.
 *
 * Deleting a workout (`WorkoutRepository.softDelete`, already built —
 * M4-04 is where the UI entry point for it lands) invalidates via the exact
 * same `['history']`-prefix `invalidateAfterWorkoutMutation` already fires
 * (`records-service.ts`) — this screen's `['history', 'list']` key matches
 * that prefix, so a delete from anywhere in the app updates this list on
 * its next focus/refetch without this screen needing its own delete-aware
 * code (04 §3's own acceptance line: "Deleting a workout updates list …
 * immediately").
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { CalendarDays, History, Plus } from 'lucide-react-native';
import { router } from 'expo-router';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { FlashList } from '@shopify/flash-list';

import type { Exercise, ExerciseRepository } from '@/data/exercises/types';
import type { WorkoutRepository, WorkoutSummary } from '@/data/workouts/types';
import { getRecordsService } from '@/features/stats/records-service';
import { useSettingsStore } from '@/features/settings/settings-store';
import { RoutineActionsSheet } from '@/features/routines/RoutineActionsSheet';
import { EmptyState } from '@/ui/EmptyState';
import { useTheme } from '@/ui/theme-provider';

import { buildHistoryCard, type ExerciseAwards, type HistoryCardUnits } from './history-list-model';
import { HistoryWorkoutCard, type HistoryCardData } from './HistoryWorkoutCard';

const PAGE_SIZE = 20;

export interface HistoryListScreenProps {
  workoutRepository: Pick<WorkoutRepository, 'listCompleted' | 'getExercisesForWorkouts'>;
  exerciseRepository: Pick<ExerciseRepository, 'list'>;
  testID?: string;
}

interface HistoryPage {
  items: HistoryCardData[];
  nextBefore: number | undefined;
}

async function fetchHistoryPage(
  before: number | undefined,
  workoutRepository: HistoryListScreenProps['workoutRepository'],
  exerciseMap: ReadonlyMap<string, Exercise>,
  units: HistoryCardUnits,
  warmupInStats: boolean,
): Promise<HistoryPage> {
  const summaries = await workoutRepository.listCompleted({ before, limit: PAGE_SIZE });
  if (summaries.length === 0) {
    return { items: [], nextBefore: undefined };
  }

  const exercisesByWorkout = await workoutRepository.getExercisesForWorkouts(
    summaries.map((summary) => summary.id),
  );

  const distinctExerciseIds = Array.from(
    new Set(
      summaries.flatMap((summary) =>
        (exercisesByWorkout.get(summary.id) ?? []).map((workoutExercise) => workoutExercise.exerciseId),
      ),
    ),
  );
  const awardEntries = await Promise.all(
    distinctExerciseIds.map(
      async (exerciseId): Promise<[string, ExerciseAwards]> => [
        exerciseId,
        (await getRecordsService().getSnapshot(exerciseId)).awards,
      ],
    ),
  );
  const awardsByExerciseId = new Map(awardEntries);

  const items = summaries.map((summary: WorkoutSummary) =>
    buildHistoryCard(
      summary,
      exercisesByWorkout.get(summary.id) ?? [],
      exerciseMap,
      awardsByExerciseId,
      units,
      warmupInStats,
    ),
  );

  const nextBefore = summaries.length === PAGE_SIZE ? summaries[summaries.length - 1]!.startTime : undefined;
  return { items, nextBefore };
}

function mapExercises(exercises: readonly Exercise[]): Map<string, Exercise> {
  const map = new Map<string, Exercise>();
  for (const exercise of exercises) {
    map.set(exercise.id, exercise);
  }
  return map;
}

export function HistoryListScreen({
  workoutRepository,
  exerciseRepository,
  testID = 'history-list',
}: HistoryListScreenProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  const weightUnit = useSettingsStore((state) => state.settings.weight_unit);
  const distanceUnit = useSettingsStore((state) => state.settings.distance_unit);
  const warmupInStats = useSettingsStore((state) => state.settings.warmup_in_stats);
  const units: HistoryCardUnits = useMemo(() => ({ weightUnit, distanceUnit }), [weightUnit, distanceUnit]);

  const [menuVisible, setMenuVisible] = useState(false);

  const exercisesQuery = useQuery({
    queryKey: ['exercises', 'all-including-archived'],
    queryFn: () => exerciseRepository.list({ includeArchived: true }),
  });
  const exerciseMap = useMemo(() => mapExercises(exercisesQuery.data ?? []), [exercisesQuery.data]);

  const historyQuery = useInfiniteQuery({
    queryKey: ['history', 'list'],
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      fetchHistoryPage(pageParam, workoutRepository, exerciseMap, units, warmupInStats),
    getNextPageParam: (lastPage) => lastPage.nextBefore,
    enabled: exercisesQuery.isSuccess,
  });

  const items = useMemo(
    () => historyQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [historyQuery.data],
  );

  // `useCallback`-stabilized (M4-11 perf tuning, `HistoryWorkoutCard.tsx`'s
  // own file header): `HistoryWorkoutCard` is `React.memo`-wrapped
  // specifically so an unrelated parent re-render doesn't re-render every
  // visible row at 1000+-workout scale — a fresh `onPress` closure every
  // render would silently defeat that by always failing `React.memo`'s
  // shallow-prop check on this one prop.
  const handleRowPress = useCallback((workoutId: string): void => {
    router.push(`/history/${workoutId}` as never);
  }, []);

  const handleCalendarPress = (): void => {
    // M4-06 hasn't landed yet — same "wire the intended route, don't build
    // a stub screen" seam `ExerciseBrowseScreen.tsx`'s M1-07 header already
    // established for `/exercise/[id]` before M1-08 existed. 06 §3's own
    // navigation map names this exact path: "history/calendar.tsx".
    router.push('/history/calendar' as never);
  };

  const handleLogPastWorkout = (): void => {
    setMenuVisible(false);
    // `app/workout/active.tsx` already reads `retro`/`startTime` query
    // params (its own header: "no retro-log entry point exists yet ...
    // these are read now so a future M4-05 entry point can navigate here
    // ... without this route file changing") — this is that entry point.
    // `startTime` is omitted: `ActiveWorkoutScreen`'s own
    // `defaultRetroStartTime()` fallback covers "no chosen date" (History's
    // `+`, as opposed to Calendar's per-day entry point, M4-06's own scope).
    router.push('/workout/active?retro=1' as never);
  };

  const isInitialLoading = exercisesQuery.isLoading || (historyQuery.isLoading && items.length === 0);
  const showEmptyState = !isInitialLoading && !historyQuery.isError && items.length === 0;

  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: colors.bg.base }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing['4'],
          paddingTop: spacing['4'],
          paddingBottom: spacing['2'],
        }}
      >
        <Text style={[typography.title1, { color: colors.text.primary }]}>History</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing['4'] }}>
          <Pressable
            testID={`${testID}-calendar-button`}
            accessibilityRole="button"
            accessibilityLabel="Calendar"
            hitSlop={8}
            onPress={handleCalendarPress}
          >
            <CalendarDays size={24} strokeWidth={1.75} color={colors.accent.text} />
          </Pressable>
          <Pressable
            testID={`${testID}-add-button`}
            accessibilityRole="button"
            accessibilityLabel="Log past workout"
            hitSlop={8}
            onPress={() => setMenuVisible(true)}
          >
            <Plus size={24} strokeWidth={1.75} color={colors.accent.text} />
          </Pressable>
        </View>
      </View>

      {isInitialLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent.primary} />
        </View>
      ) : showEmptyState ? (
        <EmptyState
          testID={`${testID}-empty`}
          icon={<History size={40} strokeWidth={1.75} color={colors.text.tertiary} />}
          title="No workouts logged yet"
          caption="Finished workouts will show up here."
        />
      ) : (
        <FlashList
          testID={`${testID}-list`}
          data={items}
          keyExtractor={(item) => item.workoutId}
          renderItem={({ item }: { item: HistoryCardData }) => (
            <HistoryWorkoutCard
              testID={`${testID}-card-${item.workoutId}`}
              item={item}
              onPress={handleRowPress}
            />
          )}
          onEndReached={() => {
            if (historyQuery.hasNextPage && !historyQuery.isFetchingNextPage) {
              void historyQuery.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            historyQuery.isFetchingNextPage ? (
              <View style={{ paddingVertical: spacing['4'] }}>
                <ActivityIndicator color={colors.accent.primary} />
              </View>
            ) : null
          }
        />
      )}

      <RoutineActionsSheet
        testID={`${testID}-add-sheet`}
        visible={menuVisible}
        onDismiss={() => setMenuVisible(false)}
        items={[{ key: 'log-past-workout', label: 'Log past workout', onPress: handleLogPastWorkout }]}
      />
    </View>
  );
}
