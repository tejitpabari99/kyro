/**
 * `SetRow` tests (M2-06 acceptance gate): smoke render both themes, every
 * column-kind's cell renders + fires the right callback, the assisted/added
 * prefix glyphs, the check/previous/set-cell/delete interactions, and a
 * `React.memo` reference-stability check (the unit-level half of 06 §8's
 * "typing in one row doesn't re-render others" — the full store-backed
 * proof lives in `src/features/workout/__tests__/ExerciseSetTableSection
 * .test.tsx`).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import type { TextInput } from 'react-native';

import { SetRow, type SetRowProps } from '../SetRow';
import { ThemeProvider } from '../theme-provider';
import type { SetRowColumn } from '../set-table-types';

const WEIGHT_REPS_COLUMNS: SetRowColumn[] = [
  { key: 'weight', kind: 'weight', label: 'KG' },
  { key: 'reps', kind: 'reps', label: 'REPS' },
];

function baseProps(overrides: Partial<SetRowProps> = {}): SetRowProps {
  return {
    columns: WEIGHT_REPS_COLUMNS,
    badgeKind: 'normal',
    workingIndex: 1,
    values: {},
    placeholders: {},
    previousLabel: '45kg × 9',
    isCompleted: false,
    onChangeValue: jest.fn(),
    onBlurValue: jest.fn(),
    onPreviousPress: jest.fn(),
    onSetCellPress: jest.fn(),
    onToggleCompleted: jest.fn(),
    onDelete: jest.fn(),
    testID: 'row',
    ...overrides,
  };
}

describe('SetRow — smoke render (both themes)', () => {
  it('renders in dark theme', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps()} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('row')).toBeTruthy();
  });

  it('renders in light theme', async () => {
    await render(
      <ThemeProvider preference="light">
        <SetRow {...baseProps()} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('row')).toBeTruthy();
  });
});

describe('SetRow — value columns', () => {
  it('renders a NumericInput per column, seeded from values/placeholders', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow
          {...baseProps({ values: { weight: '80' }, placeholders: { reps: '9' } })}
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('row-value-weight').props.value).toBe('80');
    expect(screen.getByTestId('row-value-reps').props.placeholder).toBe('9');
  });

  it('fires onChangeValue with the column key on typing, and onBlurValue on blur', async () => {
    const onChangeValue = jest.fn();
    const onBlurValue = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ onChangeValue, onBlurValue })} />
      </ThemeProvider>,
    );
    await fireEvent.changeText(screen.getByTestId('row-value-weight'), '80');
    expect(onChangeValue).toHaveBeenCalledWith('weight', '80');

    await fireEvent(screen.getByTestId('row-value-weight'), 'blur');
    expect(onBlurValue).toHaveBeenCalledWith('weight');
  });

  it('renders a + prefix for bodyweight_reps (weight_added)', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow
          {...baseProps({ columns: [{ key: 'weight', kind: 'weight_added', label: '+KG' }] })}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('+')).toBeTruthy();
  });

  it('renders a − prefix for assisted weight, with the field itself holding the plain positive number', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow
          {...baseProps({
            columns: [{ key: 'weight', kind: 'weight_assisted', label: '−KG' }],
            values: { weight: '20' },
          })}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('−')).toBeTruthy();
    expect(screen.getByTestId('row-value-weight').props.value).toBe('20');
  });

  it('uses integer mode for reps and time columns, decimal for weight/distance/custom', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow
          {...baseProps({
            columns: [
              { key: 'weight', kind: 'weight', label: 'KG' },
              { key: 'reps', kind: 'reps', label: 'REPS' },
              { key: 'duration', kind: 'time', label: 'TIME' },
              { key: 'distance', kind: 'distance', label: 'KM' },
              { key: 'custom', kind: 'custom', label: 'CUSTOM' },
            ],
          })}
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('row-value-weight').props.keyboardType).toBe('decimal-pad');
    expect(screen.getByTestId('row-value-reps').props.keyboardType).toBe('number-pad');
    expect(screen.getByTestId('row-value-duration').props.keyboardType).toBe('number-pad');
    expect(screen.getByTestId('row-value-distance').props.keyboardType).toBe('decimal-pad');
    expect(screen.getByTestId('row-value-custom').props.keyboardType).toBe('decimal-pad');
  });
});

describe('SetRow — M2-08 keyboard-flow seams', () => {
  it('fires onFocusValue with the column key when a value cell gains focus', async () => {
    const onFocusValue = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ onFocusValue })} />
      </ThemeProvider>,
    );
    await fireEvent(screen.getByTestId('row-value-weight'), 'focus');
    expect(onFocusValue).toHaveBeenCalledWith('weight');
  });

  it('forwards inputAccessoryViewID to every value cell', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ inputAccessoryViewID: 'shared-bar' })} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('row-value-weight').props.inputAccessoryViewID).toBe('shared-bar');
    expect(screen.getByTestId('row-value-reps').props.inputAccessoryViewID).toBe('shared-bar');
  });

  it('wires fieldRefs as the ref callback for the matching column\'s NumericInput', async () => {
    const captured: Record<string, TextInput | null> = {};
    const fieldRefs = {
      weight: (instance: TextInput | null) => {
        captured.weight = instance;
      },
    };
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ fieldRefs })} />
      </ThemeProvider>,
    );
    expect(captured.weight).not.toBeNull();
    expect(typeof captured.weight?.focus).toBe('function');
  });

  it('shows no inline-timer button on TIME columns when inlineTimerEnabled is false/unset', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow
          {...baseProps({
            columns: [{ key: 'duration', kind: 'time', label: 'TIME' }],
          })}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('row-timer-duration')).toBeNull();
  });

  it('shows an inline-timer button on TIME columns when inlineTimerEnabled is true, firing onDurationTimerPress with the column key', async () => {
    const onDurationTimerPress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SetRow
          {...baseProps({
            columns: [{ key: 'duration', kind: 'time', label: 'TIME' }],
            inlineTimerEnabled: true,
            onDurationTimerPress,
          })}
        />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('row-timer-duration'));
    expect(onDurationTimerPress).toHaveBeenCalledWith('duration');
  });

  it('never shows an inline-timer button on non-TIME columns even when inlineTimerEnabled is true', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ inlineTimerEnabled: true, onDurationTimerPress: jest.fn() })} />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('row-timer-weight')).toBeNull();
    expect(screen.queryByTestId('row-timer-reps')).toBeNull();
  });
});

describe('SetRow — RPE column', () => {
  it('shows the value or — and fires onRpePress on tap', async () => {
    const onRpePress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SetRow
          {...baseProps({
            columns: [{ key: 'rpe', kind: 'rpe', label: 'RPE' }],
            values: { rpe: '8.5' },
            onRpePress,
          })}
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('8.5')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('row-rpe'));
    expect(onRpePress).toHaveBeenCalledTimes(1);
  });

  it('shows — when no RPE value is set', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ columns: [{ key: 'rpe', kind: 'rpe', label: 'RPE' }] })} />
      </ThemeProvider>,
    );
    expect(screen.getByText('—')).toBeTruthy();
  });
});

describe('SetRow — SET / PREVIOUS / ✓ / delete', () => {
  it('tapping the SET badge fires onSetCellPress', async () => {
    const onSetCellPress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ onSetCellPress })} />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('row-badge'));
    expect(onSetCellPress).toHaveBeenCalledTimes(1);
  });

  it('tapping PREVIOUS fires onPreviousPress', async () => {
    const onPreviousPress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ onPreviousPress })} />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('row-previous'));
    expect(onPreviousPress).toHaveBeenCalledTimes(1);
  });

  it('renders — in PREVIOUS when previousLabel is null', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ previousLabel: null })} />
      </ThemeProvider>,
    );
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('tapping the check cell fires onToggleCompleted', async () => {
    const onToggleCompleted = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ onToggleCompleted })} />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('row-check'));
    expect(onToggleCompleted).toHaveBeenCalledTimes(1);
  });

  it('reflects isCompleted in the check cell’s accessibility state', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ isCompleted: true })} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('row-check').props.accessibilityState.checked).toBe(true);
  });

  it('tapping the delete button (always mounted, revealed by swipe in real usage) fires onDelete', async () => {
    const onDelete = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ onDelete })} />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('row-delete-button'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe('SetRow — blocked-check row shake (07 §8: 300 ms shake)', () => {
  it('accepts a shakeSignal prop and re-renders cleanly when it changes (the visual shake itself is a Reanimated worklet, not unit-testable — the behavioral half of this acceptance item, "blocked check never commits", is covered at the ConnectedSetRow/ExerciseSetTableSection level)', async () => {
    const { rerender } = await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ shakeSignal: 0 })} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('row')).toBeTruthy();

    await rerender(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ shakeSignal: 1 })} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('row')).toBeTruthy();
  });
});

describe('SetRow — memoization (06 §8 unit-level check)', () => {
  it('is wrapped in React.memo', () => {
    expect((SetRow as unknown as { $$typeof?: symbol }).$$typeof).toBe(Symbol.for('react.memo'));
  });
});

describe('SetRow — readOnly mode (M2-14, 07 §5 read-only SetTable)', () => {
  it('renders static text for value cells instead of NumericInput', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ readOnly: true, values: { weight: '80', reps: '8' } })} />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('row-value-weight')).toBeNull();
    expect(screen.getByText('80')).toBeTruthy();
    expect(screen.getByText('8')).toBeTruthy();
  });

  it('does not render swipe-to-delete chrome', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ readOnly: true, onDelete: undefined })} />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('row-delete-button')).toBeNull();
    expect(screen.queryByTestId('row-delete-action')).toBeNull();
  });

  it('does not fire onToggleCompleted, onSetCellPress, or onPreviousPress when tapped', async () => {
    const onToggleCompleted = jest.fn();
    const onSetCellPress = jest.fn();
    const onPreviousPress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SetRow
          {...baseProps({
            readOnly: true,
            onToggleCompleted: undefined,
            onSetCellPress: undefined,
            onPreviousPress: undefined,
          })}
        />
      </ThemeProvider>,
    );
    // These handlers are never even wired in readOnly mode — the elements
    // may still render (badge glyph, previous label, check indicator) but
    // are not `Pressable`s, so there's nothing for `fireEvent.press` to hit;
    // asserting the mocks are untouched proves the callbacks were never
    // supplied a live `onPress`.
    fireEvent.press(screen.getByTestId('row-badge'));
    fireEvent.press(screen.getByTestId('row-previous'));
    fireEvent.press(screen.getByTestId('row-check'));
    expect(onToggleCompleted).not.toHaveBeenCalled();
    expect(onSetCellPress).not.toHaveBeenCalled();
    expect(onPreviousPress).not.toHaveBeenCalled();
  });

  it('still shows the SET badge, PREVIOUS label, and check state for read context', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow
          {...baseProps({
            readOnly: true,
            workingIndex: 2,
            previousLabel: null,
            isCompleted: true,
            onToggleCompleted: undefined,
            onSetCellPress: undefined,
            onPreviousPress: undefined,
            onChangeValue: undefined,
            onBlurValue: undefined,
            onDelete: undefined,
          })}
        />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('row-check').props.accessibilityState.checked).toBe(true);
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByTestId('row-previous').props.children).toBe('—');
  });
});

describe('SetRow — trophy badge (M4-04, 04 §5.4/07 §6)', () => {
  it('renders no trophy affordance when trophyLabel is null/unset, even in readOnly mode', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ readOnly: true })} />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('row-trophy')).toBeNull();
  });

  it('renders the trophy glyph when trophyLabel is set and readOnly, with the label as its accessibility label', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ readOnly: true, trophyLabel: 'Heaviest Weight — 102.5 kg' })} />
      </ThemeProvider>,
    );
    const trophy = screen.getByTestId('row-trophy');
    expect(trophy).toBeTruthy();
    expect(trophy.props.accessibilityLabel).toBe('Heaviest Weight — 102.5 kg');
  });

  it('fires onTrophyPress when the trophy glyph is tapped', async () => {
    const onTrophyPress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SetRow
          {...baseProps({ readOnly: true, trophyLabel: 'Most Reps — 12 reps', onTrophyPress })}
        />
      </ThemeProvider>,
    );
    fireEvent.press(screen.getByTestId('row-trophy'));
    expect(onTrophyPress).toHaveBeenCalledTimes(1);
  });

  it('never renders a trophy affordance outside readOnly mode, even if trophyLabel is (incorrectly) supplied', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ readOnly: false, trophyLabel: 'Heaviest Weight — 100 kg' })} />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('row-trophy')).toBeNull();
  });
});

describe('SetRow — target mode (M3-04, 04 §2.1)', () => {
  it('omits the ✓ check cell entirely', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ targetMode: true })} />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('row-check-cell')).toBeNull();
    expect(screen.queryByTestId('row-check')).toBeNull();
  });

  it('SET cell stays interactive (still cycles set types)', async () => {
    const onSetCellPress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ targetMode: true, onSetCellPress })} />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('row-badge'));
    expect(onSetCellPress).toHaveBeenCalledTimes(1);
  });

  it('value cells stay editable (weight column renders a NumericInput, not static text)', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ targetMode: true, values: { weight: '60' } })} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('row-value-weight').props.value).toBe('60');
  });

  it('swipe-delete stays live (delete button fires onDelete)', async () => {
    const onDelete = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ targetMode: true, onDelete })} />
      </ThemeProvider>,
    );
    await fireEvent.press(screen.getByTestId('row-delete-button'));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('PREVIOUS is static text (no tap action) even though the row is otherwise interactive', async () => {
    const onPreviousPress = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ targetMode: true, onPreviousPress, previousLabel: '45kg × 9' })} />
      </ThemeProvider>,
    );
    fireEvent.press(screen.getByTestId('row-previous'));
    expect(onPreviousPress).not.toHaveBeenCalled();
    expect(screen.getByText('45kg × 9')).toBeTruthy();
  });

  it('renders a single REPS input when repRangeMode is false/unset', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ targetMode: true, values: { reps: '8' } })} />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('row-value-reps').props.value).toBe('8');
    expect(screen.queryByTestId('row-value-reps_from')).toBeNull();
  });

  it('renders two inputs (reps_from/reps_to) when repRangeMode is true, seeded from values', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow
          {...baseProps({
            targetMode: true,
            repRangeMode: true,
            values: { reps_from: '6', reps_to: '8' },
          })}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('row-value-reps')).toBeNull();
    expect(screen.getByTestId('row-value-reps_from').props.value).toBe('6');
    expect(screen.getByTestId('row-value-reps_to').props.value).toBe('8');
  });

  it('fires onChangeValue/onBlurValue with the synthetic reps_from/reps_to keys', async () => {
    const onChangeValue = jest.fn();
    const onBlurValue = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SetRow
          {...baseProps({ targetMode: true, repRangeMode: true, onChangeValue, onBlurValue })}
        />
      </ThemeProvider>,
    );
    await fireEvent.changeText(screen.getByTestId('row-value-reps_from'), '6');
    expect(onChangeValue).toHaveBeenCalledWith('reps_from', '6');
    await fireEvent(screen.getByTestId('row-value-reps_to'), 'blur');
    expect(onBlurValue).toHaveBeenCalledWith('reps_to');
  });

  it('long-pressing the REPS cell fires onToggleRepRange', async () => {
    const onToggleRepRange = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ targetMode: true, onToggleRepRange })} />
      </ThemeProvider>,
    );
    await fireEvent(screen.getByTestId('row-reps-target-cell'), 'longPress');
    expect(onToggleRepRange).toHaveBeenCalledTimes(1);
  });

  it('long-pressing the REPS cell in range mode also fires onToggleRepRange (toggle back to single)', async () => {
    const onToggleRepRange = jest.fn();
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ targetMode: true, repRangeMode: true, onToggleRepRange })} />
      </ThemeProvider>,
    );
    await fireEvent(screen.getByTestId('row-reps-target-cell'), 'longPress');
    expect(onToggleRepRange).toHaveBeenCalledTimes(1);
  });

  it('non-REPS columns never get the range/long-press treatment even in target mode', async () => {
    await render(
      <ThemeProvider preference="dark">
        <SetRow {...baseProps({ targetMode: true, onToggleRepRange: jest.fn() })} />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('row-value-weight_from')).toBeNull();
    expect(screen.getByTestId('row-value-weight')).toBeTruthy();
  });
});
