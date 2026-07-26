/**
 * `ProfileScreen` (M5-04, 04 §7's "Profile & settings surface") — the real
 * Profile tab, replacing `app/(tabs)/profile/index.tsx`'s previous
 * placeholder (`EmptyState` + a few bare `ListRow`s). Follows the same
 * "feature component owns data + layout, route file only wires real deps"
 * split every other data-backed screen in this codebase uses
 * (`StatisticsScreen.tsx`/`HistoryListScreen.tsx`/`CalendarScreen.tsx`).
 *
 * ## Sections (04 §7, in order)
 *
 * 1. **Header** — avatar (one emoji in a circle, `settings.profile
 *    .avatar_emoji`) + display name (`settings.profile.name`, or "Add your
 *    name" placeholder when empty) + a gear icon button → Settings. Tapping
 *    the avatar/name opens an edit sheet (name `TextInput` + a fixed emoji
 *    picker row) — local vanity only, no auth, no image picker/crop
 *    pipeline (that's the progress-photos capture path's job, an unrelated
 *    feature).
 * 2. **Stat tiles** — workout count + current streak, reusing
 *    `workoutRepository.workoutDates()` under the *same*
 *    `['stats', 'workout-dates']` query key `StatisticsScreen.tsx` already
 *    registers (06 §8: "computed in the page query, cached by Query") — one
 *    shared cache entry across both screens, and `domain/streaks.ts`'s
 *    `computeWeekStreak` (the exact function `StatisticsScreen.tsx`/
 *    `CalendarScreen.tsx` already use) rather than a third re-derivation of
 *    the same streak rule.
 * 3. **Shortcut cards** — Statistics · Exercises (Archived management) ·
 *    Measures · Calendar, a 2×2 grid. "Exercises" here specifically means
 *    the *archived-exercise management* shortcut 04 §7 calls out
 *    ("Exercises[archived mgmt]") — general exercise browsing already has
 *    its own tab; this card routes to `/profile/exercises-archived`
 *    (M1-10), unchanged from the old placeholder's row of the same name.
 *    "Measures" routes to `/profile/measures` (M5-02/M5-03's route tree,
 *    reachable only by direct URL before this task — see that route file's
 *    own header). "Calendar" routes to `/history/calendar` (M4-06's
 *    existing route — 04 §7 doesn't fix a URL, and this is the one that
 *    already exists).
 * 4. **Recent workouts (3)** — reuses `history-list-model.ts`'s
 *    `buildHistoryCard` + `HistoryWorkoutCard.tsx` (the exact same card
 *    component/model `HistoryListScreen.tsx` renders) rather than a fourth
 *    from-scratch history-summary renderer, under its own
 *    `['history', 'recent']` query key (distinct from
 *    `HistoryListScreen.tsx`'s `['history', 'list']` infinite query — a
 *    fixed 3-row fetch is a different shape, an `useInfiniteQuery` page
 *    cursor would be pure overhead here — but sharing the `'history'`
 *    prefix `invalidateAfterWorkoutMutation` already invalidates broadly,
 *    so finishing/editing/deleting a workout anywhere refreshes this list
 *    too without this screen needing its own invalidation call). A "See
 *    All" row links to History (`/history`, the tab route already covers
 *    this — no push needed via `router`, but this screen isn't inside the
 *    History tab's own stack, so a `router.push('/(tabs)/history')` is used
 *    exactly like `HistoryWorkoutCard`'s own tap-through convention for
 *    cross-tab navigation).
 * 5. Dev-only rows (Design Gallery, Load Fixture Data) — unchanged from the
 *    old placeholder, `__DEV__`-gated exactly as before.
 */
import React, { useMemo, useState } from 'react';
import { router } from 'expo-router';
import {
  BarChart3,
  CalendarDays,
  ArchiveRestore,
  Database,
  FlaskConical,
  Ruler,
  Settings as SettingsIcon,
} from 'lucide-react-native';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';

import type { Exercise, ExerciseRepository } from '@/data/exercises/types';
import type { WorkoutRepository, WorkoutSummary } from '@/data/workouts/types';
import { computeWeekStreak } from '@/domain/streaks';
import { useSettingsStore } from '@/features/settings/settings-store';
import { getRecordsService } from '@/features/stats/records-service';
import { buildHistoryCard, type ExerciseAwards, type HistoryCardUnits } from '../history/history-list-model';
import { HistoryWorkoutCard, type HistoryCardData } from '../history/HistoryWorkoutCard';
import { Card } from '@/ui/Card';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { StatTile } from '@/ui/StatColumn';
import { useTheme } from '@/ui/theme-provider';

export type ProfileWorkoutRepository = Pick<
  WorkoutRepository,
  'workoutDates' | 'listCompleted' | 'getExercisesForWorkouts'
>;
export type ProfileExerciseRepository = Pick<ExerciseRepository, 'list'>;

export interface ProfileScreenProps {
  workoutRepository: ProfileWorkoutRepository;
  exerciseRepository: ProfileExerciseRepository;
  testID?: string;
}

const RECENT_WORKOUTS_LIMIT = 3;

/** A small, fixed emoji picker — local vanity only, no image asset pipeline. */
const AVATAR_EMOJI_OPTIONS: readonly string[] = [
  '💪', '🏋️', '🔥', '⚡', '🐉', '🦁', '🚴', '🏃', '🥇', '🎯',
];

function mapExercises(exercises: readonly Exercise[]): Map<string, Exercise> {
  const map = new Map<string, Exercise>();
  for (const exercise of exercises) {
    map.set(exercise.id, exercise);
  }
  return map;
}

async function fetchRecentWorkouts(
  workoutRepository: ProfileWorkoutRepository,
  exerciseMap: ReadonlyMap<string, Exercise>,
  units: HistoryCardUnits,
  warmupInStats: boolean,
): Promise<HistoryCardData[]> {
  const summaries = await workoutRepository.listCompleted({ limit: RECENT_WORKOUTS_LIMIT });
  if (summaries.length === 0) {
    return [];
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

  return summaries.map((summary: WorkoutSummary) =>
    buildHistoryCard(
      summary,
      exercisesByWorkout.get(summary.id) ?? [],
      exerciseMap,
      awardsByExerciseId,
      units,
      warmupInStats,
    ),
  );
}

export function ProfileScreen({
  workoutRepository,
  exerciseRepository,
  testID = 'profile-screen',
}: ProfileScreenProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  const profile = useSettingsStore((state) => state.settings.profile);
  const weightUnit = useSettingsStore((state) => state.settings.weight_unit);
  const distanceUnit = useSettingsStore((state) => state.settings.distance_unit);
  const warmupInStats = useSettingsStore((state) => state.settings.warmup_in_stats);
  const firstDayOfWeek = useSettingsStore((state) => state.settings.first_day_of_week);
  const units: HistoryCardUnits = useMemo(() => ({ weightUnit, distanceUnit }), [weightUnit, distanceUnit]);

  const [editSheetVisible, setEditSheetVisible] = useState(false);
  const [draftName, setDraftName] = useState(profile.name);

  // Same unranged, all-time query `StatisticsScreen.tsx` registers under
  // `['stats', 'workout-dates']` — see file header ("shared cache entry").
  const workoutDatesQuery = useQuery({
    queryKey: ['stats', 'workout-dates'],
    queryFn: () => workoutRepository.workoutDates(),
  });
  const totalWorkouts = useMemo(
    () => (workoutDatesQuery.data ?? []).reduce((sum, d) => sum + d.count, 0),
    [workoutDatesQuery.data],
  );
  const streakWeeks = useMemo(
    () => computeWeekStreak(workoutDatesQuery.data ?? [], { firstDayOfWeek }),
    [workoutDatesQuery.data, firstDayOfWeek],
  );

  const exercisesQuery = useQuery({
    queryKey: ['exercises', 'all-including-archived'],
    queryFn: () => exerciseRepository.list({ includeArchived: true }),
  });
  const exerciseMap = useMemo(() => mapExercises(exercisesQuery.data ?? []), [exercisesQuery.data]);

  const recentWorkoutsQuery = useQuery({
    queryKey: ['history', 'recent'],
    queryFn: () => fetchRecentWorkouts(workoutRepository, exerciseMap, units, warmupInStats),
    enabled: exercisesQuery.isSuccess,
  });
  const recentWorkouts = recentWorkoutsQuery.data ?? [];

  const openEditSheet = (): void => {
    setDraftName(profile.name);
    setEditSheetVisible(true);
  };

  const handleSaveName = (): void => {
    void useSettingsStore
      .getState()
      .setSetting('profile', { ...profile, name: draftName.trim() });
  };

  const handlePickEmoji = (emoji: string): void => {
    void useSettingsStore.getState().setSetting('profile', { ...profile, avatar_emoji: emoji });
  };

  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: colors.bg.base }}>
      <ScrollView contentContainerStyle={{ padding: spacing['4'] }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginBottom: spacing['6'],
          }}
        >
          <Pressable
            testID={`${testID}-avatar-button`}
            accessibilityRole="button"
            accessibilityLabel="Edit profile"
            onPress={openEditSheet}
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
          >
            <View
              testID={`${testID}-avatar`}
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: colors.bg.elevated,
                alignItems: 'center',
                justifyContent: 'center',
                marginRight: spacing['3'],
              }}
            >
              <Text style={{ fontSize: 28 }}>{profile.avatar_emoji}</Text>
            </View>
            <Text style={[typography.title2, { color: colors.text.primary }]} numberOfLines={1}>
              {profile.name.length > 0 ? profile.name : 'Add your name'}
            </Text>
          </Pressable>
          <Pressable
            testID={`${testID}-settings-button`}
            accessibilityRole="button"
            accessibilityLabel="Settings"
            hitSlop={8}
            onPress={() => router.push('/profile/settings')}
          >
            <SettingsIcon size={24} strokeWidth={1.75} color={colors.text.secondary} />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', gap: spacing['3'], marginBottom: spacing['6'] }}>
          <StatTile
            testID={`${testID}-workout-count-tile`}
            label="Workouts"
            value={String(totalWorkouts)}
            style={{ flex: 1 }}
          />
          <StatTile
            testID={`${testID}-streak-tile`}
            label="Streak"
            value={`${streakWeeks} wk${streakWeeks === 1 ? '' : 's'}`}
            style={{ flex: 1 }}
          />
        </View>

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: spacing['3'],
            marginBottom: spacing['6'],
          }}
        >
          <ShortcutCard
            testID={`${testID}-statistics-shortcut`}
            icon={<BarChart3 size={22} strokeWidth={1.75} color={colors.accent.text} />}
            label="Statistics"
            onPress={() => router.push('/profile/statistics')}
          />
          <ShortcutCard
            testID={`${testID}-archived-exercises-shortcut`}
            icon={<ArchiveRestore size={22} strokeWidth={1.75} color={colors.accent.text} />}
            label="Exercises"
            onPress={() => router.push('/profile/exercises-archived')}
          />
          <ShortcutCard
            testID={`${testID}-measures-shortcut`}
            icon={<Ruler size={22} strokeWidth={1.75} color={colors.accent.text} />}
            label="Measures"
            onPress={() => router.push('/profile/measures')}
          />
          <ShortcutCard
            testID={`${testID}-calendar-shortcut`}
            icon={<CalendarDays size={22} strokeWidth={1.75} color={colors.accent.text} />}
            label="Calendar"
            onPress={() => router.push('/history/calendar')}
          />
        </View>

        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing['2'] }}>
          <Text style={[typography.footnote, { color: colors.text.secondary }]}>RECENT WORKOUTS</Text>
          <Pressable
            testID={`${testID}-see-all-history`}
            accessibilityRole="button"
            accessibilityLabel="See all workouts"
            onPress={() => router.push('/history')}
          >
            <Text style={[typography.footnote, { color: colors.accent.text }]}>See All</Text>
          </Pressable>
        </View>

        {recentWorkouts.length === 0 ? (
          <Text
            testID={`${testID}-recent-workouts-empty`}
            style={[typography.subhead, { color: colors.text.secondary, marginBottom: spacing['6'] }]}
          >
            No workouts logged yet.
          </Text>
        ) : (
          <View style={{ marginHorizontal: -spacing['4'], marginBottom: spacing['4'] }}>
            {recentWorkouts.map((item) => (
              <HistoryWorkoutCard
                key={item.workoutId}
                testID={`${testID}-recent-card-${item.workoutId}`}
                item={item}
                onPress={(workoutId) => router.push(`/history/${workoutId}` as never)}
              />
            ))}
          </View>
        )}

        <View style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: colors.bg.surface }}>
          {__DEV__ ? (
            <ListRow
              testID="dev-gallery-link"
              title="Design Gallery (DEV)"
              subtitle="Every src/ui primitive, both themes"
              leading={<FlaskConical size={20} strokeWidth={1.75} color={colors.text.secondary} />}
              chevron
              onPress={() => router.push('/dev/gallery')}
            />
          ) : null}
          {__DEV__ ? (
            <ListRow
              testID="dev-load-fixture-link"
              title="Load Fixture Data (DEV)"
              subtitle="5-year synthetic history for perf/QA passes"
              leading={<Database size={20} strokeWidth={1.75} color={colors.text.secondary} />}
              chevron
              hideSeparator
              onPress={() => router.push('/dev/load-fixture')}
            />
          ) : null}
        </View>
      </ScrollView>

      <Sheet
        testID={`${testID}-edit-profile-sheet`}
        visible={editSheetVisible}
        onDismiss={() => setEditSheetVisible(false)}
      >
        <View style={{ paddingHorizontal: spacing['4'] }}>
          <Text style={[typography.headline, { color: colors.text.primary, marginBottom: spacing['3'] }]}>
            Edit Profile
          </Text>
          <TextInput
            testID={`${testID}-name-input`}
            value={draftName}
            onChangeText={setDraftName}
            onBlur={handleSaveName}
            onSubmitEditing={handleSaveName}
            placeholder="Your name"
            placeholderTextColor={colors.text.tertiary}
            style={[
              typography.body,
              {
                minHeight: 44,
                color: colors.text.primary,
                borderBottomWidth: 1,
                borderBottomColor: colors.border.input,
                marginBottom: spacing['4'],
              },
            ]}
          />
          <Text style={[typography.footnote, { color: colors.text.secondary, marginBottom: spacing['2'] }]}>
            AVATAR
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing['2'] }}>
            {AVATAR_EMOJI_OPTIONS.map((emoji) => (
              <Pressable
                key={emoji}
                testID={`${testID}-avatar-option-${emoji}`}
                accessibilityRole="button"
                accessibilityLabel={`Avatar ${emoji}`}
                accessibilityState={{ selected: profile.avatar_emoji === emoji }}
                onPress={() => handlePickEmoji(emoji)}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor:
                    profile.avatar_emoji === emoji ? colors.bg.elevated : 'transparent',
                }}
              >
                <Text style={{ fontSize: 22 }}>{emoji}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Sheet>
    </View>
  );
}

interface ShortcutCardProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  testID?: string;
}

/** One 2×2-grid shortcut card (Statistics/Exercises/Measures/Calendar — file header §3). */
function ShortcutCard({ icon, label, onPress, testID }: ShortcutCardProps): React.JSX.Element {
  const { typography, colors, spacing } = useTheme();

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{ width: '47%' }}
    >
      <Card style={{ alignItems: 'flex-start' }}>
        <View style={{ marginBottom: spacing['2'] }}>{icon}</View>
        <Text style={[typography.body, { color: colors.text.primary }]}>{label}</Text>
      </Card>
    </Pressable>
  );
}
