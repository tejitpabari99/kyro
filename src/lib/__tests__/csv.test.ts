/**
 * `lib/csv.ts` unit tests (M5-05) — RFC 4180 writer: unconditional quoting,
 * embedded-quote doubling, and comma/newline fields needing no extra
 * handling once quoted. This module's own escaping rule is independently
 * re-derived (not shared code) in `domain/csv-codec.ts` — see that file's
 * header, "Why this file does NOT import lib/csv.ts" — so these tests only
 * cover `lib/csv.ts` itself; the Hevy-specific golden-file tests live in
 * `domain/__tests__/csv-codec.test.ts`.
 */
import { csvEscapeField, csvFormatRow, writeCsv } from '@/lib/csv';

describe('csvEscapeField', () => {
  it('wraps a plain field in double quotes', () => {
    expect(csvEscapeField('Bench Press')).toBe('"Bench Press"');
  });

  it('doubles a single embedded double quote', () => {
    expect(csvEscapeField('Say "hi"')).toBe('"Say ""hi"""');
  });

  it('doubles every embedded double quote, not just the first', () => {
    expect(csvEscapeField('"a""b"')).toBe('"""a""""b"""');
  });

  it('leaves an embedded comma untouched inside the quotes', () => {
    expect(csvEscapeField('Squat, Barbell')).toBe('"Squat, Barbell"');
  });

  it('leaves an embedded newline untouched inside the quotes', () => {
    expect(csvEscapeField('line one\nline two')).toBe('"line one\nline two"');
  });

  it('handles comma + quote + newline together', () => {
    expect(csvEscapeField('a, "b"\nc')).toBe('"a, ""b""\nc"');
  });

  it('quotes an empty string as an empty quoted field', () => {
    expect(csvEscapeField('')).toBe('""');
  });
});

describe('csvFormatRow', () => {
  it('joins escaped fields with commas, no trailing line ending', () => {
    expect(csvFormatRow(['a', 'b', 'c'])).toBe('"a","b","c"');
  });

  it('formats a single-field row without a trailing comma', () => {
    expect(csvFormatRow(['only'])).toBe('"only"');
  });

  it('formats an empty row as an empty string (no fields to join)', () => {
    expect(csvFormatRow([])).toBe('');
  });
});

describe('writeCsv', () => {
  it('renders a header + one data row, \\n-joined, with a trailing newline', () => {
    const csv = writeCsv([
      ['title', 'reps'],
      ['Bench Press', '5'],
    ]);
    expect(csv).toBe('"title","reps"\n"Bench Press","5"\n');
  });

  it('renders multiple rows in input order (no implicit sorting)', () => {
    const csv = writeCsv([['b'], ['a'], ['c']]);
    expect(csv).toBe('"b"\n"a"\n"c"\n');
  });

  it('renders an empty document (no rows at all) as an empty string', () => {
    expect(writeCsv([])).toBe('');
  });

  it('never emits \\r\\n — only bare \\n line endings', () => {
    const csv = writeCsv([['a'], ['b']]);
    expect(csv).not.toContain('\r');
    expect(csv.split('\n')).toEqual(['"a"', '"b"', '']);
  });
});
