/**
 * `domain/search.ts` unit tests (M1-06 acceptance gate: search-normalization
 * helper unit-tested independently of the repository that consumes it).
 */
import { matchesSearchQuery, normalizeForSearch } from '../search';

describe('normalizeForSearch', () => {
  it('lowercases plain ASCII input', () => {
    expect(normalizeForSearch('Bench Press')).toBe('bench press');
  });

  it('strips diacritics (accented Latin letters)', () => {
    expect(normalizeForSearch('Café Curl')).toBe('cafe curl');
    expect(normalizeForSearch('Sumo Deadlift à la Ed Coan')).toBe('sumo deadlift a la ed coan');
    expect(normalizeForSearch('Überkopfdrücken')).toBe('uberkopfdrucken');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normalizeForSearch('  Squat  ')).toBe('squat');
  });

  it('is idempotent', () => {
    const once = normalizeForSearch('Café Curl');
    expect(normalizeForSearch(once)).toBe(once);
  });

  it('is a no-op (besides case/trim) on already-plain-ASCII input', () => {
    expect(normalizeForSearch('overhead press')).toBe('overhead press');
  });
});

describe('matchesSearchQuery', () => {
  it('matches a case-insensitive substring', () => {
    expect(matchesSearchQuery('Barbell Bench Press', 'bench')).toBe(true);
    expect(matchesSearchQuery('Barbell Bench Press', 'BENCH')).toBe(true);
  });

  it('matches a diacritic-insensitive substring', () => {
    expect(matchesSearchQuery('Café Curl', 'cafe')).toBe(true);
    expect(matchesSearchQuery('Cafe Curl', 'café')).toBe(true);
  });

  it('does not match an absent substring', () => {
    expect(matchesSearchQuery('Barbell Bench Press', 'squat')).toBe(false);
  });

  it('treats an empty/whitespace-only query as matching everything', () => {
    expect(matchesSearchQuery('Barbell Bench Press', '')).toBe(true);
    expect(matchesSearchQuery('Barbell Bench Press', '   ')).toBe(true);
  });
});
