/**
 * `domain/plate-calc.ts` tests (M2-15 acceptance gate, 08 §4.4) — one
 * `describe` per named case: 102.5/20kg -> [25,15,1.25]/side, exact bar
 * weight, target < bar, limited inventory (counts respected), impossible
 * target (both ≤/≥ suggestions), lb unit path, EZ/short bar paths — plus a
 * handful of structural cases (duplicate-weight inventory merging, fully
 * exhausted inventory) that pin down this module's own documented
 * algorithm choices.
 */
import { platesFor, type PlateInventoryItem } from '../plate-calc';

const DEFAULT_KG_INVENTORY: PlateInventoryItem[] = [
  { weight: 25, count: null },
  { weight: 20, count: null },
  { weight: 15, count: null },
  { weight: 10, count: null },
  { weight: 5, count: null },
  { weight: 2.5, count: null },
  { weight: 1.25, count: null },
];

const DEFAULT_LB_INVENTORY: PlateInventoryItem[] = [
  { weight: 45, count: null },
  { weight: 35, count: null },
  { weight: 25, count: null },
  { weight: 10, count: null },
  { weight: 5, count: null },
  { weight: 2.5, count: null },
];

describe('platesFor — 102.5 kg target on a 20 kg bar, default kg inventory (08 §4.4 named case)', () => {
  it('resolves to [25, 15, 1.25] per side, exact', () => {
    const result = platesFor(102.5, 20, DEFAULT_KG_INVENTORY);
    expect(result.perSide).toEqual([25, 15, 1.25]);
    expect(result.achieved).toBe(102.5);
    expect(result.exact).toBe(true);
    expect(result.lower).toBeNull();
    expect(result.upper).toBeNull();
  });
});

describe('platesFor — exact bar weight target (08 §4.4: "no plates")', () => {
  it('target equal to the bar weight resolves to an empty perSide, exact', () => {
    const result = platesFor(20, 20, DEFAULT_KG_INVENTORY);
    expect(result.perSide).toEqual([]);
    expect(result.achieved).toBe(20);
    expect(result.exact).toBe(true);
  });
});

describe('platesFor — target < bar (08 §4.4: "impossible, suggest bar")', () => {
  it('returns the bar-alone total as the only (upper) suggestion, no lower', () => {
    const result = platesFor(15, 20, DEFAULT_KG_INVENTORY);
    expect(result.exact).toBe(false);
    expect(result.perSide).toEqual([]);
    expect(result.achieved).toBe(20);
    expect(result.lower).toBeNull();
    expect(result.upper).toEqual({ perSide: [], achieved: 20 });
  });
});

describe('platesFor — limited inventory respects per-plate counts, not infinite (08 §4.4)', () => {
  it('a single pair of 25s (count: 2) is not reused as if unlimited', () => {
    // Without the count limit, greedy would happily take two 25s per side
    // (50/side, 110 kg total). With only one pair (count: 2 => 1 usable per
    // side) it must fall back to smaller plates for the rest.
    const inventory: PlateInventoryItem[] = [
      { weight: 25, count: 2 },
      { weight: 10, count: null },
      { weight: 5, count: null },
    ];
    const result = platesFor(120, 20, inventory);
    // perSideTarget = 50; greedy: one 25 (cap reached) -> remaining 25 ->
    // two 10s -> remaining 5 -> one 5 -> remaining 0.
    expect(result.perSide).toEqual([25, 10, 10, 5]);
    expect(result.achieved).toBe(120);
    expect(result.exact).toBe(true);
  });

  it('a fully-exhausted single-pair inventory below the achievable ceiling produces no upper suggestion', () => {
    const inventory: PlateInventoryItem[] = [{ weight: 25, count: 2 }];
    // perSideTarget = 30; the one available 25 fits once (cap 1, reached),
    // remaining 5 with nothing smaller in the inventory and no spare
    // capacity left anywhere -> lower achieved 70, no achievable upper.
    const result = platesFor(80, 20, inventory);
    expect(result.exact).toBe(false);
    expect(result.perSide).toEqual([25]);
    expect(result.achieved).toBe(70);
    expect(result.lower).toEqual({ perSide: [25], achieved: 70 });
    expect(result.upper).toBeNull();
  });
});

describe('platesFor — impossible target returns both nearest ≤ and ≥ suggestions (08 §4.4)', () => {
  it('a single pair of 25s straddling the target on both sides', () => {
    const inventory: PlateInventoryItem[] = [{ weight: 25, count: 2 }];
    // perSideTarget = 10.5; the 25 doesn't fit (cap 1, but 25 > 10.5) ->
    // lower = bar alone (20). Ceiling adds the one spare 25 -> upper = 70.
    const result = platesFor(41, 20, inventory);
    expect(result.exact).toBe(false);
    expect(result.lower).toEqual({ perSide: [], achieved: 20 });
    expect(result.upper).toEqual({ perSide: [25], achieved: 70 });
  });

  it('the ceiling search picks the smallest available overshoot, not just any spare plate', () => {
    const inventory: PlateInventoryItem[] = [
      { weight: 20, count: null },
      { weight: 2.5, count: null },
    ];
    // perSideTarget = 11; greedy: 20 doesn't fit, 2.5 fits four times (10),
    // remaining 1 -> lower = bar(20) + 2*10 = 40. Ceiling: smallest spare
    // plate anywhere is 2.5 (20 also has spare capacity, but 2.5 is
    // smaller and thus the minimal-overshoot choice) -> upper = 40 + 5 = 45.
    const result = platesFor(42, 20, inventory);
    expect(result.exact).toBe(false);
    expect(result.lower).toEqual({ perSide: [2.5, 2.5, 2.5, 2.5], achieved: 40 });
    expect(result.upper).toEqual({ perSide: [2.5, 2.5, 2.5, 2.5, 2.5], achieved: 45 });
  });
});

describe('platesFor — lb unit path (08 §4.4)', () => {
  it('computes entirely in lb when given lb-shaped target/bar/inventory, default lb inventory', () => {
    const result = platesFor(225, 45, DEFAULT_LB_INVENTORY);
    // perSideTarget = 90 -> two 45s.
    expect(result.perSide).toEqual([45, 45]);
    expect(result.achieved).toBe(225);
    expect(result.exact).toBe(true);
  });

  it('an impossible lb target still returns lb-shaped ≤/≥ suggestions', () => {
    const result = platesFor(100, 45, DEFAULT_LB_INVENTORY);
    // perSideTarget = 27.5 -> 25 fits (remaining 2.5) -> 2.5 fits ->
    // remaining 0 -> exact at 100? Let's use a target that doesn't land
    // exactly: 96.
    const inexact = platesFor(96, 45, DEFAULT_LB_INVENTORY);
    expect(inexact.exact).toBe(false);
    expect(inexact.lower).not.toBeNull();
    expect(inexact.upper).not.toBeNull();
    expect(result.exact).toBe(true); // sanity: 100 IS exact with this inventory, kept as a control case.
  });
});

describe('platesFor — EZ bar / short bar paths (08 §4.4)', () => {
  it('EZ bar (7.5 kg): resolves against the default kg inventory', () => {
    const result = platesFor(27.5, 7.5, DEFAULT_KG_INVENTORY);
    expect(result.perSide).toEqual([10]);
    expect(result.achieved).toBe(27.5);
    expect(result.exact).toBe(true);
  });

  it('short bar (10 kg): resolves against the default kg inventory', () => {
    const result = platesFor(30, 10, DEFAULT_KG_INVENTORY);
    expect(result.perSide).toEqual([10]);
    expect(result.achieved).toBe(30);
    expect(result.exact).toBe(true);
  });
});

describe('platesFor — inventory normalization', () => {
  it('merges duplicate-weight entries, summing finite counts', () => {
    const inventory: PlateInventoryItem[] = [
      { weight: 25, count: 2 },
      { weight: 25, count: 2 },
    ];
    // Merged count 4 -> 2 usable per side; perSideTarget 50 needs both.
    const result = platesFor(120, 20, inventory);
    expect(result.perSide).toEqual([25, 25]);
    expect(result.achieved).toBe(120);
    expect(result.exact).toBe(true);
  });

  it('a null count among duplicates makes the merged entry unlimited', () => {
    const inventory: PlateInventoryItem[] = [
      { weight: 25, count: 2 },
      { weight: 25, count: null },
    ];
    const result = platesFor(120, 20, inventory);
    expect(result.perSide).toEqual([25, 25]);
    expect(result.achieved).toBe(120);
    expect(result.exact).toBe(true);
  });

  it('ignores non-positive weight entries', () => {
    const inventory: PlateInventoryItem[] = [
      { weight: 0, count: null },
      { weight: -5, count: null },
      { weight: 10, count: null },
    ];
    const result = platesFor(40, 20, inventory);
    expect(result.perSide).toEqual([10]);
    expect(result.achieved).toBe(40);
  });
});

describe('platesFor — miscellaneous edge cases', () => {
  it('an empty inventory with target above the bar yields no plates and the bar-alone achieved, with an upper of null (no plates to add)', () => {
    const result = platesFor(50, 20, []);
    expect(result.perSide).toEqual([]);
    expect(result.achieved).toBe(20);
    expect(result.exact).toBe(false);
    expect(result.lower).toEqual({ perSide: [], achieved: 20 });
    expect(result.upper).toBeNull();
  });

  it('a target requiring zero plates on a nonzero bar is exact with an empty perSide', () => {
    const result = platesFor(20, 20, DEFAULT_KG_INVENTORY);
    expect(result.perSide).toEqual([]);
    expect(result.exact).toBe(true);
  });
});
