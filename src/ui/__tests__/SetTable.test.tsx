/**
 * `SetTable` tests (M2-06): smoke render both themes, header renders SET/
 * PREVIOUS/✓ plus every given column label, and pre-built row children pass
 * through untouched. M3-04 adds the target-mode header cases (✓ omitted,
 * REPS header becomes a bulk rep-range-toggle `Pressable`).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { SetTable } from '../SetTable';
import { ThemeProvider } from '../theme-provider';

const COLUMNS = [
  { key: 'weight', label: 'KG', kind: 'weight' as const },
  { key: 'reps', label: 'REPS', kind: 'reps' as const },
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

describe('SetTable — target mode (M3-04, 04 §2.1)', () => {
  it('omits the ✓ header entirely', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetTable columns={COLUMNS} testID="table" targetMode>
          <Text>row content</Text>
        </SetTable>
      </ThemeProvider>,
    );
    expect(screen.getByText('SET')).toBeTruthy();
    expect(screen.getByText('PREVIOUS')).toBeTruthy();
    expect(screen.queryByText('✓')).toBeNull();
  });

  it('makes the REPS header a Pressable that fires onColumnHeaderPress with its column key', async () => {
    const onColumnHeaderPress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SetTable columns={COLUMNS} testID="table" targetMode onColumnHeaderPress={onColumnHeaderPress}>
          <Text>row content</Text>
        </SetTable>
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('table-header-reps-press'));
    expect(onColumnHeaderPress).toHaveBeenCalledWith('reps');
  });

  it('does not make the KG header pressable', async () => {
    const onColumnHeaderPress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SetTable columns={COLUMNS} testID="table" targetMode onColumnHeaderPress={onColumnHeaderPress}>
          <Text>row content</Text>
        </SetTable>
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('table-header-weight-press')).toBeNull();
  });

  it('renders the REPS header as plain text (not pressable) when onColumnHeaderPress is omitted', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetTable columns={COLUMNS} testID="table" targetMode>
          <Text>row content</Text>
        </SetTable>
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('table-header-reps-press')).toBeNull();
    expect(screen.getByText('REPS')).toBeTruthy();
  });
});
