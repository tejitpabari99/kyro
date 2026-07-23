# M1-11 — Curation Pass & Bundle-Size Decision

Task: `docs/plan/tasks/M1-tasks.md` M1-11 ("Curation pass + bundle-size decision point"), per
`docs/plan/03-feature-spec-exercise-library.md` §6.4–6.5. Verified against the real
873-exercise dataset (`data/free-exercise-db/exercises.json`, pinned commit
`b0eed061e1c832b3ed815fbaa4b45b3cdc14df49`) and the actual build output
(`assets/exercise-db.json` + `assets/exercises/`), not a placeholder.

---

## 1. Curation-report warnings — all triaged

`data/curation/curation-report.md` (M1-04's build output) surfaced, at the start of this task:

- **5 missing-instructions warnings**: `Iron_Cross`, `One-Arm_Kettlebell_Swings`, `Push_Press`,
  `Side_Bridge`, `Side_Jackknife`.
- **0 missing-source-image-file warnings.**
- **0 hard errors.**

All 5 missing-instructions warnings were **fixed** (not waived) with real, brief instruction
text added via a new `instructions` field on `data/curation/overrides.json`'s per-id override
schema (`src/domain/curation.ts`'s `ExerciseOverrideSchema` — same override-wins-over-source
precedence every other field already has). Each was confirmed against its own bundled images
before writing the steps, since three of the five names are non-obvious ("Side Bridge" is a
side plank; "Side Jackknife" is a side-lying leg-raise/torso-lift fold; "Iron Cross" here is a
dumbbell squat-to-lateral-raise combo, **not** the gymnastic rings skill of the same name):

| id | Movement confirmed from images | Fix |
|---|---|---|
| `Push_Press` | Barbell front-rack dip-drive-press overhead | Real instructions added |
| `Side_Bridge` | Forearm side plank | Real instructions added |
| `Side_Jackknife` | Side-lying simultaneous leg-raise + torso-lift | Real instructions added |
| `One-Arm_Kettlebell_Swings` | Single-hand hip-hinge kettlebell swing | Real instructions added |
| `Iron_Cross` | Dumbbell squat + lateral-raise combo (not the rings skill) | Real instructions added |

Full rationale and the exact instruction text: `data/curation/overrides.json` (the
`instructions` arrays) and `data/curation/README.md`'s "M1-11 curation pass" section.

After re-running `npm run build:exercises`, `data/curation/curation-report.md` now reads:

```
## Missing-instructions warnings (0)
_None._

## Missing-source-image-file warnings (0)
_None._
```

**Zero unaddressed warnings remain.**

No `exclude` overrides were added: a pass over the 873 mapped names for exact/near-duplicate
records found none — the dataset's apparent near-duplicates (e.g. `Barbell_Deadlift` /
`Romanian_Deadlift` / `Sumo_Deadlift`) are genuinely distinct exercises, not duplicate records
of the same one. No `name`-disambiguation overrides were added either — the spot-check below
found no colliding/ambiguous name needing one.

---

## 2. 20-lift spot-check (21 exercises checked)

The 8 lifts named in the task text, plus 13 more chosen for variety across equipment
(dumbbell, kettlebell, machine/cable, resistance band, bodyweight, barbell), muscle groups
(chest, back/lats, shoulders, biceps, quads, hamstrings, glutes, calves, abs, cardio), and
exercise types (all 8 types except `weight_duration`, see note below). Each row's
type/muscle/equipment/image-count was read directly from the real built
`assets/exercise-db.json`, and the images themselves opened to confirm they depict the named
movement (not just that a file exists).

| # | Exercise (real id) | Type | Primary muscle | Equipment | Images | Result |
|---|---|---|---|---|---|---|
| 1 | `Barbell_Bench_Press_-_Medium_Grip` (Bench Press) | weight_reps | chest | barbell | 2 | PASS |
| 2 | `Barbell_Squat` (Squat) | weight_reps | quadriceps | barbell | 2 | PASS |
| 3 | `Barbell_Deadlift` (Deadlift) | weight_reps | lower_back | barbell | 2 | PASS |
| 4 | `Barbell_Shoulder_Press` (OHP; alias "OHP" resolves here) | weight_reps | shoulders | barbell | 2 | PASS |
| 5 | `Pullups` (Pull-up; alias "Pull-Up" resolves here) | bodyweight_reps | lats | none | 2 | PASS |
| 6 | `Plank` | duration | abdominals | none | 2 | PASS |
| 7 | `Farmers_Walk` (Farmer's Walk) | short_distance_weight | forearms | other | 2 | PASS* |
| 8 | `Running_Treadmill` (Treadmill run) | distance_duration | cardio | machine | 2 | PASS |
| 9 | `Dumbbell_Bicep_Curl` | weight_reps | biceps | dumbbell | 2 | PASS |
| 10 | `Leg_Press` | weight_reps | quadriceps | machine | 2 | PASS |
| 11 | `Standing_Calf_Raises` | weight_reps | calves | machine | 2 | PASS |
| 12 | `Sit-Up` | reps_only | abdominals | none | 2 | PASS |
| 13 | `Band_Assisted_Pull-Up` | bodyweight_assisted_reps | lats | other | 2 | PASS* |
| 14 | `Pushups` (Push-up) | reps_only | chest | none | 2 | PASS |
| 15 | `Romanian_Deadlift` (RDL; alias resolves here) | weight_reps | hamstrings | barbell | 2 | PASS |
| 16 | `Wide-Grip_Lat_Pulldown` | weight_reps | lats | machine | 2 | PASS* |
| 17 | `Arnold_Dumbbell_Press` | weight_reps | shoulders | dumbbell | 2 | PASS |
| 18 | `Hamstring_Stretch` | duration | hamstrings | none | 2 | PASS |
| 19 | `Barbell_Hip_Thrust` | weight_reps | glutes | barbell | 2 | PASS |
| 20 | `Power_Clean` | weight_reps | hamstrings | barbell | 2 | PASS** |
| 21 | `Band_Pull_Apart` | weight_reps | shoulders | resistance_band | 2 | PASS |

**21/21 pass.** No classification errors found — no `overrides.json` fixes were needed as a
result of this spot-check (only the missing-instructions fixes in §1 above).

Notes on the three `PASS*`/`PASS**` rows (correct per spec, flagged for context, not failures):

- **`Farmers_Walk`**: source dataset tags `equipment: "other"` (not a literal
  barbell/dumbbell/kettlebell) since a farmer's-walk handle/trap-bar isn't one of the 9 Kyro
  equipment values; `other` is the correct fallback per 03 §6.3's equipment map — not a mapping
  bug, just the best available enum fit for this movement.
- **`Band_Assisted_Pull-Up`**: source tags `equipment: "other"` (the band is the *assisting*
  apparatus, not what the athlete lifts) — `classifyExerciseTypeHeuristic`'s rule 5 correctly
  fires `bodyweight_assisted_reps` from the "assisted" name-match regardless of the equipment
  gate (documented in that function's own header comment, verified again here against the real
  record).
- **`Wide-Grip_Lat_Pulldown`**: source tags `equipment: "cable"`, correctly mapped to Kyro
  `machine` per 03 §6.3's explicit `cable`→`machine` rule.
- **`Power_Clean`**: mapped `primary_muscle_group: hamstrings` exactly reflects the *source*
  record's own `primaryMuscles: ["hamstrings"]` (03 §6.3: `primaryMuscles[0]` via the muscle
  map, verbatim) — a lifter might expect "quadriceps" or "traps" as the primary for a power
  clean, but the mapping pipeline is doing exactly what the spec says with the upstream
  dataset's own muscle assignment; this is an upstream-data-editorial question, not a Kyro
  mapping defect, and secondary muscles (`quadriceps`, `traps`, `shoulders`, etc.) are all
  present in the secondary list either way.

**Exercise-type coverage:** of the 8 `exercise_type` enum values, this spot-check plus the
dataset-wide scan below hit every one **except** `weight_duration` — confirmed (via a
whole-dataset scan of the real build output) that **zero of the 873 real records** classify as
`weight_duration` (no exercise name matches the "wall sit"/weighted-hold heuristic, rule 8);
this was already known and documented in `src/domain/exercise-mapping.ts`'s own test-file header
comment from M1-04. Not a gap introduced by this task — `weight_duration` remains a valid,
unit-tested (synthetic-record) branch of the heuristic, simply unused by any of the 873 real
vendored exercises today.

---

## 3. Bundle-size decision

### Before (start of this task)

| Measure | Size |
|---|---|
| `assets/exercises/` (real file bytes) | 45.81 MB |
| `assets/exercise-db.json` | 1.01 MB |
| **Source total** | **46.82 MB** |
| `npx expo export --platform ios` → `dist/assets/` (real file bytes) | 45.36 MB |
| `dist/` total (`du -sh`) | 60 MB |

46.82 MB source / 45.36 MB `dist/assets` is within the task's own "~5 MB of the 50 MB budget"
danger-zone definition (consistent with M1-08's report flagging ~47.6 MB) — close enough that
the task requires an actual fix, not just a recorded number.

### Fix applied

`scripts/build-exercise-db.ts`'s image-processing constants were tuned down (simple
re-compression, not the bigger thumbnails-only-bundled fallback):

| Constant | Before | After |
|---|---|---|
| `MAX_WIDTH` | 600 px | 500 px |
| `JPEG_QUALITY` | 75 | 68 |
| `THUMB_WIDTH` | 128 px (unchanged) | 128 px (unchanged) |

`npm run build:exercises` was re-run against the same 873 source records (deterministic —
dataset `version` changed to `6b99c4cb4f2a44e93d7704d7152f16b6d74da96cc4feabefd28f620d979031c6`
since image bytes are part of what actually ships, though the mapped JSON's own logical content
is otherwise identical). The two generated static-require registries
(`src/features/exercises/exercise-thumbnail-registry.generated.ts` and
`exercise-image-registry.generated.ts`) were regenerated to match via
`npm run build:exercise-thumbnails`. Three re-compressed images were opened and visually
spot-checked (`Barbell_Bench_Press_-_Medium_Grip/0.jpg`, `Plank/0.jpg`,
`Farmers_Walk/thumb.jpg`) — all clean, correctly oriented, no visible quality loss at this
image style (simple gym-photo illustrations, not fine-detail photography).

### After

| Measure | Size |
|---|---|
| `assets/exercises/` (real file bytes) | 31.11 MB |
| `assets/exercise-db.json` | 1.01 MB |
| **Source total** | **32.12 MB** |
| `npx expo export --platform ios` → `dist/assets/` (real file bytes) | 30.80 MB |
| `dist/` total (`du -sh`) | 46 MB |

**~14.7 MB saved (46.82 MB → 32.12 MB source, a 31% reduction); `dist/assets` 45.36 MB → 30.80
MB.** This leaves **~19 MB of margin under the 50 MB budget** on `dist/assets` — a safe margin,
not a borderline one — so the bigger architectural fallback (O-10a: "thumbnails-bundled +
on-demand full images") was **not** needed. Recorded per O-10a: the owner decision default
("take the documented fallback") was not exercised because the simpler fix already cleared the
budget with comfortable margin; O-10a itself remains available unused if a future milestone's
asset growth (custom-exercise photos are user-local/not bundled, so the only realistic future
growth here is more built-in exercises or GIF-animation assets per 03 §7) reopens the question.

---

## 4. Verification

- `npm run build:exercises` (`tsx scripts/build-exercise-db.ts`) — clean run, 0 hard errors, 0
  warnings, 873 mapped, 1746 images + 873 thumbnails processed, 0 processing errors.
- `npm run build:exercise-thumbnails` — regenerated both static-require registries against the
  new dataset version.
- `pnpm test -- --coverage` (full suite): **59 suites / 558 tests, all green** — includes new/
  updated cases in `src/domain/__tests__/curation.test.ts` (the `instructions` override field:
  valid/invalid shapes, the 5 real seeded entries) and
  `src/domain/__tests__/exercise-mapping.test.ts` (all-real-records-fixed assertion +
  `Push_Press` override-applied case + a synthetic case proving the missing-instructions warning
  mechanism itself still works).
- `pnpm typecheck` (`tsc --noEmit`) — clean.
- `pnpm lint` (`eslint .`) — clean.

## 5. Acceptance gate — met

- [x] Spot-check table committed with 21/21 (≥ 20) lifts passing, 3 PASS rows carrying a
      documented non-defect note for context.
- [x] Curation-report warnings all triaged: 5/5 fixed with real content, 0 waived, 0 remaining.
- [x] Bundle size measured precisely before/after; genuinely-at-risk number (46.82 MB /
      within-5MB-of-budget) triggered an actual fix (image re-compression), not just a note;
      final size (32.12 MB source / 30.80 MB `dist/assets`) recorded with a safe (~19 MB)
      margin under the 50 MB budget.
