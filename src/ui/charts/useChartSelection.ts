/**
 * Bridges a `victory-native` `ChartPressState` (UI-thread `SharedValue`s,
 * driven by its internal pan gesture on real touch — `CartesianChart`
 * installs that gesture itself whenever a `chartPressState` is passed to
 * it, see its own source) into plain React state on the JS thread, so a
 * chart can render normal `<Text>` tooltip content (formatting a value/date
 * string isn't worklet-safe) that stays in sync with the touch.
 *
 * Mirrors the same `useAnimatedReaction` + `runOnJS` bridging pattern
 * `victory-native`'s own `useChartPressState` uses internally for its
 * `isActive` boolean (`cartesian/hooks/useChartPressState.ts`'s
 * `useIsPressActive`) — this just extends it to also resolve
 * `matchedIndex` back to the caller's own data point.
 */
import { useState } from 'react';
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';
import type { ChartPressState } from 'victory-native';

interface Selection {
  isActive: boolean;
  index: number;
}

export interface ChartSelectionResult<T> {
  isActive: boolean;
  point: T | null;
}

/** Local stand-in for `victory-native`'s internal `ChartPressStateInit` —
 * that type isn't re-exported from its package root (only `ChartPressState`
 * is), and every call site in this directory only ever uses a numeric `x`
 * and a `Record<string, number>` `y`, so this narrower bound is enough. */
type PressStateInit = { x: number; y: Record<string, number> };

export function useChartSelection<Init extends PressStateInit, T>(
  state: ChartPressState<Init>,
  data: readonly T[],
): ChartSelectionResult<T> {
  const [selection, setSelection] = useState<Selection>({ isActive: false, index: -1 });

  useAnimatedReaction(
    () => ({ isActive: state.isActive.value, index: state.matchedIndex.value }),
    (current, previous) => {
      if (!previous || current.isActive !== previous.isActive || current.index !== previous.index) {
        runOnJS(setSelection)(current);
      }
    },
    [state],
  );

  const point =
    selection.isActive && selection.index >= 0 && selection.index < data.length
      ? (data[selection.index] as T)
      : null;

  return { isActive: selection.isActive && point !== null, point };
}
