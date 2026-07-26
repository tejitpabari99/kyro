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
