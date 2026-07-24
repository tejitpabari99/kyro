/**
 * `SetTable` (M2-06) — the set-table shell: a header row (SET · PREVIOUS ·
 * one label per value column · ✓) above a vertical stack of already-built
 * row elements. Deliberately **not** the thing that decides which columns a
 * given exercise type gets (that engine, `columnsForExerciseType`, lives in
 * `domain/set-table-columns.ts` — `src/ui/**` may depend only on its own
 * tokens, 06 §2 dependency rule) and **not** the thing that subscribes to
 * per-set store state (that's each row's own concern, `SetRow`'s file
 * header explains why) — this component only knows "here are N column
 * headers, here are some row elements, lay them out consistently." Callers
 * (`src/features/workout/ExerciseSetTableSection.tsx`) compute the column
 * list via the domain engine, build one connected row component per set,
 * and pass the results in as `columns`/`children`.
 *
 * Rendered as `children` rather than a `rows` data prop specifically so a
 * re-render of this component (e.g. its parent re-rendering because *some*
 * set in the exercise changed) never has to reconstruct row elements itself
 * — whatever `React.memo`-wrapped `SetRow`/connected-row elements the
 * caller already built keep their own identity/memoization untouched.
 *
 * **Target mode** (M3-04, 04 §2.1 — paired with `SetRow.tsx`'s own
 * `targetMode`, see that file's header for the full design): `targetMode`
 * omits the ✓ header (no checkmark column exists in target mode at all,
 * `SetRow`'s own check cell is unmounted too — the two must always agree).
 * The REPS header additionally becomes a `Pressable` when both `targetMode`
 * and `onColumnHeaderPress` are supplied — tapping it is this task's
 * resolution of 04 §2.1's "tapping the REPS column header ... toggles rep
 * range mode for that set": rather than a single ambiguous "that set" (the
 * spec text doesn't say *which* set a table-wide header tap could mean),
 * the header tap is a **bulk** toggle for every set in this exercise's
 * table at once, while `SetRow`'s own per-cell long-press (see its header)
 * is the single-row affordance — both routes exist, both are real per the
 * spec's "or," and this is the only reading that makes a *header* tap
 * (inherently table-wide, not row-scoped) coherent.
 */
import React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { SetCell } from './SetCell';
import { useTheme } from './theme-provider';
import type { SetRowColumn } from './set-table-types';

export type SetTableColumnHeader = Pick<SetRowColumn, 'key' | 'label' | 'kind'>;

export interface SetTableProps {
  /** Value-column headers, in order (SET/PREVIOUS/✓ are fixed chrome this component renders itself). */
  columns: SetTableColumnHeader[];
  /** One pre-built row element per set (typically `SetRow`/a connected wrapper around it), already `key`ed by the caller. */
  /** Omit for an exercise with zero sets — the header still renders on its own. */
  children?: React.ReactNode;
  /** M3-04 — see file header's "Target mode" section. Defaults `false`. */
  targetMode?: boolean;
  /** M3-04 — fires with the REPS column's key when its header is tapped in target mode (bulk rep-range toggle for the whole exercise). No-op wiring (no `Pressable`) when omitted or `!targetMode`. */
  onColumnHeaderPress?: (columnKey: string) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const SET_HEADER_WIDTH = 44;
const CHECK_HEADER_WIDTH = 44;

export function SetTable({
  columns,
  children,
  targetMode = false,
  onColumnHeaderPress,
  style,
  testID,
}: SetTableProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  const headerTextStyle = {
    ...typography.footnote,
    color: colors.text.tertiary,
    letterSpacing: 0.5,
    textTransform: 'uppercase' as const,
  };

  return (
    <View testID={testID} style={style}>
      <View
        testID={testID ? `${testID}-header` : undefined}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: spacing['1'],
          borderBottomWidth: 1,
          borderBottomColor: colors.border.hairline,
        }}
      >
        <SetCell width={SET_HEADER_WIDTH}>
          <Text style={headerTextStyle}>SET</Text>
        </SetCell>
        <SetCell flex={1.3}>
          <Text style={headerTextStyle}>PREVIOUS</Text>
        </SetCell>
        {columns.map((column) => {
          const headerText = (
            <Text style={headerTextStyle} numberOfLines={1}>
              {column.label}
            </Text>
          );
          const isPressableRepsHeader =
            targetMode && column.kind === 'reps' && onColumnHeaderPress != null;
          return (
            <SetCell key={column.key} testID={testID ? `${testID}-header-${column.key}` : undefined}>
              {isPressableRepsHeader ? (
                <Pressable
                  testID={testID ? `${testID}-header-${column.key}-press` : undefined}
                  accessibilityRole="button"
                  accessibilityLabel={`Toggle rep range for every set`}
                  onPress={() => onColumnHeaderPress(column.key)}
                  hitSlop={8}
                >
                  {headerText}
                </Pressable>
              ) : (
                headerText
              )}
            </SetCell>
          );
        })}
        {targetMode ? null : (
          <SetCell width={CHECK_HEADER_WIDTH}>
            <Text style={headerTextStyle}>✓</Text>
          </SetCell>
        )}
      </View>

      <View testID={testID ? `${testID}-rows` : undefined}>{children}</View>
    </View>
  );
}
