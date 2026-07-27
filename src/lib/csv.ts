/**
 * `lib/csv.ts` (M5-05) — 06 §1's "custom `lib/csv.ts` (RFC 4180 subset;
 * dependency-free, fully unit-tested)" CSV primitive. Pure TS, zero
 * React/RN/Expo imports — same "dependency-free" posture as every other
 * `lib/` wrapper's *logic* core (e.g. `lib/logger.ts`'s ring buffer), just
 * with no native half to defer here at all: writing a CSV string touches no
 * filesystem/native API, so unlike `logger.ts` there is no
 * `*.expo.ts`/mock split needed — this file is the whole thing.
 *
 * ## Scope: writer only — the reader is M5-07's own deliverable
 *
 * `docs/plan/tasks/M5-tasks.md`'s M5-07 (`Hevy CSV import`, depends on this
 * task) lists "parse (RFC 4180 reader in `lib/csv.ts`)" as its own `How`
 * line — the reader's shape needs to be designed around that task's actual
 * needs (line-numbered malformed-row warnings for the import preview
 * report, streaming vs. whole-file parse, header-row detection for the
 * metric/imperial column-name switch) which aren't this task's to guess at.
 * Building a throwaway stub here would just be dead code M5-07 has to
 * delete or rewrite; leaving the reader out entirely and documenting why
 * (per M5-05's own task text: "leave the reader for M5-07 and say so") is
 * the cheaper, more honest scaffold.
 *
 * ## RFC 4180 subset implemented
 *
 * - Every field is unconditionally double-quoted (05 §7.1: "all fields
 *   double-quoted") — this module never takes the RFC's "quote only if the
 *   field contains a comma/quote/newline" shortcut, so callers never have
 *   to reason about which fields need escaping.
 * - Embedded double quotes are doubled (`"` -> `""`, RFC 4180 §2.7) —
 *   {@link csvEscapeField} is the one place this happens, so
 *   `domain/csv-codec.ts` never has to think about escaping at all, only
 *   about supplying raw (unescaped) string values.
 * - Records are `\n`-terminated (05 §7.1: "UTF-8, `\n` line endings" —
 *   deliberately not RFC 4180's own default CRLF, an explicit spec
 *   deviation the doc calls out by name), including a trailing line ending
 *   after the final row — the same "file ends with a newline" convention
 *   every other text file in this repo already follows, and one less
 *   footgun for `expo-sharing`/`expo-file-system` consumers that append to
 *   or diff the file.
 * - Comma/embedded-newline escaping needs no special handling beyond
 *   quoting: once a field is wrapped in `"..."`, literal commas and
 *   newlines inside it are just characters, not delimiters — nothing else
 *   in this module treats them specially.
 *
 * ## The reader (M5-07): `parseCsv`
 *
 * The exact inverse of the writer above — a hand-rolled character-by-
 * character state machine (no regex-split-on-comma shortcut, which breaks
 * the instant a field contains a quoted comma/newline) that accepts:
 *  - Quoted fields (`"..."`) containing embedded commas, newlines, and
 *    doubled-quote-escaped literal quotes (`""` -> `"`, the exact inverse of
 *    {@link csvEscapeField}'s own doubling).
 *  - Unquoted fields (this reader is a superset of what {@link writeCsv}
 *    itself ever emits — every writer output is unconditionally quoted, but
 *    a *real* Hevy export or a hand-edited fixture is not guaranteed to be;
 *    RFC 4180 §2.4 only requires quoting when a field contains a delimiter/
 *    quote/newline, so an unquoted field is equally valid input).
 *  - Bare `\n` line endings (this repo's own convention) **and** `\r\n`
 *    (RFC 4180's own default, and what a real Hevy export or Excel-edited
 *    CSV is far more likely to actually contain) — a lone `\r` immediately
 *    before a `\n` is swallowed as part of the line ending rather than kept
 *    as a literal character; a `\r` **not** followed by `\n` (a bare old-
 *    Mac-style line ending, vanishingly unlikely but not worth crashing
 *    over) is kept as a literal character, matching how every field
 *    character this reader doesn't explicitly special-case is handled.
 *
 * ## Line numbers, and what counts as "malformed" here vs. one layer up
 *
 * Every {@link CsvRecord} carries the 1-based source line on which it
 * *started* (the header row is line 1, matching how a human opens the raw
 * file in a text editor and counts from the top) — `M5-07`'s own task text
 * needs this for its "malformed row skipped, line number recorded in the
 * report" acceptance case. A record spanning multiple physical lines (an
 * embedded newline inside a quoted field) is still reported at its single
 * *start* line, not a range — the simplest, most predictable convention,
 * and the one that actually answers "which line do I look at in my editor
 * to find this row" for a human debugging a bad import.
 *
 * This module only ever detects and reports one **structural** malformation
 * — an unterminated quoted field still open at end-of-file (the one case a
 * character-level RFC 4180 reader can actually recognize as broken syntax,
 * as opposed to a semantically-invalid-but-syntactically-fine row like "too
 * few columns" or "start_time is empty," which have no CSV-syntax meaning
 * at all and are the calling code's own schema concern, not this generic
 * reader's). That row is still returned in {@link CsvParseResult.records}
 * (best-effort: whatever text was accumulated before EOF, unclosed quote and
 * all) *and* reported in {@link CsvParseResult.errors} — never silently
 * dropped by this module itself, so a caller that wants to skip it can
 * (`features/data-transfer/hevy-import-service.ts`, M5-07), and a caller
 * that doesn't care can just ignore `errors` and get a best-effort parse.
 */

const LINE_ENDING = '\n';

/**
 * Quotes and escapes one raw field value per RFC 4180 §2.5/§2.7: wraps in
 * double quotes unconditionally, doubling any embedded double quote first.
 * Callers pass the raw, unescaped string (e.g. `Bench "Press", Incline` is
 * valid input) — this is the only place `"` -> `""` doubling happens.
 */
export function csvEscapeField(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/** Joins already-raw field values into one quoted, comma-separated CSV record — no trailing line ending (callers that need one full document use {@link writeCsv}). */
export function csvFormatRow(fields: readonly string[]): string {
  return fields.map(csvEscapeField).join(',');
}

/**
 * Renders a complete CSV document from `rows` (each an ordered array of
 * raw, unescaped field values — conventionally `rows[0]` is the header).
 * Every field is quoted and escaped ({@link csvEscapeField}), records are
 * `\n`-joined, and the document ends with a trailing `\n` after the last
 * row. This module only ever produces a `string` — UTF-8 encoding and
 * actually writing bytes to disk is the caller's concern
 * (`expo-file-system`, outside this dependency-free module's scope).
 */
export function writeCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => csvFormatRow(row) + LINE_ENDING).join('');
}

// ---------------------------------------------------------------------------
// Reader (M5-07) — see file header, "The reader"
// ---------------------------------------------------------------------------

/** One parsed CSV record — `fields` in column order, `line` the 1-based source line the record *started* on (see file header). */
export interface CsvRecord {
  fields: string[];
  line: number;
}

/** One structural parse problem `parseCsv` itself detected (see file header — deliberately narrow: this is not a schema validator). */
export interface CsvParseError {
  line: number;
  message: string;
}

export interface CsvParseResult {
  records: CsvRecord[];
  errors: CsvParseError[];
}

/**
 * Parses `text` as an RFC 4180 CSV document — the exact inverse of
 * {@link writeCsv}, generalized to also accept unquoted fields and `\r\n`
 * line endings (see file header for the full contract). Never throws: a
 * structurally broken input (today, only "unterminated quoted field at
 * EOF") is reported via {@link CsvParseResult.errors}, not an exception —
 * this module has no opinion on whether a caller should abort or skip-and-
 * continue, so it always returns a best-effort result and lets the caller
 * decide (`lib/csv.ts`'s own posture throughout: pure, decision-free
 * primitives).
 */
export function parseCsv(text: string): CsvParseResult {
  const records: CsvRecord[] = [];
  const errors: CsvParseError[] = [];

  let fields: string[] = [];
  let field = '';
  let recordStartLine = 1;
  let line = 1;
  let inQuotes = false;
  // `true` once any character of the *current record* (any field's
  // content, a `,` delimiter, or an opening quote) has been consumed —
  // distinguishes "nothing left to flush, the file just ended right after a
  // line ending" from "a real trailing record with no final newline" at
  // EOF. Reset on every {@link flushRecord} call.
  let recordHasContent = false;

  const len = text.length;
  let i = 0;

  function flushField(): void {
    fields.push(field);
    field = '';
  }

  function flushRecord(): void {
    flushField();
    records.push({ fields, line: recordStartLine });
    fields = [];
    recordHasContent = false;
  }

  while (i < len) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      if (ch === '\n') {
        line += 1;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      // An opening quote only starts a quoted field when it's the *field's*
      // first character (RFC 4180 §2.5, `field === ''` — deliberately not
      // gated on `recordHasContent` too, which would only ever match a
      // quote opening the record's very first field and treat every other
      // field's opening quote as a stray literal, e.g. breaking `a,"b,c",d`).
      // A quote appearing mid-field after other characters have already
      // been typed into it (a real-world Hevy/Excel export quirk, not
      // spec-legal RFC 4180, but not worth hard-failing over) is treated as
      // a literal character instead of re-entering quote mode — the same
      // "be liberal in what you accept" posture as this reader's `\r\n`
      // handling below.
      if (field === '') {
        inQuotes = true;
        recordHasContent = true;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }
    if (ch === ',') {
      flushField();
      recordHasContent = true;
      i += 1;
      continue;
    }
    if (ch === '\r') {
      // Swallow a lone CR; the following LF (if any) is handled by the
      // '\n' branch below on the next iteration — net effect: `\r\n` and
      // bare `\n` both end a record identically.
      i += 1;
      continue;
    }
    if (ch === '\n') {
      flushRecord();
      line += 1;
      recordStartLine = line;
      i += 1;
      continue;
    }
    field += ch;
    recordHasContent = true;
    i += 1;
  }

  // EOF. An unterminated quoted field is a genuine structural problem —
  // reported, and the partial field content flushed best-effort (see file
  // header) rather than silently discarded.
  if (inQuotes) {
    errors.push({ line: recordStartLine, message: 'Unterminated quoted field at end of file.' });
  }

  // Only flush a trailing partial record if it actually has content — a
  // well-formed file (every writer this app produces included) ends with a
  // trailing '\n', which already flushed the last real record above; without
  // this guard that trailing newline would produce one bogus empty final
  // record every time.
  if (recordHasContent) {
    flushRecord();
  }

  return { records, errors };
}
