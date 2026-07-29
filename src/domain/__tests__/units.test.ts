/**
 * `domain/units.ts` unit tests (M1-02) — 08 §4.5's exact named cases:
 * kg<->lb round-trip stability, display rounding rules (05 §5), mm:ss
 * parse cases ("130" -> 90 s, bare "90" -> 90 s / 1:30 normalize), miles/km
 * and cm/in conversions, and 0-and-null passthrough for every exported
 * function.
 */
import {
  cmToIn,
  feetToM,
  formatDistanceFeet,
  formatDistanceKm,
  formatDistanceMiles,
  formatDuration,
  formatLengthIn,
  formatWeightLb,
  inToCm,
  kgToLb,
  kmToM,
  lbToKg,
  mToFeet,
  mToKm,
  mToMiles,
  milesToM,
  parseTimeInput,
} from '../units';

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) — deterministic across runs so the round-trip
// property test below is reproducible, per the task's "write this as a
// property-style test using a seeded RNG for reproducibility" instruction.
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EPSILON = 1e-6;

describe('kg <-> lb round-trip stability (08 §4.5)', () => {
  it('100 random values x 3 round trips (kg -> lb -> kg -> ...) stay within epsilon of the original', () => {
    const rand = mulberry32(20260723); // fixed seed, reproducible
    for (let i = 0; i < 100; i++) {
      // Random plausible weight in kg, 0.1 .. 500.1
      const original = rand() * 500 + 0.1;
      let value = original;
      for (let round = 0; round < 3; round++) {
        const lb = kgToLb(value) as number;
        value = lbToKg(lb) as number;
      }
      expect(Math.abs(value - original)).toBeLessThan(EPSILON);
    }
  });

  it('100 random values x 3 round trips (lb -> kg -> lb -> ...) stay within epsilon of the original', () => {
    const rand = mulberry32(19700101);
    for (let i = 0; i < 100; i++) {
      const original = rand() * 1100 + 0.1;
      let value = original;
      for (let round = 0; round < 3; round++) {
        const kg = lbToKg(value) as number;
        value = kgToLb(kg) as number;
      }
      expect(Math.abs(value - original)).toBeLessThan(EPSILON);
    }
  });

  it('raw kgToLb uses the exact 05 §5 factor, full precision (no display rounding)', () => {
    expect(kgToLb(1)).toBeCloseTo(2.2046226218, 10);
    expect(kgToLb(100)).toBeCloseTo(220.46226218, 8);
  });

  it('raw lbToKg is the exact inverse of the factor', () => {
    expect(lbToKg(2.2046226218)).toBeCloseTo(1, 10);
  });
});

describe('display rounding rules (05 §5)', () => {
  it('formatWeightLb rounds to nearest 0.5 lb at/above 10 lb converted', () => {
    // 100 kg -> 220.46226218 lb -> nearest 0.5 -> 220.5
    expect(formatWeightLb(100)).toBe(220.5);
    // exactly 10 lb boundary: 10 lb = 4.5359237 kg -> stays >= 10 -> 0.5 increment
    const tenLbInKg = lbToKg(10) as number;
    expect(formatWeightLb(tenLbInKg)).toBe(10);
  });

  it('formatWeightLb rounds to nearest 0.1 lb below 10 lb converted', () => {
    // 2 kg -> 4.4092452436 lb -> nearest 0.1 -> 4.4
    expect(formatWeightLb(2)).toBe(4.4);
    // just under the 10 lb threshold
    const justUnder = lbToKg(9.94) as number;
    expect(formatWeightLb(justUnder)).toBe(9.9);
  });

  it('formatDistanceKm/Miles round to 2 decimals', () => {
    // 5000 m -> 5.00 km, 3.10685596... miles -> 3.11
    expect(formatDistanceKm(5000)).toBe(5);
    expect(formatDistanceMiles(5000)).toBe(3.11);
  });

  it('formatDistanceFeet rounds to a whole number', () => {
    // 10 m -> 32.8084 ft -> 33
    expect(formatDistanceFeet(10)).toBe(33);
  });

  it('formatLengthIn rounds to 1 decimal', () => {
    // 180 cm -> 70.8661... in -> 70.9
    expect(formatLengthIn(180)).toBe(70.9);
  });
});

describe('miles/km conversions match 05 §5 formulas exactly', () => {
  it('mToMiles = m / 1609.344', () => {
    expect(mToMiles(1609.344)).toBeCloseTo(1, 10);
    expect(mToMiles(16093.44)).toBeCloseTo(10, 9);
  });

  it('milesToM is the exact inverse', () => {
    expect(milesToM(1)).toBeCloseTo(1609.344, 6);
  });

  it('mToKm = m / 1000, kmToM is the exact inverse', () => {
    expect(mToKm(2500)).toBe(2.5);
    expect(kmToM(2.5)).toBe(2500);
  });

  it('mToFeet = m x 3.28084, feetToM is the exact inverse', () => {
    expect(mToFeet(1)).toBeCloseTo(3.28084, 10);
    expect(feetToM(3.28084)).toBeCloseTo(1, 10);
  });
});

describe('cm/in conversions match 05 §5 formulas exactly', () => {
  it('cmToIn = cm / 2.54', () => {
    expect(cmToIn(2.54)).toBeCloseTo(1, 10);
    expect(cmToIn(180)).toBeCloseTo(70.86614173228346, 10);
  });

  it('inToCm is the exact inverse', () => {
    expect(inToCm(1)).toBeCloseTo(2.54, 10);
  });
});

describe('duration formatting (05 §5)', () => {
  it('formats under 1 h as mm:ss, unpadded minutes', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(90)).toBe('1:30');
    expect(formatDuration(3599)).toBe('59:59');
  });

  it('formats at/above 1 h as h:mm:ss, unpadded hours', () => {
    expect(formatDuration(3600)).toBe('1:00:00');
    expect(formatDuration(3661)).toBe('1:01:01');
    expect(formatDuration(7325)).toBe('2:02:05');
  });

  it('formats a negative duration with a leading sign on the magnitude (defensive, not expected in practice)', () => {
    expect(formatDuration(-90)).toBe('-1:30');
  });
});

describe('mm:ss digit-fill parsing (02 §4 / 08 §4.5)', () => {
  it('"130" -> 90 s (1 min 30 sec)', () => {
    expect(parseTimeInput('130')).toBe(90);
  });

  it('bare "90" normalizes to 90 s (displays as 1:30) — same value as "130"', () => {
    expect(parseTimeInput('90')).toBe(90);
    expect(formatDuration(parseTimeInput('90'))).toBe('1:30');
  });

  it('single digit fills seconds only', () => {
    expect(parseTimeInput('5')).toBe(5);
  });

  it('two digits fill seconds only, even >= 60 (matches the bare-normalize case)', () => {
    expect(parseTimeInput('95')).toBe(95);
    expect(formatDuration(parseTimeInput('95'))).toBe('1:35');
  });

  it('more than 4 digits keep filling into minutes without a cap', () => {
    // "1230" -> 12 min 30 sec = 750 s
    expect(parseTimeInput('1230')).toBe(750);
  });

  it('strips non-digit characters before parsing', () => {
    expect(parseTimeInput('1:30')).toBe(90);
  });

  it('empty string (buffer typed into but empty) parses to 0', () => {
    expect(parseTimeInput('')).toBe(0);
  });

  it('"0" parses to 0', () => {
    expect(parseTimeInput('0')).toBe(0);
  });
});

describe('0 and null passthrough for every exported function', () => {
  it('null in -> null out', () => {
    expect(kgToLb(null)).toBeNull();
    expect(lbToKg(null)).toBeNull();
    expect(formatWeightLb(null)).toBeNull();
    expect(mToKm(null)).toBeNull();
    expect(kmToM(null)).toBeNull();
    expect(mToMiles(null)).toBeNull();
    expect(milesToM(null)).toBeNull();
    expect(mToFeet(null)).toBeNull();
    expect(feetToM(null)).toBeNull();
    expect(formatDistanceKm(null)).toBeNull();
    expect(formatDistanceMiles(null)).toBeNull();
    expect(formatDistanceFeet(null)).toBeNull();
    expect(cmToIn(null)).toBeNull();
    expect(inToCm(null)).toBeNull();
    expect(formatLengthIn(null)).toBeNull();
    expect(formatDuration(null)).toBeNull();
    expect(parseTimeInput(null)).toBeNull();
  });

  it('0 in -> a real computed 0-ish value out (never NaN, never coerced to null)', () => {
    expect(kgToLb(0)).toBe(0);
    expect(lbToKg(0)).toBe(0);
    expect(formatWeightLb(0)).toBe(0);
    expect(mToKm(0)).toBe(0);
    expect(kmToM(0)).toBe(0);
    expect(mToMiles(0)).toBe(0);
    expect(milesToM(0)).toBe(0);
    expect(mToFeet(0)).toBe(0);
    expect(feetToM(0)).toBe(0);
    expect(formatDistanceKm(0)).toBe(0);
    expect(formatDistanceMiles(0)).toBe(0);
    expect(formatDistanceFeet(0)).toBe(0);
    expect(cmToIn(0)).toBe(0);
    expect(inToCm(0)).toBe(0);
    expect(formatLengthIn(0)).toBe(0);
    expect(formatDuration(0)).toBe('0:00');
    expect(parseTimeInput('0')).toBe(0);

    for (const value of [
      kgToLb(0),
      lbToKg(0),
      formatWeightLb(0),
      mToKm(0),
      kmToM(0),
      mToMiles(0),
      milesToM(0),
      mToFeet(0),
      feetToM(0),
      formatDistanceKm(0),
      formatDistanceMiles(0),
      formatDistanceFeet(0),
      cmToIn(0),
      inToCm(0),
      formatLengthIn(0),
      parseTimeInput('0'),
    ]) {
      expect(Number.isNaN(value)).toBe(false);
    }
  });
});
