/**
 * `domain/curation.ts` (M1-03) — 03 §6.4 step 2: the Zod schema (+ typed
 * parse helper) for `data/curation/overrides.json`, the hand-maintained
 * curation file that sits between the vendored free-exercise-db dataset
 * (`data/free-exercise-db/exercises.json`, verbatim upstream data — see its
 * `VENDORED.md`) and the Kyro exercise records the M1-04 build pipeline
 * (`scripts/build-exercise-db.ts`) emits.
 *
 * This module owns validation of the override file's *shape* only — it has
 * no opinion on which source ids exist in the vendored dataset (that
 * cross-check, "does every override/alias id actually resolve to a real
 * exercise", is the build pipeline's job in M1-04, which has the dataset
 * loaded and can fail the build on a dangling reference).
 *
 * Two independent pieces, both keyed by the free-exercise-db source `id`
 * slug (03 §1: "Built-ins: id = free-exercise-db slug"):
 *
 *  - `overrides[id]` — a partial patch applied on top of the source record
 *    during field-mapping (03 §6.3): override-file values win over every
 *    heuristic. `exclude: true` drops the id entirely (exact duplicates,
 *    triaged during the M1-11 curation pass — none seeded yet, see
 *    `data/curation/README.md`). An override entry may carry its own
 *    `aliases` — extra search terms specific to *that* exercise, folded in
 *    when this override is applied. `instructions`, when present, replaces
 *    the source record's (possibly empty) `instructions[]` outright — the
 *    M1-11 curation pass's mechanism for supplying real instruction text on
 *    the small number of vendored records that ship with none (see
 *    `data/curation/README.md`'s "M1-11 curation pass" section for the
 *    specific entries and the rationale behind each).
 *  - `aliases[term]` — **global** alias entries: a search term that isn't
 *    itself tied to any other override (e.g. "OHP" needs no field changes
 *    on `Barbell_Shoulder_Press`, just a search synonym). Value is the
 *    target exercise's source id. `03 §2`'s example ("OHP" -> Overhead
 *    Press) lives here, not in `overrides[id].aliases`, since it doesn't
 *    otherwise need an override entry.
 *
 * Pure TS, zero React/React Native/Expo imports — same `src/domain/**` zone
 * as `enums.ts`/`units.ts`, and consumed identically by the (future) Node
 * build script and by app code (M1-06 search normalization can read
 * `aliases` from the same parsed shape).
 */
import { z } from 'zod';

import { EXERCISE_TYPE_VALUES } from './enums';

// ---------------------------------------------------------------------------
// Per-id override partial (03 §6.4 step 2)
// ---------------------------------------------------------------------------

/**
 * `{ exercise_type?, uses_custom_metric?, name?, aliases?, exclude?: true,
 * instructions? }` — the base shape is 03 §6.4 step 2 verbatim; `instructions`
 * is an M1-11 curation-pass addition (a real, non-empty list of ordered
 * step strings) for hand-writing accurate instruction text on the handful
 * of vendored records that ship with an empty `instructions[]`, exactly the
 * same "override-file wins over the source value" precedence every other
 * field already has — not a new mechanism, just one more overridable field.
 * `.strict()` so a typo'd key (e.g. `exercize_type`) fails validation
 * instead of silently doing nothing.
 */
export const ExerciseOverrideSchema = z
  .object({
    exercise_type: z.enum(EXERCISE_TYPE_VALUES).optional(),
    uses_custom_metric: z.boolean().optional(),
    name: z.string().min(1).optional(),
    aliases: z.array(z.string().min(1)).optional(),
    exclude: z.literal(true).optional(),
    instructions: z.array(z.string().min(1)).min(1).optional(),
  })
  .strict();

export type ExerciseOverride = z.infer<typeof ExerciseOverrideSchema>;

// ---------------------------------------------------------------------------
// Whole-file shape
// ---------------------------------------------------------------------------

/**
 * `overrides` keyed by free-exercise-db source id; `aliases` a flat map of
 * global search-alias term -> target source id. Both required (an empty
 * object `{}` is a valid "no entries yet" value for either) so the file
 * always has a stable, fully-typed top-level shape for the build pipeline
 * to destructure without optional-chaining everywhere.
 */
export const CurationOverridesFileSchema = z
  .object({
    overrides: z.record(z.string().min(1), ExerciseOverrideSchema),
    aliases: z.record(z.string().min(1), z.string().min(1)),
  })
  .strict();

export type CurationOverridesFile = z.infer<typeof CurationOverridesFileSchema>;

/**
 * Parse + validate an unknown value (typically `JSON.parse`d file content)
 * against `CurationOverridesFileSchema`. Throws `z.ZodError` on failure —
 * the caller (M1-04's build script) is expected to let that abort the
 * build with a readable message (`error.issues`), consistent with 03 §6.4
 * step 3's "fail the build on hard errors" rule applied to the curation
 * file itself, not just the mapped records.
 */
export function parseCurationOverrides(data: unknown): CurationOverridesFile {
  return CurationOverridesFileSchema.parse(data);
}
