/**
 * `ExerciseDetailScreen` (M1-08) — 03 §3's exercise detail page: 16:9
 * `ExerciseMedia` header, `SegmentedControl` tabs About | History | Charts |
 * Records. Holds the data fetch (`ExerciseRepository.get(exerciseId)` via
 * TanStack Query, same "feature component owns data + layout, route file
 * only wires real deps" split `ExerciseBrowseScreen`/M1-07 established) so
 * `app/exercise/[id].tsx` stays a thin wiring shim.
 *
 * **About tab** (built fully now, per this task's scope): exercise type
 * label, equipment label, primary muscle as a filled `Chip`, secondary
 * muscles as outline `Chip`s, numbered instruction steps. `Chip` (07 §5)
 * only has two visual states — active (accent-tinted fill + accent text)
 * and inactive (bordered `bg.elevated`) — reused directly here as the
 * "filled"/"outline" pair 03 §3 asks for (`active` for the primary chip,
 * inactive for secondaries), with `showCaret={false}` and no `onPress`
 * since these are read-only tags, not filter controls. "No instructions
 * added — edit to add" renders whenever `instructions` is empty — 03 §3's
 * text frames this as a customs-only case, but the task brief asks to
 * verify that against the real data or handle it generically either way:
 * the real vendored dataset actually has 5 built-ins with zero mapped
 * instructions (`Iron_Cross`, `One-Arm_Kettlebell_Swings`, `Push_Press`,
 * `Side_Bridge`, `Side_Jackknife` — the exact 5 M1-04's build run logged as
 * "missing instructions" warnings), so the generic empty-array check is the
 * only correct implementation, not just a defensive fallback.
 *
 * **History/Charts/Records tabs:** themed `EmptyState` placeholders only
 * (real functionality is M4-09's job, 03 §3). Records' copy is 03 §3's own
 * verbatim text ("No records yet"); History/Charts don't have doc-specified
 * copy, so reasonable placeholder copy was written for them.
 *
 * **Sheet-reuse forward-compat (M1-08 task note, not a hard requirement):**
 * this component renders its own lightweight in-content back affordance
 * rather than assuming a native Stack header — the root `<Stack
 * screenOptions={{headerShown: false}} />` (`app/_layout.tsx`, M0-08) means
 * every route already renders header-chrome-free, and nothing below reaches
 * for `navigation.setOptions`/a Stack-only API. `showBackButton` defaults to
 * `true` (the pushed-screen case) so a later mid-workout sheet wrapper (M2)
 * can pass `showBackButton={false}` if its own sheet chrome already
 * provides a dismiss affordance, without this file changing.
 */
import React, { useMemo, useState } from 'react';
import { ChevronLeft, History as HistoryIcon, LineChart, Trophy } from 'lucide-react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { EQUIPMENT_LABELS, EXERCISE_TYPE_LABELS, MUSCLE_GROUP_LABELS } from '@/domain/enums';
import type { Exercise, ExerciseRepository } from '@/data/exercises/types';
import { Chip } from '@/ui/Chip';
import { EmptyState } from '@/ui/EmptyState';
import { SegmentedControl } from '@/ui/SegmentedControl';
import { useTheme } from '@/ui/theme-provider';

import { ExerciseMedia } from './ExerciseMedia';

const DETAIL_TABS = [
  { value: 'about', label: 'About' },
  { value: 'history', label: 'History' },
  { value: 'charts', label: 'Charts' },
  { value: 'records', label: 'Records' },
] as const;

type DetailTab = (typeof DETAIL_TABS)[number]['value'];

export interface ExerciseDetailScreenProps {
  repository: ExerciseRepository;
  exerciseId: string;
  showBackButton?: boolean;
  testID?: string;
}

function AboutTab({ exercise, testID }: { exercise: Exercise; testID: string }): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  return (
    <ScrollView testID={testID} contentContainerStyle={{ padding: spacing['4'] }}>
      <View style={{ marginBottom: spacing['4'] }}>
        <Text style={[typography.caption, { color: colors.text.tertiary }]}>TYPE</Text>
        <Text
          testID={`${testID}-type`}
          style={[typography.body, { color: colors.text.primary, marginTop: spacing['0.5'] }]}
        >
          {EXERCISE_TYPE_LABELS[exercise.exerciseType]}
        </Text>
      </View>

      <View style={{ marginBottom: spacing['4'] }}>
        <Text style={[typography.caption, { color: colors.text.tertiary }]}>EQUIPMENT</Text>
        <Text
          testID={`${testID}-equipment`}
          style={[typography.body, { color: colors.text.primary, marginTop: spacing['0.5'] }]}
        >
          {EQUIPMENT_LABELS[exercise.equipment]}
        </Text>
      </View>

      <View style={{ marginBottom: spacing['4'] }}>
        <Text style={[typography.caption, { color: colors.text.tertiary, marginBottom: spacing['2'] }]}>
          MUSCLES
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing['2'] }}>
          <Chip
            testID={`${testID}-primary-muscle-chip`}
            label={MUSCLE_GROUP_LABELS[exercise.primaryMuscleGroup]}
            active
            showCaret={false}
          />
          {exercise.secondaryMuscleGroups.map((muscle) => (
            <Chip
              key={muscle}
              testID={`${testID}-secondary-muscle-chip-${muscle}`}
              label={MUSCLE_GROUP_LABELS[muscle]}
              active={false}
              showCaret={false}
            />
          ))}
        </View>
      </View>

      <View>
        <Text style={[typography.caption, { color: colors.text.tertiary, marginBottom: spacing['2'] }]}>
          INSTRUCTIONS
        </Text>
        {exercise.instructions.length === 0 ? (
          <Text
            testID={`${testID}-no-instructions`}
            style={[typography.subhead, { color: colors.text.secondary }]}
          >
            No instructions added — edit to add
          </Text>
        ) : (
          exercise.instructions.map((step, index) => (
            <View
              key={index}
              testID={`${testID}-instruction-${index}`}
              style={{ flexDirection: 'row', marginBottom: spacing['3'] }}
            >
              <Text
                style={[
                  typography.body,
                  { color: colors.text.tertiary, width: spacing['6'], fontWeight: '600' },
                ]}
              >
                {index + 1}.
              </Text>
              <Text style={[typography.body, { color: colors.text.primary, flex: 1 }]}>{step}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function DetailEmptyTab({
  tab,
  testID,
}: {
  tab: 'history' | 'charts' | 'records';
  testID: string;
}): React.JSX.Element {
  const { colors } = useTheme();

  const copy: Record<typeof tab, { title: string; caption: string; icon: React.ReactNode }> = {
    history: {
      title: 'No history yet',
      caption: 'Log a set with this exercise to see it here.',
      icon: <HistoryIcon size={40} strokeWidth={1.75} color={colors.text.tertiary} />,
    },
    charts: {
      title: 'No chart data yet',
      caption: 'Charts appear once you’ve logged a few sessions.',
      icon: <LineChart size={40} strokeWidth={1.75} color={colors.text.tertiary} />,
    },
    records: {
      // 03 §3 verbatim: "Empty state: 'No records yet'."
      title: 'No records yet',
      caption: 'PRs and set records appear here once you’ve logged this exercise.',
      icon: <Trophy size={40} strokeWidth={1.75} color={colors.text.tertiary} />,
    },
  };

  const { title, caption, icon } = copy[tab];

  return <EmptyState testID={testID} icon={icon} title={title} caption={caption} />;
}

export function ExerciseDetailScreen({
  repository,
  exerciseId,
  showBackButton = true,
  testID = 'exercise-detail-screen',
}: ExerciseDetailScreenProps): React.JSX.Element {
  const { colors, spacing, typography } = useTheme();
  const { width } = useWindowDimensions();
  const [tab, setTab] = useState<DetailTab>('about');

  const query = useQuery({
    queryKey: ['exercises', 'detail', exerciseId],
    queryFn: () => repository.get(exerciseId),
  });

  const exercise = useMemo(() => query.data ?? null, [query.data]);

  return (
    <View testID={testID} style={{ flex: 1, backgroundColor: colors.bg.base }}>
      {showBackButton ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: spacing['4'],
            paddingTop: spacing['4'],
            paddingBottom: spacing['2'],
          }}
        >
          <Pressable
            testID={`${testID}-back`}
            accessibilityRole="button"
            accessibilityLabel="Back"
            hitSlop={8}
            onPress={() => router.back()}
          >
            <ChevronLeft size={24} strokeWidth={1.75} color={colors.text.primary} />
          </Pressable>
        </View>
      ) : null}

      {query.isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent.primary} />
        </View>
      ) : query.isError || exercise == null ? (
        <EmptyState
          testID={`${testID}-not-found`}
          icon={<ChevronLeft size={40} strokeWidth={1.75} color={colors.text.tertiary} />}
          title="Exercise not found"
          caption="This exercise may have been removed."
        />
      ) : (
        <>
          <ExerciseMedia
            testID={`${testID}-media`}
            exercise={exercise}
            size={width}
          />

          <Text
            testID={`${testID}-name`}
            style={[
              typography.title2,
              {
                color: colors.text.primary,
                marginTop: spacing['4'],
                marginHorizontal: spacing['4'],
              },
            ]}
          >
            {exercise.name}
          </Text>

          <SegmentedControl
            testID={`${testID}-tabs`}
            options={DETAIL_TABS}
            value={tab}
            onChange={setTab}
            style={{ marginHorizontal: spacing['4'], marginTop: spacing['3'] }}
          />

          <View style={{ flex: 1, marginTop: spacing['2'] }}>
            {tab === 'about' ? (
              <AboutTab exercise={exercise} testID={`${testID}-about`} />
            ) : (
              <DetailEmptyTab tab={tab} testID={`${testID}-${tab}`} />
            )}
          </View>
        </>
      )}
    </View>
  );
}
