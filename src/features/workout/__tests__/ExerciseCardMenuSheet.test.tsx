/**
 * `ExerciseCardMenuSheet` tests (M2-09, 02 §3): renders Add to Superset
 * when ungrouped and Remove from Superset when grouped, and every item
 * dismisses the sheet before firing its own callback.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ExerciseCardMenuSheet } from '../ExerciseCardMenuSheet';
import { ThemeProvider } from '@/ui/theme-provider';

function baseProps(overrides: Partial<React.ComponentProps<typeof ExerciseCardMenuSheet>> = {}) {
  return {
    testID: 'menu',
    visible: true,
    onDismiss: jest.fn(),
    isGrouped: false,
    onReorder: jest.fn(),
    onReplace: jest.fn(),
    onAddToSuperset: jest.fn(),
    onRemoveFromSuperset: jest.fn(),
    onAddWarmUpSets: jest.fn(),
    onRestTimer: jest.fn(),
    onRemoveExercise: jest.fn(),
    ...overrides,
  };
}

describe('ExerciseCardMenuSheet', () => {
  it('shows "Add to Superset" when ungrouped', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ExerciseCardMenuSheet {...baseProps({ isGrouped: false })} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('menu-add-to-superset')).toBeTruthy();
    expect(screen.queryByTestId('menu-remove-from-superset')).toBeNull();
  });

  it('shows "Remove from Superset" when grouped', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ExerciseCardMenuSheet {...baseProps({ isGrouped: true })} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('menu-remove-from-superset')).toBeTruthy();
    expect(screen.queryByTestId('menu-add-to-superset')).toBeNull();
  });

  it('every item dismisses then fires its own callback', async () => {
    const props = baseProps({ isGrouped: true });
    await render(
      <ThemeProvider preference="dark">
        <ExerciseCardMenuSheet {...props} />
      </ThemeProvider>,
    );

    await fireEvent.press(screen.getByTestId('menu-reorder'));
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
    expect(props.onReorder).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId('menu-replace'));
    expect(props.onReplace).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId('menu-remove-from-superset'));
    expect(props.onRemoveFromSuperset).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId('menu-warmup-sets'));
    expect(props.onAddWarmUpSets).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId('menu-rest-timer'));
    expect(props.onRestTimer).toHaveBeenCalledTimes(1);

    await fireEvent.press(screen.getByTestId('menu-remove-exercise'));
    expect(props.onRemoveExercise).toHaveBeenCalledTimes(1);

    expect(props.onDismiss).toHaveBeenCalledTimes(6);
  });

  it('Add to Superset item dismisses then fires its own callback', async () => {
    const props = baseProps({ isGrouped: false });
    await render(
      <ThemeProvider preference="dark">
        <ExerciseCardMenuSheet {...props} />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('menu-add-to-superset'));
    expect(props.onDismiss).toHaveBeenCalledTimes(1);
    expect(props.onAddToSuperset).toHaveBeenCalledTimes(1);
  });

  it('uses its default testID when none is supplied', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ExerciseCardMenuSheet {...baseProps({ testID: undefined })} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('exercise-card-menu-sheet')).toBeTruthy();
  });
});
