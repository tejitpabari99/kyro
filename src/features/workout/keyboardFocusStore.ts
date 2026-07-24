/**
 * `keyboardFocusStore` (M2-08) — 02 §4 / 07 §5: the cross-exercise "Next"
 * field-traversal engine behind `KeyboardAccessoryBar`, plus the
 * "is a weight field currently focused" signal that gates the Calculator
 * button (only shown when a weight field is focused **and** the plate
 * calculator setting is enabled — the setting check itself lives at the
 * `ActiveWorkoutScreen` call site, this store only tracks focus).
 *
 * ## Why a registry, not DOM/mount order (read before touching `focusNext`)
 *
 * `ActiveWorkoutScreen`'s exercise cards are keyed by `workoutExercise.id`
 * and `SetRow`'s own rows are keyed by `set.id` — reordering exercises
 * (M2-09's Reorder sheet) reconciles by key, so an already-mounted card's
 * inputs never re-fire their mount effects even though their on-screen
 * position changed. A "register in mount order" registry would silently go
 * stale after any reorder. Instead every field registers an explicit
 * `{exercisePosition, rowIndex, columnIndex}` order tuple (computed from
 * real domain data — `workoutExercise.position`, the set's 0-based index
 * within its exercise, and the column's own index among that row's
 * *non-RPE* columns — RPE never registers at all, since 02 §4's "skip RPE"
 * traversal rule is satisfied by construction: `SetRow`'s RPE cell is a
 * `Pressable` that opens a picker sheet, never a `NumericInput`) — `Next`
 * always resolves against the current, correct tuple ordering regardless of
 * mount history.
 *
 * ## Non-reactive registry, reactive focus signal
 *
 * `fields` (the `Map` below) is deliberately **not** part of Zustand's
 * reactive `state` — it's mutated directly (`fields.set`/`fields.delete`),
 * never through `set()`, so a row mounting/unmounting its `NumericInput`
 * refs (every keystroke would otherwise thrash it, see
 * `ConnectedSetRow.tsx`'s `fieldRefs` `useMemo` header for how call sites
 * keep registration calls infrequent) never itself triggers a re-render.
 * Only `focusedFieldId`/`focusedIsWeight` — what `KeyboardAccessoryBar`'s
 * caller actually needs to re-render for — live in reactive state.
 *
 * ## Value read/write by explicit field id (M2-15)
 *
 * The plate calculator (`PlateCalculatorSheet.tsx`) needs to (a) pre-fill
 * its target weight from whichever weight field was focused when
 * `Calculator` was pressed, and (b) later write the chosen achieved weight
 * back into that *same* field — even though opening the sheet's own
 * editable target-weight input steals native focus away from the
 * originating field the moment it renders (a real `TextInput.focus()` call
 * elsewhere fires the old field's `onBlur`, clearing `focusedFieldId`, same
 * mechanism the file header's "keyboard-never-dismisses" section already
 * describes). So the caller (`ActiveWorkoutScreen`) captures
 * `focusedFieldId` once, synchronously, at the moment `Calculator` is
 * pressed — *before* the sheet can steal focus — and every subsequent
 * read/write below addresses that captured id directly, never the live
 * `focusedFieldId`. `getFieldValue`/`writeFieldValue` are therefore plain
 * registry lookups by explicit id (like `focusNext`, not part of reactive
 * `state`) — a field's registration (and thus its `getValue`/`setValue`)
 * survives blur, only mount/unmount (`registerField`/`unregisterField`)
 * removes it, so this keeps working for as long as the row stays mounted
 * (true while a modal sheet is open above it).

 * ## Keyboard-never-dismisses (06 §8, this task's own "How")
 *
 * `focusNext` calls the next field's own `.focus()` directly — it never
 * blurs the current field itself or calls `Keyboard.dismiss()`. RN's native
 * responder system fires the *old* field's `onBlur` as a side effect of the
 * new field's `.focus()` call (which is exactly the "commit on blur/next"
 * behavior 06 §5.3 already wants), but the keyboard itself never leaves the
 * screen — focus transfers directly from one mounted `TextInput` to
 * another, satisfying "keep the keyboard mounted... focus moves via
 * `.focus()`, not blur+remount" literally.
 */
import { create } from 'zustand';

/** Shared `nativeID`/`inputAccessoryViewID` pairing every set-table `NumericInput` in the active-workout screen references — one `InputAccessoryView` (`KeyboardAccessoryBar`, mounted once by `ActiveWorkoutScreen`) serves the whole screen (RN's own documented "toolbar shared by multiple inputs" pattern). */
export const KEYBOARD_ACCESSORY_VIEW_ID = 'kyro-workout-set-table-accessory';

export interface FieldOrder {
  /** `workoutExercise.position` — stable across reorders (a real domain field, not render order). */
  exercisePosition: number;
  /** 0-based index of this set within its own exercise (`setNumber - 1`). */
  rowIndex: number;
  /** 0-based index of this column among its row's non-RPE value columns, in column order. */
  columnIndex: number;
}

interface FieldRegistration {
  focus: () => void;
  order: FieldOrder;
  /** Column kind is one of the three "weight" kinds — drives the Calculator button's visibility gate (02 §4/07 §5). */
  isWeight: boolean;
  /** Canonical-kg current value of this field (M2-15) — only ever set for weight fields; never called for any other kind. */
  getValue?: () => number | null;
  /** Writes `value` (canonical kg) into this field's own local buffer + commits it (M2-15's plate-calculator "Use this value" write-back) — only ever set for weight fields. */
  setValue?: (value: number) => void;
}

interface KeyboardFocusState {
  focusedFieldId: string | null;
  focusedIsWeight: boolean;
  registerField: (fieldId: string, registration: FieldRegistration) => void;
  unregisterField: (fieldId: string) => void;
  handleFocus: (fieldId: string) => void;
  handleBlur: (fieldId: string) => void;
  /** Moves native focus to the next field in traversal order after the currently-focused one. No-op if nothing is focused or the focused field is the last in the whole workout (02 §4 doesn't specify end-of-list behavior beyond "traverses... without dismissing the keyboard" — simply staying put is the safe reading, never an implicit dismiss). */
  focusNext: () => void;
  /** M2-15: canonical-kg current value of the field registered under `fieldId`, or `null` if unregistered or if that field never registered a `getValue` (non-weight fields). */
  getFieldValue: (fieldId: string) => number | null;
  /** M2-15: writes `value` (canonical kg) into the field registered under `fieldId` — a no-op if unregistered or if that field never registered a `setValue`. */
  writeFieldValue: (fieldId: string, value: number) => void;
}

/** Module-scoped, non-reactive registry — see file header. */
const fields = new Map<string, FieldRegistration>();

function compareOrder(a: FieldOrder, b: FieldOrder): number {
  return (
    a.exercisePosition - b.exercisePosition || a.rowIndex - b.rowIndex || a.columnIndex - b.columnIndex
  );
}

export const useKeyboardFocusStore = create<KeyboardFocusState>((set, get) => ({
  focusedFieldId: null,
  focusedIsWeight: false,

  registerField: (fieldId, registration) => {
    fields.set(fieldId, registration);
  },

  unregisterField: (fieldId) => {
    fields.delete(fieldId);
    if (get().focusedFieldId === fieldId) {
      set({ focusedFieldId: null, focusedIsWeight: false });
    }
  },

  handleFocus: (fieldId) => {
    const registration = fields.get(fieldId);
    set({ focusedFieldId: fieldId, focusedIsWeight: registration?.isWeight ?? false });
  },

  handleBlur: (fieldId) => {
    // Guard against a stale blur clobbering focus state that has already
    // moved on to a different field (see file header — `focusNext` calls
    // the *new* field's `.focus()` directly; the old field's own `onBlur`
    // can still fire after that call already updated `focusedFieldId`).
    if (get().focusedFieldId === fieldId) {
      set({ focusedFieldId: null, focusedIsWeight: false });
    }
  },

  focusNext: () => {
    const currentId = get().focusedFieldId;
    if (!currentId) {
      return;
    }
    const current = fields.get(currentId);
    if (!current) {
      return;
    }
    let next: { registration: FieldRegistration } | null = null;
    for (const [fieldId, registration] of fields) {
      if (fieldId === currentId) {
        continue;
      }
      if (compareOrder(registration.order, current.order) <= 0) {
        continue;
      }
      if (!next || compareOrder(registration.order, next.registration.order) < 0) {
        next = { registration };
      }
    }
    next?.registration.focus();
  },

  getFieldValue: (fieldId) => fields.get(fieldId)?.getValue?.() ?? null,

  writeFieldValue: (fieldId, value) => {
    fields.get(fieldId)?.setValue?.(value);
  },
}));

/** Test-only escape hatch — the module-scoped `fields` registry otherwise leaks registrations across test files that never unmount every field they register (e.g. a test asserting on `focusNext` behavior mid-suite). Mirrors the reset-in-`afterEach` convention `restTimerStore.test.ts`/`ExerciseSetTableSection.test.tsx` already use for other module-singleton stores. */
export function __resetKeyboardFocusRegistryForTests(): void {
  fields.clear();
}
