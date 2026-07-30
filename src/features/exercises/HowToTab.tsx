import React from 'react';
import { ScrollView, Text, View } from 'react-native';

import { EQUIPMENT_LABELS, EXERCISE_TYPE_LABELS, MUSCLE_GROUP_LABELS } from '@/domain/enums';
import type { Exercise } from '@/data/exercises/types';
import { Chip } from '@/ui/Chip';
import { useTheme } from '@/ui/theme-provider';

export interface HowToTabProps {
  exercise: Exercise;
  testID: string;
}

export function HowToTab({ exercise, testID }: HowToTabProps): React.JSX.Element {
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
