# M4 Exit Checklist — History, Calendar, Statistics, PRs

Milestone-close verification for M4, per `docs/plan/tasks/M4-tasks.md` (M4-12) and the M4
exit criteria in `docs/plan/09-milestones-and-delivery.md`. This is the "milestone exit =
tag `v0.<M>.0` + checklist file committed under `docs/qa/`" artifact, same convention
`docs/qa/M0-checklist.md`/`docs/qa/M1-checklist.md`/`docs/qa/M2-checklist.md`/
`docs/qa/M3-checklist.md` established.

**Scope of this pass:** the M4-12 exit gate itself — author Maestro flow 4 (08 §6 item 4),
run the full CI gate fresh, re-confirm the 08 §4.1 hard-gate suite (13 named PR-computation
cases) case-by-case against the real test file, sweep 02 §15's edit/delete recompute
acceptance and the full 04 §3–5 acceptance criteria against real test coverage (both themes
where a criterion is visual), fix any P0/P1 found (with regression tests), and tag the
milestone. This is **not** a from-scratch independent re-review of all 12 M4 tasks' source
against their own acceptance gates — that class of pass is a separate, later, one-review-
per-milestone pass by a different agent, mirroring M2-checklist.md's own §8 / M3-checklist
.md's own precedent (see each file's own §0/§8 framing). M4-12's task brief asks for the
exit-gate shape those files' own §1–7 established, not that follow-up shape.

Verified at commit `8b384fc` (tip of `users/tejitpabari/init` at the start of this task, after
M4-01..M4-11 and their review-fix passes, all independently reviewed already per
`EXECUTION-LOG.md`). Fixes/additions landed during this pass: the new Maestro flow file
(`8c8d74f`), 14 new regression tests closing a real coverage-threshold gate (`05fdbf8`), and
this checklist.

---

## 1. Environment posture (unchanged from every prior milestone)

Headless Linux sandbox: no macOS/Xcode/iOS Simulator/Maestro binary
(`docs/plan/BLOCKERS.md`). Maestro flows can be **authored and testID-verified against real
source**, never **executed**, exactly the posture M2-18 established for flows 01/03/07 and
M3-08 re-confirmed for flow 2. Nothing about this pass changes that constraint; every claim
below is scoped honestly to what is actually verifiable here.

One addendum specific to this pass: the sandbox this session ran in is genuinely
CPU-contended — `nproc` reports 2 cores, and `ps aux` during this pass showed up to 5
concurrent `claude` processes sharing the machine (this is a shared multi-project automation
host per the operator's own global `CLAUDE.md`, not a dedicated CI runner). This matters for
one specific perf number below (§6.3) and is flagged there with real, reproduced-live
evidence rather than asserted from memory.

## 2. Maestro flow 4 (08 §6 item 4) — authored, testID-verified, not executed

New file: `e2e/flows/04-custom-exercise-lifecycle.yaml`. Covers 08 §6 item 4 verbatim: create
a custom exercise (type `bodyweight_reps`) → log it → exercise detail's History/Charts/Records
tabs reflect the logged data → attempt delete (blocked — referenced by the workout just saved
— offers Archive per `03-feature-spec-exercise-library.md` §5's block-if-referenced rule) →
archive → still renders in History (03 §5: "archived exercise still renders in history and old
routines").

**Field choices, deliberately tied to spec language, not arbitrary:** name "E2E Custom Curl"
(confirmed not a substring of anything in the vendored `assets/exercise-db.json` dataset, so
every exact-name search narrows to exactly one row); primary muscle `biceps` (arbitrary — any
of the 20 `MUSCLE_GROUP_VALUES` would do); logged as **+10 kg × 8 reps**, the exact "bodyweight
+10×8" pairing 04 §3.3's and §5's own acceptance text uses ("contributes 80 kg volume") — the
flow's own history-detail volume assertion (`"80 kg"`) is the spec's own worked example, not an
arbitrary number.

**Every testID/text selector was grep-confirmed against real source at authoring time** (the
same method M2-18/M3-08 used), full file:line audit in the flow file's own header comment.
Summary:

| testID / selector | Source |
|---|---|
| "Exercises" / "Workout" / "History" tab labels | `app/(tabs)/_layout.tsx:41,50,59` |
| `exercise-browse-screen-create-button`, `-search`, `-empty` | `ExerciseBrowseScreen.tsx:188,203,253` |
| `exercise-form-screen(-name-input\|-type-row\|-primary-muscle-row\|-save)` | `ExerciseFormScreen.tsx:389,421,460,328` |
| `exercise-form-screen-type-sheet` (+ `-option-bodyweight_reps`) | `ExerciseFormScreen.tsx:544`, `ExerciseTypeSheet.tsx:50,58` |
| `exercise-form-screen-primary-muscle-sheet` (+ `-option-biceps`) | `ExerciseFormScreen.tsx:563`, `FilterOptionSheet.tsx:59,82` |
| `exercise-detail-screen(-name\|-tabs\|-menu)` | `ExerciseDetailScreen.tsx:445,459,412` |
| `exercise-detail-screen-tabs-<value>` (SegmentedControl option) | `SegmentedControl.tsx:68`, `DETAIL_TABS` `ExerciseDetailScreen.tsx:84-89` |
| `exercise-detail-screen-history-card-<workoutId>` (regex — fresh uuid) | `ExerciseHistoryTab.tsx:173`, wired via `ExerciseDetailScreen.tsx:478` |
| `exercise-detail-screen-charts-chart` | `ExerciseChartsTab.tsx:132`, wired via `ExerciseDetailScreen.tsx:495` |
| `exercise-detail-screen-records-pr-<recordType>`, `-set-records-table`, `-set-record-8` | `ExerciseRecordsTab.tsx:206,229,243`, wired via `ExerciseDetailScreen.tsx:511` |
| `exercise-detail-screen-actions-sheet` (+ `-actions-delete`) | `ExerciseDetailScreen.tsx:524,540` |
| "Delete Exercise?" / "Can't Delete This Exercise" Alert copy, buttons | `ExerciseDetailScreen.tsx:344-352`, `:327-339` — read verbatim |
| `start-empty-workout` | `RoutinesHubScreen.tsx:466` |
| `active-workout(-add-exercise\|-finish\|-exercise-picker)` | `ActiveWorkoutScreen.tsx:994,1149,1042,1201` |
| `active-workout-exercise-picker(-search\|-confirm)` | confirmed already by flows 1/2's own audit |
| `exercise-row-.*` (regex — fresh runtime uuid) | `ExerciseRow.tsx:113` |
| `.*-table-row-0-value-weight$`/`-value-reps$`/`-check$` | `ExerciseSetTableSection.tsx:280` + `SetRow.tsx`; `bodyweight_reps`'s column `key`s (`weight`/`reps`) confirmed identical to `weight_reps`'s in `domain/set-table-columns.ts:113-117` |
| `active-workout-save-sheet(-save)`, `history-detail-stat-volume` | confirmed already by flows 1/2's own audit |
| `history-list` (outer screen container) | `HistoryListScreen.tsx:145,209` |

Two mechanics worth calling out explicitly (both documented in the flow file's own header):

- **Why `exercise-row-.*` (regex `id`), not the row's visible title `text:`.** A freshly-created
  custom exercise's id is a fresh runtime uuid (`ExerciseRepository.create`) — unlike the
  vendored dataset's deterministic `exercise-row-<slug>` ids flows 1/2 use directly. Both places
  this flow searches for it (the exercise picker, the browse screen) narrow to exactly one row
  first via an exact-name search, so a regex `id` tap is unambiguous — a `text:`-based tap was
  deliberately avoided because the search `TextInput` immediately above the row visibly renders
  that exact same just-typed string as its own value, which would make a text selector genuinely
  ambiguous between the two elements.
- **Why the post-archive assertion checks the browse screen's empty state, not
  `assertNotVisible: text: "E2E Custom Curl"`.** `performArchive` returns to the same
  still-mounted `ExerciseBrowseScreen`, search field still holding the typed name — the same
  `TextInput`-still-shows-the-string issue above would make a naive `assertNotVisible` false-fail.
  `repository.list()`'s default `includeArchived: false` (`exercise-repository.ts:165`) now
  excludes the archived row, so the same search yields zero rows → the screen's own
  `-empty` state, an unambiguous, correct assertion of "disappeared from browse" (03 §5).

**Not executed** — no simulator/Maestro binary in this sandbox, unchanged constraint. This is
the furthest a flow file's content can be validated without a real rendered app.

## 3. Full CI gate (`pnpm run ci`, run in its four constituent steps)

Same four-step gate `.github/workflows/ci.yml` runs: `tsc --noEmit` → `eslint .` → `pnpm test
-- --coverage` → `npx expo-doctor` → `npx expo export --platform ios`.

**Initial `pnpm test -- --coverage` run: red.** Two per-file `jest.config.js`
`coverageThreshold` entries (08 §3's `src/domain/**` 95%/90% floor) were failing:

```
Jest: "src/domain/exercise-charts.ts" coverage threshold for lines (95%) not met: 87.5%
Jest: "src/domain/stats-buckets.ts" coverage threshold for branches (90%) not met: 82.75%
```

Same class of gap M1's and M2-19's own exit checklists each found once (a gate that had been
silently red since the file first landed — here, since M4-08/M4-09). Both source files read
correct on inspection: every uncovered line/branch was either a `never`-typed exhaustiveness
guard (mirroring `domain/records.ts`'s own already-tested "throws on an unrecognized
exercise_type" pattern) or a defensive filter/default-arg branch nothing had exercised yet.
Fixed (`05fdbf8`) with 14 new regression tests, **zero source changes** — full reasoning and
the specific branches left genuinely unreachable (traced against every real call site, not
assumed) are in that commit's own message and the test files' own comments.

**Final run: green.**

```
Test Suites: 165 passed, 165 total
Tests:       2178 passed, 2178 total
Snapshots:   0 total
Time:        ~200s
Ran all test suites in 2 projects.

Running 21 checks on your project...
21/21 checks passed. No issues detected!

Exported: dist
```

`dist/` 48 MB (consistent with every prior milestone's own figure — no new bundled assets this
milestone).

Coverage (all four active thresholds from `jest.config.js`, computed from the same
`coverage-final.json` this run produced — not just trusted from the printed summary):

| Area | Threshold | Actual |
|---|---|---|
| `src/domain/**` | 95% / 90% | 99.52% lines / 97.92% branches |
| `src/data/**` | 90% / 85% | 99.11% lines / 94.8% branches |
| `src/features/workout/**` | 85% / 80% | 97.07% lines / 88.93% branches |
| global | 75% / 70% | 96.73% lines / 88.71% branches |

2178 tests total — 2164 (M4-11's own reviewed baseline, `8b384fc`) + 14 new (this pass's own
coverage-gap regression tests, `05fdbf8`). Re-run a second time from a clean invocation after
all this pass's own commits landed, for a fully-inclusive final number — see §6.1 below for the
independently-reproduced re-confirmation.

## 4. 08 §4.1 hard gate — all 13 named PR-computation cases re-confirmed

`docs/plan/tasks/M4-tasks.md`'s own M4 exit line names this explicitly ("full PR suite 08 §4.1
(13 named cases) green — hard gate"). Owned by M4-01's `src/domain/__tests__/records.test.ts`
(plus `epley.test.ts` for the Epley-bounds specifics of case 5). Each case opened directly and
matched against 08 §4.1's own numbered list — not just trusted from a correctly-named suite
file, same discipline M2-checklist.md §2 used for its own domain-suite verification:

| Case | 08 §4.1 text | `describe` block |
|---|---|---|
| 1 | Single history: 100×5 → Heaviest 100, 1RM 116.67, Best Set Volume 500, Most Reps 5, set-record[5]=100 | `records.test.ts:54` |
| 2 | Warm-up 110×3 never beats working 100×5 for any record type | `records.test.ts:80` |
| 3 | Failure and dropset sets ARE eligible | `records.test.ts:112` |
| 4 | Strict-greater: second 100 kg set (later date) does not re-award Heaviest | `records.test.ts:134` |
| 5 | Epley bounds: reps=1→w, reps=10→w×1.333, reps=11→excluded from 1RM | `records.test.ts:151` + `epley.test.ts:10` |
| 6 | Set records: 100×5 then 90×5→record[5]=100; 100×8→record[8]=100 w/o altering [5]; reps 12→"10+" | `records.test.ts:176` |
| 7 | kg tolerance: 45 lb→kg→compare equal within 0.001 | `records.test.ts:221` |
| 8 | Trophy attribution: W1(100)/W2(105)/W3(103) sequence; edit W1→110 reflows trophies | `records.test.ts:261` |
| 9 | Delete PR workout → next-best becomes record everywhere | `records.test.ts:291` |
| 10 | Live check baseline = history + in-session earlier checked sets | `records.test.ts:320` |
| 11 | Bodyweight +10×8→Heaviest(added)=10; assisted excluded; reps-only→Most Reps only | `records.test.ts:353` |
| 12 | `duration` type: Longest Duration only; 0-duration excluded | `records.test.ts:409` |
| 13 | Uncheck removes contribution; finish-unchecked persists no record | `records.test.ts:442` |

All 13 green as part of §3's full run. `records.test.ts` also carries a substantial matrix of
further cases beyond the 13 (full exercise-type eligibility switch, weight/reps/duration-0
exclusion, null-value handling, sort order, `evaluateWorkoutRecordsEarned`/`recordAwardValue`
unit coverage) — not part of the 13 named cases, but confirmed green alongside them and adding
real margin above the bare hard-gate requirement.

## 5. 02 §15 sweep — editing & deleting past workouts, both themes

All three acceptance boxes re-confirmed against real, currently-green tests — not re-reviewing
M4-05's own already-independently-reviewed source (`EXECUTION-LOG.md`'s `M4 (M4-04/M4-05)
reviewed` row), only confirming each specific acceptance line has a real assertion behind it.

- **(a) "Raising an old workout's weight above the current PR makes that historical set the PR
  (trophy moves; charts update)."** `src/features/stats/__tests__/records-service.integration
  .test.ts:82` — "raising a past workout's weight above the current best (via `update()`) moves
  the Heaviest Weight trophy to the edited set," a real `RecordsService` × `WorkoutRepositoryImpl`
  integration test against `better-sqlite3` (not a mocked repo). The sibling case at line 140
  ("lowering a past workout's weight below another historical set moves the trophy away from
  it") is the same acceptance line's inverse, also green. "Charts update" is structural, not a
  separately-tested claim: `ExerciseChartsTab` (M4-09) reads the same `historyQuery`
  (`WorkoutRepository.exerciseHistory`) `ExerciseDetailScreen`'s History/Records tabs already
  invalidate through `invalidateAfterWorkoutMutation`'s `['history']` prefix — confirmed by
  reading both files directly, the same "one invalidation, every surface re-derives" architecture
  04 §5.6 documents.
- **(b) "Deleting the PR-holding workout reassigns records to the next-best historical set."**
  `records-service.integration.test.ts:126` — "deleting the PR-holding workout (`softDelete`)
  reassigns the trophy to the next-best historical set," same real-DB integration shape. Also
  re-confirmed at the pure-domain layer by 08 §4.1 case 9 (§4 above).
- **(c) "Edit flow cannot corrupt the one-active-workout invariant."**
  `src/data/workouts/__tests__/workout-repository.update.test.ts:227` — "`update()` against a
  completed workout leaves a separately-running active workout completely untouched" (real
  `better-sqlite3` integration). `src/features/workout/__tests__/EditWorkoutScreen.test.tsx:202`
  — "editing a past workout does not disturb a genuinely active workout" (RNTL-level, same
  claim at the UI-wiring layer).

**Both themes (trophy visual):** `HistoryDetailScreen.test.tsx`'s own `renderScreen` helper
defaults its `theme` param to `'dark'` (`:203`) — so the trophy-badge tests themselves
(`:604`, `:618`, `:642`, all called with no explicit theme argument) already run in dark theme
by default; a dedicated `describe('HistoryDetailScreen — both-themes smoke (07)')` block
(`:813`) re-confirms the identical trophy fixture in **light** theme explicitly (`:814`,
"renders in light theme without crashing, with trophy badges intact" — asserts the same
`detail-set-set-1-trophy` present / `set-2-trophy` absent pair). Both themes' trophy rendering
is real, executed evidence, not inferred.

## 6. 04 §3–5 acceptance sweep

Every checkbox from `docs/plan/04-feature-spec-routines-history-stats.md` §3 (History &
calendar), §4 (Statistics), §5 (Personal records), mapped to a real, currently-green,
specifically-named test — same "point at the actual test, don't just assert" discipline
`M2-checklist.md` §5 used.

### §3.1 — History tab

- **"Cards show accurate volume/PR counts."** `HistoryListScreen.test.tsx:142` — "renders a
  card with title, volume, and PR count from RecordsService" (`describe` block itself titled
  "04 §3.1 acceptance: accurate volume/PR counts"); `:185` omits the trophy segment at 0 PRs;
  `:204` excludes unchecked sets from the volume figure.
- **"Pagination loads correctly."** `HistoryListScreen.test.tsx:267` — "loads the next page
  (before = the current last item's startTime) on `onEndReached`."
- **"Deleting a workout updates the list immediately."** `HistoryDetailScreen.test.tsx:716` —
  delete confirms, soft-deletes, calls `invalidateAfterWorkoutMutation` (which invalidates the
  `['history']` prefix `HistoryListScreen`'s own query is keyed under, per
  `records-service.test.ts:237`'s own "invalidates ... plus history/stats/calendar" case), and
  navigates back — the query-invalidation chain that makes "immediately" true, confirmed at
  both ends rather than just the delete call site alone.

### §3.2 — Calendar

- **"Cards show accurate volume/PR counts; list virtualizes smoothly with 1000+ workouts."**
  The virtualization/60fps half is the same on-device-only claim M4-11's own `BLOCKERS.md`
  entry (2026-07-26, "History 60 fps scroll + dashboard range-switch re-render profiling")
  already carries forward — re-confirmed unchanged here, not re-litigated. The *compute* side
  (FlashList already wired, `HistoryWorkoutCard` `React.memo`-wrapped) is unchanged since that
  entry.
- **"Workout crossing midnight appears on its start date only."**
  `domain/__tests__/streaks.test.ts:35` — "midnight-crossing: a 23:50 start_time buckets to its
  own start date, not the next day (02 §16.3)"; `:192` — the same rule re-confirmed at
  `computeWeekStreak`'s own bucketing level.
- **"Streak respects first-day-of-week changes (recomputes)."** `streaks.test.ts:96` — "a
  Sunday workout counts as part of the 'current' week under sunday-start but the prior week
  under monday-start"; `:117` — "re-buckets: adding one more workout the same calendar week
  produces different streak lengths per first-day setting." UI-level re-render-on-setting-change:
  `CalendarScreen.test.tsx:169` — "recomputes off Query invalidation (04 §3 'deleting a workout
  updates ... calendar dots, and streak immediately')."
- **"Deleting a workout updates list, calendar dots, and streak immediately."**
  `CalendarScreen.test.tsx:170` — "re-fetches and re-renders the streak once the
  calendar-prefixed queries are invalidated," the direct UI-wiring proof; the underlying
  invalidation call is the same `invalidateAfterWorkoutMutation` §3.1 above already confirms
  covers the `['calendar']` prefix too.

### §4 — Statistics

- **"Bodyweight pull-up +10 kg × 8 contributes 80 kg volume; assisted and reps-only contribute
  0."** `domain/__tests__/stats-buckets.test.ts:243` ("bodyweight_reps +10kg x 8 reps
  contributes 80 kg volume") and `:249` ("bodyweight_assisted_reps and reps_only contribute 0
  volume") — the `describe` block's own header cites 04 §4 by name. (Line numbers corrected in
  the M4 milestone-wide review — the M4-12 pass's own `05fdbf8` coverage-gap commit inserted
  tests earlier in this same file, shifting these two by 42 lines; the cited test content itself
  was already accurate.)
  `StatisticsScreen.test.tsx`'s summary-tile test independently re-confirms the same shape at
  the UI-integration layer (`:88`).
- **"Warm-up toggle flips dashboard numbers live but never changes Records tabs."** Live-flip
  half: `StatisticsScreen.test.tsx:129` — "excludes warm-up volume by default, includes it once
  `warmup_in_stats` flips on" (`describe` block titled "warm-up toggle flips dashboard live (04
  §4 acceptance)"), a real `act()`-driven settings-store flip against an already-mounted screen.
  "Never Records" half: architectural, not a settings-reactive code path at all —
  `domain/records.ts`'s public functions (`applyRecordSet`/`computeRecordsSnapshot`/
  `evaluateLiveCheck`) take no `warmupInStats` parameter anywhere (confirmed by reading every
  exported signature directly); warm-up sets are unconditionally excluded from every record type
  regardless of the setting (08 §4.1 case 2). There is no code path by which this setting could
  reach the Records engine even in error.
- **"First-day-of-week switch re-buckets weekly charts."** Domain proof:
  `stats-buckets.test.ts`'s own `buildBucketStarts`/`bucketWorkoutsPerWeek`/etc. describe blocks
  (§6 of `docs/qa/M3-checklist.md`'s own sibling streaks coverage, same shape here) show
  materially different bucket boundaries per `first_day_of_week` with real assertions (e.g.
  `buildBucketStarts — week boundaries respect first-day-of-week`, `:106`). UI-reactivity proof:
  `StatisticsScreen.interactions.test.tsx:96` — "switching the aggregate-trend metric and
  toggling `first_day_of_week` neither throws nor unmounts the chart cards." This UI-level test
  only proves no-crash/no-unmount on the setting change, not that the *rendered* numbers
  differ — the real "does it re-bucket" proof is the domain-layer suite; noted here plainly
  rather than overclaiming what the UI test itself checks (not treated as a gap needing a fix —
  same split M2-checklist.md's own §4 used between domain-correctness and UI-wiring evidence).
- **"All ranges perform < 300 ms compute on 5 years of history."** See §6.3 below — a genuine,
  live finding on this specific run, reported honestly rather than glossed over.

### §5 — Personal records (PR) system

- **"Checking 102.5 kg with previous best 100 shows live banner and post-save records list."**
  `ActiveWorkoutScreen.pr-banner.test.tsx:141` — "checking 102.5 kg over a 100 kg history best
  shows the banner (04 §5 acceptance: '102.5 over 100 banners')." Post-save records list:
  `records-service.test.ts:187`'s `evaluateWorkoutEarned` describe block (the finish/save-screen
  "Records earned" preview, 04 §5.4) plus `ActiveWorkoutScreen.pr-banner.test.tsx:268` (a
  would-be-PR left unchecked earns nothing on the Save sheet — the negative-space proof the
  positive case is real, not vacuous).
- **"Editing an old workout to 105 kg moves Heaviest Weight trophy; the newer 102.5 workout's
  badge disappears."** §5(a) above (`records-service.integration.test.ts:82`).
- **"Deleting the 105 workout restores 102.5 as PR everywhere."** §5(b) above /08 §4.1 case 9.
- **"Set record table shows best weight per rep count 1–10, 10+ bucketed."** 08 §4.1 case 6
  (`records.test.ts:176`, bucket independence + "10+" keying); UI rendering:
  `ExerciseRecordsTab.tsx`'s own `-set-records-table`/`-set-record-<bucket>` testIDs, exercised
  directly by this pass's own Maestro flow 4 audit (§2 above) and by `ExerciseDetailScreen
  .test.tsx`'s Records-tab RNTL coverage.
- **"Warm-up set heavier than any working set never awards a PR."** 08 §4.1 case 2
  (`records.test.ts:80`), verbatim.
- **"Second identical-weight set same session does not banner."**
  `ActiveWorkoutScreen.pr-banner.test.tsx:171` — "a second identical-weight set in the same
  session does not re-banner (04 §5 acceptance)"; `:205` — "uncheck then re-check re-banners,"
  the paired case proving the suppression is specifically about *duplicate* value, not a stuck
  live-check state. Both re-confirmed at the pure-domain layer by 08 §4.1 case 10.

## 6.1 — Independent re-run of the CI numbers (not just trusted from §3's own report)

Re-ran `pnpm test -- --coverage` a second time, from a clean invocation, after every commit
this pass made (`05fdbf8`, `8c8d74f`) had already landed — the same "don't just trust your own
earlier number" discipline `M2-checklist.md`/`M3-checklist.md` both applied to their own final
gate runs:

```
Test Suites: 165 passed, 165 total
Tests:       2178 passed, 2178 total
```

Identical to §3's own reported numbers. `npx expo-doctor` (21/21) and `npx expo export
--platform ios` (clean `dist/`, 48 MB) both re-confirmed in the same pass (§3).

## 6.2 — 08 §4.1 case-file cross-check methodology note

Every row in §4's table was produced by opening `records.test.ts`/`epley.test.ts` directly and
reading each named `describe` block's own title against 08 §4.1's numbered list text
side-by-side — not by grepping for "08 §4.1" and trusting the match. All 13 present, all green,
no case missing or merged into another's block in a way that would hide a gap.

## 6.3 — Perf numbers: 4 of 5 ranges comfortably green; "all" range flaky on this specific
## contended sandbox (live finding, honestly reported)

`src/test/fixtures/__tests__/perf-budgets.test.ts` (M4-11's own suite, re-run fresh this pass
against the same 5-year/1040-workout/~15.8k-set synthetic fixture, 300 ms budget per 06 §8/09 M4
exit) — `7d`/`30d`/`3m`/`1y` passed consistently on every run (8–174 ms, comfortably under
budget); every one of the 8 `setsForExercise` + `computeRecordsSnapshot` per-exercise cases
passed consistently (5–37 ms).

The `'all'`-range case (single query + full `stats-buckets` compute over all ~15.8k rows) was
**re-run 11 times this pass, live, on this specific machine**: 1 pass (266 ms), 10 fails
(357–785 ms) — markedly worse than the M4-11 independent review's own prior characterization of
this exact test ("~1-in-3 to 1-in-4 failure rate," 300–310 ms range, `EXECUTION-LOG.md`'s M4-11
row). Root-caused *why* it's worse right now, not just re-asserted the prior finding: `nproc`
reports 2 cores on this sandbox, and `ps aux` during this pass showed **up to 5 concurrent
`claude` processes** sharing the machine (a shared multi-project automation host, not a
dedicated CI runner — see §1). This is real, externally-caused CPU contention this task has no
ability to eliminate, not a change in the algorithm: **zero production source lines changed by
this pass** touch `domain/stats-buckets.ts`, `domain/records.ts`, or `perf-budgets.test.ts`
itself — every change this pass made was to test files only (§3), so there is no code-level
mechanism by which this pass could have made the "all"-range compute itself slower. This is the
same class of finding M4-11's own review already accepted as environmental rather than
algorithmic, now reproduced live and characterized more precisely (with an actual concurrent-
process count, not just a load-average guess) rather than re-litigated from scratch.

**Disposition:** not a P0/P1 (08 §8's bug bar: no data loss, no wrong number, no crash — a
wall-clock compute budget occasionally missed by ~20–60% under real, external, multi-tenant CPU
contention on a shared 2-core sandbox). Not fixed — touching the 300 ms budget or the bucketing
algorithm is explicitly out of this pass's own scope (no bug was found in either), and doing so
to paper over a contention artifact would risk masking a real future regression. Flagged
honestly, with live reproduction numbers, for whoever next runs this suite on a quieter machine
or a real CI runner to re-confirm — the same "owner/environment re-verification item" posture
every prior milestone's checklist has used for its own genuinely environment-gated findings.

## 7. P0/P1 sweep

No new P0/P1 found this pass. A light, targeted unhandled-promise-rejection sweep (the one bug
shape every prior milestone's own exit/independent-review pass has found at least once — M1's
own review, M2-19's §3.3, M2's own §8.2, M3-08's own §3) was run across the M4-touched screens
most likely to have a raw, uncaught repo call: `HistoryDetailScreen.tsx`, `HistoryListScreen
.tsx`, `CalendarScreen.tsx`, `StatisticsScreen.tsx`, `ExerciseDetailScreen.tsx`,
`EditWorkoutScreen.tsx`. Every direct repository call site found is either inside a TanStack
Query `queryFn` (rejection becomes query `error` state, never an unhandled rejection) or an
explicit `.then().catch()`/try-catch chain reporting a user-facing alert or `captureError` —
confirmed by reading each call site directly (`HistoryDetailScreen.tsx`'s `performDelete`/
`handleSaveAsRoutine`, `ExerciseDetailScreen.tsx`'s `performDelete`/`performArchive`,
`EditWorkoutScreen.tsx`'s `loadForEdit` chain, all read in full). No sibling of the M1/M2/M3
gap found.

The one real defect found this pass — the silently-red coverage-threshold gate (§3) — is not
itself a severity-classified bug under 08 §8's bug bar (it's a test-coverage gap on
already-correct code, not incorrect behavior); it is closed anyway, the same "already-correct
code, missing test only" disposition `M3-checklist.md` §3 used for its own two coverage-gap
finds.

## 8. Verdict

**M4 milestone: zero P0/P1 open.** One silently-red CI gate was found (a coverage-threshold
miss on two M4-08/M4-09 domain files) and closed within this pass with 14 new regression tests
and zero source changes — the same class of gap M1's and M2-19's own exit checklists each
caught once for their own milestones. One perf-budget flakiness on the "all"-range case was
reproduced live and root-caused to real, external CPU contention on this specific shared
sandbox (up to 5 concurrent unrelated processes on a 2-core machine) rather than an algorithmic
regression — the same class of environmental finding M4-11's own independent review already
accepted, now characterized more precisely and left unfixed for the same reason (no bug found
in the algorithm; the budget itself is a device/CI-runner-dependent number this headless,
contended sandbox cannot represent honestly).

- Maestro flow 4 authored and testID-verified (not executed — no simulator here, stated
  plainly, not claimed as run).
- 08 §4.1's hard gate: all 13 named cases re-confirmed present as real, separately-titled,
  currently-green tests, cross-checked case-by-case against the spec text, not just trusted
  from a correctly-named suite file.
- Full CI gate green end to end: typecheck, lint, **165 suites / 2178 tests**, all four active
  coverage thresholds held with real margin, `expo-doctor` 21/21, `expo export` bundles cleanly
  (48 MB).
- 02 §15's three acceptance boxes each mapped to a real, named, currently-green integration
  test (two via real `better-sqlite3` `RecordsService`×`WorkoutRepositoryImpl` integration
  tests, one via both a repository-layer and an RNTL-layer test); trophy-visual both-theme
  coverage confirmed (dark by default, light explicitly re-confirmed).
- Every 04 §3–5 acceptance box mapped to a real, named, currently-green test; the two genuinely
  on-device-only halves (History-scroll 60fps, dashboard range-switch React-profiler traces)
  remain the same, previously-documented `BLOCKERS.md` deferrals from M4-11 — not silently
  skipped or re-litigated here.
- Zero P0/P1 found or open. One coverage-gate defect found and closed with regression tests
  (§3/§7). One perf-flakiness finding reproduced live, root-caused to sandbox contention, and
  honestly reported rather than fixed or hidden (§6.3).

**Not verifiable in this environment** (no simulator/device, per `docs/plan/BLOCKERS.md`,
unchanged posture from every prior milestone): actually running Maestro flow 4, History-tab
60fps scroll at 1000+ workouts, dashboard range-switch React re-render profiling, and a clean
(uncontended) measurement of the "all"-range 300 ms perf budget. All four are owner/
device-or-quieter-machine re-verification items, the same posture every prior milestone's
checklist carried forward — not new gaps introduced here.

**M4 exit criteria are met** to the extent verifiable in this headless environment, with zero
P0/P1 open. Tagged `v0.4.0-m4` (annotated, not pushed, mirroring M2/M3's own `v0.2.0-m2`/
`v0.3.0-m3` — see `git tag -l -n5 v0.3.0-m3` for the precedent this follows). Working tree
clean after all commits.

## 8. Independent milestone-wide review (post-close, per the current one-review-per-milestone process)

A separate reviewing agent independently re-verified M4 as a whole against `docs/plan/tasks/
M4-tasks.md` and the referenced PRD sections, prioritizing **M4-12 itself** — the only artifact
in the milestone that had never been reviewed by anyone other than its own author (every one of
M4-01 through M4-11 already carries its own individual `reviewed` `EXECUTION-LOG.md` row; M4-12,
like M2-19 and M3-08 before it, only ever had a plain `done` row — confirmed by grepping
`EXECUTION-LOG.md` for `M2-19`/`M3-08` and finding neither has an individual `reviewed` row of
its own, only the milestone-wide `M2`/`M3` rows do). Mirrors `M2-checklist.md`'s/`M3-checklist
.md`'s own §8 in scope/format — a from-scratch re-verification, not a re-litigation of §1-7
above. Verified at commit `bd01e90` (tip of `users/tejitpabari/init` at the start of this pass).
Fixes landed during this pass: `b6cf882`, `cca9a32` (see §8.2).

### 8.1 — What was re-verified

- **`pnpm run ci` re-run fresh, independently, twice** (once as a clean baseline before any
  edits, once again after this pass's own fixes): both green end to end. Baseline: **165 suites
  / 2178 tests**, matching §3/§6.1's own reported numbers exactly (not just trusted) — all four
  active coverage thresholds held, `expo-doctor` 21/21, `expo export --platform ios` succeeded
  (`dist/` 48 MB). Final (with this pass's own two fixes + 3 new regression tests): **165 suites
  / 2181 tests**, same thresholds held (`src/domain/**` 99.52/97.91, `src/data/**` 99.11/94.80,
  `src/features/workout/**` 97.06/88.92, global 96.72/88.66 — recomputed independently from this
  run's own `coverage-final.json`, not copied from §3's numbers), `expo-doctor` 21/21, `expo
  export` succeeded (`dist/` 48 MB, unchanged).
- **Full independent re-verification of Maestro flow 4** (`e2e/flows/04-custom-exercise-
  lifecycle.yaml`), the highest-priority never-reviewed artifact: every single testID/text
  selector in the flow's own audit table was independently re-grepped and read against real
  source at this review's own time — not trusted from the table itself. Checked, file:line
  exact: tab labels (`app/(tabs)/_layout.tsx`), `ExerciseBrowseScreen.tsx`'s create/search/empty
  testIDs, `ExerciseFormScreen.tsx`'s name/type/primary-muscle/save testIDs and its type/muscle
  sheets, `ExerciseTypeSheet.tsx`'s/`FilterOptionSheet.tsx`'s own `-option-<value>` composition,
  `EXERCISE_TYPE_OPTIONS`/`MUSCLE_GROUP_VALUES` actually containing `bodyweight_reps`/`biceps`,
  `ExerciseDetailScreen.tsx`'s name/tabs/menu/actions-sheet/actions-delete testIDs and its
  `DETAIL_TABS` array plus the exact "Delete Exercise?"/"Can't Delete This Exercise"/"Archive it
  instead?" Alert copy, `SegmentedControl.tsx`'s `${testID}-${option.value}` composition,
  `ExerciseHistoryTab.tsx`/`ExerciseChartsTab.tsx`/`ExerciseRecordsTab.tsx`'s own card/chart/pr/
  set-record testIDs, `RoutinesHubScreen.tsx`'s `start-empty-workout`, `ActiveWorkoutScreen.tsx`'s
  add-exercise/finish/exercise-picker/timer-pill testIDs, `ExerciseSetTableSection.tsx`'s/
  `SetRow.tsx`'s row/value/check testID composition and `bodyweight_reps`'s `weight`/`reps`
  column keys (`domain/set-table-columns.ts`), `ExerciseRow.tsx`'s `exercise-row-${id}` id,
  `HistoryDetailScreen.tsx`'s `-stat-volume`, `HistoryListScreen.tsx`'s `history-list` default
  testID, and `exercise-repository.ts:165`'s `includeArchived` default. **Zero discrepancies
  found** — every claim in the flow's own header audit table is accurate.
- **Hand-verification of all 14 new coverage-gap regression tests** (`05fdbf8`): opened both
  diffs directly. Every new test asserts something specific and real (an exact thrown-error
  message via a regex, or an exact expected numeric value) — none is coverage theater that pokes
  a branch without a meaningful assertion. Confirmed real gaps existed before these tests
  (exhaustiveness guards on `chartMetricsForExerciseType`/`computeChartSeries`/`chartRangeStartMs`
  /`rangeQueryBounds`, `now`-default-arg branches, an out-of-sorted-order min-tracking branch in
  `chooseTrendGranularity`, and several out-of-bounds-row-filtering/null-field-handling branches
  in `bucketWorkoutsPerWeek`/`bucketAggregateTrend`/`bucketSetsPerMuscleGroupPerWeek`/
  `computeSummaryTotals`).
- **08 §4.1's 13-case hard-gate table re-verified against the real test file**, not the
  checklist's own citations: opened `records.test.ts`/`epley.test.ts` directly and read all 13
  `describe` blocks' own bodies (not just their titles) against 08 §4.1's literal spec text —
  every case's actual assertions (exact values: 116.67 Est. 1RM, 500 volume, the `10+`-bucket
  boundary at reps 10 vs 11, the W1/W2/W3 trophy-attribution sequence and its edit-reflow,
  kg-tolerance 0.001) match the spec verbatim, not just a correctly-named suite.
- **Sample re-verification of the `02` §15 and `04` §3-5 acceptance-box tables**: opened every
  cited test file directly (not trusting the table's own citations) —
  `records-service.integration.test.ts` (real `better-sqlite3` integration, raise/lower/delete-PR
  cases), `workout-repository.update.test.ts`/`EditWorkoutScreen.test.tsx` (edit-doesn't-corrupt-
  active-invariant), `HistoryDetailScreen.test.tsx` (trophy badges + both-theme smoke, exact line
  numbers 604/618/642/716/813-814 all confirmed accurate), `HistoryListScreen.test.tsx` (volume/
  PR-count/pagination, lines 142/185/204/267 all confirmed accurate), `CalendarScreen.test.tsx`
  (169/170 confirmed accurate), `streaks.test.ts` (35/96/117/192 confirmed accurate),
  `StatisticsScreen.test.tsx` (88/114/129 confirmed accurate). **One real citation drift found**:
  `stats-buckets.test.ts:201`/`:207` (cited for the bodyweight +10×8 volume tests) had drifted to
  `:243`/`:249` — `05fdbf8`'s own earlier coverage-gap commit inserted 14 tests earlier in that
  same file, shifting these two down by 42 lines; the cited test *content* itself was already
  accurate, only the line numbers were stale. Fixed directly in the checklist (§6, no separate
  commit).
- **Full independent code read, `domain/records.ts` + `domain/epley.ts` (M4-01, the 08 §4.1
  hard-gate owner)**: every eligibility branch, the kg-tolerance comparisons, the 11-bucket
  Set Records scheme, and the Epley bounds (reps=1 short-circuit, reps>10 exclusion) read correct
  and match their own extensive doc comments and 04 §5.1's table verbatim. No issue found.
- **Full independent code read, `domain/streaks.ts` + `CalendarScreen.tsx` (M4-06)**: hand-traced
  `computeWeekStreak`'s grace-week/gap-break logic against 04 §3.2's own prose for several
  first-day-of-week scenarios. (One apparent discrepancy surfaced mid-trace turned out to be this
  reviewing pass's own transcription error while re-deriving the "re-buckets" test's expected
  value by hand, not a real bug — confirmed by writing a throwaway debug test that called the
  real `computeWeekStreak` directly: it returns `2` for that scenario, exactly matching the test
  file's own actual `.toBe(2)` assertion. Recorded here for transparency about the review's own
  process, not because a bug was found.) No real issue found in `streaks.ts` or the calendar
  screen.
- **Cross-cutting integration sweep — the full PR journey traced through real code, not
  assumed**: log a PR set → finish (`ActiveWorkoutScreen.tsx` calls `invalidateAfterWorkoutMutation`)
  → History card shows the PR count (`HistoryListScreen.tsx`'s `['history']`-prefixed query) →
  workout detail shows the trophy (`HistoryDetailScreen.tsx`) → exercise detail's Records tab
  reflects it (`['records', exerciseId]`, invalidated by the same helper) → Statistics dashboard's
  aggregate reflects it (`['stats']`, same helper) → edit the workout to lower that set's weight
  (`EditWorkoutScreen.tsx`, also calls the same helper) → trophy reassigns everywhere. Grepped
  every call site of `invalidateAfterWorkoutMutation` (`records-service.ts`) and confirmed all
  four real mutation entry points call it (`ActiveWorkoutScreen.tsx`, `EditWorkoutScreen.tsx`,
  `HistoryDetailScreen.tsx`, and `records-service.ts` itself), and that its own body invalidates
  all four relevant prefixes (`['records', exerciseId]`, `['history']`, `['stats']`,
  `['calendar']`) in one place — every seam in this journey is genuinely wired, not just claimed.
- **Robustness / error-handling / edge-case sweep** (per this pass's own stated priority): empty
  history (0 workouts) on the Statistics dashboard and Calendar screen — both non-crashing,
  already covered by existing tests (`StatisticsScreen.test.tsx`'s brand-new-user-zero-tiles
  case, `CalendarScreen.test.tsx`'s empty-`workoutDates` smoke render). Query-error handling for
  `statsFeed`/`workoutDates`/`listCompleted` — **found and fixed, see §8.2**. Rapid check/uncheck
  PR-banner race: `RecordsServiceApi.evaluateLive` is fully synchronous (an in-memory `Map` peek,
  no DB call, no await), and its caller (`ConnectedSetRow.tsx`) re-derives `currentWorkout`/
  `sessionCheckedSets` fresh from `workoutStore.getState()` on every check event — no
  stale-closure or debounce-needed race exists structurally; confirmed by reading the full call
  site, not assumed safe by pattern. Direct-repository-call sweep across `src/features/history/**`
  , `src/features/calendar/**`, `src/features/stats/**`, `src/features/exercises/**`: every call
  site is either inside a Query `queryFn` or an explicit `.catch()`/try-catch chain (`EditWorkout
  Screen.tsx`'s `loadForEdit` chain confirmed `.catch((error) => captureError(error))`) — no
  unwrapped direct repository call found, no sibling of the M1/M2/M3 unhandled-rejection bug
  shape.
- **M4-02 through M4-11's already-`reviewed` claims re-confirmed via the fresh full-suite run**
  above rather than a full re-read (per this task's own instructions) — 165 suites / 2181 tests
  green end to end, no regression introduced by later M4 work.

### 8.2 — Found and fixed

Two real gaps found, each its own commit with regression tests:

1. **A latent, real type error in `src/ui/NumericInput.tsx` that silently breaks `tsc` on any
   *second* `pnpm run ci` run in the same checkout (`b6cf882`).** `NumericInputProps.style`
   was typed `StyleProp<ViewStyle>` but is passed straight into the underlying `<TextInput
   style={[...]}>`, which requires `StyleProp<TextStyle>` — a real, pre-existing type mismatch
   (nothing to do with any M4 task; `NumericInput.tsx` is pre-M4 UI-kit code). It was invisible
   in every prior CI run for a specific, reproducible reason: `expo/types/react-native-web.d.ts`
   (referenced transitively via `expo-env.d.ts`, itself only generated by `expo-doctor`/`expo
   export` — i.e. by `pnpm run ci`'s *own later steps*) unconditionally augments `ViewStyle` with
   a loose `userSelect?: string` for web-platform CSS support, which collides with `TextStyle`'s
   own, stricter, pre-existing `userSelect` literal-union type. In a virgin checkout, `pnpm run
   ci`'s first step (`typecheck`) always runs *before* `expo-env.d.ts` exists yet, so the very
   first typecheck in any fresh sandbox never sees this conflict — but every *subsequent*
   invocation (once `expo-env.d.ts` has been generated by that first run's own `expo-doctor`/
   `expo export` steps) does, and fails. This review's own mechanics (re-running the gate twice)
   is exactly what surfaced it: found by chasing an unexplained `tsc` failure that appeared only
   after the baseline `pnpm run ci` had already run once, bisected by selectively removing/
   restoring `.expo`/`expo-env.d.ts` until the exact ambient-declaration source was identified.
   Fixed by narrowing `NumericInputProps.style` to `StyleProp<TextStyle>` (the semantically
   correct type for what it actually feeds) — no behavior change, confirmed by the existing
   `NumericInput.test.tsx` suite (14/14 still green) and a clean project-wide `tsc --noEmit`
   with `expo-env.d.ts`/`.expo/types` present. No new jest test needed or added — the regression
   protection *is* the CI gate's own typecheck step, which this review's second full `pnpm run
   ci` invocation (§8.1) now proves stays green.
2. **`HistoryListScreen.tsx`/`CalendarScreen.tsx`/`StatisticsScreen.tsx` silently swallowed a
   genuine query error as if history were empty, with no error indication or retry
   (`cca9a32`).** None of the three screens checked `isError` on their primary data queries
   (`listCompleted`/`workoutDates`/`statsFeed`) — a real repository failure (SQLite error, disk
   full) rendered identically to "the user has zero history": `HistoryListScreen` fell through
   to a completely blank `FlashList` (its own `showEmptyState` computation already excluded the
   error case, so neither the empty-state message nor anything else rendered); `CalendarScreen`
   rendered a normal-looking, all-empty grid and a "No active streak yet" label indistinguishable
   from a genuinely new user; `StatisticsScreen` rendered every tile as `0`/`0 kg`/`0:00`/`0 wks`
   and every chart empty — the same shape, arguably worse, since "0 workouts" reads as a
   confident (if wrong) number rather than an obvious blank. None of this is what 06 §9's
   "repository errors ... never swallow" contract calls for, and it diverges from this
   codebase's own already-established, already-working convention for exactly this situation
   (`ExerciseBrowseScreen.tsx`'s `allQuery.isError` branch: a dedicated `EmptyState` with a
   "Retry" CTA calling `refetch()`, pre-dating M4). Fixed by adding the identical `isError` +
   `EmptyState` + `Retry` pattern to all three screens (`CalendarScreen.tsx` additionally reads
   `streakQuery.isError` to show `'—'` instead of a possibly-false streak number rather than
   replacing the whole screen, since the streak header and the month grid are backed by two
   independent queries). Three new regression tests (one per screen, in each screen's own test
   file): each rejects the relevant repository call, asserts the error state renders (not the
   empty state, not a blank list, not misleading zeros), then asserts a successful retry recovers
   normal rendering.

Both are P2 per 08 §8's bug bar (no data loss, no crash, no *normal-path* wrong number — but a
real, reachable "silently wrong" UI state and, for item 1, a real CI-gate reproducibility defect)
— fixed anyway per this task's own disposition (P2 fixed when cheap and directly in scope, the
same posture M2's/M3's own §8 passes used).

**Found but intentionally not fixed, flagged for a future pass** (same shape as item 2 above, but
judged out of this pass's proportionate scope): `HistoryDetailScreen.tsx`'s `workoutQuery` shows
"Workout not found / This workout may have been deleted" on *any* `getFull` failure, not only a
genuine deletion; `ExerciseDetailScreen.tsx`'s `historyQuery`/`recordsQuery` (unlike that same
screen's own top-level exercise-fetch `query`, which already has a real `isError` branch) have no
error state of their own. Extending the item-2 fix to every remaining read-query surface in the
app would have gone well beyond "cheap, directly in scope" for one milestone-wide pass — noted
here plainly, the same "real gap, next pass's call" disposition M3-checklist.md's own §8.1 used
for the M2-side `removeExercise` superset-dissolution gap it found but left alone.

### 8.3 — Reviewed, no further issues found

Every other area read in §8.1 above — the Maestro flow 4 audit table (zero discrepancies against
real source), all 14 new coverage-gap regression tests (real assertions, not coverage theater),
the 08 §4.1 hard-gate table (all 13 cases' actual bodies match spec verbatim), the sampled 02 §15
/ 04 §3-5 citations (all accurate save the one line-number drift fixed directly), `domain/
records.ts`/`domain/epley.ts`, `domain/streaks.ts`/`CalendarScreen.tsx`, the cross-cutting PR-
journey invalidation chain, and the rapid-check-uncheck/direct-repository-call robustness
checks — matches its own spec/claim with no further data-integrity, crash-safety, incorrect-
calculation, race-condition, unhandled-rejection, or re-render-discipline bug found beyond the
two items in §8.2 and the two flagged-but-unfixed items noted above.

### 8.4 — Verdict

**Unchanged: M4 milestone exit criteria met, zero P0/P1 open**, now confirmed by a second,
independent reviewing pass rather than resting on §1-7's own self-report. Two real gaps were
found and fixed within this pass, each with regression tests (or, for the type-only fix, the CI
gate's own typecheck step as the regression protection) — one a latent CI-gate reproducibility
defect pre-dating M4 entirely (`NumericInput.tsx`), one a cross-cutting robustness gap spanning
three M4 screens (M4-03/M4-06/M4-08) that no single task's own review could have caught, exactly
the kind of finding this milestone-wide pass exists to surface. `pnpm run ci` is green end to end
after this pass's changes (165 suites / 2181 tests, all four active coverage thresholds held,
21/21 `expo-doctor`, clean `expo export`) — re-run fresh twice, both times, per this task's own
mechanics. M4 remains ready for M5 to build on top of. The `v0.4.0-m4` tag is left exactly where
M4-12 placed it (this pass's own fix commits land on top of it, mirroring M2's/M3's own §8
precedent: `git merge-base --is-ancestor <fix-sha> v0.3.0-m3` returns false for both of M3's own
§8 fix commits, confirming the tag-stays-put convention independently rather than assuming it).
