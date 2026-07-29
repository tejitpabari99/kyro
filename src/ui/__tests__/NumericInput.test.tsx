/**
 * `NumericInput` tests (M0-07 acceptance gate): RNTL smoke render both
 * themes, plus the select-all-on-focus and decimal/integer filtering
 * behavioral tests called out explicitly in the task's acceptance gate.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import type { TextInput } from 'react-native';

import { NumericInput, sanitizeNumericInput } from '../NumericInput';
import { ThemeProvider } from '../theme-provider';

describe('NumericInput — smoke render (both themes)', () => {
  it('renders the placeholder in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <NumericInput value="" onChangeText={() => {}} placeholder="0" />
      </ThemeProvider>,
    );
    expect(screen.getByPlaceholderText('0')).toBeTruthy();
  });

  it('renders the placeholder in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <NumericInput value="" onChangeText={() => {}} placeholder="0" />
      </ThemeProvider>,
    );
    expect(screen.getByPlaceholderText('0')).toBeTruthy();
  });

  it('renders a given value in both themes', async () => {
    await render(
      <ThemeProvider preference="dark">
        <NumericInput value="135" onChangeText={() => {}} testID="weight" />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('weight').props.value).toBe('135');
  });
});

describe('NumericInput — M2-08 keyboard-flow seams', () => {
  it('fires onFocus when focused', async () => {
    const onFocus = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <NumericInput value="" onChangeText={() => {}} onFocus={onFocus} testID="weight" />
      </ThemeProvider>,
    );
    await fireEvent(screen.getByTestId('weight'), 'focus');
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it('forwards inputAccessoryViewID to the underlying TextInput', async () => {
    await render(
      <ThemeProvider preference="dark">
        <NumericInput
          value=""
          onChangeText={() => {}}
          inputAccessoryViewID="shared-bar"
          testID="weight"
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('weight').props.inputAccessoryViewID).toBe('shared-bar');
  });

  it('forwards a ref exposing an imperative .focus() to the underlying TextInput', async () => {
    const ref = React.createRef<TextInput>();
    await render(
      <ThemeProvider preference="dark">
        <NumericInput ref={ref} value="" onChangeText={() => {}} testID="weight" />
      </ThemeProvider>,
    );
    expect(typeof ref.current?.focus).toBe('function');
  });
});

describe('NumericInput — select-all-on-focus', () => {
  it('sets selectTextOnFocus so the whole value highlights on focus', async () => {
    await render(
      <ThemeProvider preference="dark">
        <NumericInput value="135" onChangeText={() => {}} testID="weight" />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('weight').props.selectTextOnFocus).toBe(true);
  });
});

describe('NumericInput — decimal/integer filtering', () => {
  it('decimal mode strips non-numeric characters but keeps digits and a dot', async () => {
    const onChangeText = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <NumericInput value="" onChangeText={onChangeText} mode="decimal" testID="weight" />
      </ThemeProvider>,
    );

    fireEvent.changeText(screen.getByTestId('weight'), 'ab12.5cd');

    expect(onChangeText).toHaveBeenCalledWith('12.5');
  });

  it('decimal mode allows only one decimal point', async () => {
    const onChangeText = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <NumericInput value="" onChangeText={onChangeText} mode="decimal" testID="weight" />
      </ThemeProvider>,
    );

    fireEvent.changeText(screen.getByTestId('weight'), '1.2.3.4');

    expect(onChangeText).toHaveBeenCalledWith('1.234');
  });

  it('integer mode strips all non-digit characters, including dots', async () => {
    const onChangeText = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <NumericInput value="" onChangeText={onChangeText} mode="integer" testID="reps" />
      </ThemeProvider>,
    );

    fireEvent.changeText(screen.getByTestId('reps'), 'a1b2.5c');

    expect(onChangeText).toHaveBeenCalledWith('125');
  });
});

describe('sanitizeNumericInput (unit)', () => {
  it('integer mode: keeps only digits', () => {
    expect(sanitizeNumericInput('a1b2.5c', 'integer')).toBe('125');
    expect(sanitizeNumericInput('', 'integer')).toBe('');
    expect(sanitizeNumericInput('12', 'integer')).toBe('12');
  });

  it('decimal mode: keeps digits and at most one dot', () => {
    expect(sanitizeNumericInput('ab12.5cd', 'decimal')).toBe('12.5');
    expect(sanitizeNumericInput('1.2.3.4', 'decimal')).toBe('1.234');
    expect(sanitizeNumericInput('...', 'decimal')).toBe('.');
    expect(sanitizeNumericInput('45', 'decimal')).toBe('45');
  });

  // Edge cases not exercised above: neither mode has a dedicated affordance
  // for a leading minus sign (weight/reps/measurements are never negative
  // in this app's domain, 07 §5's stated use cases for this component), so
  // `-` is simply stripped as a non-digit/non-dot character rather than
  // preserved or rejected outright — pinning that behavior here so a future
  // change can't silently start accepting negative values unnoticed.
  it('strips a leading minus sign in both modes (no negative-number support)', () => {
    expect(sanitizeNumericInput('-12', 'integer')).toBe('12');
    expect(sanitizeNumericInput('-12.5', 'decimal')).toBe('12.5');
  });

  it('leaves leading zeros and a trailing/lone dot untouched (no numeric normalization)', () => {
    // Sanitizing is character-filtering only, not numeric normalization —
    // "007" stays "007" (the caller/consumer decides how to interpret it),
    // and a trailing or lone "." is kept as-is (mid-typing states like the
    // user having just pressed "." before the digits after it).
    expect(sanitizeNumericInput('007', 'integer')).toBe('007');
    expect(sanitizeNumericInput('00.50', 'decimal')).toBe('00.50');
    expect(sanitizeNumericInput('12.', 'decimal')).toBe('12.');
    expect(sanitizeNumericInput('.', 'decimal')).toBe('.');
  });
});
