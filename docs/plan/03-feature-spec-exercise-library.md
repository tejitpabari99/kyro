# 03 — Feature Spec: Exercise Library

A headline feature (owner decision D6). The library ships with ~870 bundled open-source exercises and treats user-created exercises as first-class citizens — identical UX, storage, and capabilities. Enums and schema per `05`; visual components per `07`.

---

## 1. Concepts

- **Exercise** (`exercises` table): id, name, `exercise_type` (one of 8), `primary_muscle_group` (one of 20), `secondary_muscle_groups[]`, `equipment` (one of 9), `instructions` (ordered steps), `images[]` (0..n), `is_custom`, `uses_custom_metric`, `archived_at`.
- Built-ins: `id` = free-exercise-db slug (e.g. `Barbell_Bench_Press_-_Medium_Grip`), `is_custom=0`, images are bundled assets. Customs: UUID id, `is_custom=1`, images are user files in the app's documents dir.
- Built-ins are immutable except: user may **duplicate** one into a custom copy and edit that. Customs support full CRUD.

## 2. Exercises tab (browse)

- Header: "Exercises" large title; `+` (create custom, §5); search bar.
- **Filter chips:** `All Equipment ▾` and `All Muscles ▾` — each opens a bottom sheet of options (the 9 equipment categories / 20 muscle groups, with human labels per `05` §2.3); single-select per chip; active chip shows selection and accent tint; `Clear` resets.
- **Sections:** `Recent` (last 10 distinct exercises logged, most recent first; hidden while searching/filtering) then `All` — alphabetical with sticky letter headers and a right-edge A–Z index rail.
- **Row:** 44 pt thumbnail (first image, or a colored circle with the exercise's initial as placeholder), name (1 line, tail-truncated), subtitle = primary muscle label; customs show a small "Custom" tag. Tap → exercise detail (§4).
- **Search:** case/diacritic-insensitive substring on name; also matches known aliases (alias list maintained in the curation overrides file, §6.4 — e.g. "OHP" → Overhead Press). Results update per keystroke, debounced 150 ms.
- Empty state (no matches): "No exercises found" + `Create "{query}"` shortcut into §5 with name pre-filled.
- **Picker mode** (from logger/routine editor): same screen presented as a sheet with multi-select checkmarks, a selection counter, `Superset` toggle, and bottom `Add N exercises` button (`02` §3). Single-tap in picker selects; info button (ⓘ) on the row opens detail without selecting.

**Acceptance criteria**
- [ ] 870-row list scrolls at 60 fps (virtualized, `06` §8); search returns < 50 ms perceived.
- [ ] Filters combine (equipment AND muscle) and compose with search.
- [ ] Recents reflect actual logging history and update after each workout.
- [ ] Picker multi-select + Superset toggle adds a color-grouped superset to the workout.
- [ ] Placeholder thumbnails render for exercises without images (customs) — no broken-image UI.

## 3. Exercise detail page

Pushed screen (or sheet when opened mid-workout). Header: media area, 16:9 — shows the exercise image pair with an **auto-crossfade toggle (~1 s interval)** between position-0 and position-1 images, simulating motion. This same slot is the future **animation/GIF slot** (design requirement): it renders, in priority order — animated media (future) → image pair crossfade → single image → branded placeholder (muscle-group glyph on `bg.tertiary`). No layout change will be needed when GIFs arrive (§7).

Segmented tabs below header: **About | History | Charts | Records**.

- **About:** exercise type label (e.g. "Weight & Reps"), equipment label; muscle diagram-free v1: primary muscle as filled chip, secondaries as outline chips; numbered instruction steps. Customs with no instructions show "No instructions added — edit to add".
- **History:** reverse-chron list of every performance: workout title + date, then that workout's set lines (`1 · 80kg × 8 @9`, warm-ups with `W` badge). Tap → the full workout detail. Infinite scroll, 20 per page.
- **Charts:** metric selector (per exercise type, `04` §4.3): Heaviest Weight, Estimated 1RM, Best Set Volume, Session Volume, Total Reps (rep types); Duration types: Longest Duration, Total Duration; Cardio: Distance, Duration, Pace. Range selector: 3M / 1Y / All. Line chart styling per `07` §7.
- **Records:** PR cards (`04` §5.1 types applicable to this exercise type) with value + date + link to the workout; **Set Records table**: rows for rep counts 1–10+ ("10+" bucket) showing best weight at that rep count and date. Empty state: "No records yet".

Custom exercises additionally show `Edit` in the nav bar and ⋯ → Edit / Delete (§5). Built-ins show ⋯ → `Duplicate as Custom`.

**Acceptance criteria**
- [ ] All four tabs work for built-in and custom exercises identically.
- [ ] Media slot renders each fallback tier correctly (test: built-in with 2 images, custom with 1 user photo, custom with none).
- [ ] Charts/records/history respect unit settings and warm-up exclusion rules.
- [ ] Detail opened as sheet mid-workout does not disturb the active workout.

## 4. Media slot behavior (contract for future GIFs)

The media component's contract: `ExerciseMedia({ exercise, size })` resolves sources in priority order: `exercise.animation_uri` (future column, nullable — reserved now in schema `05` §3.1) → `images[0..1]` crossfade → `images[0]` static → placeholder. Thumbnails use `images[0]` → placeholder. This is the only component that touches exercise media; GIF adoption later = populate `animation_uri` + render `expo-image` (which plays GIF/WebP natively). No other UI changes.

## 5. Custom exercises

**Create** (`+` on Exercises tab, `Create Exercise` in picker, or empty-search shortcut): form —
- Image (optional): photo library / camera → stored via `05` §8; square-cropped.
- Name (required, unique among non-archived exercises, case-insensitive; inline error on duplicate).
- Exercise type (required, one of 8; picker with column-preview explanation). **Immutable after the first logged set** (changing measurement semantics would corrupt history); until then editable.
- Equipment (one of 9, default `none`).
- Primary muscle group (required, one of 20); secondary muscle groups (multi-select, optional).
- Instructions (optional multiline; split on newlines into steps).
- "Track extra metric" toggle → sets `uses_custom_metric` (adds CUSTOM column in logger).

**Edit:** all fields except type-after-use (above). **Duplicate as Custom** pre-fills the form from a built-in (name + " (Copy)").

**Delete:** if the exercise has zero references (no workout/routine rows) → hard delete + remove image files. If referenced → explain and offer **Archive** instead: archived exercises disappear from browse/picker but render normally in history, stats, and old routines (starting a routine containing one still works). Archived list lives under Profile → Exercises → Archived, with Restore.

**Parity guarantee:** customs get everything built-ins get — PREVIOUS values, PRs and set records, charts, records, history, CSV export (by name), routine membership.

**Acceptance criteria**
- [ ] Create → appears in picker/browse instantly, logged like a built-in, PRs computed.
- [ ] Type immutable after first logged set (UI disables with explanation).
- [ ] Duplicate name rejected case-insensitively.
- [ ] Referenced exercise delete → archive path; archived exercise still renders in history and old routines; restorable.
- [ ] CSV export of a custom-exercise workout carries the exercise name; re-import maps back by name (`05` §7.4).

## 6. Bundled dataset: free-exercise-db

### 6.1 Choice & license

**Chosen source: [free-exercise-db](https://github.com/yuhonas/free-exercise-db)** (yuhonas) — ~870 exercises as JSON + JPG image pairs. License: **Unlicense (public domain)** — verified July 2026; no attribution required (we'll credit it in-app Settings → About anyway). Derived from `wrkout/exercises.json`.

Evaluated alternative — **wger**: richer multilingual data but content is CC-BY-SA (share-alike complicates bundling in a closed app), API-oriented, and image coverage is inconsistent. Rejected for v1; remains a candidate for supplementary GIFs (§7).

### 6.2 Source shape

Each record: `id` (slug), `name`, `force` (push/pull/static/null), `level` (beginner/intermediate/expert), `mechanic` (compound/isolation/null), `equipment` (string/null), `primaryMuscles[]`, `secondaryMuscles[]`, `instructions[]`, `category` (strength/stretching/plyometrics/strongman/powerlifting/cardio/olympic weightlifting), `images[]` (paths like `Exercise_Name/0.jpg`, typically 2 per exercise).

### 6.3 Field mapping → Kyro schema

| Kyro field | Mapping |
|---|---|
| `id` | source `id` slug, verbatim (P12) |
| `name` | source `name`; curation overrides may append equipment qualifiers to disambiguate (e.g. "(Barbell)") |
| `primary_muscle_group` | `primaryMuscles[0]` via muscle map below; if `category=cardio` → `cardio`; missing → `other` |
| `secondary_muscle_groups` | remaining `primaryMuscles[1..]` + `secondaryMuscles[]`, mapped, deduped, minus primary |
| `equipment` | equipment map below |
| `exercise_type` | heuristic below + overrides |
| `instructions` | `instructions[]` verbatim |
| `images` | bundled asset refs for `images[]` |
| `is_custom` | 0 |
| `uses_custom_metric` | 0 except override list (stair machine etc.) |

**Muscle map** (source → Kyro `muscle_group`, 20-value enum `05` §2.3): abdominals→`abdominals` · abductors→`abductors` · adductors→`adductors` · biceps→`biceps` · calves→`calves` · chest→`chest` · forearms→`forearms` · glutes→`glutes` · hamstrings→`hamstrings` · lats→`lats` · **lower back**→`lower_back` · **middle back**→`upper_back` · neck→`neck` · quadriceps→`quadriceps` · shoulders→`shoulders` · traps→`traps` · triceps→`triceps`. Kyro values `cardio`, `full_body`, `other` are assigned by category/overrides (dataset has no direct equivalents).

**Equipment map** (source → Kyro 9-value enum): body only→`none` · barbell→`barbell` · dumbbell→`dumbbell` · kettlebell→`kettlebell` · machine→`machine` · **cable**→`machine` · **e-z curl bar**→`barbell` · bands→`resistance_band` · medicine ball→`other` · exercise ball→`other` · foam roll→`other` · other→`other` · null→`none`.

**Exercise-type heuristic** (order matters; overrides file wins over all):
1. Override file entry → use it.
2. `category=cardio` and name matches run/row/bike/elliptical/ski/swim → `distance_duration`.
3. `category=cardio` or `stretching` otherwise → `duration`.
4. `equipment=body only` + name matches plank/hold/hang/carry-less isometrics → `duration`.
5. `equipment=body only` + name matches pull-up/chin-up/dip/muscle-up/pistol → `bodyweight_reps`; "assisted" prefix or machine-assisted → `bodyweight_assisted_reps`.
6. `equipment=body only` otherwise → `reps_only` (sit-ups, push-ups default; push-up variants moved to `bodyweight_reps` via overrides where added load is common).
7. Name matches carry/farmer/suitcase/sled/yoke → `short_distance_weight`.
8. Name matches "wall sit"/weighted hold → `weight_duration`.
9. Default → `weight_reps`.

### 6.4 Build-time import pipeline

A repo script, **not** runtime work: `scripts/build-exercise-db.ts` (Node, run via `npm run build:exercises`):

1. Vendor the dataset: `data/free-exercise-db/exercises.json` + `images/` committed to the repo (public domain; pinned — no network at build).
2. Apply `data/curation/overrides.json`: per-id partial overrides `{ exercise_type?, uses_custom_metric?, name?, aliases?, exclude?: true }` + global alias entries. Excluded ids are dropped (e.g. exact duplicates).
3. Map fields per §6.3; **validate**: every enum value legal, primary muscle present, instructions non-empty warning list, image files exist; fail the build on hard errors, emit `curation-report.md` for warnings (fuels the M1 curation pass).
4. Image processing: `sharp` → resize to max 600 px wide, strip metadata, re-encode JPEG q75; emit thumbnails 128 px. Output to `assets/exercises/{id}/{0,1}.jpg` + `thumb.jpg`.
5. Emit `assets/exercise-db.json` (the mapped records with image asset keys) + a checksum/version constant.
6. At app first-launch (and whenever the bundled checksum ≠ the one recorded in DB), a **seed migration** upserts built-ins into the `exercises` table by id (updates never touch user data; removed built-ins get archived, not deleted). Runs inside a transaction; < 1 s target on device.

### 6.5 Size budget

~870 exercises × 2 images ≈ 1700 JPGs; at ~10–20 KB each post-compression ≈ **20–35 MB** in the bundle plus thumbnails. Acceptable (Hevy is ~249 MB). If it exceeds 50 MB, fall back to shipping thumbnails bundled + full images as an on-demand asset pack (decision point at M1 exit — flagged in `09`).

**Acceptance criteria (dataset)**
- [ ] `npm run build:exercises` is deterministic, validates enums, and fails on unmapped values.
- [ ] Seed completes < 1 s on device; re-running app doesn't duplicate rows; dataset version bump updates built-ins without touching custom exercises or history.
- [ ] Spot-check 20 well-known lifts (bench, squat, deadlift, OHP, pull-up, plank, farmer's walk, treadmill run…) for correct type/muscles/equipment/images — part of the M1 curation checklist.
- [ ] Every `exercise_type` heuristic branch is covered by unit tests with representative slugs (`08` §4.7).

## 7. Animation/GIF roadmap (deferred milestone)

v1 ships the crossfading image pair (§4). Later milestone (`11` §1) options, in preference order:

1. **free-exercise-db pairs → generated WebP** (build pipeline animates the 2 frames with easing): zero licensing risk, mediocre quality — cheap experiment.
2. **wger media** (CC-BY-SA): attribution + share-alike review needed for the media files used; per-exercise manual matching.
3. **Licensed commercial GIF pack** (e.g. ExerciseDB-style/musclewiki-style vendors): best quality, one-time cost, per-license redistribution terms must permit app bundling; map by name+equipment.
4. **Self-recorded clips** for the owner's ~50 staple exercises: perfect relevance, most effort.

Whatever the source, integration is only: populate `animation_uri` (bundled asset or cached download) — the media slot contract (§4) already renders it.
