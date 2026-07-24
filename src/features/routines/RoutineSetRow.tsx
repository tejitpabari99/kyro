/**
 * `RoutineSetRow` (M3-04) — the routine editor's own connected wrapper
 * around `src/ui/SetRow`, in **target mode** (see that file's header for
 * the full design). This is the routine-editor analogue of
 * `src/features/workout/ConnectedSetRow.tsx` — same split (`ui/SetRow` stays
 * dumb/presentation-only, this layer owns the local "typed-but-not-
 * committed" text buffer + canonical<->display translation via
 * `domain/set-cell-values.ts`) — but subscribed to nothing: there is no
 * store here. `RoutineEditorScreen.tsx` owns the whole draft as plain React
 * state (see that file's header for why), and every mutation this row makes
 * is a callback prop closing over `(draftExerciseId, draftSetId)`, supplied
 * by `RoutineExerciseCard.tsx`. That's the one load-bearing difference from
 * `ConnectedSetRow`: there, `updateSet`/`setCompleted`/etc. reach a Zustand
 * store directly via `useActiveWorkoutStore.getState()`; here, every write
 * goes back up through props, because the source of truth (`RoutineDraft`)
 * lives in the screen's own `useState`, not a store this file could import.
 *
 * ## No ✓, no stopwatch, no autofill-commit (04 §2.1)
 *
 * `SetRow`'s `targetMode` prop already omits the ✓ cell by construction —
 * this file simply never wires `isCompleted`/`onToggleCompleted`
 * (`isCompleted` is always `false`, inert since target mode never renders
 * that cell). No stopwatch: `inlineTimerEnabled`/`onDurationTimerPress` are
 * never passed at all (both optional on `SetRow`, default off). No
 * autofill-commit: `onPreviousPress` is never wired either — target mode's
 * PREVIOUS is `SetRow`'s own always-static-in-target-mode rendering, so
 * there's no press handler to give it in the first place.
 *
 * ## Reps vs. rep-range (04 §2.1, `routine-draft.ts`'s own header)
 *
 * When `set.rangeMode` is `false`, the REPS column round-trips through
 * `set.reps` exactly like any other numeric column. When `true`, `SetRow`
 * renders two inputs under the synthetic `` `${column.key}_from` ``/
 * `` `${column.key}_to` `` keys (its own header explains why synthetic keys
 * rather than a parallel prop surface) — this file maps those two keys to
 * `onSetRepRange('start' | 'end', ...)` instead of the generic
 * `onSetReps`. Toggling itself (`onToggleRepRange`, fired by `SetRow`'s
 * long-press, and the exercise-wide header tap `RoutineExerciseCard`
 * forwards from `SetTable`) is the caller's job — this row only ever reads
 * `set.rangeMode`, never writes it.
 *
 * ## No `React.memo` per-keystroke isolation claim
 *
 * This file is still `React.memo`-wrapped and `RoutineExerciseCard.tsx`
 * still computes `columns`/`badgeKind`/`previousResult` off a structural
 * signature (not on every draft change) — the same shape `ConnectedSetRow`/
 * `ExerciseSetTableSection` established — so sibling rows don't re-render on
 * an unrelated row's keystroke. Unlike the live logger, this isn't chasing a
 * hard 06 §8 requirement (no such perf budget is specified for the editor in
 * 04 §2.1); it's simply the established pattern for "a table of per-row
 * text-buffered cells" in this codebase, reused because it's already the
 * right shape, not because the editor is provably safety-critical against
 * typing latency the way the live logger is.
 */
import React, { useMemo, useState } from 'react';

import type { SetColumnSpec } from '@/domain/set-table-columns';
import { formatCellValue, parseCellValue, type SetCellUnits } from '@/domain/set-cell-values';
import type { PreviousValueResult } from '@/domain/previous-values';
import type { SetType } from '@/domain/enums';
import { ListRow } from '@/ui/ListRow';
import { Sheet } from '@/ui/Sheet';
import { SetRow, type SetBadgeKind } from '@/ui/SetRow';

import type { DraftSet } from './routine-draft';

export interface RoutineSetRowProps {
  set: DraftSet;
  /** Stable per-exercise column list — RPE is never included (`RoutineSet` has no `rpe` field, `RoutineExerciseCard.tsx`'s own column-building comment explains why it's force-excluded regardless of the RPE-tracking setting). */
  columns: SetColumnSpec[];
  badgeKind: SetBadgeKind;
  workingIndex: number | null;
  previousResult: PreviousValueResult;
  units: SetCellUnits;
  onSetType: (setType: SetType) => void;
  onUpdateTarget: (
    patch: Partial<Pick<DraftSet, 'weightKg' | 'distanceMeters' | 'durationSeconds' | 'customMetric'>>,
  ) => void;
  onSetReps: (reps: number | null) => void;
  onSetRepRange: (bound: 'start' | 'end', value: number | null) => void;
  onToggleRepRange: () => void;
  onDelete: () => void;
  testID?: string;
}

/** Human labels for the set-type menu sheet (02 §4, same as `ConnectedSetRow`'s own `SET_TYPE_MENU`) — targets allow every set type (04 §2.1: "warm-up/normal/failure/dropset targets allowed"). */
const SET_TYPE_MENU: { type: SetType; label: string }[] = [
  { type: 'warmup', label: 'Warm Up Set' },
  { type: 'normal', label: 'Normal Set' },
  { type: 'failure', label: 'Failure Set' },
  { type: 'dropset', label: 'Drop Set' },
];

function readCanonical(set: DraftSet, columnKey: string): number | null {
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
    default:
      return null;
  }
}

function seedValues(set: DraftSet, columns: SetColumnSpec[], units: SetCellUnits): Record<string, string> {
  const out: Record<string, string> = {};
  for (const column of columns) {
    if (column.kind === 'reps' && set.rangeMode) {
      out[`${column.key}_from`] = formatCellValue('reps', set.repRangeStart, units);
      out[`${column.key}_to`] = formatCellValue('reps', set.repRangeEnd, units);
      continue;
    }
    out[column.key] = formatCellValue(column.kind, readCanonical(set, column.key), units);
  }
  return out;
}

function RoutineSetRowImpl({
  set,
  columns,
  badgeKind,
  workingIndex,
  previousResult,
  units,
  onSetType,
  onUpdateTarget,
  onSetReps,
  onSetRepRange,
  onToggleRepRange,
  onDelete,
  testID,
}: RoutineSetRowProps): React.JSX.Element {
  const [menuVisible, setMenuVisible] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => seedValues(set, columns, units));

  // Re-seed whenever this row's own `set`/`columns`/`units` reference
  // changes — mid-render state adjustment, same established pattern
  // `ConnectedSetRow.tsx` uses (its header cites `ExerciseMedia.tsx`/
  // `MultiSelectOptionSheet.tsx` as the precedent) rather than a
  // `useEffect`, to avoid the extra render-then-re-render cascade this
  // repo's `react-hooks/set-state-in-effect` rule flags.
  const [lastSet, setLastSet] = useState(set);
  const [lastColumns, setLastColumns] = useState(columns);
  const [lastUnits, setLastUnits] = useState(units);
  if (set !== lastSet || columns !== lastColumns || units !== lastUnits) {
    setLastSet(set);
    setLastColumns(columns);
    setLastUnits(units);
    setValues(seedValues(set, columns, units));
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
          ...set,
          weightKg: autofill.weightKg,
          reps: autofill.reps,
          distanceMeters: autofill.distanceMeters,
          durationSeconds: autofill.durationSeconds,
          customMetric: autofill.customMetric,
        },
        column.key,
      );
      out[column.key] = formatCellValue(column.kind, canonical, units);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `set` is only spread for its non-value fields (id/setType/rangeMode), never read for its own values here; `previousResult.autofill`/`columns`/`units` are the real deps.
  }, [columns, previousResult.autofill, units]);

  const handleChangeValue = (columnKey: string, text: string): void => {
    setValues((prev) => ({ ...prev, [columnKey]: text }));
  };

  const repsColumn = columns.find((c) => c.kind === 'reps');

  const handleBlurValue = (columnKey: string): void => {
    if (repsColumn && columnKey === `${repsColumn.key}_from`) {
      onSetRepRange('start', parseCellValue('reps', values[columnKey] ?? '', units));
      return;
    }
    if (repsColumn && columnKey === `${repsColumn.key}_to`) {
      onSetRepRange('end', parseCellValue('reps', values[columnKey] ?? '', units));
      return;
    }
    const column = columns.find((c) => c.key === columnKey);
    if (!column) {
      return;
    }
    const canonical = parseCellValue(column.kind, values[columnKey] ?? '', units);
    if (column.kind === 'reps') {
      onSetReps(canonical);
      return;
    }
    onUpdateTarget({
      ...(column.key === 'weight' ? { weightKg: canonical } : {}),
      ...(column.key === 'distance' ? { distanceMeters: canonical } : {}),
      ...(column.key === 'duration' ? { durationSeconds: canonical } : {}),
      ...(column.key === 'custom' ? { customMetric: canonical } : {}),
    });
  };

  const handleSelectSetType = (type: SetType): void => {
    setMenuVisible(false);
    onSetType(type);
  };

  const handleRemove = (): void => {
    setMenuVisible(false);
    onDelete();
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
        isCompleted={false}
        targetMode
        repRangeMode={set.rangeMode}
        onToggleRepRange={onToggleRepRange}
        onChangeValue={handleChangeValue}
        onBlurValue={handleBlurValue}
        onSetCellPress={() => setMenuVisible(true)}
        onDelete={onDelete}
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

/** See file header — memoized for the same "structural props only change when the exercise's structure changes" reasoning `ConnectedSetRow`/`SetRow` already document. */
export const RoutineSetRow = React.memo(RoutineSetRowImpl);
