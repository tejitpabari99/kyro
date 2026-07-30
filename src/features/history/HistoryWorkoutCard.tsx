/**
 * `HistoryWorkoutCard` (M4-03, 04 §3.1) — one card in the real History tab
 * list: title, relative date, a Duration · Volume · 🏆 N PRs stats strip
 * (the trophy segment omitted entirely at `prCount === 0`, not shown as
 * "🏆 0 PRs" — 04 §3.1's own parenthetical), and one summary line per
 * exercise ("3 × Bench Press (Barbell) — best 80kg × 8"). Composes `ListRow`
 * directly (07-history-routines-list-decarding PRD §4.2) — the old
 * variable-line-count reasoning for avoiding `ListRow` no longer applies
 * once per-exercise lines stop being rendered (§9.2).
 *
 * The 🏆 emoji is used literally here per 07 §6: "the 🏆 emoji only in
 * history-card copy" (every *other* trophy surface — workout-detail set
 * badges, the live banner — uses the `lucide-react-native` `Trophy` glyph
 * in `accent.text` instead; this is the one place the doc calls out the
 * emoji by name).
 *
 * **M4-11 perf tuning**: wrapped in `React.memo` — the History tab's
 * `FlashList` (`HistoryListScreen.tsx`) can carry 1000+ rows (06 §8's
 * "history 60 fps at 1000+ workouts" budget), and without memoization every
 * cell re-runs its own render whenever the parent screen re-renders for a
 * reason that has nothing to do with this particular row (a page fetch
 * completing, a focus-triggered refetch, an unrelated state update) —
 * `item`/`onPress` are otherwise-stable references per row (`onPress` is
 * `useCallback`-stabilized at the call site, `HistoryListScreen.tsx`;
 * `item` only changes identity when its own page's query data actually
 * changes), so the default shallow-prop comparison `React.memo` performs
 * is exactly the right cheap skip check here — no custom comparator needed.
 */
import React from 'react';
import { Text } from 'react-native';

import { ListRow } from '@/ui/ListRow';
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

function HistoryWorkoutCardComponent({
  item,
  onPress,
  testID = `history-card-${item.workoutId}`,
}: HistoryWorkoutCardProps): React.JSX.Element {
  const { colors, typography } = useTheme();

  const statsStrip =
    item.prCount > 0
      ? `${item.durationLabel} · ${item.volumeLabel} · 🏆 ${item.prCount} PR${item.prCount === 1 ? '' : 's'}`
      : `${item.durationLabel} · ${item.volumeLabel}`;

  return (
    <ListRow
      testID={testID}
      title={item.title}
      subtitle={statsStrip}
      trailing={
        <Text style={[typography.footnote, { color: colors.text.tertiary }]} numberOfLines={1}>
          {item.relativeDate}
        </Text>
      }
      chevron
      onPress={() => onPress(item.workoutId)}
    />
  );
}

/** Memoized export — see file header, "M4-11 perf tuning." */
export const HistoryWorkoutCard = React.memo(HistoryWorkoutCardComponent);
