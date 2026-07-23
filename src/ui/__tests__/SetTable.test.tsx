/**
 * `SetTable` tests (M2-06): smoke render both themes, header renders SET/
 * PREVIOUS/✓ plus every given column label, and pre-built row children pass
 * through untouched.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { SetTable } from '../SetTable';
import { ThemeProvider } from '../theme-provider';

const COLUMNS = [
  { key: 'weight', label: 'KG' },
  { key: 'reps', label: 'REPS' },
];

describe('SetTable — smoke render (both themes)', () => {
  it('renders in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetTable columns={COLUMNS} testID="table">
          <Text>row 1</Text>
        </SetTable>
      </ThemeProvider>,
    );
    expect(screen.getByTestId('table')).toBeTruthy();
  });

  it('renders in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <SetTable columns={COLUMNS} testID="table">
          <Text>row 1</Text>
        </SetTable>
      </ThemeProvider>,
    );
    expect(screen.getByTestId('table')).toBeTruthy();
  });
});

describe('SetTable — header + rows', () => {
  it('renders SET, PREVIOUS, every column label, and ✓', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetTable columns={COLUMNS} testID="table">
          <Text>row content</Text>
        </SetTable>
      </ThemeProvider>,
    );
    expect(screen.getByText('SET')).toBeTruthy();
    expect(screen.getByText('PREVIOUS')).toBeTruthy();
    expect(screen.getByText('KG')).toBeTruthy();
    expect(screen.getByText('REPS')).toBeTruthy();
    expect(screen.getByText('✓')).toBeTruthy();
  });

  it('renders pre-built row children as-is', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetTable columns={COLUMNS} testID="table">
          <Text testID="custom-row">a set row</Text>
        </SetTable>
      </ThemeProvider>,
    );
    expect(screen.getByTestId('custom-row')).toBeTruthy();
  });

  it('renders no extra columns when given an empty column list (e.g. reps_only-with-nothing-else)', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetTable columns={[]} testID="table" />
      </ThemeProvider>,
    );
    expect(screen.getByText('SET')).toBeTruthy();
    expect(screen.getByText('PREVIOUS')).toBeTruthy();
    expect(screen.getByText('✓')).toBeTruthy();
  });
});
