/**
 * `SegmentedControl` tests (M0-07 acceptance gate): RNTL smoke render both
 * themes, plus selection-change behavior.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { SegmentedControl } from '../SegmentedControl';
import { ThemeProvider } from '../theme-provider';

const OPTIONS = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

describe('SegmentedControl — smoke render (both themes)', () => {
  it('renders all segment labels in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SegmentedControl options={OPTIONS} value="system" onChange={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByText('System')).toBeTruthy();
    expect(screen.getByText('Light')).toBeTruthy();
    expect(screen.getByText('Dark')).toBeTruthy();
  });

  it('renders all segment labels in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <SegmentedControl options={OPTIONS} value="system" onChange={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByText('System')).toBeTruthy();
    expect(screen.getByText('Light')).toBeTruthy();
    expect(screen.getByText('Dark')).toBeTruthy();
  });
});

describe('SegmentedControl — selection behavior', () => {
  it('calls onChange with the pressed segment value', async () => {
    const onChange = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SegmentedControl options={OPTIONS} value="system" onChange={onChange} />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByText('Dark'));

    expect(onChange).toHaveBeenCalledWith('dark');
  });

  it('marks the current value as the selected tab', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SegmentedControl options={OPTIONS} value="light" onChange={() => {}} />
      </ThemeProvider>,
    );

    expect(screen.getByRole('tab', { name: 'Light' }).props.accessibilityState.selected).toBe(true);
    expect(screen.getByRole('tab', { name: 'System' }).props.accessibilityState.selected).toBe(
      false,
    );
  });

  it('does not call onChange when disabled', async () => {
    const onChange = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SegmentedControl options={OPTIONS} value="system" onChange={onChange} disabled />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByText('Dark'));

    expect(onChange).not.toHaveBeenCalled();
  });
});
