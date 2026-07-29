/**
 * `AddToSupersetSheet` tests (M2-09, 02 §8 stub): empty-candidates message;
 * checkbox toggle + counter label; Confirm disabled with none selected;
 * confirming calls `onConfirm` with the selected ids and dismisses.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { AddToSupersetSheet, type SupersetCandidate } from '../AddToSupersetSheet';
import { ThemeProvider } from '@/ui/theme-provider';

const CANDIDATES: SupersetCandidate[] = [
  { id: 'we-1', name: 'Pull-Up', position: 1 },
  { id: 'we-2', name: 'Push-Up', position: 2 },
];

describe('AddToSupersetSheet', () => {
  it('shows an empty message when there are no other exercises to group with', async () => {
    await render(
      <ThemeProvider preference="dark">
        <AddToSupersetSheet testID="sheet" visible onDismiss={() => {}} candidates={[]} onConfirm={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByText('No other exercises in this workout yet.')).toBeTruthy();
    expect(screen.getByTestId('sheet-confirm').props.accessibilityState.disabled).toBe(true);
  });

  it('Confirm is disabled until at least one candidate is checked', async () => {
    await render(
      <ThemeProvider preference="dark">
        <AddToSupersetSheet
          testID="sheet"
          visible
          onDismiss={() => {}}
          candidates={CANDIDATES}
          onConfirm={() => {}}
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('sheet-confirm').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText('Group Exercises')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('sheet-option-we-1'));
    expect(screen.getByTestId('sheet-confirm').props.accessibilityState.disabled).toBe(false);
    // Selected count + the current card itself.
    expect(screen.getByText('Group 2 Exercises')).toBeTruthy();
  });

  it('toggling a candidate twice deselects it again', async () => {
    await render(
      <ThemeProvider preference="dark">
        <AddToSupersetSheet
          testID="sheet"
          visible
          onDismiss={() => {}}
          candidates={CANDIDATES}
          onConfirm={() => {}}
        />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('sheet-option-we-1'));
    await fireEvent.press(screen.getByTestId('sheet-option-we-1'));
    expect(screen.getByTestId('sheet-confirm').props.accessibilityState.disabled).toBe(true);
  });

  it('Confirm calls onConfirm with every selected id and dismisses', async () => {
    const onConfirm = jest.fn();
    const onDismiss = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <AddToSupersetSheet
          testID="sheet"
          visible
          onDismiss={onDismiss}
          candidates={CANDIDATES}
          onConfirm={onConfirm}
        />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('sheet-option-we-1'));
    await fireEvent.press(screen.getByTestId('sheet-option-we-2'));
    await fireEvent.press(screen.getByTestId('sheet-confirm'));

    expect(onConfirm).toHaveBeenCalledWith(['we-1', 'we-2']);
    expect(onDismiss).toHaveBeenCalled();
  });

  it('resets the selection each time the sheet re-opens', async () => {
    const { rerender } = await render(
      <ThemeProvider preference="dark">
        <AddToSupersetSheet
          testID="sheet"
          visible
          onDismiss={() => {}}
          candidates={CANDIDATES}
          onConfirm={() => {}}
        />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('sheet-option-we-1'));
    expect(screen.getByTestId('sheet-confirm').props.accessibilityState.disabled).toBe(false);

    await rerender(
      <ThemeProvider preference="dark">
        <AddToSupersetSheet
          testID="sheet"
          visible={false}
          onDismiss={() => {}}
          candidates={CANDIDATES}
          onConfirm={() => {}}
        />
      </ThemeProvider>,
    );
    await rerender(
      <ThemeProvider preference="dark">
        <AddToSupersetSheet
          testID="sheet"
          visible
          onDismiss={() => {}}
          candidates={CANDIDATES}
          onConfirm={() => {}}
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('sheet-confirm').props.accessibilityState.disabled).toBe(true);
  });

  it('uses its default testID when none is supplied', async () => {
    await render(
      <ThemeProvider preference="dark">
        <AddToSupersetSheet visible onDismiss={() => {}} candidates={[]} onConfirm={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('add-to-superset-sheet')).toBeTruthy();
  });
});
