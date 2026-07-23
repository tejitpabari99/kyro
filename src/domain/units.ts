/**
 * `domain/units.ts` (M1-02) — 05 §5: the single conversion module used at
 * every display/input boundary. Storage is always canonical (kg / meters /
 * seconds / cm); this module never touches storage — it only converts
 * canonical <-> display units and formats/parses display-facing strings.
 *
 * Pure TS, zero React/React Native/Expo imports (06 §2 dependency rule,
 * enforced by `eslint.config.js`'s `src/domain/**` zone — see M1-01's
 * `enums.ts` header for the same note).
 *
 * ## API design: raw conversion vs. display rounding (deliberate split)
 *
 * 05 §5's "no drift rule" says conversions happen only at the display/input
 * boundary and storage stays full precision. That means two genuinely
 * different operations hide behind "kg to lb":
 *
 *  1. A **raw, full-precision, round-trip-safe** conversion — used e.g. when
 *     converting a *typed* lb value back to canonical kg for storage, or
 *     internally by the display formatter below. `kgToLb` / `lbToKg` and
 *     friends (`mToKm`, `kmToM`, `mToMiles`, `milesToM`, `mToFeet`,
 *     `feetToM`, `cmToIn`, `inToCm`) are this tier — no rounding, so
 *     round-tripping kg -> lb -> kg -> lb -> ... never drifts beyond float
 *     epsilon.
 *  2. A **display-rounded** value — used when rendering a canonical value
 *     to the user, per 05 §5's per-field rounding rule (e.g. weight in lb
 *     rounds to the nearest 0.5 lb at/above 10 lb, else nearest 0.1 lb).
 *     These are named `format*` (`formatWeightLb`, `formatDistanceKm`,
 *     `formatDistanceMiles`, `formatDistanceFeet`, `formatLengthIn`) and
 *     each composes the matching raw conversion + a rounding step. They
 *     return a `number` (the rounded display value), not a string — string
 *     presentation (adding a unit suffix, locale formatting, etc.) is a UI
 *     concern layered on top by the caller.
 *
 * This mirrors the task's own suggested shape ("kgToLb(kg) returns full
 * precision, formatWeightLb(kg) returns the display-rounded value") and
 * keeps every caller's intent explicit at the call site: reach for the raw
 * function when the result feeds back into a round-trip or another
 * calculation, reach for `format*` only at the final render step.
 *
 * `formatDuration` and `parseTimeInput` are the odd ones out — durations
 * don't have a "raw vs. rounded" split (seconds are already the canonical,
 * exact unit and mm:ss/h:mm:ss is purely a string representation), so they
 * are single functions. See `parseTimeInput`'s doc comment for the mm:ss
 * parse-vs-normalize resolution (08 §4.5 / TASKS-INDEX.md item 6).
 *
 * ## 0-and-null passthrough
 *
 * Every exported function accepts `number | null` (or `string | null` for
 * `parseTimeInput`) and returns the same nullish-ness: `null` in -> `null`
 * out, always via an explicit `=== null` check (never a falsy check, which
 * would mistreat `0`). `0` in -> a real computed `0`-ish value out (never
 * short-circuited to `null` or `NaN`).
 */

// ---------------------------------------------------------------------------
// Rounding helpers (internal)
// ---------------------------------------------------------------------------

/**
 * Rounds `value` to the nearest multiple of `increment`, then trims the
 * inevitable binary-floating-point residue (e.g. `0.1 + 0.2`-style noise)
 * back to a clean decimal so display values never show
 * `72.60000000000001`-style artifacts.
 */
function roundToIncrement(value: number, increment: number): number {
  const rounded = Math.round(value / increment) * increment;
  // Clean up float residue without hard-coding a decimal-place count: 1e8
  // is comfortably beyond any precision these display values ever need.
  return Math.round(rounded * 1e8) / 1e8;
}

function round2(value: number): number {
  return roundToIncrement(value, 0.01);
}

// ---------------------------------------------------------------------------
// Weight: kg <-> lb (05 §5)
// ---------------------------------------------------------------------------

/** kg -> lb conversion factor, exact per 05 §5. */
const KG_TO_LB_FACTOR = 2.2046226218;

/** Raw, full-precision kg -> lb. Storage-safe; no display rounding. */
export function kgToLb(kg: number | null): number | null {
  if (kg === null) return null;
  return kg * KG_TO_LB_FACTOR;
}

/** Raw, full-precision lb -> kg (exact inverse of `kgToLb`). Storage-safe. */
export function lbToKg(lb: number | null): number | null {
  if (lb === null) return null;
  return lb / KG_TO_LB_FACTOR;
}

/**
 * Display-rounded weight in lb, from a canonical kg value. 05 §5: nearest
 * 0.5 lb for weights >= 10 lb, else nearest 0.1 lb. The threshold is
 * evaluated on the *converted lb magnitude*, per the doc's literal wording
 * ("nearest 0.5 lb for weights >= 10 lb").
 */
export function formatWeightLb(kg: number | null): number | null {
  if (kg === null) return null;
  const lb = kgToLb(kg) as number;
  const increment = Math.abs(lb) >= 10 ? 0.5 : 0.1;
  return roundToIncrement(lb, increment);
}

// ---------------------------------------------------------------------------
// Distance: m <-> km / miles / feet (05 §5)
// ---------------------------------------------------------------------------

/** m -> miles conversion divisor, exact per 05 §5. */
const METERS_PER_MILE = 1609.344;

/** m -> feet conversion factor, exact per 05 §5. */
const M_TO_FEET_FACTOR = 3.28084;

/** Raw, full-precision m -> km. Storage-safe; no display rounding. */
export function mToKm(m: number | null): number | null {
  if (m === null) return null;
  return m / 1000;
}

/** Raw, full-precision km -> m (exact inverse of `mToKm`). Storage-safe. */
export function kmToM(km: number | null): number | null {
  if (km === null) return null;
  return km * 1000;
}

/** Raw, full-precision m -> miles. Storage-safe; no display rounding. */
export function mToMiles(m: number | null): number | null {
  if (m === null) return null;
  return m / METERS_PER_MILE;
}

/** Raw, full-precision miles -> m (exact inverse of `mToMiles`). Storage-safe. */
export function milesToM(miles: number | null): number | null {
  if (miles === null) return null;
  return miles * METERS_PER_MILE;
}

/** Raw, full-precision m -> feet. Storage-safe; no display rounding. */
export function mToFeet(m: number | null): number | null {
  if (m === null) return null;
  return m * M_TO_FEET_FACTOR;
}

/** Raw, full-precision feet -> m (exact inverse of `mToFeet`). Storage-safe. */
export function feetToM(feet: number | null): number | null {
  if (feet === null) return null;
  return feet / M_TO_FEET_FACTOR;
}

/** Display-rounded distance in km, from a canonical meters value. 2 decimals (05 §5). */
export function formatDistanceKm(m: number | null): number | null {
  if (m === null) return null;
  return round2(mToKm(m) as number);
}

/** Display-rounded distance in miles, from a canonical meters value. 2 decimals (05 §5). */
export function formatDistanceMiles(m: number | null): number | null {
  if (m === null) return null;
  return round2(mToMiles(m) as number);
}

/** Display-rounded short distance in feet, from a canonical meters value. Whole number (05 §5). */
export function formatDistanceFeet(m: number | null): number | null {
  if (m === null) return null;
  return Math.round(mToFeet(m) as number);
}

// ---------------------------------------------------------------------------
// Length (body measurements): cm <-> in (05 §5)
// ---------------------------------------------------------------------------

/** cm -> in conversion divisor, exact per 05 §5. */
const CM_PER_IN = 2.54;

/** Raw, full-precision cm -> in. Storage-safe; no display rounding. */
export function cmToIn(cm: number | null): number | null {
  if (cm === null) return null;
  return cm / CM_PER_IN;
}

/** Raw, full-precision in -> cm (exact inverse of `cmToIn`). Storage-safe. */
export function inToCm(inches: number | null): number | null {
  if (inches === null) return null;
  return inches * CM_PER_IN;
}

/** Display-rounded length in inches, from a canonical cm value. 1 decimal (05 §5). */
export function formatLengthIn(cm: number | null): number | null {
  if (cm === null) return null;
  return roundToIncrement(cmToIn(cm) as number, 0.1);
}

// ---------------------------------------------------------------------------
// Duration: seconds -> mm:ss / h:mm:ss, and mm:ss text entry -> seconds
// ---------------------------------------------------------------------------

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/**
 * Formats a canonical seconds duration as `mm:ss` (under 1 h) or `h:mm:ss`
 * (at/above 1 h), per 05 §5. The leading unit (minutes, or hours when
 * present) is unpadded; every unit after it is zero-padded to 2 digits.
 * Negative durations (shouldn't occur in practice, but handled rather than
 * left to produce garbage) keep a leading `-` and format the magnitude.
 */
export function formatDuration(totalSeconds: number | null): string | null {
  if (totalSeconds === null) return null;
  const sign = totalSeconds < 0 ? '-' : '';
  const abs = Math.round(Math.abs(totalSeconds));
  const hours = Math.floor(abs / 3600);
  const minutes = Math.floor((abs % 3600) / 60);
  const seconds = abs % 60;
  if (hours >= 1) {
    return `${sign}${hours}:${pad2(minutes)}:${pad2(seconds)}`;
  }
  return `${sign}${minutes}:${pad2(seconds)}`;
}

/**
 * Parses a TIME cell's typed-digit buffer into a canonical seconds value.
 * 02 §4: "typing digits fills seconds -> minutes, e.g. '130' -> 1:30" — a
 * calculator/stopwatch-style digit-fill entry where the rightmost 2 digits
 * are always seconds and everything left of that is minutes.
 *
 * ## The "130" vs. bare "90" resolution (08 §4.5 / TASKS-INDEX.md item 6)
 *
 * 08 §4.5 names two cases that read as if they might conflict — digit-fill
 * parsing of `"130"` -> 90 s, and "bare seconds >= 60 normalize" of `"90"`
 * -> displayed as 1:30 (also 90 s) — and TASKS-INDEX.md resolves the
 * second explicitly. Implemented here as **one formula**, because they
 * turn out to be the same operation, not two:
 *
 *   digits  = the buffer with non-digit characters stripped, read as a plain
 *             integer (e.g. "130" -> 130, "90" -> 90).
 *   seconds = digits % 100   (the rightmost up-to-2 digits, taken literally
 *             — even if that "seconds" chunk is itself >= 60, e.g. "90"'s
 *             chunk is 90).
 *   minutes = floor(digits / 100)   (everything left of the rightmost 2
 *             digits).
 *   total   = minutes * 60 + seconds
 *
 * This is algebraically insensitive to whether `seconds` is "carried" into
 * `minutes` first (min' = minutes + floor(seconds/60), sec' = seconds % 60)
 * — `minutes*60 + seconds` and `min'*60 + sec'` are always equal — so no
 * separate carry step is needed:
 *   - `"130"`: digits=130, seconds=30, minutes=1  -> total = 90 s.
 *   - `"90"`:  digits=90,  seconds=90, minutes=0  -> total = 90 s.
 * Both land on exactly 90 s, matching 08 §4.5's own worked numbers for both
 * cases, and `formatDuration(90)` renders either as `"1:30"` — the "bare
 * seconds >= 60 normalize (90 -> 1:30)" case is just `formatDuration`
 * applied to this function's output, not a different parse rule.
 *
 * Passthrough: `null` -> `null` (no value entered / field cleared, as
 * distinct from an emptied-but-present buffer). An empty string (after
 * stripping non-digits) -> `0`, matching a TIME cell that's been typed into
 * but has no digits yet.
 */
export function parseTimeInput(input: string | null): number | null {
  if (input === null) return null;
  const digitsOnly = input.replace(/\D/g, '');
  if (digitsOnly === '') return 0;
  const digits = parseInt(digitsOnly, 10);
  const seconds = digits % 100;
  const minutes = Math.floor(digits / 100);
  return minutes * 60 + seconds;
}
