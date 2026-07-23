# M1 Tasks — Exercise Library & Data Layer Core

Milestone spec: `../09-milestones-and-delivery.md` (M1). Exit = 870 exercises browsable at 60 fps; deterministic fully-mapped dataset build; custom-exercise acceptance criteria pass; `src/data` coverage ≥ 90% for implemented repos.

No owner tasks gate M1. The bundle-size fallback call at M1-11 is flagged to the owner (O-10) but has a specified default (thumbnail-only fallback plan, 03 §6.5) so dev proceeds either way.

Task count: **12**

---

### M1-01 — Full v1 schema: Drizzle schema.ts + migration 0002 [done]
**Description:** Land the complete 05 §3 DDL — exercises, workouts, workout_exercises, sets, routines, routine_folders, routine_exercises, routine_sets, body_measurements, progress_photos — even though most UI arrives later.
**How:** Mirror 05 §3.1–3.4 exactly in `src/data/schema.ts` (snake_case, TEXT uuid/slug PKs, INTEGER epoch-ms timestamps, CHECK-constrained enums incl. RPE domain, JSON-array TEXT columns, `animation_uri` reserved column). All indexes verbatim, including the partial unique indexes `idx_one_active_workout` and `idx_exercises_name_active`, and the `routine_sets` reps-vs-range CHECK. Generate migration 0002 with drizzle-kit. Add enum constants module `src/domain/enums.ts` (exercise_type 8, set_type 4, muscle_group 20 with labels, equipment 9, rpe values, settings enums) — single source shared by DB/CSV/UI.
**References:** 05 §2, §3 (source of truth — copy, don't improvise), §10.
**Dependencies:** M0-09.
**Acceptance / test gate:** Migration fixture test: DB at 0001 with seeded settings → migrate → all tables/indexes exist, data intact (08 §5.3 pattern; commit the 0001 fixture dump under `src/data/migrations/__fixtures__/`). CHECK constraints verified by insert-rejection tests (bad enum, rpe=6.2, reps+range both set).
**Est:** 1.5 d

### M1-02 — domain/units.ts + conversion test suite [done]
**Description:** The single conversion module used at every display/input boundary.
**How:** Per 05 §5: `kgToLb` (×2.2046226218) with display rounding nearest 0.5 lb ≥ 10 lb else 0.1; `lbToKg` stored full precision; m↔km/miles (miles = m/1609.344, 2 decimals), meters/feet (whole ft); seconds → mm:ss under 1 h, h:mm:ss above; cm↔in (1 decimal). Include mm:ss **parsing**: digit-fill seconds→minutes ("130" → 1:30 → 90 s) and normalize bare seconds ≥ 60 ("90" → 1:30/90 s per 08 §4.5 resolution). Pure TS, zero RN imports.
**References:** 05 §5; 02 §4 (TIME entry); 08 §4.5 (named cases).
**Dependencies:** M0-03.
**Acceptance / test gate:** 08 §4.5 suite green: kg↔lb round-trip stability (100 random values × 3 round trips, epsilon-bounded), display rounding rules, mm:ss parse cases, miles/km, cm/in, 0-and-null passthrough. **Also:** this is the first source file under `src/domain/**` — uncomment the `'./src/domain/**/*.{ts,tsx}': { lines: 95, branches: 90 }` `coverageThreshold` entry in `jest.config.js` (currently commented out with a `TODO(M1)`, per M0-03's review — Jest hard-errors on a zero-covered-file glob, which is why it was deferred, not weakened) and confirm `pnpm test -- --coverage` still passes with it active.
**Est:** 0.5 d

### M1-03 — Vendor free-exercise-db + curation scaffolding
**Description:** Commit the dataset and the curation override machinery as build inputs.
**How:** Vendor `data/free-exercise-db/exercises.json` + `images/` from github.com/yuhonas/free-exercise-db (Unlicense; pin the commit hash in a `VENDORED.md` note — no network at build time). Create `data/curation/overrides.json` schema: per-id partials `{exercise_type?, uses_custom_metric?, name?, aliases?, exclude?: true}` + global alias entries (seed with a starter set: "OHP" → Overhead Press etc.); Zod-validate its shape. Seed the initial override entries the heuristics are known to need (stair machine → uses_custom_metric, push-up variants → bodyweight_reps per 03 §6.3 rule 6 note).
**References:** 03 §6.1–6.2, §6.4 steps 1–2.
**Dependencies:** M0-02.
**Acceptance / test gate:** Files committed; overrides.json validates against its Zod schema in a unit test; repo size delta noted (input images are raw here; output compression happens in M1-04).
**Est:** 0.5 d

### M1-04 — `scripts/build-exercise-db.ts` build pipeline + tests
**Description:** Deterministic Node script mapping the vendored dataset to Kyro schema records + processed images.
**How:** Implement 03 §6.4 steps 2–5: apply overrides (override file wins over all heuristics); map fields per 03 §6.3 (muscle map incl. middle back→upper_back, equipment map incl. cable→machine and e-z curl bar→barbell; exercise-type heuristic in the specified order 1–9); validate — every enum legal, primary muscle present, image files exist; **fail build on hard errors**, emit `curation-report.md` warnings (missing instructions, unmatched values). Image processing via `sharp`: max 600 px wide, strip metadata, JPEG q75, plus 128 px `thumb.jpg`, output `assets/exercises/{id}/{0,1}.jpg`. Emit `assets/exercise-db.json` + checksum/version constant. `npm run build:exercises` script. Determinism: stable sort + stable JSON key order → stable output hash.
**References:** 03 §6.3–6.5; 08 §4.7.
**Dependencies:** M1-03.
**Acceptance / test gate:** 08 §4.7 suite green: every muscle/equipment mapping entry, each heuristic branch via representative slugs, override precedence, enum-validation build failure, deterministic output hash (run twice, compare). Manual: report generated, spot-open 3 processed images.
**Est:** 2 d

### M1-05 — Dataset seeding at app boot
**Description:** First-launch (and version-bump) seed of built-ins into the `exercises` table.
**How:** In the cold-start sequence after migrations (06 §5.1): compare bundled checksum vs `app_meta.dataset_version`; on mismatch, transactional upsert-by-id of all records (`ExerciseRepository.seedBuiltins`); removed built-ins → archived, never deleted; custom rows and user edits to nothing (built-ins immutable) untouched. Target < 1 s on device — use a single transaction with prepared statements.
**References:** 03 §6.4 step 6; 05 §10 (dataset seeding is data, not schema).
**Dependencies:** M1-01, M1-04.
**Acceptance / test gate:** Integration tests: fresh DB seeds N rows; re-run no-op (no duplicates, no updated_at churn); version bump updates a changed built-in, archives a removed one, leaves a custom row + a fake history row untouched. Manual: first-launch timing logged < 1 s-equivalent on simulator.
**Est:** 1 d

### M1-06 — ExerciseRepository + integration suite
**Description:** Complete `ExerciseRepository` per the 05 §6 interface against Drizzle.
**How:** Implement `list` (filter: query — case/diacritic-insensitive substring on name **and aliases**; muscle; equipment; includeArchived), `get`, `create` (UUID, is_custom=1, name-unique-among-active check), `update` (patch custom fields; enforce type-immutable-after-first-logged-set at repo level via referenceCount of sets), `archive`/`restore`, `delete` (throws IfReferenced), `referenceCount`, `recentlyUsed` (last N distinct from completed workouts), `seedBuiltins` (used by M1-05). Search normalization helper in `src/domain/` (diacritic strip) so it's unit-testable.
**References:** 05 §6; 03 §2 (search/alias semantics), §5 (constraints).
**Dependencies:** M1-01.
**Acceptance / test gate:** Integration test per method — happy path + key edge (08 §2): duplicate active name rejected case-insensitively, archived excluded from default list, delete-referenced throws, recentlyUsed ordering/distinctness, alias match. Coverage counts toward the ≥ 90% `src/data` gate.
**Est:** 1.5 d

### M1-07 — Exercises tab: browse, search, filters, A–Z index
**Description:** The full library browse screen per 03 §2 (picker mode is M2-09).
**How:** `app/(tabs)/exercises/index.tsx` + feature components. FlashList v2, fixed row height, 44 pt thumbnail via `expo-image` (memory-disk cache) with initial fallback (`Avatar/Thumb`); Recent section (repo `recentlyUsed(10)`, hidden while searching/filtering — will be empty until M2 logging exists; render the section only when non-empty); All section alphabetical with sticky letter headers + right-edge A–Z rail; equipment + muscle filter chips opening option Sheets (single-select, human labels from enums module, Clear resets, active accent tint); search debounced 150 ms, in-memory over the preloaded array; empty state with `Create "{query}"` shortcut (navigates to M1-09 form with name pre-filled); "Custom" tag on custom rows.
**References:** 03 §2; 06 §8 (perf tactics); 07 §5.
**Dependencies:** M1-05, M1-06, M0-06/07/08.
**Acceptance / test gate:** 60 fps scroll over 870 rows (manual on simulator + note); filters AND-compose with search (RNTL behavioral tests on the filter logic); A–Z rail jumps; empty-search shortcut navigates; placeholder thumbs render for image-less exercises.
**Est:** 2 d

### M1-08 — ExerciseMedia component + exercise detail page (About)
**Description:** The media-slot contract component and the detail screen with About tab live, History/Charts/Records as empty states.
**How:** `ExerciseMedia({exercise, size})` resolves in priority order: `animation_uri` (future) → images[0..1] auto-crossfade (~1 s interval, expo-image) → images[0] static → branded placeholder (muscle-group glyph on bg.tertiary). This is the ONLY component touching exercise media (03 §4). Detail route `app/exercise/[id].tsx` (push; presentable as sheet mid-workout later): 16:9 media header, SegmentedControl tabs About | History | Charts | Records. About: type label, equipment label, primary muscle filled chip, secondary outline chips, numbered instructions ("No instructions added — edit to add" for bare customs). History/Charts/Records render EmptyState placeholders (go live M4-09).
**References:** 03 §3, §4 (media contract); 07 §5, §7.
**Dependencies:** M1-06, M1-07.
**Acceptance / test gate:** Media fallback-tier tests (built-in with 2 images crossfades; custom with 1 user photo static; custom with none → placeholder) per 03 §3 acceptance; RNTL smoke both themes; tabs switch.
**Est:** 1.5 d

### M1-09 — lib/files.ts + custom exercise create/edit
**Description:** File-storage seam and the custom exercise form (create, edit, image pick/store).
**How:** `src/lib/files.ts`: documentDirectory roots `photos/exercises/{exerciseId}/{uuid}.jpg` (and `photos/progress/` for M5), store **relative names only** in DB, re-encode via `expo-image-manipulator` (square-crop for exercise images), delete-file helpers. Form (route `app/exercise/new.tsx` / `[id]/edit.tsx`): image (library/camera via expo-image-picker), name (required, unique-among-active, inline duplicate error), exercise type (picker with column-preview explanation; **immutable after first logged set** — disable with explanation), equipment (default none), primary muscle (required), secondary multi-select, instructions multiline (split on newlines), "Track extra metric" toggle → uses_custom_metric.
**References:** 03 §5; 05 §8 (file storage).
**Dependencies:** M1-06, M1-08.
**Acceptance / test gate:** Create → appears in browse/picker instantly; duplicate name rejected case-insensitively (RNTL + repo test); image stored under documents dir with relative name in DB; type-lock behavior unit-tested at repo level (M1-06) + UI disabled state.
**Est:** 1.5 d

### M1-10 — Custom exercise delete/archive/restore, duplicate-as-custom, archived screen
**Description:** Lifecycle completion for customs + built-in duplication.
**How:** Delete: zero references → hard delete + remove image files; referenced → dialog explaining + offer Archive. Archived exercises: hidden from browse/picker, still render in history/stats/old routines (query paths already exclude-by-default per M1-06). Archived management screen under Profile → Exercises → Archived with Restore. `Duplicate as Custom` on built-in detail ⋯ menu → pre-fills M1-09 form (name + " (Copy)"). Detail nav: customs show Edit + ⋯ Edit/Delete; built-ins show ⋯ Duplicate as Custom.
**References:** 03 §5 (delete/archive rules, parity guarantee), §3 (menu placement); 04 §7 (Profile shortcut).
**Dependencies:** M1-09.
**Acceptance / test gate:** 03 §5 acceptance: referenced delete → archive path; archived still renders where referenced and is restorable; hard delete removes files (integration test with tmp files); duplicate flow produces an editable custom.
**Est:** 1 d

### M1-11 — Curation pass + bundle-size decision point
**Description:** Human-in-the-loop data quality pass over the generated dataset, and the size checkpoint.
**How:** Work through `curation-report.md` warnings: fix via `overrides.json` entries (types, names, aliases, excludes for exact duplicates), re-run build until warnings are triaged. Execute the 20-lift spot-check (bench, squat, deadlift, OHP, pull-up, plank, farmer's walk, treadmill run, …) verifying type/muscles/equipment/images; record results in `docs/qa/M1-curation.md`. Measure final bundled asset size: if > 50 MB → implement the documented fallback (thumbnails bundled, full images on-demand asset pack) — surface the call to the owner (O-10) but default to the fallback plan if no answer, so nothing blocks.
**References:** 03 §6.4–6.5 + acceptance; 09 M1 scope; 00 open item 3.
**Dependencies:** M1-04, M1-05.
**Acceptance / test gate:** Spot-check table committed with all 20 pass; curation report warnings all triaged (fixed or waived with reason); size number recorded + decision noted.
**Est:** 1 d

### M1-12 — M1 QA, bug iteration & exit gate
**Description:** Milestone-close pass.
**How:** Verify all M1 exit criteria + 03 §2/§3/§5 acceptance checklists manually on simulator (both themes); fix P0/P1 with regression tests; confirm `src/data` coverage ≥ 90% lines for implemented repos; `docs/qa/M1-checklist.md`; milestone tag.
**References:** 09 M1 exit; 08 §7–8.
**Dependencies:** all M1 tasks.
**Acceptance / test gate:** Checklist committed, zero P0/P1, CI green, coverage gate holds, tag pushed.
**Est:** 1 d
