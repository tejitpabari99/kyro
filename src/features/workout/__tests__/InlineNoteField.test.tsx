/**
 * `InlineNoteField` tests (06 §4.5/§7.2) — direct-render coverage for the
 * dual-mode display/edit note field that replaced the old `notes != null`
 * gated row + `NoteEditSheet` modal. Mirrors the render-harness convention
 * used by `NoteText.test.tsx` (this component's own display-mode delegate):
 * no SQLite/store setup, just `<ThemeProvider>` + plain props.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import * as Linking from 'expo-linking';

import { InlineNoteField } from '../InlineNoteField';
import { ThemeProvider } from '@/ui/theme-provider';

jest.mock('expo-linking', () => ({
  openURL: jest.fn(() => Promise.resolve(true)),
}));

describe('InlineNoteField', () => {
  it('renders a placeholder when value is null, with no text/input testIDs', async () => {
    const onSave = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <InlineNoteField testID="card" value={null} onSave={onSave} />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('card-placeholder')).toBeTruthy();
    expect(screen.getByText('Add a note for this exercise…')).toBeTruthy();
    expect(screen.queryByTestId('card-text')).toBeNull();
    expect(screen.queryByTestId('card-input')).toBeNull();
  });

  it('renders NoteText with a tappable link segment when value contains a URL', async () => {
    const onSave = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <InlineNoteField testID="card" value="Check out https://example.com" onSave={onSave} />
      </ThemeProvider>,
    );

    expect(screen.queryByTestId('card-placeholder')).toBeNull();
    expect(screen.getByTestId('card-text')).toBeTruthy();

    // splitTextWithUrls('Check out https://example.com') -> [text "Check out ", url "https://example.com"]
    // so the url segment is index 1, matching NoteText.test.tsx's own `<testID>-link-<n>` convention.
    const link = screen.getByTestId('card-text-link-1');
    expect(link.props.accessibilityRole).toBe('link');
    expect(screen.getByText('https://example.com')).toBeTruthy();

    await fireEvent.press(link);
    expect(Linking.openURL).toHaveBeenCalledWith('https://example.com');
  });

  it('pressing the row while value is non-null enters edit mode, pre-filled with the current value', async () => {
    const onSave = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <InlineNoteField testID="card" value="Existing note" onSave={onSave} />
      </ThemeProvider>,
    );

    await fireEvent.press(screen.getByTestId('card-row'));

    const input = screen.getByTestId('card-input');
    expect(input.props.value).toBe('Existing note');
  });

  it('pressing the row while value is null also enters edit mode, pre-filled empty', async () => {
    const onSave = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <InlineNoteField testID="card" value={null} onSave={onSave} />
      </ThemeProvider>,
    );

    await fireEvent.press(screen.getByTestId('card-placeholder'));

    const input = screen.getByTestId('card-input');
    expect(input.props.value).toBe('');
  });

  it('typing new text then blurring commits it via onSave and returns to display mode', async () => {
    const onSave = jest.fn();
    const { rerender } = await render(
      <ThemeProvider preference="dark">
        <InlineNoteField testID="card" value="Old note" onSave={onSave} />
      </ThemeProvider>,
    );

    await fireEvent.press(screen.getByTestId('card-row'));
    const input = screen.getByTestId('card-input');
    await fireEvent.changeText(input, 'New note');
    await fireEvent(input, 'blur');

    expect(onSave).toHaveBeenCalledWith('New note');
    expect(screen.queryByTestId('card-input')).toBeNull();

    // The component itself doesn't re-render with a new `value` unless the
    // parent updates it (it only holds local `editing`/`draft` state) — so
    // confirm display mode reflects the committed note via a controlled
    // rerender, mirroring how ExerciseCard.test.tsx/RoutineEditorScreen.test.tsx
    // assert against updated data rather than static on-screen text.
    await rerender(
      <ThemeProvider preference="dark">
        <InlineNoteField testID="card" value="New note" onSave={onSave} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('card-text')).toBeTruthy();
    expect(screen.getByText('New note')).toBeTruthy();
    expect(screen.queryByTestId('card-placeholder')).toBeNull();
  });

  it('typing only whitespace then blurring commits null, not the whitespace string', async () => {
    const onSave = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <InlineNoteField testID="card" value="Old note" onSave={onSave} />
      </ThemeProvider>,
    );

    await fireEvent.press(screen.getByTestId('card-row'));
    const input = screen.getByTestId('card-input');
    await fireEvent.changeText(input, '   ');
    await fireEvent(input, 'blur');

    expect(onSave).toHaveBeenCalledWith(null);
    expect(onSave).not.toHaveBeenCalledWith('   ');
    expect(screen.queryByTestId('card-input')).toBeNull();
  });

  it('falls back to the default inline-note-field testID prefix when none is supplied', async () => {
    const onSave = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <InlineNoteField value={null} onSave={onSave} />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('inline-note-field-placeholder')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('inline-note-field-row'));
    expect(screen.getByTestId('inline-note-field-input')).toBeTruthy();
  });
});
