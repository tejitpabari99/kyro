/**
 * `SetCell` (M2-06) — the generic layout primitive every `SetRow`/`SetTable`
 * header cell is built from: a flex column with consistent horizontal
 * padding/alignment, so every column (SET, PREVIOUS, the type-driven value
 * columns, RPE, ✓) lines up between the header row and every data row
 * without each call site re-deriving the same flex math. Purely
 * presentational — no domain knowledge, per `src/ui/**`'s "tokens only"
 * dependency boundary (06 §2).
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from './theme-provider';

export interface SetCellProps {
  children: React.ReactNode;
  /** Flex-grow weight relative to sibling cells in the same row. Defaults to `1` (equal-width columns). Fixed-width cells (SET, ✓) pass a small integer or an explicit `width` instead. */
  flex?: number;
  /** Fixed pixel width instead of flex-growing — used by the SET/✓ chrome cells, which should not stretch. */
  width?: number;
  align?: 'center' | 'flex-start' | 'flex-end';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SetCell({
  children,
  flex = 1,
  width,
  align = 'center',
  style,
  testID,
}: SetCellProps): React.JSX.Element {
  const { spacing } = useTheme();

  return (
    <View
      testID={testID}
      style={[
        {
          flex: width != null ? undefined : flex,
          width,
          alignItems: align,
          justifyContent: 'center',
          paddingHorizontal: spacing['1'],
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
