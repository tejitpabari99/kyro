/**
 * `domain/warmup-calc.ts` (M2-16) — 02 §12 / 00 P8 / 08 §4.3: the pure
 * warm-up-set formula engine. No I/O — every input is a plain value
 * already resolved to the unit the caller wants the *output* in; the
 * feature layer (`src/features/workout/AddWarmUpSetsSheet.tsx`) owns
 * reading `warmup_calc` settings, the exercise's `equipment`, and the
 * user's `weight_unit` preference, and handing this module already-decided
 * numbers via {@link resolveWarmupRounding}.
 *
 * ## Formula (02 §12, decision P8, verbatim)
 *
 * An ordered list of `{percent, reps}` rows. Default: bar × 10 (`percent:
 * 0` — "0% = empty bar"), 40% × 8, 60% × 5, 80% × 3. The default formula
 * itself lives as data in `src/data/settings/settings-schema.ts`'s
 * `DEFAULT_WARMUP_CALC` (M0-10, already shipped) — this module doesn't
 * duplicate that constant, it just consumes whatever formula array it's
 * handed (the default, or a user-customized one; "custom formulas" per 08
 * §4.3 is exactly this — `warmupSets` has no notion of "the default", it
 * treats every formula array identically).
 *
 * For each formula row: the *raw* target weight is `workingWeight *
 * (percent / 100)`, **except** `percent === 0` when a `barWeight` floor is
 * supplied — 02 §12's "0% = empty bar" reads literally as "use the bar's
 * own weight", not "0% of the working weight rounds up to the bar anyway"
 * (those usually coincide once the floor below applies, but not always —
 * e.g. a working weight of `0` would otherwise produce a `0` bar row).
 *
 * ## Rounding: round-half-up (08 §4.3's named boundary case)
 *
 * 08 §4.3 flags a genuine ambiguity in "round to nearest increment" at the
 * exact halfway point and resolves it explicitly: "43.75 -> 45" at a 2.5
 * increment (round **up**, not banker's/round-half-to-even, which would
 * also land on 45 here by coincidence since 18 is even — but 43.75 is
 * *not* ambiguous under half-up, only under half-to-even would the tie
 * ever need a coin flip, and the doc explicitly names "up" as the rule).
 * `Math.round(x)` already implements exactly this for every non-negative
 * `x` — it rounds `.5` toward `+Infinity`, which for a positive value *is*
 * "up" — so `Math.round(value / increment) * increment` is round-half-up
 * with no extra branching needed. Every weight this module ever rounds is
 * `>= 0` (a working weight, a percent of one, or a bar weight), so that
 * property always applies; documented here rather than re-derived at each
 * call site. See {@link roundToIncrement}'s own comment for the matching
 * float-residue cleanup (mirrors `domain/units.ts`'s identical helper).
 *
 * ## Floor at bar weight (barbell only)
 *
 * "floor at bar weight for barbell exercises" (02 §12): when
 * {@link WarmupCalcRoundingOptions.barWeight} is supplied, no row's
 * *rounded* output may fall below it — `Math.max(rounded, barWeight)`,
 * applied **after** rounding (a light working weight can produce a raw
 * percent target below the bar's own weight; the lifter obviously can't
 * warm up with less than an empty bar). Omitting `barWeight` (dumbbell/
 * machine/kettlebell/etc., 08 §4.3's "dumbbell increment path") skips the
 * floor entirely — there's no fixed minimum load for those.
 *
 * ## Unit handling — pure, unit-oblivious by design
 *
 * `warmupSets` itself never touches kg/lb: `workingWeight`, `rounding
 * .increment`, and `rounding.barWeight` must already be in whatever unit
 * the caller wants the output rows in (percent math is unit-invariant —
 * 40% of a value is 40% of it whether that value is kg or lb — so there is
 * nothing for this function to convert). {@link resolveWarmupRounding}
 * below is the one piece that *does* know about units: given the
 * kg-canonical `warmup_calc` settings (`plate_increment_kg`/
 * `dumbbell_increment_kg` — 05 §3.5's fields, always stored in kg
 * regardless of display-unit preference, per that file's own "display-only
 * conversion happens ... (future milestone)" note) plus the exercise's
 * `equipment` and the user's current `weight_unit`, it produces the
 * already-resolved `{increment, barWeight?}` this function wants. In `lb`
 * mode that means converting the stored kg increment/bar-weight via
 * `domain/units.ts`'s raw `kgToLb` (never a separate, disconnected "5 lb"
 * literal) — the settings schema exposes exactly one canonical value per
 * increment, so a user who edits it sees that edit reflected in *both*
 * unit displays, converted, rather than two independently-editable
 * numbers the schema has no field for. This is 08 §4.3's "lb unit path"
 * named case: {@link resolveWarmupRounding}'s own unit tests exercise the
 * conversion directly, and a `warmupSets` call using illustrative
 * lb-shaped numbers (e.g. a 5 lb increment / 45 lb bar, matching 00 P8's
 * prose defaults) exercises the math path end to end.
 */
import type { Equipment, WeightUnit } from './enums';
import { kgToLb } from './units';

// ---------------------------------------------------------------------------
// Formula engine
// ---------------------------------------------------------------------------

/** One row of a warm-up formula — 05 §3.5's `warmup_calc.sets[]` shape (`{percent, reps}`), mirrored here rather than imported (`src/domain` never depends on `src/data`, 06 §2). */
export interface WarmupFormulaRow {
  /** 0-100. `0` means "the empty bar" when {@link WarmupCalcRoundingOptions.barWeight} is supplied. */
  percent: number;
  reps: number;
}

/** Already unit-resolved rounding inputs — see file header. */
export interface WarmupCalcRoundingOptions {
  /** Rounding increment, in the same unit as `workingWeight`. Must be `> 0`. */
  increment: number;
  /** Minimum output weight (barbell exercises only) — omit for equipment with no fixed bar/frame weight. Same unit as `workingWeight`. */
  barWeight?: number;
}

/** One generated warm-up row — a weight + rep target, same unit `workingWeight` was given in. */
export interface WarmupSetRow {
  weight: number;
  reps: number;
}

/**
 * Rounds `value` to the nearest multiple of `increment` (round-half-up —
 * see file header), then trims binary-floating-point residue back to a
 * clean decimal — identical shape to `domain/units.ts`'s own
 * `roundToIncrement` (not imported/reused from there since that one is a
 * module-private helper, not part of that file's public surface; keeping a
 * second copy here avoids adding a new cross-file coupling for four lines
 * of arithmetic).
 */
function roundToIncrement(value: number, increment: number): number {
  const rounded = Math.round(value / increment) * increment;
  return Math.round(rounded * 1e8) / 1e8;
}

/**
 * Pure warm-up formula engine (02 §12 / 08 §4.3): `workingWeight` + an
 * ordered `formula` -> one generated row per formula entry, in the same
 * order. See file header for the exact percent/rounding/floor rules.
 */
export function warmupSets(
  workingWeight: number,
  formula: readonly WarmupFormulaRow[],
  rounding: WarmupCalcRoundingOptions,
): WarmupSetRow[] {
  return formula.map((row) => {
    const raw =
      row.percent === 0 && rounding.barWeight !== undefined
        ? rounding.barWeight
        : workingWeight * (row.percent / 100);
    const rounded = roundToIncrement(raw, rounding.increment);
    const floored = rounding.barWeight !== undefined ? Math.max(rounded, rounding.barWeight) : rounded;
    return { weight: floored, reps: row.reps };
  });
}

// ---------------------------------------------------------------------------
// Settings -> rounding-options resolution (the one unit-aware piece)
// ---------------------------------------------------------------------------

/** The subset of `src/data/settings/settings-schema.ts`'s `WarmupCalcSettings` this module needs — mirrored, not imported (06 §2). */
export interface WarmupCalcSettingsLike {
  plate_increment_kg: number;
  dumbbell_increment_kg: number;
}

export interface ResolveWarmupRoundingOptions {
  /** The exercise's own `equipment` (`src/domain/enums.ts`) — `'dumbbell'` selects the dumbbell increment; `'barbell'` additionally supplies the bar-weight floor. Every other value uses the plate increment with no floor. */
  equipment: Equipment;
  /** The display unit to resolve into — `warmupSets`'s `workingWeight`/output are expected in this same unit. */
  weightUnit: WeightUnit;
  /** The barbell's canonical kg weight (e.g. `settings.plate_calc.bars` — default 20 kg) — only consulted when `equipment === 'barbell'`. */
  barbellWeightKg: number;
}

/**
 * Resolves `settings.warmup_calc`'s canonical-kg increments (+ the
 * barbell's own kg weight) into the unit-matched `{increment, barWeight?}`
 * `warmupSets` wants — the one place kg/lb conversion happens in this
 * module (see file header's "Unit handling" section for why `lb` mode
 * converts rather than using a disconnected literal).
 */
export function resolveWarmupRounding(
  settings: WarmupCalcSettingsLike,
  opts: ResolveWarmupRoundingOptions,
): WarmupCalcRoundingOptions {
  const incrementKg =
    opts.equipment === 'dumbbell' ? settings.dumbbell_increment_kg : settings.plate_increment_kg;
  const increment = opts.weightUnit === 'kg' ? incrementKg : (kgToLb(incrementKg) as number);

  if (opts.equipment !== 'barbell') {
    return { increment };
  }

  const barWeight =
    opts.weightUnit === 'kg' ? opts.barbellWeightKg : (kgToLb(opts.barbellWeightKg) as number);
  return { increment, barWeight };
}
