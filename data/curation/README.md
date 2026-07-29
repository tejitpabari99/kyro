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

## M1-11 curation pass

M1-04's build surfaced exactly 5 missing-instructions warnings (`curation-report.md`) and 0
missing-image warnings and 0 unmatched-value warnings — the full warning inventory triaged
below, per the M1-11 task's acceptance gate ("zero unaddressed warnings").

**Fixed with real `instructions` overrides (all 5)** — the override schema
(`src/domain/curation.ts`'s `ExerciseOverrideSchema`) gained a new optional `instructions`
field for this pass: a non-empty ordered array of step strings that replaces the source
record's empty `instructions[]` outright, with the exact same "override wins over source"
precedence every other field already has. Each of the 5 was confirmed against its own bundled
images (`data/free-exercise-db/images/{id}/{0,1}.jpg`) before writing the steps, to be
confident the movement being described is actually the one depicted — not written from the
name alone:

| id | Movement confirmed from images | Why confident enough to write real instructions |
|---|---|---|
| `Push_Press` | Barbell front-rack dip-drive-press overhead | Standard, unambiguous barbell technique; images show the front-rack starting position and the overhead lockout finish, consistent with a textbook push press. |
| `Side_Bridge` | Forearm side plank | The dataset's name for what's universally known as the side plank; images show the classic forearm-supported side-plank position. |
| `Side_Jackknife` | Side-lying simultaneous leg-raise + torso-lift ("V" fold) | Images show the two frames of the fold (legs+torso together) unambiguously; a standard oblique bodyweight move. |
| `One-Arm_Kettlebell_Swings` | Single-hand hip-hinge kettlebell swing | Images show the bottom-of-swing hip-hinge and the drive-through position, consistent with the standard one-arm kettlebell swing. |
| `Iron_Cross` | Dumbbell squat-to-lateral-raise combo (not the gymnastics rings skill of the same name) | Images clearly show a squat holding two dumbbells together in front, then standing while raising both arms out to shoulder height forming a "T"/cross — a real, if less common, combo lift; confirmed via the images rather than assumed from the name (which is misleading — it is not the gymnastic rings "iron cross"). |

No missing-instructions entry was waived instead of fixed — all 5 were well-known/clearly
depicted enough to write accurate, brief steps for. `curation-report.md`'s "Missing-instructions
warnings" count is 0 as of this pass.

**No `exclude` entries added.** A pass over the mapped output (873 names) for exact/near-exact
duplicates found no pair worth excluding — the dataset's apparent near-duplicates
(`Barbell_Deadlift`/`Romanian_Deadlift`/`Sumo_Deadlift`, `Close-Grip_Barbell_Bench_Press`/
`Barbell_Bench_Press_-_Medium_Grip`, etc.) are genuinely distinct exercises/variations, not
duplicate records of the same one. `ExerciseOverrideSchema` fully supports `exclude: true`
(covered by a synthetic case in the unit test) for if a real duplicate turns up later.

Likewise, no `name` overrides were added — the 20-lift spot-check (`docs/qa/M1-curation.md`)
found no ambiguous/collision-prone name needing a disambiguating suffix.

## Bundle-size decision (M1-11)

See `docs/qa/M1-curation.md`'s "Bundle-size decision" section for the full before/after
numbers. Summary: the build pipeline's image settings were tuned down from 600px/q75 to
500px/q68 (`scripts/build-exercise-db.ts`'s `MAX_WIDTH`/`JPEG_QUALITY` constants), bringing the
bundled `assets/exercises/` + `assets/exercise-db.json` total from ~46.8 MB to ~32.1 MB (and
`expo export`'s `dist/assets` from ~45.4 MB to ~30.8 MB) — comfortably clear of the 50 MB
budget (03 §6.5) without needing the bigger thumbnails-only-bundled fallback (O-10a).
