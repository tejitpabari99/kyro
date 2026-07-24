/**
 * `NoteEditSheet` tests (M2-09, 02 §3/§9): pre-fills from `initialValue`;
 * saving a non-empty draft calls `onSave` with the typed text; saving an
 * empty/whitespace-only draft calls `onSave(null)` (clears the note);
 * re-opening reseeds the draft from the (possibly new) `initialValue`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { NoteEditSheet } from '../NoteEditSheet';
import { ThemeProvider } from '@/ui/theme-provider';

describe('NoteEditSheet', () => {
  it('pre-fills the input from initialValue and saves the typed text', async () => {
    const onSave = jest.fn();
    const onDismiss = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <NoteEditSheet
          testID="sheet"
          visible
          onDismiss={onDismiss}
          initialValue="Old note"
          onSave={onSave}
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('sheet-input').props.value).toBe('Old note');

    await fireEvent.changeText(screen.getByTestId('sheet-input'), 'Updated note');
    await fireEvent.press(screen.getByTestId('sheet-save'));

    expect(onSave).toHaveBeenCalledWith('Updated note');
    expect(onDismiss).toHaveBeenCalled();
  });

  it('saving an empty draft clears the note (onSave(null))', async () => {
    const onSave = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <NoteEditSheet testID="sheet" visible onDismiss={() => {}} initialValue="Old note" onSave={onSave} />
      </ThemeProvider>,
    );
    await fireEvent.changeText(screen.getByTestId('sheet-input'), '   ');
    await fireEvent.press(screen.getByTestId('sheet-save'));
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it('reseeds the draft from a new initialValue each time the sheet re-opens', async () => {
    const { rerender } = await render(
      <ThemeProvider preference="dark">
        <NoteEditSheet testID="sheet" visible={false} onDismiss={() => {}} initialValue="First" onSave={() => {}} />
      </ThemeProvider>,
    );

    await rerender(
      <ThemeProvider preference="dark">
        <NoteEditSheet testID="sheet" visible onDismiss={() => {}} initialValue="First" onSave={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('sheet-input').props.value).toBe('First');

    await fireEvent.changeText(screen.getByTestId('sheet-input'), 'edited but not saved');

    // Close, then reopen with a *different* initialValue (e.g. a different
    // exercise's note) — the stale in-progress edit must not leak through.
    await rerender(
      <ThemeProvider preference="dark">
        <NoteEditSheet testID="sheet" visible={false} onDismiss={() => {}} initialValue="First" onSave={() => {}} />
      </ThemeProvider>,
    );
    await rerender(
      <ThemeProvider preference="dark">
        <NoteEditSheet testID="sheet" visible onDismiss={() => {}} initialValue="Second" onSave={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('sheet-input').props.value).toBe('Second');
  });

  it('uses its default testID when none is supplied', async () => {
    await render(
      <ThemeProvider preference="dark">
        <NoteEditSheet visible onDismiss={() => {}} initialValue="" onSave={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('note-edit-sheet')).toBeTruthy();
  });
});
