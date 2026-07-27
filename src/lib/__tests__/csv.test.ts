/**
 * `lib/csv.ts` unit tests (M5-05 writer, M5-07 reader) — RFC 4180 writer:
 * unconditional quoting, embedded-quote doubling, and comma/newline fields
 * needing no extra handling once quoted; and `parseCsv`, the reader M5-07
 * added: quoted/unquoted fields, embedded commas/quotes/newlines, doubled-
 * quote escaping, `\r\n` and bare `\n` line endings, 1-based per-record line
 * numbers, and the one structural error this reader detects (an
 * unterminated quoted field at EOF). This module's own escaping rule is
 * independently re-derived (not shared code) in `domain/csv-codec.ts` — see
 * that file's header, "Why this file does NOT import lib/csv.ts" — so these
 * tests only cover `lib/csv.ts` itself; the Hevy-specific golden-file tests
 * live in `domain/__tests__/csv-codec.test.ts`, and the Hevy-specific *row
 * semantics* (required fields, set_type/RPE mapping, ...) live in
 * `domain/__tests__/hevy-import.test.ts`.
 */
import { csvEscapeField, csvFormatRow, parseCsv, writeCsv } from '@/lib/csv';

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

describe('parseCsv', () => {
  it('round-trips writeCsv output exactly, including line numbers (header = line 1)', () => {
    const csv = writeCsv([
      ['title', 'reps'],
      ['Bench Press', '5'],
      ['Squat, Barbell', '8'],
      ['Say "hi"', '3'],
      ['line one\nline two', '1'],
    ]);
    const { records, errors } = parseCsv(csv);
    expect(errors).toEqual([]);
    expect(records).toEqual([
      { fields: ['title', 'reps'], line: 1 },
      { fields: ['Bench Press', '5'], line: 2 },
      { fields: ['Squat, Barbell', '8'], line: 3 },
      { fields: ['Say "hi"', '3'], line: 4 },
      { fields: ['line one\nline two', '1'], line: 5 },
    ]);
  });

  it('parses unquoted fields (RFC 4180 only requires quoting when needed)', () => {
    const { records, errors } = parseCsv('a,b,c\n1,2,3\n');
    expect(errors).toEqual([]);
    expect(records).toEqual([
      { fields: ['a', 'b', 'c'], line: 1 },
      { fields: ['1', '2', '3'], line: 2 },
    ]);
  });

  it('parses a quoted field that is not the record\'s first field (comma inside)', () => {
    const { records } = parseCsv('a,"b,c",d\n');
    expect(records).toEqual([{ fields: ['a', 'b,c', 'd'], line: 1 }]);
  });

  it('parses a doubled-quote escape inside a quoted field', () => {
    const { records } = parseCsv('"Say ""hi"""\n');
    expect(records).toEqual([{ fields: ['Say "hi"'], line: 1 }]);
  });

  it('accepts \\r\\n line endings identically to bare \\n', () => {
    const { records, errors } = parseCsv('a,b\r\n1,2\r\n');
    expect(errors).toEqual([]);
    expect(records).toEqual([
      { fields: ['a', 'b'], line: 1 },
      { fields: ['1', '2'], line: 2 },
    ]);
  });

  it('parses a file with no trailing newline (last record still flushed)', () => {
    const { records } = parseCsv('a,b\n1,2');
    expect(records).toEqual([
      { fields: ['a', 'b'], line: 1 },
      { fields: ['1', '2'], line: 2 },
    ]);
  });

  it('parses empty fields (bare commas)', () => {
    const { records } = parseCsv('a,,c\n');
    expect(records).toEqual([{ fields: ['a', '', 'c'], line: 1 }]);
  });

  it('produces no phantom trailing record for a header-only document', () => {
    const { records } = parseCsv('"h1","h2"\n');
    expect(records).toEqual([{ fields: ['h1', 'h2'], line: 1 }]);
  });

  it('returns empty records/errors for an empty string input', () => {
    expect(parseCsv('')).toEqual({ records: [], errors: [] });
  });

  it('advances the line counter correctly across a multi-line quoted field', () => {
    const { records } = parseCsv('h1,h2\n"line1\nline2",v\nafter,row\n');
    expect(records[1]).toEqual({ fields: ['line1\nline2', 'v'], line: 2 });
    expect(records[2]).toEqual({ fields: ['after', 'row'], line: 4 });
  });

  it('reports an unterminated quoted field at EOF as a structural error, at the record\'s start line', () => {
    const { records, errors } = parseCsv('a,b\n"unterminated,x\n');
    expect(errors).toEqual([{ line: 2, message: expect.stringContaining('Unterminated') }]);
    // Best-effort: the row is still returned, whatever text was accumulated.
    expect(records[1].line).toBe(2);
  });

  it('treats a mid-field quote (not at the field\'s start) as a literal character', () => {
    const { records, errors } = parseCsv('ab"cd,e\n');
    expect(errors).toEqual([]);
    expect(records).toEqual([{ fields: ['ab"cd', 'e'], line: 1 }]);
  });

  it('keeps a bare CR not followed by LF as a literal field character, not a line ending', () => {
    // Regression: a `\r` outside quotes used to be unconditionally swallowed
    // regardless of what followed it, silently splicing the surrounding
    // characters together (`'a\rb,c\n'` parsed as `['ab', 'c']` instead of
    // `['a\rb', 'c']`) — contradicting this file's own header contract that
    // a lone `\r` not immediately before a `\n` is kept as literal content.
    const { records, errors } = parseCsv('a\rb,c\n');
    expect(errors).toEqual([]);
    expect(records).toEqual([{ fields: ['a\rb', 'c'], line: 1 }]);
  });
});
