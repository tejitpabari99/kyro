/**
 * `Button` tests (M0-06 acceptance gate): RNTL smoke render in both themes
 * plus the press/disabled behavioral test called out explicitly in the
 * task's acceptance gate (08 §2: interactive components get behavioral
 * tests).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { Button, type ButtonVariant, type ButtonSize } from '../Button';
import { ThemeProvider } from '../theme-provider';
import { colors } from '../tokens';

const VARIANTS: ButtonVariant[] = ['primary', 'tonal', 'ghost', 'destructive'];
const SIZES: ButtonSize[] = ['lg', 'md', 'sm'];

describe('Button — smoke render (both themes)', () => {
  it.each(VARIANTS)('renders the %s variant in dark theme', async (variant) => {
    await render(
      <ThemeProvider preference="dark">
        <Button label="Start workout" variant={variant} onPress={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Start workout')).toBeTruthy();
  });

  it.each(VARIANTS)('renders the %s variant in light theme', async (variant) => {
    await render(
      <ThemeProvider preference="light">
        <Button label="Start workout" variant={variant} onPress={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Start workout')).toBeTruthy();
  });

  it.each(SIZES)('renders the %s size in both themes', async (size) => {
    await render(
      <ThemeProvider preference="dark">
        <Button label="Save" size={size} onPress={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Save')).toBeTruthy();

    await render(
      <ThemeProvider preference="light">
        <Button label="Save" size={size} onPress={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getAllByText('Save').length).toBeGreaterThan(0);
  });

  it('renders the destructive fill emphasis (danger-fill confirm style)', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Button label="Delete routine" variant="destructive" emphasis="fill" onPress={() => {}} />
      </ThemeProvider>,
    );
    const button = screen.getByRole('button');
    const flatStyle = Array.isArray(button.props.style)
      ? Object.assign({}, ...button.props.style)
      : button.props.style;
    expect(flatStyle.backgroundColor).toBe(colors.dark.semantic.danger);
  });
});

describe('Button — press/disabled behavior', () => {
  it('fires onPress when enabled', async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <Button label="Finish" onPress={onPress} />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByRole('button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress when disabled', async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <Button label="Finish" onPress={onPress} disabled />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByRole('button'));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not fire onPress while loading', async () => {
    const onPress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <Button label="Finish" onPress={onPress} loading />
      </ThemeProvider>,
    );

    fireEvent.press(screen.getByRole('button'));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('exposes accessibilityState.disabled and reflects disabled style (reduced opacity)', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Button label="Finish" onPress={() => {}} disabled />
      </ThemeProvider>,
    );

    const button = screen.getByRole('button');
    expect(button.props.accessibilityState.disabled).toBe(true);

    const flatStyle = Array.isArray(button.props.style)
      ? Object.assign({}, ...button.props.style)
      : button.props.style;
    expect(flatStyle.opacity).toBe(0.4);
  });

  it('does not apply the disabled style when enabled', async () => {
    await render(
      <ThemeProvider preference="dark">
        <Button label="Finish" onPress={() => {}} />
      </ThemeProvider>,
    );

    const button = screen.getByRole('button');
    expect(button.props.accessibilityState.disabled).toBe(false);

    const flatStyle = Array.isArray(button.props.style)
      ? Object.assign({}, ...button.props.style)
      : button.props.style;
    expect(flatStyle.opacity).toBe(1);
  });
});
