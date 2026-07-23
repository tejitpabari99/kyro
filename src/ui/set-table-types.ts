/**
 * Shared `SetRow`/`SetTable` prop types (M2-06) — kept in their own module
 * so both components import the same shapes without one importing the
 * other's file for a type alone. `SetRowColumnKind`/`SetRowColumn` are a
 * local, ui-layer mirror of `src/domain/set-table-columns.ts`'s
 * `SetColumnKind`/`SetColumnSpec` — **not imported from there** (`src/ui/**`
 * may depend only on its own tokens, 06 §2 dependency rule, lint-enforced);
 * `src/features/workout/`'s wiring maps the domain engine's output into
 * this shape. See `set-table-columns.ts`'s own file header for the full
 * rationale — same "mirror across the boundary" pattern
 * `domain/previous-values.ts`'s `PreviousSetLike` already established.
 */

export type SetRowColumnKind =
  | 'weight'
  | 'weight_added'
  | 'weight_assisted'
  | 'reps'
  | 'time'
  | 'distance'
  | 'short_distance'
  | 'custom'
  | 'rpe';

export interface SetRowColumn {
  /** Stable key, used to key `values`/`placeholders` records and to identify which column changed in `onChangeValue`/`onBlurValue`. */
  key: string;
  kind: SetRowColumnKind;
  /** Uppercase header text, e.g. `'KG'`, `'+KG'`, `'REPS'`, `'TIME'`. */
  label: string;
}
