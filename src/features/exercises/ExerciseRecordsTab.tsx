/**
 * `ExerciseRecordsTab` (M4-09, 03 §3 / 04 §5.1/§5.4): "PR cards (value +
 * date + link to the workout); Set Records table: rows for rep counts
 * 1-10+ ('10+' bucket) showing best weight at that rep count and date."
 * Assisted types show a least-assistance info line instead of a trophy
 * (04 §5.1's own carve-out).
 *
 * Which slots to render is decided by **reading the actual computed
 * `RecordsSnapshot`**, not by re-deriving `domain/records.ts`'s private
 * per-type eligibility table here: a slot renders a card iff its holder is
 * non-null. This can never disagree with the Records tab's own source of
 * truth (P10, "derived never stored") — an exercise type that can never
 * populate a slot (per `domain/records.ts`'s `eligibilityForExerciseType`)
 * simply never has a non-null holder for it, so the card list is correct
 * by construction. The Set Records table and the least-assistance line are
 * the two exceptions that *do* need a type check (`exerciseType`) — 04
 * §5.1 restricts both structurally (Set Records only for `weight_reps`/
 * `bodyweight_reps`; least-assistance only for `bodyweight_assisted_reps`),
 * and neither has a natural "just check if empty" reading: an
 * all-`null` Set Records table for a type that can *never* have one (e.g.
 * a cardio exercise) would render 11 meaningless dash rows, not a
 * legitimate empty state.
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';

import type { ExerciseHistorySet } from '@/data/workouts/types';
import type { ExerciseType, WeightUnit } from '@/domain/enums';
import {
  SET_RECORD_BUCKET_VALUES,
  type RecordAward,
  type RecordHolder,
  type RecordsSnapshot,
  type SetRecordBucket,
} from '@/domain/records';
import { formatVolumeDisplay } from '@/domain/volume';
import { formatRelativeWorkoutDate } from '@/features/history/date-format';
import { formatRecordAwardValue, formatRecordTypeLabel } from '@/features/workout/records-provider';
import { Card } from '@/ui/Card';
import { useTheme } from '@/ui/theme-provider';

type TrophySlotKey = 'heaviestWeightKg' | 'best1RmKg' | 'bestSetVolumeKg' | 'mostReps' | 'longestDurationSeconds';

/** 04 §5.1's own table row order. */
const TROPHY_SLOTS: { key: TrophySlotKey; recordType: RecordAward['recordType'] }[] = [
  { key: 'heaviestWeightKg', recordType: 'heaviest_weight' },
  { key: 'best1RmKg', recordType: 'best_1rm' },
  { key: 'bestSetVolumeKg', recordType: 'best_set_volume' },
  { key: 'mostReps', recordType: 'most_reps' },
  { key: 'longestDurationSeconds', recordType: 'longest_duration' },
];

const SET_RECORD_ELIGIBLE_TYPES: readonly ExerciseType[] = ['weight_reps', 'bodyweight_reps'];

export interface ExerciseRecordsTabProps {
  snapshot: RecordsSnapshot;
  historicalSets: readonly ExerciseHistorySet[];
  exerciseType: ExerciseType;
  weightUnit: WeightUnit;
  testID?: string;
}

function workoutStartTimeById(sets: readonly ExerciseHistorySet[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const set of sets) {
    if (!map.has(set.workoutId)) {
      map.set(set.workoutId, set.workoutStartTime);
    }
  }
  return map;
}

function PrCard({
  holder,
  recordType,
  weightUnit,
  workoutStartTime,
  testID,
}: {
  holder: RecordHolder;
  recordType: RecordAward['recordType'];
  weightUnit: WeightUnit;
  workoutStartTime: number | undefined;
  testID: string;
}): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  const award = { recordType, setId: holder.setId, workoutId: holder.workoutId } as RecordAward;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={() => router.push(`/history/${holder.workoutId}` as never)}
      style={{ marginBottom: spacing['3'] }}
    >
      <Card>
        <Text style={[typography.footnote, { color: colors.text.tertiary }]}>
          {formatRecordTypeLabel(award)}
        </Text>
        <Text style={[typography.title1, { color: colors.text.primary, marginTop: spacing['0.5'] }]}>
          {formatRecordAwardValue(award, holder.value, weightUnit)}
        </Text>
        {workoutStartTime !== undefined ? (
          <Text style={[typography.footnote, { color: colors.text.secondary, marginTop: spacing['0.5'] }]}>
            {formatRelativeWorkoutDate(workoutStartTime)}
          </Text>
        ) : null}
      </Card>
    </Pressable>
  );
}

function SetRecordRow({
  bucket,
  holder,
  weightUnit,
  workoutStartTime,
  hideSeparator,
  testID,
}: {
  bucket: SetRecordBucket;
  holder: RecordHolder | null;
  weightUnit: WeightUnit;
  workoutStartTime: number | undefined;
  hideSeparator: boolean;
  testID: string;
}): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  const award = { recordType: 'set_record', bucket, setId: holder?.setId ?? '', workoutId: holder?.workoutId ?? '' } as RecordAward;

  const content = holder ? (
    <>
      <Text style={[typography.body, { color: colors.text.primary }]}>
        {formatRecordAwardValue(award, holder.value, weightUnit)}
      </Text>
      {workoutStartTime !== undefined ? (
        <Text style={[typography.footnote, { color: colors.text.tertiary }]}>
          {formatRelativeWorkoutDate(workoutStartTime)}
        </Text>
      ) : null}
    </>
  ) : (
    <Text style={[typography.body, { color: colors.text.tertiary }]}>—</Text>
  );

  const row = (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing['2'],
        borderBottomWidth: hideSeparator ? 0 : 1,
        borderBottomColor: colors.border.hairline,
      }}
    >
      <Text style={[typography.body, { color: colors.text.secondary }]}>{bucket}</Text>
      <View style={{ alignItems: 'flex-end' }}>{content}</View>
    </View>
  );

  if (!holder) {
    return (
      <View testID={testID} style={{ paddingHorizontal: spacing['4'] }}>
        {row}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={() => router.push(`/history/${holder.workoutId}` as never)}
      style={{ paddingHorizontal: spacing['4'] }}
    >
      {row}
    </Pressable>
  );
}

export function ExerciseRecordsTab({
  snapshot,
  historicalSets,
  exerciseType,
  weightUnit,
  testID = 'exercise-records-tab',
}: ExerciseRecordsTabProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();
  const startTimeById = workoutStartTimeById(historicalSets);

  const trophyCards = TROPHY_SLOTS.map(({ key, recordType }) => ({ key, recordType, holder: snapshot[key] })).filter(
    (slot): slot is { key: TrophySlotKey; recordType: RecordAward['recordType']; holder: RecordHolder } =>
      slot.holder !== null,
  );

  const showSetRecords = SET_RECORD_ELIGIBLE_TYPES.includes(exerciseType);
  const showLeastAssistance = exerciseType === 'bodyweight_assisted_reps';

  return (
    <View testID={testID} style={{ flex: 1, padding: spacing['4'] }}>
      {trophyCards.map(({ key, recordType, holder }) => (
        <PrCard
          key={key}
          testID={`${testID}-pr-${recordType}`}
          holder={holder}
          recordType={recordType}
          weightUnit={weightUnit}
          workoutStartTime={startTimeById.get(holder.workoutId)}
        />
      ))}

      {showLeastAssistance ? (
        <Card style={{ marginBottom: spacing['3'] }}>
          <Text style={[typography.footnote, { color: colors.text.tertiary }]}>LEAST ASSISTANCE</Text>
          <Text
            testID={`${testID}-least-assistance`}
            style={[typography.title1, { color: colors.text.primary, marginTop: spacing['0.5'] }]}
          >
            {snapshot.leastAssistanceKg
              ? `${formatVolumeDisplay(snapshot.leastAssistanceKg.value, weightUnit)} ${weightUnit}`
              : 'Not yet recorded'}
          </Text>
        </Card>
      ) : null}

      {showSetRecords ? (
        <Card style={{ padding: 0, paddingVertical: spacing['2'] }} testID={`${testID}-set-records-table`}>
          <Text
            style={[
              typography.footnote,
              { color: colors.text.tertiary, paddingHorizontal: spacing['4'], paddingBottom: spacing['1'] },
            ]}
          >
            SET RECORDS
          </Text>
          {SET_RECORD_BUCKET_VALUES.map((bucket, index) => {
            const holder = snapshot.setRecords[bucket];
            return (
              <SetRecordRow
                key={bucket}
                testID={`${testID}-set-record-${bucket}`}
                bucket={bucket}
                holder={holder}
                weightUnit={weightUnit}
                workoutStartTime={holder ? startTimeById.get(holder.workoutId) : undefined}
                hideSeparator={index === SET_RECORD_BUCKET_VALUES.length - 1}
              />
            );
          })}
        </Card>
      ) : null}
    </View>
  );
}
