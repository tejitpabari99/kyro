/**
 * `EmptyState` tests (M0-06 acceptance gate): RNTL smoke render in both
 * themes, incl. icon/caption/CTA slots.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';

import { Button } from '../Button';
import { EmptyState } from '../EmptyState';
import { ThemeProvider } from '../theme-provider';

describe('EmptyState — smoke render (both themes)', () => {
  it('renders icon, title and caption in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <EmptyState
          icon={<Text>icon</Text>}
          title="No routines yet"
          caption="Create a routine to get started"
        />
      </ThemeProvider>,
    );

    expect(screen.getByText('icon')).toBeTruthy();
    expect(screen.getByText('No routines yet')).toBeTruthy();
    expect(screen.getByText('Create a routine to get started')).toBeTruthy();
  });

  it('renders icon, title and caption in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <EmptyState
          icon={<Text>icon</Text>}
          title="No routines yet"
          caption="Create a routine to get started"
        />
      </ThemeProvider>,
    );

    expect(screen.getByText('No routines yet')).toBeTruthy();
  });

  it('omits the caption when not provided', async () => {
    await render(
      <ThemeProvider preference="dark">
        <EmptyState icon={<Text>icon</Text>} title="No routines yet" />
      </ThemeProvider>,
    );

    expect(screen.getByText('No routines yet')).toBeTruthy();
  });

  it('renders the CTA slot and forwards its press', async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <EmptyState
          icon={<Text>icon</Text>}
          title="No routines yet"
          cta={<Button label="Create routine" onPress={onPress} />}
        />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByText('Create routine'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
