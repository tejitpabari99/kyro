/**
 * `NoteText` tests (M2-09, 02 §3/§9): plain notes render as-is; URLs render
 * as tappable, accent-colored, `accessibilityRole="link"` segments; tapping
 * one opens it via `expo-linking`'s `openURL`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import * as Linking from 'expo-linking';

import { NoteText } from '../NoteText';
import { ThemeProvider } from '@/ui/theme-provider';

jest.mock('expo-linking', () => ({
  openURL: jest.fn(() => Promise.resolve(true)),
}));

describe('NoteText', () => {
  it('renders a plain note with no links', async () => {
    await render(
      <ThemeProvider preference="dark">
        <NoteText testID="note" text="Keep elbows tucked" />
      </ThemeProvider>,
    );
    expect(screen.getByText('Keep elbows tucked')).toBeTruthy();
    expect(screen.queryByTestId('note-link-0')).toBeNull();
  });

  it('renders a URL as a tappable link and opens it on press', async () => {
    await render(
      <ThemeProvider preference="dark">
        <NoteText testID="note" text="Form cue: https://example.com/video" />
      </ThemeProvider>,
    );
    const link = screen.getByTestId('note-link-1');
    expect(link.props.accessibilityRole).toBe('link');
    expect(screen.getByText('https://example.com/video')).toBeTruthy();

    await fireEvent.press(link);
    expect(Linking.openURL).toHaveBeenCalledWith('https://example.com/video');
  });

  it('swallows a rejected openURL rather than throwing', async () => {
    // Built lazily inside the mock implementation (not a pre-built
    // `Promise.reject(...)` handed to `mockReturnValueOnce`) so the
    // rejection is only created once `NoteText`'s own `.catch` is already
    // in the chain (same tick, via `fireEvent.press` below) — otherwise
    // Node flags it as an unhandled rejection before that `.catch` attaches.
    (Linking.openURL as jest.Mock).mockImplementationOnce(() => Promise.reject(new Error('no handler')));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    await render(
      <ThemeProvider preference="dark">
        <NoteText testID="note" text="https://example.com" />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('note-link-0'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('renders link segments without a testID when none is supplied', async () => {
    await render(
      <ThemeProvider preference="dark">
        <NoteText text="See https://example.com" />
      </ThemeProvider>,
    );
    expect(screen.getByText('https://example.com')).toBeTruthy();
  });
});
