/**
 * `WheelPicker` tests (M2-09 primitive gate): renders every option, tapping
 * a row commits it via `onChange`, momentum-scroll-end also commits the
 * nearest row, both-themes smoke.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { WheelPicker, WHEEL_PICKER_ROW_HEIGHT } from '../WheelPicker';
import { ThemeProvider } from '../theme-provider';

const OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
  { value: 15, label: '15s' },
];

describe('WheelPicker', () => {
  it('renders every option label', async () => {
    await render(
      <ThemeProvider preference="dark">
        <WheelPicker testID="wp" options={OPTIONS} value={0} onChange={() => {}} />
      </ThemeProvider>,
    );
    for (const option of OPTIONS) {
      expect(screen.getByText(option.label)).toBeTruthy();
    }
  });

  it('tapping a row commits its value via onChange', async () => {
    const onChange = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <WheelPicker testID="wp" options={OPTIONS} value={0} onChange={onChange} />
      </ThemeProvider>,
    );
    fireEvent.press(screen.getByTestId('wp-option-10'));
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it('marks the current value selected (accessibilityState)', async () => {
    await render(
      <ThemeProvider preference="dark">
        <WheelPicker testID="wp" options={OPTIONS} value={5} onChange={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('wp-option-5').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('wp-option-10').props.accessibilityState).toEqual({ selected: false });
  });

  it('re-tapping the already-selected row does not call onChange again', async () => {
    const onChange = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <WheelPicker testID="wp" options={OPTIONS} value={5} onChange={onChange} />
      </ThemeProvider>,
    );
    fireEvent.press(screen.getByTestId('wp-option-5'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('momentum scroll end commits the nearest row by offset', async () => {
    const onChange = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <WheelPicker testID="wp" options={OPTIONS} value={0} onChange={onChange} />
      </ThemeProvider>,
    );
    fireEvent(screen.getByTestId('wp-scroll'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { y: 2 * WHEEL_PICKER_ROW_HEIGHT } },
    });
    expect(onChange).toHaveBeenCalledWith(10);
  });

  it('clamps a momentum offset past the last row to the last option', async () => {
    const onChange = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <WheelPicker testID="wp" options={OPTIONS} value={0} onChange={onChange} />
      </ThemeProvider>,
    );
    fireEvent(screen.getByTestId('wp-scroll'), 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { y: 99 * WHEEL_PICKER_ROW_HEIGHT } },
    });
    expect(onChange).toHaveBeenCalledWith(15);
  });

  it('smoke renders in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <WheelPicker testID="wp" options={OPTIONS} value={0} onChange={() => {}} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('wp')).toBeTruthy();
  });
});
