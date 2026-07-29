/**
 * `SetCell` tests (M2-06): smoke render both themes + the flex-vs-fixed-
 * width layout branch.
 */
import { render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { SetCell } from '../SetCell';
import { ThemeProvider } from '../theme-provider';

describe('SetCell — smoke render (both themes)', () => {
  it('renders its children in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetCell testID="cell">
          <Text>45</Text>
        </SetCell>
      </ThemeProvider>,
    );
    expect(screen.getByText('45')).toBeTruthy();
  });

  it('renders its children in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <SetCell testID="cell">
          <Text>45</Text>
        </SetCell>
      </ThemeProvider>,
    );
    expect(screen.getByText('45')).toBeTruthy();
  });
});

describe('SetCell — layout', () => {
  it('uses a fixed width (and no flex) when width is given', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetCell testID="cell" width={44}>
          <Text>SET</Text>
        </SetCell>
      </ThemeProvider>,
    );
    const flat = Object.assign({}, ...([] as object[]).concat(screen.getByTestId('cell').props.style));
    expect(flat.width).toBe(44);
    expect(flat.flex).toBeUndefined();
  });

  it('defaults to flex: 1 when no width is given', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetCell testID="cell">
          <Text>KG</Text>
        </SetCell>
      </ThemeProvider>,
    );
    const flat = Object.assign({}, ...([] as object[]).concat(screen.getByTestId('cell').props.style));
    expect(flat.flex).toBe(1);
  });
});
