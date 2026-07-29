/**
 * `Avatar`/`Thumb` tests (M0-07 acceptance gate): RNTL smoke render both
 * themes, plus the initial-letter fallback and image-source rendering.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { Avatar, Thumb } from '../Avatar';
import { ThemeProvider } from '../theme-provider';

describe('Avatar — smoke render (both themes)', () => {
  it('renders the initial-letter fallback in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Avatar name="Bench press" testID="avatar" />
      </ThemeProvider>,
    );
    expect(screen.getByText('B')).toBeTruthy();
    expect(screen.getByTestId('avatar').props.accessibilityLabel).toBe('Bench press');
  });

  it('renders the initial-letter fallback in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <Avatar name="Bench press" testID="avatar" />
      </ThemeProvider>,
    );
    expect(screen.getByText('B')).toBeTruthy();
  });

  it('renders an image when a source is given', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Avatar name="Bench press" source="https://example.com/bench.png" testID="avatar" />
      </ThemeProvider>,
    );
    expect(screen.queryByText('B')).toBeNull();
    expect(screen.getByTestId('avatar')).toBeTruthy();
  });
});

describe('Avatar — fallback initial derivation', () => {
  it('uppercases the first letter of the name', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Avatar name="squat" />
      </ThemeProvider>,
    );
    expect(screen.getByText('S')).toBeTruthy();
  });

  it('falls back to "?" for an empty/whitespace name', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Avatar name="   " />
      </ThemeProvider>,
    );
    expect(screen.getByText('?')).toBeTruthy();
  });
});

describe('Thumb — smoke render (both themes)', () => {
  it('renders the initial-letter fallback in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Thumb name="Deadlift" testID="thumb" />
      </ThemeProvider>,
    );
    expect(screen.getByText('D')).toBeTruthy();
  });

  it('renders the initial-letter fallback in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <Thumb name="Deadlift" testID="thumb" />
      </ThemeProvider>,
    );
    expect(screen.getByText('D')).toBeTruthy();
  });
});
