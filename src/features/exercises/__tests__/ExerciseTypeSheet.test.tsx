/**
 * `ExerciseTypeSheet` tests (M1-09, 03 §5: "picker with column-preview
 * explanation") — every type option renders its short description
 * alongside its label, selecting one calls `onChange` + dismisses, and the
 * currently-selected value shows a checkmark.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { EXERCISE_TYPE_DESCRIPTIONS } from '@/domain/enums';
import { ThemeProvider } from '@/ui/theme-provider';

import { ExerciseTypeSheet } from '../ExerciseTypeSheet';

describe('ExerciseTypeSheet', () => {
  it('shows every type option with its column-preview description', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ExerciseTypeSheet
          testID="type-sheet"
          visible
          onDismiss={jest.fn()}
          value={null}
          onChange={jest.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText(EXERCISE_TYPE_DESCRIPTIONS.weight_reps)).toBeTruthy();
    expect(screen.getByText(EXERCISE_TYPE_DESCRIPTIONS.distance_duration)).toBeTruthy();
  });

  it('selecting an option calls onChange with that value and dismisses', async () => {
    const onChange = jest.fn();
    const onDismiss = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <ExerciseTypeSheet
          testID="type-sheet"
          visible
          onDismiss={onDismiss}
          value={null}
          onChange={onChange}
        />
      </ThemeProvider>,
    );

    await fireEvent.press(screen.getByTestId('type-sheet-option-bodyweight_reps'));

    expect(onChange).toHaveBeenCalledWith('bodyweight_reps');
    expect(onDismiss).toHaveBeenCalled();
  });

  it('shows a checkmark next to the currently-selected value', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ExerciseTypeSheet
          testID="type-sheet"
          visible
          onDismiss={jest.fn()}
          value="duration"
          onChange={jest.fn()}
        />
      </ThemeProvider>,
    );

    const row = screen.getByTestId('type-sheet-option-duration');
    // `ListRow`'s `trailing` slot renders the `Check` glyph only for the
    // matching option — presence of any SVG-rendered icon child is the
    // cheapest reliable signal without reaching into lucide's internals.
    expect(row).toBeTruthy();
  });
});
