# M1 Exit Checklist — Exercise Library & Data Layer Core

Milestone-close verification for M1, per `docs/plan/tasks/M1-tasks.md` (M1-12) and the M1
exit criteria in `docs/plan/09-milestones-and-delivery.md`. This is the "milestone exit =
tag `v0.<M>.0` + checklist file committed under `docs/qa/`" artifact, same convention
`docs/qa/M0-checklist.md` established.

**Scope of this pass, and why it's larger than M0's:** M1-01 through M1-07 each received an
individual code-review pass (logged in `docs/plan/EXECUTION-LOG.md`), but a mid-milestone
process change meant **M1-08 through M1-11 shipped with no individual review at all** — only
a `done` row each, never a `reviewed` row. This task is therefore both the standard exit-gate
pass *and* the first real code review of four unreviewed tasks' combined diff. §2 below is
that catch-up review, and it is the substantive part of this checklist — it found and fixed
two real P1 functional bugs that had been silently shipping since M1-08/M1-09.

Verified at commit `a8a107f` (tip of `users/tejitpabari/init` at the start of this task).

---

## 1. Full CI gate (`pnpm run ci`)

Steps: `tsc --noEmit` → `eslint .` → `pnpm test -- --coverage` → `npx expo-doctor` →
`npx expo export --platform ios`. This is the exact sequence `.github/workflows/ci.yml` runs
(non-continue-on-error), so a nonzero exit here means the real CI workflow is also red.

**Initial run: red.** `npx expo-doctor` failed 20/21 — `@shopify/flash-list` installed at
`2.3.2` vs. SDK 56's expected `2.0.2`. Every M1-07/M1-08/M1-09 `EXECUTION-LOG.md` entry had
logged this as "non-blocking" (since `expo export` still bundles fine), but **nobody had
actually fixed it** — meaning the literal `&&`-chained `pnpm run ci` (and the real GitHub
Actions workflow) has had a nonzero exit code for the entire milestone. Fixed by adding the
officially-documented `expo.install.exclude` entry to `package.json` (`expo-doctor`'s own
"Advice" line): `2.3.2` is a strict superset patch/minor bump within the same new-arch-only
v2 API M1-07 deliberately installed for (no `estimatedItemSize` prop in that API at all,
already documented in that task's `EXECUTION-LOG.md` row) — not a version anyone needs to
roll back.

**Final run: green, exit 0.**

```
Test Suites: 60 passed, 60 total
Tests:       564 passed, 564 total
Snapshots:   0 total
Time:        ~45s
Ran all test suites in 2 projects.

Running 21 checks on your project...
21/21 checks passed. No issues detected!

Exported: dist
```

`dist/` total 46 MB, `dist/assets` ~36 MB (bundled dataset + processed images) — within
03 §6.5's 50 MB budget, consistent with M1-11's re-tuning (600px/q75 → 500px/q68).

Coverage (all active thresholds from `jest.config.js` met):

| Area | Threshold | Actual |
|---|---|---|
| `src/domain/**` | 95% / 90% | 100% / 100% |
| `src/data/**` | 90% / 85% | 100% / 95.28% (branches; `src/data/exercises` is the one subdir below 100% branch, still well over the 85% floor) |
| global | 75% / 70% | 98.23% / 91.76% / 87.43% (fn) / 98.48% (line) |

`src/features/workout/**` (85/80) remains commented out in `jest.config.js` — still correct,
that directory has no real logic yet (M2).

## 2. M1-08…M1-11 catch-up code review (the substantive part of this pass)

Diffed every M1-08–M1-11 commit in full (`git show 9f1b2d5 b5488d9 8b6f10a` etc.) against
03 §3–§6 and each task's own text, then independently re-read every file the task brief
named: `ExerciseMedia.tsx`, `ExerciseDetailScreen.tsx`, `ExerciseFormScreen.tsx`,
`ArchivedExercisesScreen.tsx`, `src/lib/files.ts`, `exercise-form-prefill.ts`, and the M1-11
curation/build diff (`scripts/build-exercise-db.ts`, `src/domain/curation.ts`,
`src/domain/exercise-mapping.ts`).

### 2.1 — P1 bug (fixed): a custom exercise's own photo never actually loaded

`exercise-media-source.ts`'s `resolveImageSources` used a custom exercise's `images[]`
entries **as-is** as `expo-image` sources. But `05 §8` (and `M1-09`'s own `saveExercisePhoto`)
store only the **bare relative file name** in the DB (e.g. `"abc123.jpg"`), never an absolute
path — resolving that into a loadable `file://` URI requires joining it with
`documentDirectory` first (`exercisePhotoUri`, the exact helper `ExerciseFormScreen`'s own
image preview already calls for this reason). Net effect: on a real device, a custom
exercise's detail-page header (`ExerciseMedia`) would try to render `expo-image` with
`source: "abc123.jpg"` — a bare string with no scheme — which cannot resolve to the actual
photo. The user's own photo would never appear on their custom exercise's detail page.

**Why this shipped unnoticed:** `ExerciseMedia.test.tsx` and `exercise-media-source.test.ts`
(both M1-08) stubbed the custom-exercise test case's `images[]` with an *already-resolved*
`file:///mock/documents/...` URI instead of a bare file name — a fixture shape that matched
the bug instead of catching it. This makes sense chronologically: M1-08 landed *before*
M1-09 decided the real bare-name-only storage convention, and nobody revisited the fixture
once M1-09 actually shipped.

**Fix:** `resolveImageSources` now calls `exercisePhotoUri(exercise.id, fileName)` for each
custom image entry. Both test files updated to pass real bare file names and mock
`@/lib/files` (the codebase's established mocking seam for this native module), so the fix's
regression path is now actually exercised. `exercise-media-source.ts`'s header comment —
previously incorrect about what M1-09 would land — corrected.

### 2.2 — P1 bug (fixed): a custom exercise's browse-row thumbnail never showed its photo either

Same root cause, different call site. `exercise-thumbnail.ts`'s `resolveExerciseThumbnailSource`
(M1-07) **unconditionally returned `undefined` for every custom exercise**, regardless of
`images[]` — its own header comment even said "once M1-09 lands a real file-URI convention,
this is the one function that needs updating to resolve it," but M1-09 landed within this
same milestone and the function was never revisited. Net effect: a custom exercise with a
real user-added photo still always showed the initial-letter placeholder in the Exercises
browse-tab row, never the actual photo.

**Why this shipped unnoticed:** there was no dedicated unit test for this function at all —
it was only exercised indirectly through `ExerciseBrowseScreen.test.tsx`'s rendering of
`ExerciseRow`, and every custom-exercise fixture used there happened to have an empty
`images[]`, so the broken branch was never actually reached by any test.

**Fix:** same pattern — resolves via `exercisePhotoUri(exercise.id, exercise.images[0])` for
customs with a non-empty `images[]`. Added `exercise-thumbnail.test.ts` (5 cases: built-in
resolved via registry, built-in with no images, custom with a photo — the fixed bug's
regression case — custom with 2+ photos only using `images[0]`, custom with no images
falling back to the placeholder), since none existed before.

### 2.3 — Knock-on test-infra fix (not a product bug)

Both fixes above added a transitive top-level import of `@/lib/files` (which itself does
plain top-level native imports of `expo-image-manipulator`/`expo-image-picker`, by design —
see that file's own header) into `exercise-thumbnail.ts` / `exercise-media-source.ts`, both
reached from `ExerciseRow`/`ExerciseBrowseScreen`. This broke three previously-green suites
that render those components without mocking `@/lib/files`
(`ExerciseBrowseScreen.test.tsx`, `ExerciseBrowseScreen.full-dataset.test.tsx`,
`app/__tests__/tabs-layout.test.tsx`) — caught immediately by re-running the full suite after
the fix, not left for CI to find. Fixed by adding `jest.mock('@/lib/files')` to each,
matching the exact pattern `ExerciseFormScreen.test.tsx`/`ExerciseDetailScreen.actions.test.tsx`
already established for this same native-import boundary. Full suite re-verified green after
(60/60 suites, 564/564 tests).

### 2.4 — P2 bug (fixed): restoring an archived exercise could fail silently

`ArchivedExercisesScreen.handleRestore` called `repository.restore()` with no error handling
at all. `restore()` can throw `DuplicateExerciseNameError` by design — its own comment in
`exercise-repository.ts` states restoring "must not silently violate the active-name-
uniqueness rule" (e.g. archive "Bench Press", create a new active exercise also named "Bench
Press", then try to restore the original). Before this fix, that real, documented edge case
would surface as an unhandled promise rejection with **zero user feedback** — the row would
just silently stay in the archived list with no explanation. Fixed with a try/catch +
`Alert.alert`, matching `ExerciseDetailScreen`'s existing error-Alert convention for
repository failures. Added a regression test (`ArchivedExercisesScreen.test.tsx`) covering
the failure path, which had no prior coverage.

### 2.5 — Everything else reviewed, no further issues found

- **Security / input handling:** traced whether `exerciseId` (used to build on-device file
  paths in `src/lib/files.ts`) could ever be attacker/deep-link-controlled in a way that
  enables path traversal. It cannot in practice: every file-mutating call site
  (`saveExercisePhoto`, `deleteExercisePhotos`) is only ever reached *after* a successful
  `repository.update`/`.delete`/`.get` call on that same id, and `ExerciseRepositoryImpl`'s
  `requireRow(id)` throws `ExerciseNotFoundError` for any id that isn't a real, previously
  legitimately-created row — so a bogus deep-linked id never reaches the filesystem layer.
- **`ExerciseFormScreen.tsx`, `ExerciseDetailScreen.tsx`, `src/lib/files.ts`,
  `exercise-form-prefill.ts`, `ExerciseTypeSheet.tsx`, `MultiSelectOptionSheet.tsx`:** read in
  full; image-save ordering (create/update row first, then write the photo, then patch
  `images[]`), the type-immutable-after-first-logged-set UI gate, and the prefill
  read-and-clear contract are all correctly implemented and match their own header
  documentation. No bugs found.
- **M1-11 curation/build diff** (`scripts/build-exercise-db.ts`, `src/domain/curation.ts`,
  `src/domain/exercise-mapping.ts`): the `instructions` override field (Zod-validated,
  `.min(1)`) correctly takes precedence over the source record per the established
  override-wins-over-source convention; dedicated tests exist for both the schema addition
  (`curation.test.ts`) and the mapping precedence (`exercise-mapping.test.ts`, including a
  test asserting all 5 real M1-11 fixes together resolve to zero warnings). Re-ran the image
  registry generator independently — byte-identical output, 873/1746 entries, no drift.
- **Code-consistency sweep** (grepped `src/features/exercises/**`, `src/lib/files.ts`): zero
  raw hex literals, zero `console.log`/`.warn`/`.error`, zero `eslint-disable` comments, zero
  new/untracked `TODO`s — the two pre-existing `TODO(M5)` stubs in `files.ts`
  (`pickFile`/`writeFile`) predate M1-08 (M0-03) and are correctly scoped to M5's CSV tasks.

## 3. M1 exit criteria — evidence

### 3.1 — 870+ exercises browsable

`ExerciseBrowseScreen.full-dataset.test.tsx` seeds the **real** 873-record bundled dataset
into a real (in-memory) SQLite DB via the real migration + seed path, asserts
`repository.list()` returns exactly 873 rows, then mounts the real `ExerciseBrowseScreen`
(real `@shopify/flash-list`, not a stand-in) against it and confirms it renders without
crashing or hanging. Fixed row heights (`EXERCISE_ROW_HEIGHT = 64`, `SECTION_HEADER_HEIGHT =
32`, both real constants, not computed) are FlashList's actual documented smooth-scroll lever.

**60 fps is not independently verifiable in this environment** — no iOS Simulator/device
exists here (`docs/plan/BLOCKERS.md`). This is the standard caveat every M1 task already
carries forward, not new to this pass.

### 3.2 — Dataset build deterministic + fully mapped

Re-ran `npm run build:exercises` **twice**, independently, myself (not trusting the prior
commit's own report):

```
Loaded 873 source records + curation overrides.
Mapped 873 exercises (0 excluded by overrides), 0 mapping warning(s).
Image-file-exists check: 0 warning(s).
Processed 1746 images + 873 thumbnails (0 processing error(s)).
```

Both fresh runs produced `assets/exercise-db.json` with **sha256
`80f567c7270d7c5454753094f48db51bd4e49d7a3f618a3d38523181c9936810`** — identical to each
other *and* to the version already committed to the repo before this pass touched anything
(`git status` showed zero diff on `assets/`/`data/curation/` after both runs). Dataset
version constant inside the file: `6b99c4cb4f2a44e93d7704d7152f16b6d74da96cc4feabefd28f620d979031c6`.
**873/873 mapped, 0 hard errors, 0 warnings** — matches `data/curation/curation-report.md`
exactly. Also independently re-ran `scripts/generate-exercise-thumbnail-registry.ts` — byte-
identical regenerated output (873/1746 entries), confirming the derived registries are still
in sync with the dataset.

### 3.3 — Custom exercise acceptance criteria (03 §5)

Traced each specific bullet to a real, currently-passing test — not just "plausibly implied":

| 03 §5 bullet | Covered by | Status |
|---|---|---|
| Create → appears in picker/browse instantly | `exercise-repository.test.ts` ("excludes archived exercises by default…": creates, then asserts `repository.list()` — the exact call the browse screen's `useQuery` uses — includes it immediately) + `ExerciseFormScreen.test.tsx` (create calls `repository.create`, navigates on success) | **Covered** |
| …logged like a built-in, PRs computed | — | **Not testable at M1** — workout logging (M2) and PR computation (`RecordsService`, M4) don't exist yet. Confirmed via `grep` (no `RecordsService`/PR code anywhere in `src/`). Correctly out of scope; will be real by M4's exit gate. |
| Type immutable after first logged set (UI disables + explanation) | `exercise-repository.test.ts` (4 `hasLoggedSets` cases: unlocked/no-activity, workout-row-but-no-set still unlocked, logged-set locked, unknown-id throws) + `ExerciseFormScreen.test.tsx` (`disables the type picker…`/`does not disable…`) | **Covered** |
| Duplicate name rejected case-insensitively | `exercise-repository.test.ts` (`create`/`update`/`restore`, all case-insensitive) + `ExerciseFormScreen.test.tsx` (inline error surfaced) | **Covered** |
| Referenced delete → archive path; archived still renders in history/old routines; restorable | `ExerciseDetailScreen.actions.test.tsx` (referenced delete → archive-offer dialog → archives → hidden from default list) + `ArchivedExercisesScreen.test.tsx` (lists archived, Restore works, restore-conflict now surfaced per §2.4 above). "Still renders in history/old routines" itself isn't independently testable yet (History is M4, Routines is M3) — but the mechanism it depends on (`list()` excludes archived **only** by default; `get()`/`includeArchived` always see it) is repo-tested today, which is what M3/M4 will rely on. | **Covered at the data layer; UI-level parity is M3/M4's own exit gate** |
| CSV export of a custom-exercise workout carries the name; re-import maps back by name | — | **Not implemented yet** — `src/lib/files.ts`'s `pickFile`/`writeFile` are still throwing stubs, correctly scoped to M5 (`TODO(M5)`). Confirmed not silently faked. |

### 3.4 — `src/data` coverage ≥ 90%

See §1's coverage table: every `src/data/**` subdirectory is at 100% lines, 95–100% branches
— comfortably over the 90%/85% gate. `src/data/exercises` (the largest, most logic-heavy
subdir) sits at 100%/95.28%.

## 4. Verdict

**M1 milestone: exit criteria met. Zero P0/P1 issues open** (the two P1s found in §2.1/§2.2
were fixed within this same pass, with regression tests; not carried forward as debt).

- CI green end-to-end (typecheck, lint, 564 tests, expo-doctor 21/21, expo export).
- Dataset build deterministic and fully mapped, independently re-verified twice.
- 873-exercise browse path proven at the data + component-mount layer; fps itself is an
  owner re-measurement item once a simulator/device is available (`BLOCKERS.md`).
- Custom exercise lifecycle (create/edit/type-lock/duplicate-name/delete/archive/restore/
  duplicate-as-custom) is real and test-covered end to end; the two acceptance bullets that
  depend on future milestones (PR computation, CSV round-trip) are correctly deferred, not
  silently skipped.
- Coverage gates (`src/domain/**`, `src/data/**`, global) all hold with real margin.

**Not verifiable in this environment** (no simulator/device, per `docs/plan/BLOCKERS.md`,
unchanged from every prior milestone's caveat): 60 fps scroll measurement, on-device visual
QA in both themes, and any physical-device interaction. These are owner re-measurement items
once a device/simulator is available, same posture as M0's checklist.

## 5. Independent milestone-wide review (post-close, per the current one-review-per-milestone process)

A separate reviewing agent independently re-verified this checklist's claims from scratch
(not a re-read of §1–4 above) — full details logged as the `M1 | reviewed | d0b0342` row in
`docs/plan/EXECUTION-LOG.md`. Summary:

- `pnpm run ci` re-run fresh: still green end-to-end (typecheck, lint, 61 suites/567 tests +
  coverage, expo-doctor 21/21, expo export ~46 MB).
- `npm run build:exercises` re-run twice more, independently: same sha256
  `80f567c7270d7c5454753094f48db51bd4e49d7a3f618a3d38523181c9936810`, 0/0 curation warnings —
  a third independent confirmation of determinism.
- 10 new exercises spot-checked (disjoint from M1-11's 21 and any prior sample), covering all
  6 `exercise_type` values the real dataset actually contains: **10/10 correct** against the
  raw source record and 03 §6.3's mapping table.
- The M1-12 photo-rendering fix (§2.1/§2.2 above) was independently retraced end-to-end and a
  **new** integration-style test (`custom-exercise-photo-e2e.test.ts`) was added that chains
  the real `lib/files.ts`, a real `ExerciseRepositoryImpl`/better-sqlite3 round-trip, and the
  real thumbnail/media-source resolvers together (only the native module trio is mocked) —
  confirming the fix holds across all three seams composed, not just at each seam individually.
- **One new P2 found and fixed**: `ExerciseDetailScreen.performArchive()` had no error handling
  around `repository.archive()` — the same unhandled-promise-rejection class as §2.4's
  `ArchivedExercisesScreen.handleRestore` bug, just a sibling call site that pass didn't check.
  Fixed with the same Alert-on-catch convention + a regression test.
- `git fsck --full --strict`: clean (two benign dangling objects from an old tag re-point, no
  corruption). `.git` is 184 MB (expected, given the vendored dataset's binary history).
- 05 §8's orphan sweep confirmed correctly deferred to `M5-03`, not a silently-dropped M1 gap.

**Revised verdict: unchanged — M1 exit criteria met, zero P0/P1 open**, now confirmed by a
second, independent reviewing pass rather than resting on §1–4's own self-report. M1 is ready
to build M2 on top of.
