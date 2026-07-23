/**
 * `StatColumn`/`StatTile` tests (M0-07 acceptance gate): RNTL smoke render
 * both themes for both components.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';

import { StatColumn, StatTile } from '../StatColumn';
import { ThemeProvider } from '../theme-provider';

describe('StatColumn — smoke render (both themes)', () => {
  it('renders label and value in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <StatColumn label="Duration" value="42:15" size="large" />
      </ThemeProvider>,
    );
    expect(screen.getByText('Duration')).toBeTruthy();
    expect(screen.getByText('42:15')).toBeTruthy();
  });

  it('renders label and value in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <StatColumn label="Duration" value="42:15" size="large" />
      </ThemeProvider>,
    );
    expect(screen.getByText('Duration')).toBeTruthy();
    expect(screen.getByText('42:15')).toBeTruthy();
  });

  it('renders the small size in both themes', async () => {
    await render(
      <ThemeProvider preference="dark">
        <StatColumn label="Sets" value="12" size="small" />
      </ThemeProvider>,
    );
    expect(screen.getByText('Sets')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
  });
});

describe('StatTile — smoke render (both themes)', () => {
  it('renders label and value in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <StatTile label="Volume" value="12,340 lb" testID="volume-tile" />
      </ThemeProvider>,
    );
    expect(screen.getByText('Volume')).toBeTruthy();
    expect(screen.getByText('12,340 lb')).toBeTruthy();
    expect(screen.getByTestId('volume-tile')).toBeTruthy();
  });

  it('renders label and value in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <StatTile label="Volume" value="12,340 lb" />
      </ThemeProvider>,
    );
    expect(screen.getByText('Volume')).toBeTruthy();
    expect(screen.getByText('12,340 lb')).toBeTruthy();
  });
});
