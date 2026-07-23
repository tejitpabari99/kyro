/**
 * `SearchBar` tests (M0-06 acceptance gate): RNTL smoke render in both
 * themes, plus text-input/clear behavior.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { SearchBar } from '../SearchBar';
import { ThemeProvider } from '../theme-provider';

describe('SearchBar — smoke render (both themes)', () => {
  it('renders the placeholder in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SearchBar value="" onChangeText={() => {}} placeholder="Search exercises" />
      </ThemeProvider>,
    );
    expect(screen.getByPlaceholderText('Search exercises')).toBeTruthy();
  });

  it('renders the placeholder in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <SearchBar value="" onChangeText={() => {}} placeholder="Search exercises" />
      </ThemeProvider>,
    );
    expect(screen.getByPlaceholderText('Search exercises')).toBeTruthy();
  });
});

describe('SearchBar — behavior', () => {
  it('calls onChangeText as the user types', async () => {
    const onChangeText = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SearchBar value="" onChangeText={onChangeText} />
      </ThemeProvider>,
    );

    fireEvent.changeText(screen.getByPlaceholderText('Search'), 'squat');

    expect(onChangeText).toHaveBeenCalledWith('squat');
  });

  it('hides the clear button when the value is empty', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SearchBar value="" onChangeText={() => {}} />
      </ThemeProvider>,
    );

    expect(screen.queryByLabelText('Clear search')).toBeNull();
  });

  it('shows the clear button when there is a value and clears it on press', async () => {
    const onChangeText = jest.fn();
    const onClear = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SearchBar value="squat" onChangeText={onChangeText} onClear={onClear} />
      </ThemeProvider>,
    );

    const clearButton = screen.getByLabelText('Clear search');
    fireEvent.press(clearButton);

    expect(onChangeText).toHaveBeenCalledWith('');
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
