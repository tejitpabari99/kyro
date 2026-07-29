/**
 * `KeyboardAccessoryBar` tests (M2-08, 07 §5): smoke render both themes,
 * Calculator button's conditional visibility, Next/Calculator press wiring.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { KeyboardAccessoryBar } from '../KeyboardAccessoryBar';
import { ThemeProvider } from '../theme-provider';

describe('KeyboardAccessoryBar — smoke render (both themes)', () => {
  it('renders in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <KeyboardAccessoryBar
          nativeID="bar"
          showCalculator={false}
          onCalculatorPress={jest.fn()}
          onNextPress={jest.fn()}
          testID="bar"
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('bar')).toBeTruthy();
  });

  it('renders in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <KeyboardAccessoryBar
          nativeID="bar"
          showCalculator={false}
          onCalculatorPress={jest.fn()}
          onNextPress={jest.fn()}
          testID="bar"
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('bar')).toBeTruthy();
  });
});

describe('KeyboardAccessoryBar — Calculator button (02 §4: weight field focused + plate calculator enabled)', () => {
  it('is hidden when showCalculator is false', async () => {
    await render(
      <ThemeProvider preference="dark">
        <KeyboardAccessoryBar
          nativeID="bar"
          showCalculator={false}
          onCalculatorPress={jest.fn()}
          onNextPress={jest.fn()}
          testID="bar"
        />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('bar-calculator')).toBeNull();
  });

  it('is shown and fires onCalculatorPress when showCalculator is true', async () => {
    const onCalculatorPress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <KeyboardAccessoryBar
          nativeID="bar"
          showCalculator
          onCalculatorPress={onCalculatorPress}
          onNextPress={jest.fn()}
          testID="bar"
        />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('bar-calculator'));
    expect(onCalculatorPress).toHaveBeenCalledTimes(1);
  });
});

describe('KeyboardAccessoryBar — Next button', () => {
  it('is always present and fires onNextPress', async () => {
    const onNextPress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <KeyboardAccessoryBar
          nativeID="bar"
          showCalculator={false}
          onCalculatorPress={jest.fn()}
          onNextPress={onNextPress}
          testID="bar"
        />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('bar-next'));
    expect(onNextPress).toHaveBeenCalledTimes(1);
  });
});
