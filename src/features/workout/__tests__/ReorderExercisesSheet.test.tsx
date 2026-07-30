/**
 * `ReorderExercisesSheet` — direct style coverage for subproject
 * `03-reorder-exercises-sheet-fixes` Task 1 (`size="lg"` on the Save Order
 * button). The 3 existing indirect specs (`EditWorkoutScreen.test.tsx`,
 * `RoutineEditorScreen.test.tsx`, `ActiveWorkoutScreen.test.tsx`) only ever
 * assert on `testID`s/press flows for this component, never on style, so
 * none of them actually exercise the full-width behavior `size="lg"`
 * produces. This file adds the one assertion that does: the Save Order
 * button's flattened style resolves `alignSelf: 'stretch'` (per
 * `Button.tsx`, `alignSelf: size === 'lg' || fullWidth ? 'stretch' :
 * 'flex-start'`).
 *
 * Deliberately not asserted here: anything about `ScreenFooter`'s
 * `insets.bottom`-driven `paddingBottom` — the `react-native-safe-area-
 * context` jest mock (`jest/safe-area-context-mock.tsx`) returns all-zero
 * insets unconditionally, so that logic can't be meaningfully exercised
 * from this test, and it's `ScreenFooter`'s own concern, not something this
 * subproject's Task 1 change touches.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { ReorderExercisesSheet } from '../ReorderExercisesSheet';
import { ThemeProvider } from '@/ui/theme-provider';

/** Same flatten-and-assert idiom used by `Button.test.tsx`/`Sheet.test.tsx`/
 * `ScreenFooter.test.tsx` for asserting on a RN style array without a
 * snapshot dependency. */
function flattenStyle(style: unknown): Record<string, unknown> {
  return Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : (style as Record<string, unknown>);
}

const EXERCISES = [
  { id: 'ex-1', name: 'Bench Press' },
  { id: 'ex-2', name: 'Squat' },
];

describe('ReorderExercisesSheet — Save Order button full-width', () => {
  it('renders the Save Order button with alignSelf: "stretch" (size="lg")', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ReorderExercisesSheet
          testID="reorder-exercises-sheet"
          visible
          onDismiss={() => {}}
          exercises={EXERCISES}
          onSave={() => {}}
        />
      </ThemeProvider>,
    );

    const saveButton = screen.getByTestId('reorder-exercises-sheet-save');
    const flatStyle = flattenStyle(saveButton.props.style);
    expect(flatStyle.alignSelf).toBe('stretch');
  });
});
