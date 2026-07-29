/**
 * `domain/plate-calc.ts` (M2-15) — 02 §11 / 08 §4.4: the pure plate-loading
 * solver behind the Calculator sheet. No I/O, no unit awareness — `target`,
 * `bar`, and every `inventory[].weight` must already be in the *same* unit
 * (kg or lb, whichever the caller wants the output in); this mirrors
 * `domain/warmup-calc.ts`'s own "unit-oblivious by design" convention (see
 * that file's header) rather than re-deriving the same resolution here.
 * `src/features/workout/PlateCalculatorSheet.tsx` is the one caller that
 * knows about `weight_kg`-canonical settings vs. the user's display unit —
 * it runs this module's math in canonical kg (the plates' real physical
 * unit) and converts only at the input/output boundary (typed target ->
 * kg in, achieved kg -> display unit out), same "storage/math canonical,
 * display-only conversion" rule 05 §5 sets everywhere else.
 *
 * ## Algorithm (02 §11 / this task's own "How", verbatim: "largest-first
 * greedy respecting per-plate counts")
 *
 * `inventory[].count` is a **total** count (both sides of the bar combined,
 * matching how a lifter actually owns plates and how `05` §3.5's
 * `plate_calc.plates[].count` is documented) — `null` means unlimited. Since
 * loading is always symmetric (one plate per side per pair), the max number
 * of a given plate usable *per side* is `floor(count / 2)`. The primary
 * solve (`perSide`/`achieved`) walks the inventory largest-weight-first,
 * greedily taking as many as fit within the remaining per-side budget
 * (`(target - bar) / 2`) without exceeding it and without exceeding that
 * per-side cap — the textbook largest-first change-making greedy, which is
 * optimal for the kind of "each denomination roughly doubles the next"
 * plate sets 02 §11 defaults to (25/20/15/10/5/2.5/1.25 kg,
 * 45/35/25/10/5/2.5 lb) and simple/predictable for arbitrary
 * user-configured inventories, per the task's own explicit algorithm
 * choice (not a from-scratch optimal knapsack search).
 *
 * Because this greedy fill never lets `remaining` go negative, the result
 * it produces can never exceed `target` — it either lands exactly on it
 * (`exact: true`) or undershoots (`exact: false`), and in the undershoot
 * case that same result *is* the nearest achievable total **≤** target
 * (`lower`), so there's no separate search needed for that half of 08
 * §4.4's "nearest ≤ and ≥ suggestions" requirement.
 *
 * The **≥** half (`upper`) is found by taking `lower`'s own plate
 * selection and adding exactly one more plate — the smallest weight
 * anywhere in the inventory that still has spare per-side capacity beyond
 * what `lower` already used. Adding the smallest available increment is
 * what keeps the overshoot minimal; `null` only when literally nothing in
 * the inventory has any spare capacity left (a fully-exhausted limited
 * inventory — 08 §4.4's "limited inventory... counts respected" case can
 * produce this).
 *
 * ## `target < bar` (08 §4.4 named case: "impossible, suggest bar")
 *
 * The bar alone (zero plates) is the minimum *any* solve can ever produce —
 * there's no such thing as negative plates. When `target < bar`, that
 * minimum already exceeds `target`, so nothing is achievable `≤ target` at
 * all (`lower: null`); the bar-alone total is the (only) `upper`
 * suggestion, and is also what `perSide`/`achieved` report (the closest
 * this solver can get).
 */

// ---------------------------------------------------------------------------
// Float-safety helpers
// ---------------------------------------------------------------------------

/** Comparisons below tolerate float noise up to this margin (mirrors 08 §4.1's own "0.001 tolerance" precedent for weight comparisons elsewhere in this codebase). */
const EPS = 1e-6;

/** Rounds off binary-floating-point residue (e.g. `41.25 - 25 - 15` landing on `1.2500000000000004`) — same shape as `domain/units.ts`/`domain/warmup-calc.ts`'s own private `roundToIncrement` float-cleanup step, just without a target increment (this module sums arbitrary plate weights, it doesn't round to one). */
function cleanFloat(value: number): number {
  return Math.round(value * 1e8) / 1e8;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface PlateInventoryItem {
  /** A single plate's weight, in whatever unit `target`/`bar` are also expressed in for this call (unit-oblivious — see file header). Non-positive entries are ignored. */
  weight: number;
  /** Total plates of this weight available (both sides combined) — `null` means unlimited (05 §3.5's `plate_calc.plates[].count` sentinel, mirrored here verbatim). */
  count: number | null;
}

/** One concrete plate-loading outcome: the plates on one side (largest-first) plus the resulting total. */
export interface PlateSolution {
  /** Plate weights making up **one** side of the bar, largest-first. */
  perSide: number[];
  /** Total weight this solution represents: `bar + 2 * sum(perSide)`. */
  achieved: number;
}

export interface PlateCalcResult extends PlateSolution {
  /** `true` when `achieved` matches `target` within float tolerance. */
  exact: boolean;
  /** Nearest achievable total ≤ `target`, populated only when `!exact` (always equal to the top-level `perSide`/`achieved` when present — see file header). `null` only when `target < bar` (nothing achievable is ≤ target at all). */
  lower: PlateSolution | null;
  /** Nearest achievable total ≥ `target`, populated only when `!exact`. `null` only when the inventory has no spare capacity left beyond `lower`. */
  upper: PlateSolution | null;
}

// ---------------------------------------------------------------------------
// Inventory normalization
// ---------------------------------------------------------------------------

interface NormalizedPlate {
  weight: number;
  /** `null` = unlimited. */
  count: number | null;
}

/** Merges duplicate weight entries (summing finite counts; any `null` among duplicates makes the merged entry unlimited) and drops non-positive weights, then sorts largest-first — the one preprocessing pass every solve below shares. */
function normalizeInventory(inventory: readonly PlateInventoryItem[]): NormalizedPlate[] {
  const merged = new Map<number, number | null>();
  for (const item of inventory) {
    if (item.weight <= 0) {
      continue;
    }
    const existing = merged.get(item.weight);
    if (existing === undefined) {
      merged.set(item.weight, item.count);
    } else if (existing === null || item.count === null) {
      merged.set(item.weight, null);
    } else {
      merged.set(item.weight, existing + item.count);
    }
  }
  return [...merged.entries()]
    .map(([weight, count]) => ({ weight, count }))
    .sort((a, b) => b.weight - a.weight);
}

/** `null` (unlimited total) -> effectively-unlimited per-side cap; a finite total count -> `floor(count / 2)` plates usable per side (symmetric loading — see file header). */
function maxPerSide(count: number | null): number {
  return count === null ? Infinity : Math.floor(count / 2);
}

// ---------------------------------------------------------------------------
// Greedy fill (the ≤-target half — see file header)
// ---------------------------------------------------------------------------

interface GreedyFill {
  perSide: number[];
  sumPerSide: number;
  /** How many of each weight the fill used — the "spare capacity" input to {@link ceilFromLower}. */
  used: Map<number, number>;
}

function greedyAtMost(targetPerSide: number, sorted: readonly NormalizedPlate[]): GreedyFill {
  const perSide: number[] = [];
  const used = new Map<number, number>();
  let remaining = targetPerSide;

  for (const plate of sorted) {
    const cap = maxPerSide(plate.count);
    let count = 0;
    while (count < cap && remaining - plate.weight >= -EPS) {
      perSide.push(plate.weight);
      remaining -= plate.weight;
      count++;
    }
    if (count > 0) {
      used.set(plate.weight, count);
    }
  }

  return { perSide, sumPerSide: cleanFloat(perSide.reduce((sum, w) => sum + w, 0)), used };
}

// ---------------------------------------------------------------------------
// Ceiling search (the ≥-target half — see file header)
// ---------------------------------------------------------------------------

interface PerSideResult {
  perSide: number[];
  sumPerSide: number;
}

function ceilFromLower(
  sorted: readonly NormalizedPlate[],
  lowerPerSide: readonly number[],
  used: ReadonlyMap<number, number>,
): PerSideResult | null {
  let smallestSpare: NormalizedPlate | null = null;
  for (const plate of sorted) {
    const cap = maxPerSide(plate.count);
    const usedCount = used.get(plate.weight) ?? 0;
    if (usedCount >= cap) {
      continue;
    }
    if (smallestSpare === null || plate.weight < smallestSpare.weight) {
      smallestSpare = plate;
    }
  }
  if (smallestSpare === null) {
    return null;
  }
  const perSide = [...lowerPerSide, smallestSpare.weight].sort((a, b) => b - a);
  return { perSide, sumPerSide: cleanFloat(perSide.reduce((sum, w) => sum + w, 0)) };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Solves for the closest achievable total load to `target` on a bar
 * weighing `bar`, using `inventory` (per-plate weight + total count, `null`
 * count = unlimited). See file header for the full algorithm/edge-case
 * writeup.
 */
export function platesFor(
  target: number,
  bar: number,
  inventory: readonly PlateInventoryItem[],
): PlateCalcResult {
  const sorted = normalizeInventory(inventory);
  const perSideTarget = (target - bar) / 2;

  if (perSideTarget < -EPS) {
    // target < bar (08 §4.4: "impossible, suggest bar") — see file header.
    const achieved = cleanFloat(bar);
    return {
      perSide: [],
      achieved,
      exact: false,
      lower: null,
      upper: { perSide: [], achieved },
    };
  }

  const { perSide, sumPerSide, used } = greedyAtMost(Math.max(perSideTarget, 0), sorted);
  const achieved = cleanFloat(bar + 2 * sumPerSide);
  const exact = Math.abs(achieved - target) < EPS;

  if (exact) {
    return { perSide, achieved, exact: true, lower: null, upper: null };
  }

  const lower: PlateSolution = { perSide, achieved };
  const ceil = ceilFromLower(sorted, perSide, used);
  const upper: PlateSolution | null =
    ceil === null ? null : { perSide: ceil.perSide, achieved: cleanFloat(bar + 2 * ceil.sumPerSide) };

  return { perSide, achieved, exact: false, lower, upper };
}
