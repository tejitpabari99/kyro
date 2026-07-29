/**
 * `SettingsToggleRow` tests (M2-17) — smoke coverage for the title/subtitle
 * render and the `Switch`'s `onValueChange` wiring, independent of any
 * settings-store consumer.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { SettingsToggleRow } from '../SettingsToggleRow';
import { ThemeProvider } from '../theme-provider';

describe('SettingsToggleRow', () => {
  it('renders the title, subtitle, and current value', async () => {
    await render(
      <ThemeProvider>
        <SettingsToggleRow
          testID="row-under-test"
          title="RPE Tracking"
          subtitle="Show an RPE column on the set table"
          value={false}
          onValueChange={jest.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText('RPE Tracking')).toBeTruthy();
    expect(screen.getByText('Show an RPE column on the set table')).toBeTruthy();
    expect(screen.getByTestId('row-under-test').props.value).toBe(false);
  });

  it('calls onValueChange when the switch is toggled', async () => {
    const onValueChange = jest.fn();
    await render(
      <ThemeProvider>
        <SettingsToggleRow testID="row-under-test" title="RPE Tracking" value={false} onValueChange={onValueChange} />
      </ThemeProvider>,
    );

    fireEvent(screen.getByTestId('row-under-test'), 'valueChange', true);
    expect(onValueChange).toHaveBeenCalledWith(true);
  });
});
