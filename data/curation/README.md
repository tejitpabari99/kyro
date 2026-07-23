# Curation overrides (M1-03)

`overrides.json` is the hand-maintained patch file 03 §6.4 step 2 describes, applied by the
M1-04 build pipeline (`scripts/build-exercise-db.ts`) on top of the vendored
`data/free-exercise-db/exercises.json` records during field-mapping (03 §6.3). Its shape is
validated by `src/domain/curation.ts`'s Zod schema (`CurationOverridesFileSchema`), unit-tested
in `src/domain/__tests__/curation.test.ts`.

## Shape

```jsonc
{
  "overrides": {
    "<free-exercise-db source id>": {
      "exercise_type"?: "<one of the 8 EXERCISE_TYPE_VALUES>",
      "uses_custom_metric"?: true | false,
      "name"?: "<override display name>",
      "aliases"?: ["<extra search term>", ...],
      "exclude"?: true
    }
  },
  "aliases": {
    "<global alias search term>": "<target source id>"
  }
}
```

- **`overrides[id]`** — per-exercise partial patch; override-file values win over every
  heuristic in 03 §6.3 (field-mapping step). `exclude: true` drops the id entirely from the
  build output (intended for exact-duplicate records — see "Deferred" below).
- **`aliases[term]`** — a flat, global map of search-term -> target source id, for alias
  entries that don't otherwise need any override (e.g. "OHP" needs no field changed on
  `Barbell_Shoulder_Press`, just a search synonym). This is distinct from an individual
  override's own `aliases` array, which attaches extra search terms to that specific override
  entry only.

## Seeded entries and rationale

| id / term | Entry | Why |
|---|---|---|
| `Stairmaster` | `uses_custom_metric: true` | 03 §6.3's heuristic-note example ("stair machine → uses_custom_metric") — a cardio machine exercise where floors-climbed/level is a useful extra tracked metric beyond duration. |
| `Decline_Push-Up` | `exercise_type: "bodyweight_reps"` | Heuristic rule 6 (03 §6.3) defaults `equipment=body only` bodyweight moves to `reps_only`; push-up variants where added external load (weight vest/plate) is common in practice are curated to `bodyweight_reps` instead, per the rule's own parenthetical. Decline push-ups are a standard weighted-progression variant. |
| `Handstand_Push-Ups` | `exercise_type: "bodyweight_reps"` | Same rationale as above — commonly weighted/deficit-progressed once bodyweight reps get easy. |
| `"OHP"` (alias) | -> `Barbell_Shoulder_Press` | 03 §2's own worked example ("OHP" -> Overhead Press); the dataset has no record literally named "Overhead Press", so this points at the closest canonical match. |
| `"RDL"` (alias) | -> `Romanian_Deadlift` | Common lifting shorthand. |
| `"BP"` (alias) | -> `Barbell_Bench_Press_-_Medium_Grip` | Common lifting shorthand. |
| `"DL"` (alias) | -> `Barbell_Deadlift` | Common lifting shorthand. |
| `"GM"` (alias) | -> `Good_Morning` | Common lifting shorthand. |
| `"Pull-Up"` (alias) | -> `Pullups` | The dataset's generic pull-up record is spelled `Pullups` (no hyphen); since search (03 §2) is a case/diacritic-insensitive **substring** match, the hyphenated spelling wouldn't otherwise match it. |

All seven ids referenced above (three overrides + six alias targets — `Barbell_Shoulder_Press`,
`Romanian_Deadlift`, `Barbell_Bench_Press_-_Medium_Grip`, `Barbell_Deadlift`, `Good_Morning`,
`Pullups`) were confirmed present in `data/free-exercise-db/exercises.json` at seed time.

## Deferred to M1-11 (curation pass)

No `exclude` entries are seeded here: identifying exact-duplicate records in the real ~870-row
dataset is an editorial judgment call the M1-11 task ("Curation pass + bundle-size decision
point") explicitly owns ("fix via `overrides.json` entries ... excludes for exact duplicates"),
working off the `curation-report.md` warnings M1-04's build emits. Fabricating an exclude entry
now, without that report to justify it, would risk silently dropping a legitimate exercise.
`ExerciseOverrideSchema` fully supports `exclude: true` today (covered by a synthetic case in
the unit test) — it's simply unused by any real entry yet.

Likewise, no `name` overrides are seeded — 03 §6.3 mentions curation may append equipment
qualifiers to disambiguate near-identical names (e.g. "(Barbell)"), but that's also an M1-11
judgment call once the real duplicate/ambiguity list is known.
