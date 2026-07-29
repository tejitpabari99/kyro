/**
 * `ScreenFooter` — PRD A (`sheet-header-foundation`) §4.3: a shared,
 * bottom-safe footer wrapper for a `Sheet`/screen's terminal action
 * control(s) (e.g. a lone "Save" `Button`, or a `ButtonRow`).
 *
 * Placement contract (§4.3, "not sticky, brings up short content" — the
 * part most retrofits will get wrong if not called out explicitly):
 * `ScreenFooter` MUST be rendered as the **last child inside the same
 * scrollable container as the rest of the content** — i.e. the last item
 * passed to a `ScrollView`'s children / laid out in its
 * `contentContainerStyle` flow — or, for fixed-content sheets with no
 * `ScrollView` at all, as the last child of a plain (non-`flex:1`) column
 * `View`. It must NEVER be a sibling positioned after a separate
 * `flex:1`-sized `ScrollView`.
 *
 * Why this matters — the "sticky-by-accident" failure mode:
 *   Wrong (today's pattern in several call sites, e.g. `ReorderExercisesSheet`):
 *     <ScrollView style={{ flex: 1 }}>…</ScrollView>
 *     <Button />
 *   The `ScrollView` claims all remaining flex space regardless of how
 *   little content it holds, so the footer always renders pinned to the
 *   physical bottom edge with a dead gap above it when content is short —
 *   exactly the "sticky-by-accident" behavior the user explicitly said they
 *   don't want.
 *
 *   Right: put `ScreenFooter` as the final element *inside* the scrollable
 *   content (no `flex:1` on the `ScrollView`/its wrapper). Short content ->
 *   the whole column (content + footer) is shorter than the viewport and
 *   renders in its natural position right below the last row — "brought
 *   up," as asked. Long/overflowing content -> `ScreenFooter` scrolls with
 *   everything else and lands immediately after the last item once
 *   scrolled to the end — it never floats over content and never needs
 *   `position: 'absolute'`.
 *
 * Double-counting of `insets.bottom` on top of `Sheet.tsx`'s own baseline
 * `paddingBottom: insets.bottom` (§4.1.3) is deliberate, not a bug: worst
 * case it wastes a few extra points of whitespace under a footer button;
 * `ScreenFooter` used standalone inside a plain route (no `Sheet` ancestor,
 * no baseline to rely on) still needs to own its full `insets.bottom + gap`
 * regardless, so it can't be simplified to "gap only" without breaking the
 * non-`Sheet` case.
 */
import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from './theme-provider';

export interface ScreenFooterProps {
  children: React.ReactNode;
  /** Extra gap beyond the raw safe-area bottom inset. Defaults to spacing['4'] (16pt). */
  gap?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ScreenFooter({ children, gap, style, testID }: ScreenFooterProps): React.JSX.Element {
  const { layout, spacing } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      testID={testID}
      style={[
        {
          paddingHorizontal: layout.screenGutter,
          paddingTop: spacing['3'],
          paddingBottom: insets.bottom + (gap ?? spacing['4']),
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
