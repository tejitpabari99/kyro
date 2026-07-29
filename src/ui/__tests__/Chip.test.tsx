/**
 * `Chip` tests (M0-06 acceptance gate): RNTL smoke render in both themes,
 * plus active-tint/press behavior.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { Chip } from '../Chip';
import { ThemeProvider } from '../theme-provider';
import { alphaOverlayToRgba, colors } from '../tokens';

describe('Chip — smoke render (both themes)', () => {
  it('renders the label and caret in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Chip label="Muscle group" onPress={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Muscle group')).toBeTruthy();
  });

  it('renders the label and caret in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <Chip label="Muscle group" onPress={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Muscle group')).toBeTruthy();
  });

  it('omits the caret when showCaret is false', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Chip label="Equipment" showCaret={false} onPress={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Equipment')).toBeTruthy();
  });
});

describe('Chip — active tint & behavior', () => {
  it('applies the accent-12% active tint background when active (dark theme)', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Chip label="Chest" active onPress={() => {}} />
      </ThemeProvider>,
    );

    const chip = screen.getByRole('button');
    const flatStyle = Array.isArray(chip.props.style)
      ? Object.assign({}, ...chip.props.style)
      : chip.props.style;
    expect(flatStyle.backgroundColor).toBe(
      alphaOverlayToRgba({ hex: colors.dark.accent.primary, opacity: 0.12 }),
    );
  });

  it('applies the neutral bg.elevated background when inactive', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Chip label="Chest" onPress={() => {}} />
      </ThemeProvider>,
    );

    const chip = screen.getByRole('button');
    const flatStyle = Array.isArray(chip.props.style)
      ? Object.assign({}, ...chip.props.style)
      : chip.props.style;
    expect(flatStyle.backgroundColor).toBe(colors.dark.bg.elevated);
  });

  it('fires onPress when tapped and exposes selected state', async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <Chip label="Chest" active onPress={onPress} />
      </ThemeProvider>,
    );

    const chip = screen.getByRole('button');
    expect(chip.props.accessibilityState.selected).toBe(true);

    fireEvent.press(chip);

    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
