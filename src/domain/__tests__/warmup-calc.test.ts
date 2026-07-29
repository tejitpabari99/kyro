/**
 * `domain/warmup-calc.ts` tests (M2-16 acceptance gate, 08 §4.3) — one
 * `describe` per named case from that section: default formula @100 kg,
 * the round-half-up boundary (43.75 -> 45), the dumbbell increment path,
 * floor-at-bar-weight, percent-0 (empty bar), custom formulas, and the lb
 * unit path (both `warmupSets` fed lb-shaped numbers directly, and
 * `resolveWarmupRounding`'s own kg->lb conversion).
 */
import { kgToLb } from '../units';
import {
  resolveWarmupRounding,
  warmupSets,
  type WarmupCalcSettingsLike,
  type WarmupFormulaRow,
} from '../warmup-calc';

const DEFAULT_FORMULA: readonly WarmupFormulaRow[] = [
  { percent: 0, reps: 10 },
  { percent: 40, reps: 8 },
  { percent: 60, reps: 5 },
  { percent: 80, reps: 3 },
];

describe('warmupSets — default formula @ 100 kg (08 §4.3)', () => {
  it('produces 20x10 / 40x8 / 60x5 / 80x3 at 2.5 kg rounding, 20 kg bar', () => {
    const rows = warmupSets(100, DEFAULT_FORMULA, { increment: 2.5, barWeight: 20 });
    expect(rows).toEqual([
      { weight: 20, reps: 10 },
      { weight: 40, reps: 8 },
      { weight: 60, reps: 5 },
      { weight: 80, reps: 3 },
    ]);
  });
});

describe('warmupSets — round-half-up boundary (08 §4.3: 43.75 -> 45)', () => {
  it('rounds an exact-half value up to the next 2.5 increment, not down or to-even', () => {
    // 50% of 87.5 = 43.75 exactly — the documented boundary case.
    const [row] = warmupSets(87.5, [{ percent: 50, reps: 5 }], { increment: 2.5 });
    expect(row).toEqual({ weight: 45, reps: 5 });
  });

  it('leaves an already-exact multiple untouched (42.5 stays 42.5)', () => {
    const [row] = warmupSets(85, [{ percent: 50, reps: 5 }], { increment: 2.5 });
    expect(row).toEqual({ weight: 42.5, reps: 5 });
  });

  it('rounds a below-half remainder down (43.7%-style: 43.6 -> 42.5)', () => {
    const [row] = warmupSets(100, [{ percent: 43.6, reps: 5 }], { increment: 2.5 });
    expect(row).toEqual({ weight: 42.5, reps: 5 });
  });
});

describe('warmupSets — dumbbell increment path (08 §4.3)', () => {
  it('rounds to the dumbbell increment with no bar-weight floor', () => {
    // 40% of 24 = 9.6, nearest 2 => 10 (no floor: dumbbells have no fixed bar).
    const rows = warmupSets(24, [{ percent: 40, reps: 8 }], { increment: 2 });
    expect(rows).toEqual([{ weight: 10, reps: 8 }]);
  });

  it('a percent-0 row with no barWeight is a literal 0, not a bar weight (no bar to float to)', () => {
    const rows = warmupSets(24, [{ percent: 0, reps: 10 }], { increment: 2 });
    expect(rows).toEqual([{ weight: 0, reps: 10 }]);
  });
});

describe('warmupSets — floor at bar weight (08 §4.3)', () => {
  it('floors a raw target that rounds below the bar up to the bar weight', () => {
    // 40% of 30 = 12, nearest 2.5 => 12.5, floored to the 20 kg bar.
    const rows = warmupSets(30, [{ percent: 40, reps: 8 }], { increment: 2.5, barWeight: 20 });
    expect(rows).toEqual([{ weight: 20, reps: 8 }]);
  });

  it('does not touch a target already above the bar', () => {
    const rows = warmupSets(100, [{ percent: 80, reps: 3 }], { increment: 2.5, barWeight: 20 });
    expect(rows).toEqual([{ weight: 80, reps: 3 }]);
  });
});

describe('warmupSets — percent 0 = empty bar (08 §4.3)', () => {
  it('uses the bar weight verbatim regardless of the working weight', () => {
    const rows = warmupSets(53, [{ percent: 0, reps: 10 }], { increment: 2.5, barWeight: 20 });
    expect(rows).toEqual([{ weight: 20, reps: 10 }]);
  });

  it('a working weight of 0 still yields the bar, not 0', () => {
    const rows = warmupSets(0, DEFAULT_FORMULA, { increment: 2.5, barWeight: 20 });
    expect(rows[0]).toEqual({ weight: 20, reps: 10 });
  });
});

describe('warmupSets — custom formulas (08 §4.3)', () => {
  it('maps an arbitrary formula array 1:1, in order, ignoring the built-in default entirely', () => {
    const custom: WarmupFormulaRow[] = [
      { percent: 50, reps: 6 },
      { percent: 75, reps: 4 },
      { percent: 90, reps: 2 },
    ];
    const rows = warmupSets(200, custom, { increment: 5, barWeight: 20 });
    expect(rows).toEqual([
      { weight: 100, reps: 6 },
      { weight: 150, reps: 4 },
      { weight: 180, reps: 2 },
    ]);
  });

  it('handles an empty formula (every row removed) as an empty result', () => {
    expect(warmupSets(100, [], { increment: 2.5, barWeight: 20 })).toEqual([]);
  });

  it('handles a single custom row', () => {
    const rows = warmupSets(60, [{ percent: 50, reps: 12 }], { increment: 2.5 });
    expect(rows).toEqual([{ weight: 30, reps: 12 }]);
  });
});

describe('warmupSets — lb unit path (08 §4.3)', () => {
  it('computes entirely in lb when given lb-shaped inputs (illustrative P8 defaults: 5 lb increment, 45 lb bar)', () => {
    const rows = warmupSets(225, DEFAULT_FORMULA, { increment: 5, barWeight: 45 });
    expect(rows).toEqual([
      { weight: 45, reps: 10 },
      { weight: 90, reps: 8 },
      { weight: 135, reps: 5 },
      { weight: 180, reps: 3 },
    ]);
  });

  it('never internally converts kg<->lb mid-calculation — percent math on the same numbers is identical regardless of which "unit" they represent', () => {
    const asKg = warmupSets(100, DEFAULT_FORMULA, { increment: 2.5, barWeight: 20 });
    const asLb = warmupSets(100, DEFAULT_FORMULA, { increment: 2.5, barWeight: 20 });
    expect(asLb).toEqual(asKg);
  });
});

describe('resolveWarmupRounding (08 §4.3 lb unit path + equipment branching)', () => {
  const settings: WarmupCalcSettingsLike = { plate_increment_kg: 2.5, dumbbell_increment_kg: 2 };

  it('kg mode: passes the canonical increments/bar weight straight through for a barbell exercise', () => {
    const rounding = resolveWarmupRounding(settings, {
      equipment: 'barbell',
      weightUnit: 'kg',
      barbellWeightKg: 20,
    });
    expect(rounding).toEqual({ increment: 2.5, barWeight: 20 });
  });

  it('lb mode: converts the plate increment and bar weight via kgToLb for a barbell exercise', () => {
    const rounding = resolveWarmupRounding(settings, {
      equipment: 'barbell',
      weightUnit: 'lbs',
      barbellWeightKg: 20,
    });
    expect(rounding.increment).toBeCloseTo(kgToLb(2.5) as number);
    expect(rounding.barWeight).toBeCloseTo(kgToLb(20) as number);
  });

  it('dumbbell equipment: uses the dumbbell increment and supplies no bar-weight floor', () => {
    const rounding = resolveWarmupRounding(settings, {
      equipment: 'dumbbell',
      weightUnit: 'kg',
      barbellWeightKg: 20,
    });
    expect(rounding).toEqual({ increment: 2 });
  });

  it('dumbbell equipment in lb mode converts the dumbbell increment, still no floor', () => {
    const rounding = resolveWarmupRounding(settings, {
      equipment: 'dumbbell',
      weightUnit: 'lbs',
      barbellWeightKg: 20,
    });
    expect(rounding.increment).toBeCloseTo(kgToLb(2) as number);
    expect(rounding.barWeight).toBeUndefined();
  });

  it('every other equipment value falls back to the plate increment with no floor', () => {
    for (const equipment of ['none', 'machine', 'kettlebell', 'plate', 'resistance_band', 'suspension', 'other'] as const) {
      const rounding = resolveWarmupRounding(settings, {
        equipment,
        weightUnit: 'kg',
        barbellWeightKg: 20,
      });
      expect(rounding).toEqual({ increment: 2.5 });
    }
  });
});
