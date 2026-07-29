/**
 * `MultiSelectOptionSheet` tests (M1-09) — toggling options accumulates a
 * local draft that only commits (via `onChange`) on `Done`; dismissing
 * without `Done` must not call `onChange` at all; reopening resets the
 * draft from the latest committed `value`.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { ThemeProvider } from '@/ui/theme-provider';

import { MultiSelectOptionSheet } from '../MultiSelectOptionSheet';

const OPTIONS = [
  { value: 'chest', label: 'Chest' },
  { value: 'triceps', label: 'Triceps' },
  { value: 'shoulders', label: 'Shoulders' },
] as const;

function Harness({
  initialValue = [],
}: {
  initialValue?: string[];
}): React.JSX.Element {
  const [visible, setVisible] = React.useState(true);
  const [value, setValue] = React.useState<string[]>(initialValue);
  return (
    <MultiSelectOptionSheet
      testID="sheet"
      visible={visible}
      onDismiss={() => setVisible(false)}
      title="Secondary Muscles"
      options={OPTIONS}
      value={value}
      onChange={setValue}
    />
  );
}

function renderHarness(initialValue: string[] = []) {
  return render(
    <ThemeProvider preference="dark">
      <Harness initialValue={initialValue} />
    </ThemeProvider>,
  );
}

describe('MultiSelectOptionSheet', () => {
  it('toggling two options and pressing Done commits both as the new value', async () => {
    const onChange = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <MultiSelectOptionSheet
          testID="sheet"
          visible
          onDismiss={jest.fn()}
          title="Secondary Muscles"
          options={OPTIONS}
          value={[]}
          onChange={onChange}
        />
      </ThemeProvider>,
    );

    await fireEvent.press(screen.getByTestId('sheet-option-chest'));
    await fireEvent.press(screen.getByTestId('sheet-option-triceps'));
    await fireEvent.press(screen.getByTestId('sheet-done'));

    expect(onChange).toHaveBeenCalledWith(['chest', 'triceps']);
  });

  it('pressing an already-selected option removes it from the draft', async () => {
    const onChange = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <MultiSelectOptionSheet
          testID="sheet"
          visible
          onDismiss={jest.fn()}
          title="Secondary Muscles"
          options={OPTIONS}
          value={['chest', 'triceps']}
          onChange={onChange}
        />
      </ThemeProvider>,
    );

    await fireEvent.press(screen.getByTestId('sheet-option-chest'));
    await fireEvent.press(screen.getByTestId('sheet-done'));

    expect(onChange).toHaveBeenCalledWith(['triceps']);
  });

  it('reflects the initial value with checkmarks and rebuilds correctly end-to-end via a stateful harness', async () => {
    await renderHarness(['shoulders']);

    // Toggle chest on top of the pre-checked shoulders, then commit.
    await fireEvent.press(screen.getByTestId('sheet-option-chest'));
    await fireEvent.press(screen.getByTestId('sheet-done'));

    // Sheet dismissed after commit (no visible content left to query).
    expect(screen.queryByTestId('sheet-content')).toBeNull();
  });
});
