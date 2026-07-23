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
 */
import React from 'react';
import { Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { SetCell } from './SetCell';
import { useTheme } from './theme-provider';
import type { SetRowColumn } from './set-table-types';

export type SetTableColumnHeader = Pick<SetRowColumn, 'key' | 'label'>;

export interface SetTableProps {
  /** Value-column headers, in order (SET/PREVIOUS/✓ are fixed chrome this component renders itself). */
  columns: SetTableColumnHeader[];
  /** One pre-built row element per set (typically `SetRow`/a connected wrapper around it), already `key`ed by the caller. */
  /** Omit for an exercise with zero sets — the header still renders on its own. */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const SET_HEADER_WIDTH = 44;
const CHECK_HEADER_WIDTH = 44;

export function SetTable({ columns, children, style, testID }: SetTableProps): React.JSX.Element {
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
        {columns.map((column) => (
          <SetCell key={column.key}>
            <Text style={headerTextStyle} numberOfLines={1}>
              {column.label}
            </Text>
          </SetCell>
        ))}
        <SetCell width={CHECK_HEADER_WIDTH}>
          <Text style={headerTextStyle}>✓</Text>
        </SetCell>
      </View>

      <View testID={testID ? `${testID}-rows` : undefined}>{children}</View>
    </View>
  );
}
