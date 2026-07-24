/**
 * `PlateCalculatorSheet` tests (M2-15, 02 §11) — pre-fill from a captured
 * `keyboardFocusStore` field id, bar selection, exact vs. inexact-with-
 * suggestions rendering, and the "Use this value" write-back (the
 * acceptance gate's own "UI test: 'Use this value' actually writes back
 * into the input" — the write-back mechanism itself; the full real-input
 * round trip through `ActiveWorkoutScreen` is covered in
 * `keyboard-flow.test.tsx`). `keyboardFocusStore` is used for real (not
 * mocked) — a field is registered directly with `getValue`/`setValue` spies,
 * the same seam `ConnectedSetRow.tsx` wires in production.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';

import { SETTINGS_DEFAULTS } from '@/data/settings/settings-schema';
import { createSettingsStore } from '@/features/settings/settings-store';
import { ThemeProvider } from '@/ui/theme-provider';

import { PlateCalculatorSheet } from '../PlateCalculatorSheet';
import { __resetKeyboardFocusRegistryForTests, useKeyboardFocusStore } from '../keyboardFocusStore';

jest.mock('@/features/settings/settings-store', () => {
  const actual = jest.requireActual('@/features/settings/settings-store');
  return {
    ...actual,
    useSettingsStore: actual.createSettingsStore(),
  };
});

function getSettingsStore() {
  const { useSettingsStore } = jest.requireMock('@/features/settings/settings-store') as {
    useSettingsStore: ReturnType<typeof createSettingsStore>;
  };
  return useSettingsStore;
}

function registerField(fieldId: string, getValue: () => number | null, setValue: (v: number) => void) {
  useKeyboardFocusStore.getState().registerField(fieldId, {
    focus: jest.fn(),
    order: { exercisePosition: 0, rowIndex: 0, columnIndex: 0 },
    isWeight: true,
    getValue,
    setValue,
  });
}

async function seedSettings(overrides?: Partial<typeof SETTINGS_DEFAULTS.plate_calc>) {
  const store = getSettingsStore();
  // Seed synchronously (no repository needed for this component's own
  // tests — `useSettingsStore.setState` bypasses the write-through
  // repository call entirely, which is fine here since nothing in this
  // suite asserts persistence, only the sheet's own rendering/write-back).
  store.setState({
    loaded: true,
    settings: { ...SETTINGS_DEFAULTS, plate_calc: { ...SETTINGS_DEFAULTS.plate_calc, ...overrides } },
  });
}

function renderSheet(props: Partial<React.ComponentProps<typeof PlateCalculatorSheet>> = {}) {
  return render(
    <ThemeProvider>
      <PlateCalculatorSheet
        visible
        onDismiss={jest.fn()}
        targetFieldId="test-field"
        weightUnit="kg"
        {...props}
      />
    </ThemeProvider>,
  );
}

describe('PlateCalculatorSheet (M2-15)', () => {
  beforeEach(async () => {
    __resetKeyboardFocusRegistryForTests();
    await seedSettings();
  });

  it('pre-fills the target weight from the captured field id, converted to display units', async () => {
    registerField('test-field', () => 102.5, jest.fn());
    await act(async () => {
      renderSheet();
    });
    expect(screen.getByTestId('plate-calculator-sheet-target-input').props.value).toBe('102.5');
  });

  it('leaves the target blank when the captured field has no current value', async () => {
    registerField('test-field', () => null, jest.fn());
    await act(async () => {
      renderSheet();
    });
    expect(screen.getByTestId('plate-calculator-sheet-target-input').props.value).toBe('');
  });

  it('defaults the bar selection to Barbell', async () => {
    registerField('test-field', () => null, jest.fn());
    await act(async () => {
      renderSheet();
    });
    expect(screen.getByTestId('plate-calculator-sheet-bar-0').props.accessibilityState.selected).toBe(
      true,
    );
  });

  it('an exact target shows the diagram, achieved total, and a single Use-this-value button that writes back and dismisses', async () => {
    const setValue = jest.fn();
    const onDismiss = jest.fn();
    registerField('test-field', () => null, setValue);
    await act(async () => {
      renderSheet({ onDismiss });
    });

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('plate-calculator-sheet-target-input'), '102.5');
    });

    expect(screen.getByTestId('plate-calculator-sheet-achieved').props.children.join('')).toBe(
      '102.5kg',
    );
    expect(screen.getByTestId('plate-calculator-sheet-diagram-plate-a-0')).toBeTruthy();
    expect(screen.queryByTestId('plate-calculator-sheet-use-lower')).toBeNull();

    await act(async () => {
      fireEvent.press(screen.getByTestId('plate-calculator-sheet-use-value'));
    });

    expect(setValue).toHaveBeenCalledWith(102.5);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('an inexact target shows lower/upper suggestions, each with its own working Use-this-value button', async () => {
    const setValue = jest.fn();
    registerField('test-field', () => null, setValue);
    await seedSettings({ plates: [{ weight_kg: 25, count: 2 }] });
    await act(async () => {
      renderSheet();
    });

    await act(async () => {
      // perSideTarget = 10.5 (bar 20) -> lower = bar alone (20), upper = 70.
      fireEvent.changeText(screen.getByTestId('plate-calculator-sheet-target-input'), '41');
    });

    expect(screen.getByTestId('plate-calculator-sheet-use-lower')).toBeTruthy();
    expect(screen.getByTestId('plate-calculator-sheet-use-upper')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByTestId('plate-calculator-sheet-use-upper'));
    });
    expect(setValue).toHaveBeenCalledWith(70);
  });

  it('selecting a different bar recomputes the result against that bar weight', async () => {
    registerField('test-field', () => null, jest.fn());
    await act(async () => {
      renderSheet();
    });

    await act(async () => {
      fireEvent.changeText(screen.getByTestId('plate-calculator-sheet-target-input'), '27.5');
    });
    // Against the default Barbell (20 kg) this is exact via [2.5, 2.5] etc,
    // but selecting the EZ Bar (7.5 kg, index 1) changes the achieved base.
    await act(async () => {
      fireEvent.press(screen.getByTestId('plate-calculator-sheet-bar-1'));
    });

    expect(screen.getByTestId('plate-calculator-sheet-bar-1').props.accessibilityState.selected).toBe(
      true,
    );
    // perSideTarget = (27.5 - 7.5) / 2 = 10 -> one 10 kg plate/side, exact.
    expect(screen.getByTestId('plate-calculator-sheet-achieved').props.children.join('')).toBe('27.5kg');
  });

  it('converts to lb display while still solving in canonical kg', async () => {
    registerField('test-field', () => null, jest.fn());
    await act(async () => {
      renderSheet({ weightUnit: 'lbs' });
    });

    expect(screen.getByTestId('plate-calculator-sheet-target-input').props.value).toBe('');
    // The default Barbell (20 kg canonical) renders its lb-converted label.
    expect(screen.getByTestId('plate-calculator-sheet-bar-0').props.accessibilityLabel).toContain('lb');
  });

  it('renders nothing result-shaped while the target is empty', async () => {
    registerField('test-field', () => null, jest.fn());
    await act(async () => {
      renderSheet();
    });
    expect(screen.queryByTestId('plate-calculator-sheet-achieved')).toBeNull();
  });
});
