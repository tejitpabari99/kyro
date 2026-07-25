/**
 * `domain/epley.ts` (M4-01) — 00 P5 / 04 §5.1: the Epley estimated-1RM
 * formula, isolated from `domain/records.ts` so it stays a single-purpose,
 * trivially-verifiable unit (bounds included) that `records.ts` — and any
 * future caller needing a raw estimate outside the PR-eligibility pipeline
 * (e.g. a "what if" calculator) — can import without pulling in the whole
 * records engine.
 *
 * `1RM = weight × (1 + reps/30)`, valid only for `1 ≤ reps ≤ 10` (P5); `reps
 * === 1` short-circuits to `weight` itself rather than going through the
 * formula — algebraically `weight × (1 + 1/30)` would already be `weight` to
 * within float noise, but P5 spells the `reps === 1` case out explicitly
 * ("reps = 1 uses actual weight"), so this returns the input verbatim there
 * rather than relying on the formula to coincidentally land on it.
 *
 * Out-of-range `reps` (`0`, negative, `11+`) returns `null` — 08 §4.1 case 5:
 * "reps=11 → excluded from 1RM (but counts for volume/reps records)." This
 * function only answers "what's the estimate," not "is this set eligible
 * for the Best Est. 1RM *record*" (weight `0`/`null` exclusion, non-warm-up,
 * checked-only, etc. are `records.ts`'s eligibility concerns, 04 §5.3) — so
 * a `weightKg` of `0` still computes (`0`), it's simply never a useful
 * record value; `records.ts` filters that case out before ever calling this.
 */
export function epley1RM(weightKg: number, reps: number): number | null {
  if (reps < 1 || reps > 10) {
    return null;
  }
  if (reps === 1) {
    return weightKg;
  }
  return weightKg * (1 + reps / 30);
}
