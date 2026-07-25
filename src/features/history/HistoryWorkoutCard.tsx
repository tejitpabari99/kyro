/**
 * `HistoryWorkoutCard` (M4-03, 04 §3.1) — one card in the real History tab
 * list: title, relative date, a Duration · Volume · 🏆 N PRs stats strip
 * (the trophy segment omitted entirely at `prCount === 0`, not shown as
 * "🏆 0 PRs" — 04 §3.1's own parenthetical), and one summary line per
 * exercise ("3 × Bench Press (Barbell) — best 80kg × 8"). Built from `Card`
 * (07 §5's generic surface primitive — "routine cards, exercise cards,
 * chart cards") wrapped in a `Pressable`, rather than `ListRow` (that
 * primitive's title/subtitle shape is a fixed two lines; this card is a
 * variable number of lines depending on how many exercises the workout
 * has) — `HistoryListScreen.tsx`'s own header explains the same choice.
 *
 * The 🏆 emoji is used literally here per 07 §6: "the 🏆 emoji only in
 * history-card copy" (every *other* trophy surface — workout-detail set
 * badges, the live banner — uses the `lucide-react-native` `Trophy` glyph
 * in `accent.text` instead; this is the one place the doc calls out the
 * emoji by name).
 */
import React from 'react';
import { Pressable, Text, View } from 'react-native';

import { Card } from '@/ui/Card';
import { useTheme } from '@/ui/theme-provider';

export interface HistoryCardData {
  workoutId: string;
  title: string;
  relativeDate: string;
  durationLabel: string;
  volumeLabel: string;
  prCount: number;
  exerciseLines: string[];
}

export interface HistoryWorkoutCardProps {
  item: HistoryCardData;
  onPress: (workoutId: string) => void;
  testID?: string;
}

export function HistoryWorkoutCard({
  item,
  onPress,
  testID = `history-card-${item.workoutId}`,
}: HistoryWorkoutCardProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  const statsStrip =
    item.prCount > 0
      ? `${item.durationLabel} · ${item.volumeLabel} · 🏆 ${item.prCount} PR${item.prCount === 1 ? '' : 's'}`
      : `${item.durationLabel} · ${item.volumeLabel}`;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={item.title}
      onPress={() => onPress(item.workoutId)}
      style={{ marginHorizontal: spacing['4'], marginBottom: spacing['3'] }}
    >
      <Card>
        <Text style={[typography.title2, { color: colors.text.primary }]} numberOfLines={1}>
          {item.title}
        </Text>
        <Text
          style={[typography.footnote, { color: colors.text.secondary, marginTop: spacing['0.5'] }]}
        >
          {item.relativeDate}
        </Text>
        <Text
          style={[typography.subhead, { color: colors.text.secondary, marginTop: spacing['2'] }]}
        >
          {statsStrip}
        </Text>
        {item.exerciseLines.length > 0 ? (
          <View style={{ marginTop: spacing['2'], gap: spacing['0.5'] }}>
            {item.exerciseLines.map((line, index) => (
              <Text
                key={index}
                style={[typography.footnote, { color: colors.text.secondary }]}
                numberOfLines={1}
              >
                {line}
              </Text>
            ))}
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}
