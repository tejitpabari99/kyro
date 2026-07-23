/**
 * `ListRow` tests (M0-06 acceptance gate): RNTL smoke render in both
 * themes, plus press/chevron/separator behavior.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { ListRow } from '../ListRow';
import { ThemeProvider } from '../theme-provider';

describe('ListRow — smoke render (both themes)', () => {
  it('renders title, subtitle, leading and trailing slots in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ListRow
          title="Bench press"
          subtitle="Chest"
          leading={<Text>icon</Text>}
          trailing={<Text>3 sets</Text>}
          chevron
        />
      </ThemeProvider>,
    );

    expect(screen.getByText('Bench press')).toBeTruthy();
    expect(screen.getByText('Chest')).toBeTruthy();
    expect(screen.getByText('icon')).toBeTruthy();
    expect(screen.getByText('3 sets')).toBeTruthy();
  });

  it('renders title, subtitle, leading and trailing slots in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <ListRow
          title="Bench press"
          subtitle="Chest"
          leading={<Text>icon</Text>}
          trailing={<Text>3 sets</Text>}
          chevron
        />
      </ThemeProvider>,
    );

    expect(screen.getByText('Bench press')).toBeTruthy();
    expect(screen.getByText('Chest')).toBeTruthy();
  });
});

describe('ListRow — behavior', () => {
  it('fires onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <ListRow title="Bench press" onPress={onPress} />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress when disabled', async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <ListRow title="Bench press" onPress={onPress} disabled />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByRole('button'));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders as static (non-pressable) content when onPress is omitted', async () => {
    await render(
      <ThemeProvider preference="dark">
        <ListRow title="Bench press" />
      </ThemeProvider>,
    );

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Bench press')).toBeTruthy();
  });
});
