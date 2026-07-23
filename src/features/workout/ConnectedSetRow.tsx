/**
 * `ConnectedSetRow` (M2-06) — the store-connected wrapper around
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
 * Basic check/remove/set-type wiring only (task scope note, M2-06): ✓ calls
 * `setCompleted` directly with no validation/blocking — the full
 * placeholder-commit / required-field-blocking semantics are M2-07's job,
 * layered on top of this same cell later without this file changing shape.
 */
import React, { useMemo, useState } from 'react';

import type { UpdateSetInput } from '@/data/workouts/types';
import { formatCellValue, parseCellValue, type SetCellUnits } from '@/domain/set-cell-values';
import type { SetColumnSpec } from '@/domain/set-table-columns';
import type { PreviousValueResult } from '@/domain/previous-values';
import type { SetType } from '@/domain/enums';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { SetRow, type SetBadgeKind } from '@/ui/SetRow';

import { selectWorkoutSet, useActiveWorkoutStore } from './activeWorkoutStore';

export interface ConnectedSetRowProps {
  setId: string;
  /** Stable per-exercise column list — structurally compatible with `ui/SetRow`'s own `SetRowColumn[]` (same `kind` union values), see `SetRow.tsx`'s file header. */
  columns: SetColumnSpec[];
  badgeKind: SetBadgeKind;
  workingIndex: number | null;
  previousResult: PreviousValueResult;
  units: SetCellUnits;
  testID?: string;
}

/** Human labels for the set-type menu sheet (02 §4). */
const SET_TYPE_MENU: { type: SetType; label: string }[] = [
  { type: 'warmup', label: 'Warm Up Set' },
  { type: 'normal', label: 'Normal Set' },
  { type: 'failure', label: 'Failure Set' },
  { type: 'dropset', label: 'Drop Set' },
];

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
  testID,
}: ConnectedSetRowProps): React.JSX.Element | null {
  const set = useActiveWorkoutStore(selectWorkoutSet(setId));
  const [menuVisible, setMenuVisible] = useState(false);
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
    void useActiveWorkoutStore.getState().setCompleted(setId, !set.isCompleted);
  };

  const handleSelectSetType = (type: SetType): void => {
    setMenuVisible(false);
    void useActiveWorkoutStore.getState().setSetType(setId, type);
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
        onPreviousPress={handlePreviousPress}
        onSetCellPress={() => setMenuVisible(true)}
        onToggleCompleted={handleToggleCompleted}
        onDelete={handleDelete}
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
    </>
  );
}

/** See file header — memoized so 06 §8's per-row isolation actually holds. */
export const ConnectedSetRow = React.memo(ConnectedSetRowImpl);
