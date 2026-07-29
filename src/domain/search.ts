/**
 * `domain/search.ts` (M1-06) — the diacritic-strip/case-fold normalization
 * helper 03 §2's search semantics need: "case/diacritic-insensitive
 * substring on name; also matches known aliases." `ExerciseRepository.list`
 * (`src/data/exercises/exercise-repository.ts`) is the first caller, but
 * this lives in `src/domain/` (not colocated with the repository) precisely
 * because the task calls it out as its own unit-testable seam — pure TS,
 * zero React/React Native/Expo imports, same `src/domain/**` zone as
 * `enums.ts`/`units.ts` (06 §2 dependency rule) and covered by that zone's
 * 95%/90% Jest coverage gate (08 §3).
 *
 * Approach: Unicode `NFKD` decomposition splits each accented/decorated
 * character into a base character + combining mark(s) (e.g. "e with acute
 * accent" -> plain "e" + a trailing COMBINING ACUTE ACCENT codepoint), then
 * a regex strips every codepoint in the `U+0300`-`U+036F` "Combining
 * Diacritical Marks" Unicode block — the block NFKD/NFD decomposition of
 * every accented Latin letter (the entire vendored dataset and expected
 * custom-exercise-name alphabet) produces. Case-folding via `toLowerCase`
 * happens after decomposition (order doesn't matter for ASCII, but keeps the
 * two normalization steps clearly separated). `NFKD` (not `NFD`) additionally
 * folds compatibility variants some searchers type interchangeably with the
 * plain-ASCII form (e.g. ligatures, full-width characters) — a strict
 * superset of `NFD` for this helper's purposes, never a behavior loss.
 */

/** Unicode Combining Diacritical Marks block (`U+0300`-`U+036F`) produced by `NFKD`/`NFD` decomposition. */
const COMBINING_MARKS_PATTERN = /[\u0300-\u036f]/g;

/**
 * Normalize `text` for case/diacritic-insensitive substring search: strips
 * accents/diacritics, lowercases, and trims leading/trailing whitespace.
 * Idempotent (`normalizeForSearch(normalizeForSearch(x)) === normalizeForSearch(x)`)
 * and safe on already-plain-ASCII input (no-op besides lowercasing/trimming).
 *
 * Example: `normalizeForSearch("Café Curl")` -> `"cafe curl"`.
 */
export function normalizeForSearch(text: string): string {
  return text.normalize('NFKD').replace(COMBINING_MARKS_PATTERN, '').toLowerCase().trim();
}

/**
 * `true` when `haystack` contains `needle` as a case/diacritic-insensitive
 * substring (both normalized via {@link normalizeForSearch} before
 * comparing). An empty/whitespace-only `needle` always matches (mirrors "no
 * search query typed yet" behaving as "show everything").
 */
export function matchesSearchQuery(haystack: string, needle: string): boolean {
  const normalizedNeedle = normalizeForSearch(needle);
  if (normalizedNeedle.length === 0) {
    return true;
  }
  return normalizeForSearch(haystack).includes(normalizedNeedle);
}
