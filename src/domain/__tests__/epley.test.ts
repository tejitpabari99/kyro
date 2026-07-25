/**
 * `domain/epley.ts` tests (M4-01, 00 P5) — the formula in isolation
 * (bounds, `reps === 1` short-circuit, worked numeric values). Its use as
 * part of the Best Est. 1RM *record* — weight-0/null exclusion,
 * eligibility, tolerance — is `records.test.ts`'s concern (file header of
 * both modules), not re-tested here.
 */
import { epley1RM } from '../epley';

describe('domain/epley — epley1RM (00 P5: 1RM = w × (1 + reps/30), 1 ≤ reps ≤ 10)', () => {
  it('reps=1 returns the weight itself, verbatim (P5: "reps = 1 uses actual weight")', () => {
    expect(epley1RM(100, 1)).toBe(100);
    expect(epley1RM(72.5, 1)).toBe(72.5);
  });

  it('reps=5 matches the worked example (08 §4.1 case 1): 100 × (1 + 5/30) = 116.666...', () => {
    expect(epley1RM(100, 5)).toBeCloseTo(116.6666666667, 9);
  });

  it('reps=10 (upper bound): weight × 1.333... (08 §4.1 case 5)', () => {
    expect(epley1RM(100, 10)).toBeCloseTo(100 * (4 / 3), 9);
  });

  it('reps=0 is out of range → null (not a divide-by-zero or a bare weight)', () => {
    expect(epley1RM(100, 0)).toBeNull();
  });

  it('reps=11 is out of range → null (08 §4.1 case 5: "excluded from 1RM")', () => {
    expect(epley1RM(100, 11)).toBeNull();
  });

  it('reps=-1 (defensively out of range) → null', () => {
    expect(epley1RM(100, -1)).toBeNull();
  });

  it('weight=0 still computes (0) — this function does not apply the "weight 0 excluded from records" eligibility rule, that is records.ts’s concern', () => {
    expect(epley1RM(0, 5)).toBe(0);
    expect(epley1RM(0, 1)).toBe(0);
  });

  it('a fractional weight (e.g. plate-math result) computes without rounding', () => {
    expect(epley1RM(62.5, 3)).toBeCloseTo(62.5 * (1 + 3 / 30), 9);
  });
});
