/**
 * `RoutineCard` (M3-02, 04 §1) — title, 2-line grey exercise-name preview,
 * ⋯ menu trigger, full-width **tonal** `Start Routine` button (07 §5/§6:
 * "Routine card: Start Routine as full-width tonal button ... tonal keeps
 * single-accent hierarchy under the page-level primary"). Built on `Card`
 * (`src/ui/Card.tsx`) — no one-off surface styling (07 §5's "no
 * feature-local one-off buttons/cards" rule).
 */
import React from 'react';
import { Ellipsis } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import type { RoutineSummary } from '@/data/routines/types';
import { Button } from '@/ui/Button';
import { Card } from '@/ui/Card';
import { useTheme } from '@/ui/theme-provider';

export interface RoutineCardProps {
  routine: RoutineSummary;
  /** The 2-line preview line's text — `''` renders no preview row at all (still-loading case, `buildExercisePreview`'s contract). */
  preview: string;
  onStart: () => void;
  onMenuPress: () => void;
  testID?: string;
}

export function RoutineCard({
  routine,
  preview,
  onStart,
  onMenuPress,
  testID = 'routine-card',
}: RoutineCardProps): React.JSX.Element {
  const { colors, spacing, typography } = useTheme();

  return (
    <Card testID={testID} style={{ marginBottom: spacing['3'] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text
          style={[typography.title2, { color: colors.text.primary, flex: 1 }]}
          numberOfLines={1}
        >
          {routine.title}
        </Text>
        <Pressable
          testID={`${testID}-menu`}
          accessibilityRole="button"
          accessibilityLabel={`More actions for ${routine.title}`}
          hitSlop={8}
          onPress={onMenuPress}
        >
          <Ellipsis size={22} strokeWidth={1.75} color={colors.text.primary} />
        </Pressable>
      </View>
      {preview.length > 0 ? (
        <Text
          testID={`${testID}-preview`}
          style={[typography.subhead, { color: colors.text.secondary, marginTop: spacing['1'] }]}
          numberOfLines={2}
        >
          {preview}
        </Text>
      ) : null}
      <Button
        testID={`${testID}-start`}
        label="Start Routine"
        variant="tonal"
        size="lg"
        onPress={onStart}
        style={{ marginTop: spacing['4'] }}
      />
    </Card>
  );
}
