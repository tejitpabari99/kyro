/**
 * `keyboardFocusStore` unit tests (M2-08) — the pure Next-traversal
 * algorithm in isolation: registration/unregistration, focus/blur tracking
 * (including the stale-blur guard), and `focusNext`'s ordering across rows
 * and exercises using synthetic `{focus: jest.fn()}` registrations (no RN
 * rendering needed — the store itself has zero RN imports). The
 * store-driven-by-a-real-rendered-tree half of this feature (does the real
 * component tree register the *correct* order tuples) is covered at the
 * integration level in `keyboard-flow.test.tsx`.
 */
import {
  KEYBOARD_ACCESSORY_VIEW_ID,
  __resetKeyboardFocusRegistryForTests,
  useKeyboardFocusStore,
} from '../keyboardFocusStore';

function resetStore(): void {
  __resetKeyboardFocusRegistryForTests();
  useKeyboardFocusStore.setState({ focusedFieldId: null, focusedIsWeight: false });
}

afterEach(() => {
  resetStore();
});

describe('keyboardFocusStore — registerField / unregisterField', () => {
  it('registers a field and unregisters it, clearing focus state if it was the focused field', () => {
    const focus = jest.fn();
    useKeyboardFocusStore.getState().registerField('a', {
      focus,
      order: { exercisePosition: 0, rowIndex: 0, columnIndex: 0 },
      isWeight: true,
    });
    useKeyboardFocusStore.getState().handleFocus('a');
    expect(useKeyboardFocusStore.getState().focusedFieldId).toBe('a');
    expect(useKeyboardFocusStore.getState().focusedIsWeight).toBe(true);

    useKeyboardFocusStore.getState().unregisterField('a');

    expect(useKeyboardFocusStore.getState().focusedFieldId).toBeNull();
    expect(useKeyboardFocusStore.getState().focusedIsWeight).toBe(false);
  });

  it('unregistering a field that is NOT the currently focused one leaves focus state untouched', () => {
    useKeyboardFocusStore.getState().registerField('a', {
      focus: jest.fn(),
      order: { exercisePosition: 0, rowIndex: 0, columnIndex: 0 },
      isWeight: true,
    });
    useKeyboardFocusStore.getState().registerField('b', {
      focus: jest.fn(),
      order: { exercisePosition: 0, rowIndex: 0, columnIndex: 1 },
      isWeight: false,
    });
    useKeyboardFocusStore.getState().handleFocus('a');

    useKeyboardFocusStore.getState().unregisterField('b');

    expect(useKeyboardFocusStore.getState().focusedFieldId).toBe('a');
  });
});

describe('keyboardFocusStore — handleFocus / handleBlur', () => {
  it('handleFocus records focusedIsWeight from the registration, false for a non-weight kind', () => {
    useKeyboardFocusStore.getState().registerField('reps', {
      focus: jest.fn(),
      order: { exercisePosition: 0, rowIndex: 0, columnIndex: 1 },
      isWeight: false,
    });
    useKeyboardFocusStore.getState().handleFocus('reps');
    expect(useKeyboardFocusStore.getState().focusedIsWeight).toBe(false);
  });

  it('handleFocus on an unregistered field id still records it as focused, with focusedIsWeight false', () => {
    useKeyboardFocusStore.getState().handleFocus('ghost');
    expect(useKeyboardFocusStore.getState().focusedFieldId).toBe('ghost');
    expect(useKeyboardFocusStore.getState().focusedIsWeight).toBe(false);
  });

  it('handleBlur clears focus state when it matches the currently focused field', () => {
    useKeyboardFocusStore.getState().handleFocus('a');
    useKeyboardFocusStore.getState().handleBlur('a');
    expect(useKeyboardFocusStore.getState().focusedFieldId).toBeNull();
  });

  it('handleBlur is a no-op (stale blur guard) when a different field is now the focused one — the exact race `focusNext` produces: focus the next field before the old one\'s own blur event arrives', () => {
    useKeyboardFocusStore.getState().handleFocus('a');
    // Focus already moved on to 'b' (e.g. via `focusNext`) before 'a''s own
    // blur event fires.
    useKeyboardFocusStore.getState().handleFocus('b');

    useKeyboardFocusStore.getState().handleBlur('a');

    expect(useKeyboardFocusStore.getState().focusedFieldId).toBe('b');
  });
});

describe('keyboardFocusStore — focusNext', () => {
  function register(id: string, order: { exercisePosition: number; rowIndex: number; columnIndex: number }) {
    const focus = jest.fn();
    useKeyboardFocusStore.getState().registerField(id, { focus, order, isWeight: false });
    return focus;
  }

  it('is a no-op when nothing is focused', () => {
    const focus = register('a', { exercisePosition: 0, rowIndex: 0, columnIndex: 0 });
    useKeyboardFocusStore.getState().focusNext();
    expect(focus).not.toHaveBeenCalled();
  });

  it('is a no-op when the focused field is no longer registered', () => {
    useKeyboardFocusStore.getState().handleFocus('ghost');
    // Should simply not throw / not call anything.
    expect(() => useKeyboardFocusStore.getState().focusNext()).not.toThrow();
  });

  it('advances weight -> reps within the same row (column order)', () => {
    const weight = register('weight', { exercisePosition: 0, rowIndex: 0, columnIndex: 0 });
    const reps = register('reps', { exercisePosition: 0, rowIndex: 0, columnIndex: 1 });
    useKeyboardFocusStore.getState().handleFocus('weight');

    useKeyboardFocusStore.getState().focusNext();

    expect(reps).toHaveBeenCalledTimes(1);
    expect(weight).not.toHaveBeenCalled();
  });

  it('advances from the last column of one row to the first column of the next row (same exercise)', () => {
    register('row0-weight', { exercisePosition: 0, rowIndex: 0, columnIndex: 0 });
    const row0Reps = register('row0-reps', { exercisePosition: 0, rowIndex: 0, columnIndex: 1 });
    const row1Weight = register('row1-weight', { exercisePosition: 0, rowIndex: 1, columnIndex: 0 });
    register('row1-reps', { exercisePosition: 0, rowIndex: 1, columnIndex: 1 });
    useKeyboardFocusStore.getState().handleFocus('row0-reps');

    useKeyboardFocusStore.getState().focusNext();

    expect(row1Weight).toHaveBeenCalledTimes(1);
    expect(row0Reps).not.toHaveBeenCalled();
  });

  it('advances from the last row of one exercise to the first row/column of the next exercise', () => {
    register('exA-row0-weight', { exercisePosition: 0, rowIndex: 0, columnIndex: 0 });
    const exARow0Reps = register('exA-row0-reps', { exercisePosition: 0, rowIndex: 0, columnIndex: 1 });
    const exBRow0Weight = register('exB-row0-weight', { exercisePosition: 1, rowIndex: 0, columnIndex: 0 });
    register('exB-row0-reps', { exercisePosition: 1, rowIndex: 0, columnIndex: 1 });
    useKeyboardFocusStore.getState().handleFocus('exA-row0-reps');

    useKeyboardFocusStore.getState().focusNext();

    expect(exBRow0Weight).toHaveBeenCalledTimes(1);
    expect(exARow0Reps).not.toHaveBeenCalled();
  });

  it('is a no-op (stays put, never throws) when the focused field is the very last one registered', () => {
    register('a', { exercisePosition: 0, rowIndex: 0, columnIndex: 0 });
    const b = register('b', { exercisePosition: 0, rowIndex: 0, columnIndex: 1 });
    useKeyboardFocusStore.getState().handleFocus('b');

    expect(() => useKeyboardFocusStore.getState().focusNext()).not.toThrow();
    expect(b).not.toHaveBeenCalled();
  });

  it('exercise/row/column ordering wins over registration order — a field registered later can still be traversal-earlier', () => {
    // Registered in reverse traversal order on purpose.
    const later = register('later', { exercisePosition: 1, rowIndex: 0, columnIndex: 0 });
    register('earlier', { exercisePosition: 0, rowIndex: 0, columnIndex: 0 });
    useKeyboardFocusStore.getState().handleFocus('earlier');

    useKeyboardFocusStore.getState().focusNext();

    expect(later).toHaveBeenCalledTimes(1);
  });
});

describe('keyboardFocusStore — KEYBOARD_ACCESSORY_VIEW_ID', () => {
  it('is exported as a stable, non-empty string', () => {
    expect(typeof KEYBOARD_ACCESSORY_VIEW_ID).toBe('string');
    expect(KEYBOARD_ACCESSORY_VIEW_ID.length).toBeGreaterThan(0);
  });
});
