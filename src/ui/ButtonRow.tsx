/**
 * `ButtonRow` — PRD A (`sheet-header-foundation`) §4.4(b): the actual fix for
 * the "footer buttons of different sizes not sitting side-by-side" problem.
 *
 * Root cause (§4.4): in a `flexDirection:'row'` parent, `Button`'s
 * `alignSelf` only ever affects the *cross* (vertical) axis — it was never
 * going to make two `md`/`sm` buttons equal-width side by side, because
 * nothing in `Button.tsx` sets anything on the row's *main* (horizontal)
 * axis. `ButtonRow` solves that by injecting `flex:1` into each child's own
 * `style` prop, which wins over `Button`'s computed `alignSelf` because
 * `Button`'s internal style array already spreads the caller-supplied
 * `style` last (`[styles.base, {...computed}, style]`).
 *
 * Arity-agnostic by construction (§9 decision 9) — `React.Children.map`
 * gives every child `flex:1` regardless of count, so a 3-way row divides
 * evenly with no special-casing. Usage guideline (not enforced by the
 * component): give every `Button` inside one `ButtonRow` the same `size` so
 * their heights match.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from './theme-provider';

export interface ButtonRowProps {
  /** One or more `<Button>` elements, rendered left-to-right with equal width. */
  children: React.ReactNode;
  /** Gap between buttons. Defaults to `spacing['3']` (12pt). */
  gap?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ButtonRow({ children, gap, style, testID }: ButtonRowProps): React.JSX.Element {
  const { spacing } = useTheme();

  return (
    <View testID={testID} style={[{ flexDirection: 'row', gap: gap ?? spacing['3'] }, style]}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<{ style?: StyleProp<ViewStyle> }>, {
              style: [(child.props as { style?: StyleProp<ViewStyle> }).style, { flex: 1 }],
            })
          : child,
      )}
    </View>
  );
}
