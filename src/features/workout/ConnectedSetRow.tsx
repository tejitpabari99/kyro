/**
 * `ConnectedSetRow` (M2-06/M2-07, rest timer wired in M2-10) — the
 * store-connected wrapper around
 * `src/ui/SetRow`: this is the component that actually subscribes to
 * `activeWorkoutStore`'s per-set selector (`selectWorkoutSet(setId)`, 06
 * §8), owns the local "typed-but-not-committed" text buffer (06 §5.3:
 * commit on blur), and translates between canonical `WorkoutSet` fields and
 * `ui/SetRow`'s generic per-column text values via
 * `domain/set-cell-values.ts`. See `src/ui/SetRow.tsx`'s file header for the
 * full rationale on why the per-row store subscription lives at *this*
 * layer rather than inside the `src/ui` component itself (the "ui may
 * depend only on tokens" boundary, 06 §2).
 *
 * `React.memo`-wrapped for the same reason `ui/SetRow` is: as long as the
 * parent (`ExerciseSetTableSection`) passes this component referentially
 * stable `columns`/`workingIndex`/`previousResult`/`units` props (recomputed
 * only when the exercise's *structure* changes, not on every keystroke —
 * see that file), typing in one row's own subscribed `WorkoutSet` slice is
 * the *only* thing that can make its own instance re-render; sibling rows
 * never do (06 §8's "typing in one row doesn't re-render others").
 *
 * ## Check/uncheck semantics (M2-07, 02 §4 / `00` P6)
 *
 * `handleToggleCompleted` is the one place both directions live:
 *  - **Check** (`!set.isCompleted`): builds the check-commit decision via
 *    the pure `domain/set-check.ts` engine, fed canonical (never
 *    display-text-round-tripped) typed/placeholder values per column —
 *    typed values come from this row's own `values` buffer parsed through
 *    `parseCellValue`; placeholder values come straight from
 *    `previousResult.autofill` via `readCanonical`, the same canonical
 *    source `handlePreviousPress` below already uses (so a rep-range
 *    target, whose `autofill.reps` `previous-values.ts` already nulls, is
 *    correctly treated as "no placeholder" here too — no separate
 *    rep-range flag needed, see `set-check.ts`'s own header). RPE is never
 *    part of this — it's optional for every type and written only through
 *    the RPE picker sheet below.
 *    - Blocked: `notificationWarning` haptic + a `shakeSignal` bump (drives
 *      `SetRow`'s 300 ms row shake, 07 §8) — no store write at all.
 *    - Committed: `updateSet` (the resolved patch) then `setCompleted(true)`
 *      — same fire-and-forget `void`-call pattern every other mutator in
 *      this file already uses (the store's own `set()` call inside
 *      `updateSet` runs synchronously before its first `await`, so by the
 *      time `setCompleted` reads `get()` the optimistic patch is already
 *      applied — ordering is safe without awaiting either call). Then:
 *      `impactLight` haptic; volume/checked-set counters update for free
 *      (`ActiveWorkoutScreen`'s meta row derives them live from
 *      `workout.exercises`, no separate counter action to call). Then
 *      (M2-10): `shouldStartRestTimer` decides whether to start this
 *      exercise's rest timer (`restTimerStore.start`) — Off setting or a
 *      next-row-same-exercise dropset suppress it. The remaining two
 *      success-path items are still **hook points for a later milestone
 *      that doesn't exist yet** — clearly TODO-labeled no-op call sites:
 *      sound (M2-11's `src/lib/sound.ts`), live-PR check (M4-10's records
 *      provider, no-op until then per the M2 task notes), smart-superset
 *      scroll (M2-12).
 *  - **Uncheck** (`set.isCompleted` already `true`): `restTimerStore
 *    .cancelForSet(setId)` (M2-10 — no-op unless the running timer, if
 *    any, was started by *this* set) then `setCompleted(false)` — counters
 *    reverse for free (same live-derivation as above).
 *
 * ## Keyboard flow (M2-08, 02 §4 / 06 §8)
 *
 * `fieldRefs` registers each value cell's `NumericInput` with
 * `keyboardFocusStore`'s Next-traversal registry — memoized (deps: the
 * stable `columns` reference plus the row's own identity/position) so a
 * keystroke's re-render never re-triggers React's ref detach/reattach
 * cycle (which would otherwise thrash `registerField`/`unregisterField` on
 * every character typed). `handleFocusValue`/`handleBlurValue` mirror focus
 * state into the store; `exercisePosition` (the exercise's own
 * `workoutExercise.position`, threaded down from `ActiveWorkoutScreen`) is
 * what makes traversal order survive an exercise reorder even though
 * mount order doesn't (see `keyboardFocusStore.ts`'s own header). The
 * inline-timer button (Settings → Inline Timer, `settings.inline_timer`,
 * read live here rather than threaded as a prop — same "settings read at
 * call time" convention M2-10's rest-timer hook already established)
 * opens `DurationTimerSheet` for whichever TIME column was tapped; its
 * `onCommit` writes the elapsed seconds through the exact same
 * values-buffer + `updateSet` path `handlePreviousPress` already uses.
 */
import React, { useMemo, useState } from 'react';
import type { TextInput } from 'react-native';

import type { UpdateSetInput } from '@/data/workouts/types';
import { formatCellValue, parseCellValue, type SetCellUnits } from '@/domain/set-cell-values';
import { evaluateSetCheck, type SetCheckColumnInput } from '@/domain/set-check';
import type { SetColumnSpec } from '@/domain/set-table-columns';
import type { PreviousValueResult } from '@/domain/previous-values';
import { RPE_VALUES, type ExerciseType, type Rpe, type SetType } from '@/domain/enums';
import { useSettingsStore } from '@/features/settings/settings-store';
import { triggerImpact, triggerNotificationFeedback } from '@/lib/haptics';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { SetRow, type SetBadgeKind } from '@/ui/SetRow';

import { selectWorkoutSet, useActiveWorkoutStore } from './activeWorkoutStore';
import { DurationTimerSheet } from './DurationTimerSheet';
import { KEYBOARD_ACCESSORY_VIEW_ID, useKeyboardFocusStore } from './keyboardFocusStore';
import { shouldStartRestTimer, useRestTimerStore } from './restTimerStore';

export interface ConnectedSetRowProps {
  setId: string;
  /** Stable per-exercise column list — structurally compatible with `ui/SetRow`'s own `SetRowColumn[]` (same `kind` union values), see `SetRow.tsx`'s file header. */
  columns: SetColumnSpec[];
  badgeKind: SetBadgeKind;
  workingIndex: number | null;
  previousResult: PreviousValueResult;
  units: SetCellUnits;
  /** Drives `domain/set-check.ts`'s per-type required-field rules (02 §4). */
  exerciseType: ExerciseType;
  /** The library exercise id (`exercise.id`, not the workout-local `workoutExerciseId`) — `restTimerStore`'s own `exerciseId` field (M2-10). */
  exerciseId: string;
  /** `workoutExercise.position` — this exercise's own stable position within the workout (M2-08's Next-traversal order key; survives reorders unlike render/mount order, see `keyboardFocusStore.ts`'s header). */
  exercisePosition: number;
  /** For the rest-timer notification body, "Rest over — set N of {exercise}" (M2-10, 06 §6.2). */
  exerciseName: string;
  /** This workout-exercise's own rest-timer duration (`workoutExercise.restSeconds`) — `null`/`<= 0` means the timer is Off (02 §7, M2-10). */
  restSeconds: number | null;
  /** The *next* row's set type within this same exercise (`null` when this is the exercise's last row) — a `dropset` next row suppresses the rest-timer start (02 §7, M2-10). */
  nextSetType: SetType | null;
  /** 1-based position of this row within its exercise's set list (all types) — the "N" in the rest-timer notification body (M2-10). */
  setNumber: number;
  testID?: string;
}

/** Human labels for the set-type menu sheet (02 §4). */
const SET_TYPE_MENU: { type: SetType; label: string }[] = [
  { type: 'warmup', label: 'Warm Up Set' },
  { type: 'normal', label: 'Normal Set' },
  { type: 'failure', label: 'Failure Set' },
  { type: 'dropset', label: 'Drop Set' },
];

/** Column keys the check-commit engine ever evaluates — every `SetColumnSpec.key` except `'rpe'` (see `domain/set-check.ts`'s header). */
const CHECK_COLUMN_KEYS = new Set<SetColumnSpec['key']>(['weight', 'reps', 'distance', 'duration', 'custom']);

/** Column kinds the M2-08 Calculator-button seam treats as "a weight field" (02 §4: "when a weight field is focused"). */
function isWeightColumnKind(kind: SetColumnSpec['kind']): boolean {
  return kind === 'weight' || kind === 'weight_added' || kind === 'weight_assisted';
}

/** 02 §5: helper text for each of the 8 enum RPE values; the `.5` steps are the doc's own "interpolate" instruction made concrete. */
const RPE_HELPER_TEXT: Record<Rpe, string> = {
  6: '4+ reps left',
  7: '3 reps left',
  7.5: '2–3 reps left',
  8: '2 reps left',
  8.5: '1–2 reps left',
  9: '1 rep left',
  9.5: '0–1 reps left',
  10: 'Max effort',
};

/** Exported for direct exhaustiveness-guard testing — same rationale/pattern `domain/set-table-columns.ts`'s own `columnsForExerciseType` exhaustiveness test uses (cast an unrecognized key past the closed `SetColumnSpec['key']` union to exercise the `default` arm a real caller can never reach). */
export function readCanonical(set: { weightKg: number | null; reps: number | null; distanceMeters: number | null; durationSeconds: number | null; customMetric: number | null; rpe: number | null }, columnKey: string): number | null {
  switch (columnKey) {
    case 'weight':
      return set.weightKg;
    case 'reps':
      return set.reps;
    case 'distance':
      return set.distanceMeters;
    case 'duration':
      return set.durationSeconds;
    case 'custom':
      return set.customMetric;
    case 'rpe':
      return set.rpe;
    default:
      return null;
  }
}

/** Exported for direct exhaustiveness-guard testing — see {@link readCanonical}'s header note. */
export function writeCanonical(patch: UpdateSetInput, columnKey: string, value: number | null): void {
  switch (columnKey) {
    case 'weight':
      patch.weightKg = value;
      break;
    case 'reps':
      patch.reps = value;
      break;
    case 'distance':
      patch.distanceMeters = value;
      break;
    case 'duration':
      patch.durationSeconds = value;
      break;
    case 'custom':
      patch.customMetric = value;
      break;
    case 'rpe':
      // `Rpe` is a numeric-literal subset of `number` (05 §2.5); this path
      // is only ever reached with `value === null` today (PREVIOUS autofill
      // never carries an rpe value, and nothing else writes this column
      // yet — the RPE picker is M2-07's job), so the cast never actually
      // smuggles an invalid literal through in current call sites.
      patch.rpe = value as UpdateSetInput['rpe'];
      break;
    default:
      break;
  }
}

function seedValues(
  set: { weightKg: number | null; reps: number | null; distanceMeters: number | null; durationSeconds: number | null; customMetric: number | null; rpe: number | null },
  columns: SetColumnSpec[],
  units: SetCellUnits,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const column of columns) {
    out[column.key] = formatCellValue(column.kind, readCanonical(set, column.key), units);
  }
  return out;
}

function ConnectedSetRowImpl({
  setId,
  columns,
  badgeKind,
  workingIndex,
  previousResult,
  units,
  exerciseType,
  exerciseId,
  exercisePosition,
  exerciseName,
  restSeconds,
  nextSetType,
  setNumber,
  testID,
}: ConnectedSetRowProps): React.JSX.Element | null {
  const set = useActiveWorkoutStore(selectWorkoutSet(setId));
  const inlineTimerEnabled = useSettingsStore((state) => state.settings.inline_timer);
  const [menuVisible, setMenuVisible] = useState(false);
  const [rpeSheetVisible, setRpeSheetVisible] = useState(false);
  const [durationTimerColumnKey, setDurationTimerColumnKey] = useState<string | null>(null);
  // Bumped on every blocked check attempt — `SetRow`'s `shakeSignal` prop
  // reads this to replay the 300 ms row shake (07 §8); the value itself
  // carries no meaning beyond "changed."
  const [shakeSignal, setShakeSignal] = useState(0);
  const [values, setValues] = useState<Record<string, string>>(() =>
    set ? seedValues(set, columns, units) : {},
  );

  // Re-seed from the canonical set whenever *this row's own* set reference
  // changes (post-commit reconciliation, PREVIOUS autofill, set-type
  // change) — never on a sibling's edit, since `set` only changes identity
  // when this exact set mutates (activeWorkoutStore's structural sharing).
  // Mid-render state adjustment (the established pattern in this codebase
  // for "derive state from a prop/subscription change" —
  // `ExerciseMedia.tsx`/`MultiSelectOptionSheet.tsx`) rather than a
  // `useEffect`: calling `setState` unconditionally inside an effect body
  // triggers an extra render-then-immediately-re-render cascade every
  // commit, flagged by this repo's `react-hooks/set-state-in-effect` rule.
  const [lastSet, setLastSet] = useState(set);
  const [lastColumns, setLastColumns] = useState(columns);
  const [lastUnits, setLastUnits] = useState(units);
  if (set !== lastSet || columns !== lastColumns || units !== lastUnits) {
    setLastSet(set);
    setLastColumns(columns);
    setLastUnits(units);
    if (set) {
      setValues(seedValues(set, columns, units));
    }
  }

  const placeholders = useMemo(() => {
    const out: Record<string, string> = {};
    if (!previousResult.autofill) {
      return out;
    }
    const autofill = previousResult.autofill;
    for (const column of columns) {
      const canonical = readCanonical(
        {
          weightKg: autofill.weightKg,
          reps: autofill.reps,
          distanceMeters: autofill.distanceMeters,
          durationSeconds: autofill.durationSeconds,
          customMetric: autofill.customMetric,
          rpe: null,
        },
        column.key,
      );
      out[column.key] = formatCellValue(column.kind, canonical, units);
    }
    return out;
  }, [columns, previousResult.autofill, units]);

  // M2-08 Next-traversal registry — see file header. `inputColumns` (RPE
  // excluded, matching "RPE never registers at all" — its cell is a
  // `Pressable`, not a `NumericInput`) is its own `useMemo` purely so the
  // `fieldRefs` map below only rebuilds when `columns` itself actually
  // changes (structurally stable across keystrokes, per
  // `ExerciseSetTableSection`'s own memoization), never on every render.
  const inputColumns = useMemo(() => columns.filter((c) => c.kind !== 'rpe'), [columns]);
  const fieldRefs = useMemo(() => {
    const map: Record<string, (instance: TextInput | null) => void> = {};
    inputColumns.forEach((column, columnIndex) => {
      const columnFieldId = `${setId}:${column.key}`;
      map[column.key] = (instance) => {
        if (instance) {
          useKeyboardFocusStore.getState().registerField(columnFieldId, {
            focus: () => instance.focus(),
            order: { exercisePosition, rowIndex: setNumber - 1, columnIndex },
            isWeight: isWeightColumnKind(column.kind),
          });
        } else {
          useKeyboardFocusStore.getState().unregisterField(columnFieldId);
        }
      };
    });
    return map;
  }, [inputColumns, setId, exercisePosition, setNumber]);

  if (!set) {
    return null;
  }

  const handleChangeValue = (columnKey: string, text: string): void => {
    const column = columns.find((c) => c.key === columnKey);
    if (!column) {
      return;
    }
    // TIME columns re-format to "m:ss" on every keystroke (digit-fill
    // parsing, 02 §4 / M1-02) — every other kind just holds the raw typed
    // text until blur.
    if (column.kind === 'time') {
      const seconds = parseCellValue('time', text, units);
      setValues((prev) => ({ ...prev, [columnKey]: seconds === null ? '' : (formatCellValue('time', seconds, units)) }));
      return;
    }
    setValues((prev) => ({ ...prev, [columnKey]: text }));
  };

  const handleBlurValue = (columnKey: string): void => {
    const column = columns.find((c) => c.key === columnKey);
    if (!column) {
      return;
    }
    const canonical = parseCellValue(column.kind, values[columnKey] ?? '', units);
    const patch: UpdateSetInput = {};
    writeCanonical(patch, columnKey, canonical);
    void useActiveWorkoutStore.getState().updateSet(setId, patch);
    // M2-08: a real blur (as opposed to `focusNext` calling the *next*
    // field's `.focus()`, whose resulting blur on this one arrives after
    // the store already recorded the new field as focused) clears this
    // field's own focus tracking — `handleBlur`'s own guard (see
    // `keyboardFocusStore.ts`) no-ops if focus already moved elsewhere.
    useKeyboardFocusStore.getState().handleBlur(`${setId}:${columnKey}`);
  };

  const handleFocusValue = (columnKey: string): void => {
    useKeyboardFocusStore.getState().handleFocus(`${setId}:${columnKey}`);
  };

  const handleDurationTimerPress = (columnKey: string): void => {
    setDurationTimerColumnKey(columnKey);
  };

  const handleDurationTimerDismiss = (): void => {
    setDurationTimerColumnKey(null);
  };

  /**
   * 02 §4: "stop writes the elapsed seconds into the field" — same
   * values-buffer-then-`updateSet` shape `handlePreviousPress` below
   * already uses, scoped to just the one TIME column the sheet was opened
   * for. Non-null assertions rather than defensive early-returns: this
   * callback only ever runs as `DurationTimerSheet`'s `onCommit`, which is
   * only reachable while that sheet is visible — and it's only ever
   * `visible={durationTimerColumnKey != null}` below — so
   * `durationTimerColumnKey` is guaranteed set. `handleDurationTimerPress`
   * (the only place that ever writes it) is only ever called by `SetRow`'s
   * `onDurationTimerPress` with a `column.key` sourced from this row's own
   * `columns` prop, so the `columns.find` below is guaranteed to resolve
   * too. Same "genuinely unreachable through the real UI" reasoning
   * `domain/text-links.ts`'s own coverage note documents, applied here
   * instead of padding this file with an untestable branch.
   */
  const handleDurationTimerCommit = (seconds: number): void => {
    const columnKey = durationTimerColumnKey!;
    const column = columns.find((c) => c.key === columnKey)!;
    setValues((prev) => ({ ...prev, [columnKey]: formatCellValue(column.kind, seconds, units) }));
    const patch: UpdateSetInput = {};
    writeCanonical(patch, columnKey, seconds);
    void useActiveWorkoutStore.getState().updateSet(setId, patch);
  };

  const handlePreviousPress = (): void => {
    if (!previousResult.autofill) {
      return;
    }
    const autofill = previousResult.autofill;
    const patch: UpdateSetInput = {};
    const nextValues: Record<string, string> = { ...values };
    for (const column of columns) {
      const canonical = readCanonical(
        {
          weightKg: autofill.weightKg,
          reps: autofill.reps,
          distanceMeters: autofill.distanceMeters,
          durationSeconds: autofill.durationSeconds,
          customMetric: autofill.customMetric,
          rpe: null,
        },
        column.key,
      );
      if (canonical === null) {
        continue;
      }
      nextValues[column.key] = formatCellValue(column.kind, canonical, units);
      writeCanonical(patch, column.key, canonical);
    }
    setValues(nextValues);
    void useActiveWorkoutStore.getState().updateSet(setId, patch);
  };

  const handleToggleCompleted = (): void => {
    if (set.isCompleted) {
      // Uncheck (02 §4: "allowed anytime before finish; reverses counters
      // and cancels a running rest timer only if that timer was started by
      // this set"). Volume/checked-set counters are derived live from
      // `isCompleted` (`ActiveWorkoutScreen`'s meta row) — flipping this
      // flag back reverses them for free, no separate counter action.
      // M2-10: cancel *this set's own* rest timer only — `cancelForSet` is
      // a no-op if the currently running timer (if any) belongs to a
      // different set, matching "cancels its own timer only."
      void useRestTimerStore.getState().cancelForSet(setId);
      void useActiveWorkoutStore.getState().setCompleted(setId, false);
      return;
    }

    // Check: run the pure check-commit decision (`domain/set-check.ts`)
    // over every value column (never 'rpe' — optional for every type,
    // written only via the RPE picker). Placeholder values come from the
    // same canonical `previousResult.autofill` source `handlePreviousPress`
    // above uses — never a display-text round trip — so a rep-range
    // target's already-nulled `autofill.reps` (04 §2.3) naturally falls
    // through to "no placeholder," never auto-committing a range.
    const autofill = previousResult.autofill;
    const checkColumns: SetCheckColumnInput[] = columns
      .filter((column) => CHECK_COLUMN_KEYS.has(column.key))
      .map((column) => ({
        key: column.key as SetCheckColumnInput['key'],
        typedValue: parseCellValue(column.kind, values[column.key] ?? '', units),
        placeholderValue: autofill
          ? readCanonical(
              {
                weightKg: autofill.weightKg,
                reps: autofill.reps,
                distanceMeters: autofill.distanceMeters,
                durationSeconds: autofill.durationSeconds,
                customMetric: autofill.customMetric,
                rpe: null,
              },
              column.key,
            )
          : null,
      }));

    const result = evaluateSetCheck(exerciseType, checkColumns);

    if (!result.ok) {
      // 02 §4 / 07 §8: blocked check → row shake (300 ms) + notificationWarning haptic. No store write.
      setShakeSignal((n) => n + 1);
      triggerNotificationFeedback('warning');
      return;
    }

    const patch: UpdateSetInput = {};
    for (const [key, value] of Object.entries(result.values)) {
      writeCanonical(patch, key, value ?? null);
    }
    // Fire-and-forget, same pattern every other mutator in this file uses:
    // `updateSet`'s own optimistic `set()` call runs synchronously before
    // its first `await`, so `setCompleted` below reads the already-patched
    // draft via `get()` even without awaiting `updateSet` first.
    void useActiveWorkoutStore.getState().updateSet(setId, patch);
    void useActiveWorkoutStore.getState().setCompleted(setId, true);

    // 02 §4 / 07 §8: successful check → impactLight haptic. Counters
    // (volume/checked-set count) update for free, same live-derivation as
    // uncheck above.
    triggerImpact('light');
    // TODO(M2-11): play the set-check chime once `src/lib/sound.ts` exists
    // (Settings → Sounds' set-check volume) — no-op today, this is the hook
    // point M2-11 wires up.
    // M2-10: start this exercise's rest timer unless the timer setting is
    // Off or the next row (same exercise, next index) is a drop set (02 §7).
    if (shouldStartRestTimer({ restSeconds, nextSetType })) {
      const { rest_notifications_enabled: notificationsEnabled, sounds } =
        useSettingsStore.getState().settings;
      void useRestTimerStore.getState().start({
        exerciseId,
        setId,
        // `shouldStartRestTimer` above already guarantees `restSeconds` is
        // a positive number on this branch; the `?? 0` is just a type-level
        // fallback TS can't narrow across the function-call boundary.
        durationSeconds: restSeconds ?? 0,
        exerciseName,
        setNumber,
        notificationsEnabled,
        soundChoice: sounds.timer_sound,
        volume: sounds.timer_volume,
      });
    }
    // TODO(M4-10): run the live-PR check against this newly-committed set
    // and surface a PR banner — the records provider is intentionally a
    // no-op until M4-10 (per the M2 task notes), so there is nothing to
    // wire yet.
    // TODO(M2-12): if this exercise is in a superset and Smart Superset
    // Scrolling is on, scroll to the next member with sets remaining —
    // supersets don't exist until M2-12; no-op today.
  };

  const handleSelectSetType = (type: SetType): void => {
    setMenuVisible(false);
    void useActiveWorkoutStore.getState().setSetType(setId, type);
  };

  const handleRpePress = (): void => {
    setRpeSheetVisible(true);
  };

  const handleSelectRpe = (value: Rpe): void => {
    setRpeSheetVisible(false);
    const patch: UpdateSetInput = {};
    writeCanonical(patch, 'rpe', value);
    void useActiveWorkoutStore.getState().updateSet(setId, patch);
  };

  const handleClearRpe = (): void => {
    setRpeSheetVisible(false);
    const patch: UpdateSetInput = {};
    writeCanonical(patch, 'rpe', null);
    void useActiveWorkoutStore.getState().updateSet(setId, patch);
  };

  const handleRemove = (): void => {
    setMenuVisible(false);
    void useActiveWorkoutStore.getState().removeSet(setId);
  };

  const handleDelete = (): void => {
    void useActiveWorkoutStore.getState().removeSet(setId);
  };

  return (
    <>
      <SetRow
        testID={testID}
        columns={columns}
        badgeKind={badgeKind}
        workingIndex={workingIndex}
        values={values}
        placeholders={placeholders}
        previousLabel={previousResult.label}
        isCompleted={set.isCompleted}
        onChangeValue={handleChangeValue}
        onBlurValue={handleBlurValue}
        onFocusValue={handleFocusValue}
        onPreviousPress={handlePreviousPress}
        onSetCellPress={() => setMenuVisible(true)}
        onToggleCompleted={handleToggleCompleted}
        onRpePress={handleRpePress}
        onDelete={handleDelete}
        shakeSignal={shakeSignal}
        fieldRefs={fieldRefs}
        inputAccessoryViewID={KEYBOARD_ACCESSORY_VIEW_ID}
        inlineTimerEnabled={inlineTimerEnabled}
        onDurationTimerPress={handleDurationTimerPress}
      />
      <DurationTimerSheet
        testID={testID ? `${testID}-duration-timer-sheet` : undefined}
        visible={durationTimerColumnKey != null}
        onDismiss={handleDurationTimerDismiss}
        onCommit={handleDurationTimerCommit}
      />
      <Sheet
        visible={menuVisible}
        onDismiss={() => setMenuVisible(false)}
        testID={testID ? `${testID}-set-type-sheet` : undefined}
      >
        {SET_TYPE_MENU.map((item) => (
          <ListRow
            key={item.type}
            testID={testID ? `${testID}-set-type-${item.type}` : undefined}
            title={item.label}
            onPress={() => handleSelectSetType(item.type)}
          />
        ))}
        <ListRow
          testID={testID ? `${testID}-set-type-remove` : undefined}
          title="Remove Set"
          hideSeparator
          onPress={handleRemove}
        />
      </Sheet>
      <Sheet
        visible={rpeSheetVisible}
        onDismiss={() => setRpeSheetVisible(false)}
        testID={testID ? `${testID}-rpe-sheet` : undefined}
      >
        {RPE_VALUES.map((value) => (
          <ListRow
            key={value}
            testID={testID ? `${testID}-rpe-${value}` : undefined}
            title={String(value)}
            subtitle={RPE_HELPER_TEXT[value]}
            onPress={() => handleSelectRpe(value)}
          />
        ))}
        <ListRow
          testID={testID ? `${testID}-rpe-clear` : undefined}
          title="Clear"
          hideSeparator
          onPress={handleClearRpe}
        />
      </Sheet>
    </>
  );
}

/** See file header — memoized so 06 §8's per-row isolation actually holds. */
export const ConnectedSetRow = React.memo(ConnectedSetRowImpl);
