# Execution Environment Blockers

This document records environment constraints on the machine used to execute the Kyro dev
task list (`docs/plan/tasks/M0-tasks.md` … `M7-tasks.md`, `M-CLOUD-tasks.md`) autonomously,
so the human owner can address them later. It is a companion to `docs/plan/EXECUTION-LOG.md`
and the `[status]` tags described in `docs/plan/tasks/TASKS-INDEX.md`.

## Machine profile

Headless Linux machine. No macOS, no Xcode, no iOS Simulator, no physical iOS device, no
Apple Developer account access, no EAS/Expo account login, no TestFlight/App Store Connect
access.

## Practical impact on the task list

- **CAN run here:**
  - All Jest unit/integration tests — domain logic, repository tests against `better-sqlite3`,
    RNTL (React Native Testing Library) component tests — since these are Node-based and do
    not require a simulator or device.
  - Static analysis: `tsc` (TypeScript type-checking) and `eslint`.
  - Maestro E2E flow files can be **authored** (written to disk, reviewed for correctness)
    but **cannot be executed** — there is no iOS Simulator to run them against.
- **CANNOT run here:**
  - `eas build` / `eas submit`, TestFlight distribution, App Store Connect submission — all
    require Expo/EAS account login and Apple Developer account access, neither available.
  - Physical-device QA drills: lock-screen notification delivery, force-quit/restart resume
    behavior, haptics feel, and any App Store review interaction.
  - Anything requiring the iOS Simulator (visual QA, Maestro flow execution, on-device manual
    testing).

**Update (M2-08, 2026-07-24):** the same "physical-device QA drills" category above also covers
keyboard-feel timing measurements — M2-08's own acceptance gate calls out "zero keyboard
flicker between fields" and "keypress-to-paint < 50 ms" (06 §8) as manual/physical checks,
explicitly deferring formal sign-off to M2-19. Confirmed these cannot be measured here: there is
no iOS Simulator/device to observe real keyboard transition rendering or to run a React
DevTools/timestamp profiling harness against. The keyboard-flow *logic* itself (Next-traversal
order, no explicit blur/dismiss calls in this app's own code, `keyboardShouldPersistTaps`
wiring) is fully covered by Jest/RNTL instead — see `docs/plan/EXECUTION-LOG.md`'s M2-08 row.

**Update (M2-18, 2026-07-24):** authored `nightly.yml` (full jest + Maestro E2E on a `macos-14`
runner + dataset-build determinism check) and `e2e/flows/{01,03,07}-*.yaml`. This doesn't
surface a new blocker *category* — it's the same "no macOS/Xcode/Simulator/Maestro binary"
constraint the Machine profile above already states — but is worth a precise note on exactly
how far verification could go: `nightly.yml`'s `maestro` job (macOS runner, Xcode select,
Maestro CLI install, simulator build via `expo run:ios`, `maestro test`) could only be checked
by generic YAML parsing (`python3 -c "import yaml; yaml.safe_load(...)"`, same method the
M0-04 row already used for `ci.yml`) and manual review against Maestro's/GitHub Actions'
documented syntax from training knowledge — there is no way to dry-run even the job's *shape*
(e.g. whether `maxim-lobanov/setup-xcode@v1` or `expo run:ios --device "iPhone 15"` actually
succeed on a real `macos-14` runner) without an actual macOS runner, which this sandbox cannot
provide under any workaround. By contrast, the `jest` and `dataset-determinism` jobs in that
same file mirror steps that **were** run for real here (`pnpm test -- --coverage`;
`pnpm run build:exercises` run twice with a `sha256sum`/`diff` byte-identity check) — see
`docs/plan/EXECUTION-LOG.md`'s M2-18 row for the exact commands/output. Every testID referenced
in the three new `e2e/flows/*.yaml` files was grep-confirmed against current source (also
logged there), which is the furthest a flow file's *content* (as opposed to a real run against a
rendered app) can be validated from here.

## Out-of-scope tasks for this autonomous run

The following tasks are explicitly **skipped entirely** in this run. They are owner-gated per
`docs/plan/tasks/OWNER-TASKS.md` and `TASKS-INDEX.md`:

- **M5-11** — owner Hevy CSV audit
- **MC-14** — production Supabase credential wiring
- **M6-09** — TestFlight beta distribution + physical device drills
- **M7-04, M7-05, M7-06** — App Store submission, review response, post-launch ops

All **14** owner tasks (`O-01` … `O-14`) in `OWNER-TASKS.md` are the human owner's
responsibility and are not attempted by the autonomous agent run.

## Docker / Supabase local stack

Milestone MC tasks **MC-01, MC-02, MC-07, MC-08, MC-10, MC-11** need `supabase start`, which
in turn needs Docker.

- **Docker: NOT available** on this machine (`docker --version` → command not found).
- **Supabase CLI: NOT available** on this machine (`supabase --version` → command not found).

Impact: for these MC tasks, the agent will implement the code and any Node-runnable unit
tests (e.g. pure sync logic, schema definitions, mock-based tests), but **cloud-integration
tests that require a live local Supabase stack (`supabase start`) cannot be executed in this
environment** and must be flagged per-task in `EXECUTION-LOG.md` as blocked/unverified pending
Docker + Supabase CLI installation by the owner.

## Toolchain check

Run on 2026-07-23:

| Tool | Available | Version / notes |
|---|---|---|
| `node` | Yes | v20.20.1 |
| `npm` | Yes | 10.8.2 |
| `pnpm` | No | not on PATH (`pnpm --version` → command not found) |
| `corepack` | Yes | 0.34.6 — can enable `pnpm` via `corepack enable` / `corepack prepare pnpm@<ver> --activate` if the project requires it |
| `docker` | No | not on PATH (`docker --version` → command not found) |
| `docker ps` | No | fails, same reason (Docker not installed) |
| `supabase` CLI | No | not on PATH (`supabase --version` → command not found) |
| `xcodebuild` | No | not on PATH (expected — no macOS) |

`pnpm` is not currently installed but `corepack` is present, so it can likely be activated
on-demand (`corepack enable && corepack prepare pnpm@latest --activate`) by the first task
that needs it (M0 scaffold), without owner intervention. Docker and the Supabase CLI have no
such local workaround and require the owner to install them for MC cloud-integration testing.

**Update (M0-01):** `corepack prepare pnpm@latest --activate` fails on this machine — current
pnpm (11.x) requires Node ≥ 22.13, and this machine has Node v20.20.1 (`node:sqlite` builtin
module error on startup). Worked around with `corepack prepare pnpm@9 --activate` (resolved to
pnpm 9.15.9), which is Node-20-compatible and has worked cleanly for `pnpm install` since. If
Node is ever upgraded to ≥22.13 on this machine, `pnpm@latest` can be re-tried; until then, all
`pnpm` invocations on this repo resolve to the pinned 9.x line via corepack's local activation
(no `packageManager` field was added to `package.json`, so a fresh shell must re-run
`corepack prepare pnpm@9 --activate` if corepack's global state is ever reset).

**Update (M0-03):** `better-sqlite3`'s latest release (13.0.1) ships prebuilt binaries compiled
with `NAPI_VERSION=10`. Loading that binary (or any from-scratch N-API addon built with
`NAPI_VERSION=10`, confirmed independently of better-sqlite3's own code) segfaults immediately
inside Node's own `napi_module_register_by_symbol` on this machine's Node v20.20.1 — whose
actual napi version is 9 (`process.versions.napi === '9'`) — instead of failing gracefully.
Root-caused via `gdb` backtrace (crash is inside Node internals, not the addon). A plain N-API
addon built without an explicit `NAPI_VERSION` define loads and runs fine, confirming this is
specifically the NAPI_VERSION-10-on-Node-20 combination, not native addons in general.
Workaround: pinned `better-sqlite3` to `12.4.1` (declares `"engines": {"node": "20.x || 22.x ||
23.x || 24.x"}`, ships a `prebuild-install`-fetched binary compiled against a Node-20-compatible
napi version) — verified working (create/insert/select/rollback round-trip passes). If Node is
ever upgraded to ≥22 on this machine (see the M0-01 update above re: `pnpm@latest` too), retest
`better-sqlite3@latest` — the NAPI_VERSION=10 requirement should be satisfied natively there and
the pin can likely be lifted.

## Git remote (M0-04 finding)

The M0-04 task brief assumed "no GitHub remote confirmed for this repo." That assumption is
**outdated**: `git remote -v` shows `origin -> https://github.com/tejitpabari99/kyro.git`
(fetch+push), and `git ls-remote origin` succeeds from this sandbox — `refs/heads/main` on the
remote resolves to `f131f977956ee06fd91845f189673fd6e25276d6`, matching this repo's local
history at the time of the check. So a real, reachable GitHub remote exists and the CI workflow
(`.github/workflows/ci.yml`, M0-04) *would* run for real once pushed.

Per the M0-04 task instructions, no push was attempted from this session (working on
`users/tejitpabari/init`, no new branches, no push) — so an actual GitHub Actions run of
`ci.yml` has **not** been triggered or observed; the workflow file has only been reviewed
manually and YAML-parsed locally (`python3 -c "import yaml; yaml.safe_load(...)"`), not executed
via `act` or a real Actions runner (neither is installed here). Whoever next pushes this branch
(or opens the PR) should watch for the first real Actions run and report back if `ci.yml` behaves
differently than the local `pnpm run ci` equivalent predicts.

## `pnpm ci` vs `pnpm run ci` (M0-04 finding)

`package.json` has a `"ci"` script (the local-equivalent gate for `.github/workflows/ci.yml`,
per M0-04). However, **bare `pnpm ci` does not run it**: pnpm reserves the top-level verb `ci`
for its own built-in command (alias of `clean-install`, mirroring `npm ci`) and intercepts it
before consulting `package.json` scripts — on this machine's pnpm 9.15.9 that built-in isn't
even implemented yet, so `pnpm ci` fails immediately with `ERR_PNPM_CI_NOT_IMPLEMENTED` (exit 1)
instead of running the intended gate sequence. This is permanent pnpm CLI behavior (documented at
`pnpm ci --help`: "Usage: pnpm ci … Clean install a project"), not an environment quirk, and it
is not specific to this pnpm version — any script literally named `ci` is shadowed the same way.

**The actual invocation is `pnpm run ci`** (explicit `run` disambiguates a script name from a
built-in command) — verified to execute the full gate end-to-end and exit 0. Anyone reaching for
"the local CI gate" should use `pnpm run ci`, not bare `pnpm ci`. The script was kept named `ci`
rather than renamed (e.g. to `ci:local`) because that is what the task spec asked for verbatim
and it is still the standard, discoverable name in `package.json` scripts — the caveat is just
that pnpm requires the explicit `run`.

## Network access (M1-03 finding)

The M1-03 task brief hedged that this sandbox "likely has NO general internet access for
arbitrary downloads" and asked the agent to actually test before assuming either way. Tested
2026-07-23: `curl -sI https://github.com` → `200`; `curl -sI https://raw.githubusercontent.com`
→ `301` (redirect to `github.com`, expected for a bare host request, not a block);
`curl -sI https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json`
→ `200` with real content-length; and a real
`git clone --depth 1 https://github.com/yuhonas/free-exercise-db /tmp/fedb-check` succeeded in
~6 s, producing a full working tree (`git rev-parse HEAD` → `b0eed061e1c832b3ed815fbaa4b45b3cdc14df49`).
**So this machine DOES have outbound internet access to at least github.com /
raw.githubusercontent.com** (whether that's true for arbitrary other hosts wasn't tested here —
only what M1-03 needed). This corrects the general "no internet access" assumption baked into
several task briefs' blocker-hedges; a future task that assumes no network access should still
verify it directly (per this same test pattern) rather than trusting that assumption blindly,
since it does not hold uniformly.

Practical effect: M1-03 vendored the **real** free-exercise-db dataset (873 exercises, 1746
images, pinned commit hash — see `data/free-exercise-db/VENDORED.md`), not a synthetic
placeholder. M1-04 onward build against real data.

## Drag-reorder gesture feel + frame rate (M3-03 finding)

M3-03 implemented `RoutinesHubScreen`'s drag-reorder mode on
`react-native-reanimated-dnd` (`Draggable`/`Droppable`/`DropProvider`
primitives — see that file's header for the library-choice reasoning and
`docs/plan/EXECUTION-LOG.md`'s M3-03 row). Same "physical-device QA drills"
category the Machine profile section above already covers (no iOS
Simulator/device here) applies to two specific pieces of that task's own
acceptance gate that could not be verified in this sandbox:

- **On-device gesture feel** — whether pickup/drag/drop actually feels
  smooth, whether `react-native-reanimated-dnd`'s collision detection
  correctly recognizes a drop against the right `Droppable` zone under real
  touch input (as opposed to this task's RNTL tests, which fire the same
  `onDragStart`/`onDrop` callback props through a mocked stand-in for the
  library rather than a real pan gesture — see
  `RoutinesHubScreen.test.tsx`'s M3-03 section header for exactly what that
  does and doesn't prove), and whether `impactLight` haptics actually fire
  on a physical device (`src/lib/haptics.ts`'s own header already notes this
  sandbox hits the "native module unavailable" branch on every haptics call
  — true here too, `dragReorder()` is exercised via the mocked
  `@/lib/haptics` module in tests, never the real `expo-haptics` bridge).
- **"No frame drops on a 30-routine list"** (M3-03's own acceptance line,
  04 §1) — an explicitly manual/on-device performance check with no Jest or
  static-analysis equivalent; nothing in this sandbox can render 30 real
  routine cards under a live 60fps compositor and measure dropped frames.

The *data-persistence* half of M3-03's acceptance gate ("drag routine
between folders persists and order stable after relaunch") **is** verified
here, end-to-end, against the real position-math (`routine-reorder.ts`,
node-testable pure functions) and the real `RoutineRepository` call wiring
(RNTL, mocked-drop-callback pattern above) — only the on-device gesture
feel/frame-rate half is deferred, matching the M2-08 update's precedent
above (in "Practical impact on the task list") for exactly this split
("the *logic* is fully covered by Jest/RNTL instead... [the physical feel]
cannot be measured here").

## Calendar month-pager swipe gesture feel (M4-06 finding, 2026-07-25)

`CalendarMonth` (`src/ui/CalendarMonth.tsx`) implements 04 §3.2's "swipe/chevron month pager" with
both an always-available chevron pair and a `Gesture.Pan()` swipe over the week grid, the same
`Gesture.Pan()` + threshold-on-`onEnd` shape `SetRow.tsx`'s swipe-to-delete and `Sheet.tsx`'s
drag-to-dismiss already use. Same category as `Sheet.test.tsx`'s (M0-07) and M3-03's own
drag-reorder blocker above: this sandbox has no iOS Simulator/physical device, and RNTL's
`fireGestureHandler`-less setup here doesn't simulate a real native pan sequence, so
`CalendarMonth.test.tsx` (M4-06) exercises the chevron-button paging path only — the *logic* both
paths share (`onPrevMonth`/`onNextMonth` callbacks, month-grid rebuild, query refetch) is fully
covered; whether the swipe gesture actually feels responsive, whether the `SWIPE_PAGE_THRESHOLD`
(50 pt) is a good value against a real finger, and whether it fights `FlashList`'s own vertical
scroll anywhere it's embedded, are on-device-only checks deferred to the same physical-device QA
pass the two precedents above are deferred to.

## Multi-chart-mount RNTL test flakiness within one file (M4-08 finding, 2026-07-25)

`StatisticsScreen.tsx` (M4-08, Profile → Statistics dashboard) mounts 3 real
`victory-native`/`@shopify/react-native-skia` chart cards (`BarChart` + `LineChart` +
`StackedBarChart`) simultaneously in one render — heavier than any single M4-07 chart wrapper's
own test file (each of which mounts only one chart type per test). Empirically, the interaction
tests that repeatedly re-mount `StatisticsScreen` (range-control re-fetch, metric switcher,
first-day-of-week reactivity) intermittently failed with zero query calls / missing testIDs when
run **after** other `it` blocks in the *same* test file — accompanied by React console warnings
("You seem to have overlapping act() calls, this is not supported", "An update ... was not
wrapped in act(...)", "The current testing environment is not configured to support act(...)").
Each individual failing test passed cleanly in isolation (`jest -t "<name>"`, a fresh process),
and the underlying behavior is independently proven correct by `domain/stats-buckets.ts`'s own
exhaustive unit suite (`stats-buckets.test.ts`) and `WorkoutRepositoryImpl.statsFeed`'s real-SQLite
integration suite (`workout-repository.stats.test.ts`) — this is a test-harness-level React
act()/scheduler interaction under this project's jest-expo + React 19 + `@tanstack/react-query`
combination, not a functional bug in the screen or its data layer. Root cause not fully isolated
(a `IS_REACT_ACT_ENVIRONMENT`-adjacent global-scheduler interaction across sequential heavy-Skia
mounts within one Jest worker/file is the leading theory, per the specific console warnings
above), but the fix that resolved it reliably was mechanical: splitting the interaction-heavy `it`
blocks into their own file (`StatisticsScreen.interactions.test.tsx`, separate from
`StatisticsScreen.test.tsx`'s summary-tile/warm-up-toggle tests) — Jest resets the module registry
and JS environment per test **file**, not just per test, which sidesteps whatever state
accumulates within one shared file/process. **Practical guidance for later multi-chart-mount
screens** (M4-09's per-exercise charts is the obvious next case): keep test files that mount more
than one heavy chart component per render small, and split interaction/re-render-heavy `it` blocks
into their own file rather than accumulating many full-screen mounts in one file, before assuming
a real bug if `waitFor`/testID lookups start failing only when run alongside other tests in the
same file.

## M4-09 checked against the M4-08 multi-chart-mount flakiness pattern (M4-08/M4-09 batch review, 2026-07-26)

The M4-08 finding above named M4-09's per-exercise charts as "the obvious next case" to watch for
the same act()/scheduler flakiness. Checked directly: `ExerciseDetailScreen.test.tsx` (13 `it`
blocks, including a real Charts-tab mount of a `LineChart` with real data) does print the same
signature console warnings ("You seem to have overlapping act() calls", "An update ... was not
wrapped in act(...)") when run as a full file — but unlike the M4-08 case, it did **not** reproduce
as a test failure: run in isolation 3x back-to-back, in combination with
`StatisticsScreen.test.tsx` + `StatisticsScreen.interactions.test.tsx` 2x, and once inside the full
`pnpm test` run (164/164 suites, 2148/2148 tests) — 13/13 (or 18/18 combined) passed every time,
zero flakes observed. Likely reason this file is lower-risk than `StatisticsScreen.tsx`: it never
mounts more than one heavy chart *type* per render (only the single active `LineChart` on the
Charts tab, versus `StatisticsScreen`'s 3 simultaneous chart types — `BarChart` + `LineChart` +
`StackedBarChart` — in one render), and the file's own test count (13) is smaller than the
combined `StatisticsScreen` suites were before their split. **No action taken** — the mechanical
fix (split into a second file) documented above is available if this ever does start flaking, but
speculatively splitting an already-green, non-flaky file would be unjustified churn. Noting this
here so a future task doesn't have to re-derive "was this checked" from scratch.

## History 60 fps scroll + dashboard range-switch re-render profiling (M4-11 finding, 2026-07-26)

M4-11's own brief splits cleanly into a sandbox-testable half and an on-device-only half. The
testable half is done: `src/test/fixtures/synthetic-history.ts` + `synthetic-history-loader.ts`
generate/load a 5-year, 1040-workout (~15.8k-set, 8-distinct-`exercise_type`) fixture into a real
`better-sqlite3` driver, and `src/test/fixtures/__tests__/perf-budgets.test.ts` times the real
`WorkoutRepositoryImpl.statsFeed`/`domain/stats-buckets.ts` compute (every `DashboardRangeKey`) and
`WorkoutRepositoryImpl.setsForExercise`/`domain/records.ts` compute (every fixture exercise)
against the 300 ms budget (06 §8) — all green, see `docs/plan/EXECUTION-LOG.md`'s M4-11 row for the
actual measured numbers.

What is **not** achievable here, same category as the `CalendarMonth` swipe-gesture-feel and
drag-reorder-frame-rate findings above (no iOS Simulator/physical device in this sandbox):

- **History-tab scroll at 1000+ workouts actually running at 60 fps.** `FlashList` v2
  (`@shopify/flash-list@2.3.2`, confirmed via its own `FlashListProps.d.ts`) has no
  `estimatedItemSize`/`removeClippedSubviews` props at all — both are v1-only concepts, fully
  automatic in v2 — so there is no static "v1 footgun" config to tune there. What *is* a real,
  applicable tuning was checked and applied: `HistoryWorkoutCard` (`src/features/history/
  HistoryWorkoutCard.tsx`) is now `React.memo`-wrapped, and `HistoryListScreen.tsx`'s
  `handleRowPress` is `useCallback`-stabilized, so an unrelated parent re-render no longer
  re-renders every visible row. Whether the list actually holds 60 fps against a real finger at
  1000+ rows can only be measured with a profiler attached to a running device/simulator — deferred
  to the owner's physical/simulator QA pass.
- **Dashboard range-switch re-render profiling** (`StatisticsScreen.tsx`, M4-08) — React DevTools
  Profiler / Flipper-style "what re-rendered and why" traces need a real running app, not a Jest
  render tree. The *compute* budget behind a range switch (`statsFeed` + full `stats-buckets`
  suite) is proven under budget by the perf-budget test above; whether React itself re-renders more
  than necessary on a switch is a separate, on-device-only question, deferred the same way.

`app/dev/load-fixture.tsx` (`__DEV__`-gated, linked from Profile → "Load Fixture Data (DEV)") loads
this exact fixture into the real on-device database for whoever runs that physical/simulator pass —
it does the seeding, not the measuring.

## Worktree started behind `users/tejitpabari/init`'s tip (M5-05 finding, 2026-07-26)

The isolated git worktree assigned for M5-05 (`worktree-agent-a898c7e6646e15a5f`) was checked out at
`f131f97` ("Initial Plan and Task docs") — an early ancestor commit containing only `docs/`, with no
`src/`, `package.json`, `node_modules`, or any of the M0-M4 code the task references (`domain/stats-
buckets.ts`, `domain/units.ts`, `src/data/workouts/types.ts`, etc. were all unreadable at that
commit). `git merge-base --is-ancestor f131f97 0394324` confirmed the worktree's branch tip is a
strict ancestor of `users/tejitpabari/init`'s own tip (`0394324`, the M4-reviewed state), so a plain
`git merge --ff-only users/tejitpabari/init` inside the worktree fast-forwarded it cleanly to
`0394324` with no divergent commits to reconcile (the worktree branch had zero commits of its own
yet). `pnpm install --frozen-lockfile` then populated `node_modules` (also absent pre-merge).
Recorded here per this task's own instruction to work around environment blockers rather than stop;
future agents landing in a freshly-created worktree that appears to be missing the application
source entirely should check `git log --oneline -3` / `ls` first — it may just need the same
fast-forward, not a from-scratch bootstrap.

## `process.env.TZ` mid-test reassignment does not work under this repo's Jest setup (M5-05 finding, 2026-07-26)

Tried, for `domain/csv-codec.ts`'s "local time, not UTC" date-formatting requirement (05 §7.1), the
obvious approach: reassign `process.env.TZ` inside a test (even as the literal first statement of a
brand-new test file, before any other code touches `Date`/`Intl`) and assert the formatter's output
changes accordingly. Empirically this has **no effect** under `jest` (`node` project, `testEnvironment:
'node'`) — a minimal probe test (`process.env.TZ = 'America/New_York'` as the file's first line,
then `new Date(Date.UTC(2026,0,3,2,0)).getHours()`) still returned the UTC hour, not the NY one.
A bare `node -e` script doing the exact same reassignment-before-first-Date-use *does* work (verified
separately) — so this isn't "Node doesn't support it" in general, it's that Jest's own runtime
(module registry setup, coverage instrumentation, or jest-circus internals) already touches
`Date`/`Intl` before user test code runs, and V8's ICU timezone resolution appears to cache the
process's timezone on first use for the rest of the process lifetime, making a later reassignment a
no-op. No `TZ=... jest ...`-at-invocation config exists in this repo (`package.json`'s `test`/`ci`
scripts don't set it), and adding one was out of scope for a single task's test file. Grepped: no
existing test in this codebase (`domain/streaks.ts`'s included) relies on a non-ambient TZ — they
all just trust the environment's own timezone (confirmed UTC on this machine via `date`/
`Intl.DateTimeFormat().resolvedOptions().timeZone`). **Workaround used**: `domain/__tests__/csv-
codec.test.ts`'s local-vs-UTC coverage instead spies on `Date.prototype`'s local getters
(`getDate`/`getMonth`/`getFullYear`/`getHours`/`getMinutes`) and asserts the `getUTC*` family is
never called — an environment-independent way to prove the implementation reads local time, since
the TZ-reassignment approach can't be made to work reliably here. Future tasks that need a genuinely
non-UTC timezone in a Jest test (not just "prove local vs. UTC getters are used") will need either a
per-file `testEnvironmentOptions` timezone config or a `TZ=`-prefixed separate `test:tz` script —
neither exists yet.

## Pre-existing uncommitted EAS/Sentry-CLI scaffolding found on the working tree (M5-01/M5-05 batch review, 2026-07-26)

While independently reviewing M5-01/M5-05 (unrelated to either task's actual content), the working
tree at the start of the review already carried uncommitted changes with no obvious authorship in
this session's own history: `app.json` and `package.json` modified, `pnpm-lock.yaml` modified (3
lines), and two new untracked files, `.easignore` and `eas.json`. None of this touches
`src/data/measurements/**` or `src/domain/csv-codec.ts`/`src/lib/csv.ts` — it is orthogonal to the
M5-01/M5-05 review — so rather than either committing it under a review-fix commit or discarding it
outright (it may be real in-progress work from another session on this machine), it has been
preserved off the working tree via:

```
git stash push -u -m "pre-existing uncommitted EAS/package changes found during M5-01/M5-05 review, cause unconfirmed"
```

Stash ref: `stash@{0}` (SHA `f1f2c18249f196a431723e06ccd7bd78f530274e` at the time of stashing — recover
with `git stash show -p f1f2c18249f196a431723e06ccd7bd78f530274e` or `git stash pop` if it's still at
index 0; if other stashes accumulate before this is triaged, look it up by that SHA rather than by
index).

**What's in it, file by file:**
- `app.json`: adds `ios.infoPlist.ITSAppUsesNonExemptEncryption: false`; adds
  `android.permissions` (`RECORD_AUDIO`, `MODIFY_AUDIO_SETTINGS`, `FOREGROUND_SERVICE`,
  `FOREGROUND_SERVICE_MEDIA_PLAYBACK`); adds a top-level `extra: {router: {}, eas: {projectId:
  "5ab26155-4329-404b-8905-a19fd206e5b3"}}` and `owner: "tejitpabari99"`.
- `package.json` / `pnpm-lock.yaml`: adds `@sentry/cli@^2.58.4` as a devDependency (lockfile diff is
  exactly the corresponding 3-line entry — nothing else touched).
- `eas.json` (untracked, new): a `build`/`submit` profile config — `development` build sets
  `SENTRY_DISABLE_AUTO_UPLOAD: "true"`, `preview` is internal-distribution, `production` has
  `autoIncrement: true` and an empty `submit.production` block.
- `.easignore` (untracked, new): excludes `.expo/`, `dist/`, `web-build/`, `coverage/`,
  `*.tsbuildinfo`, `.DS_Store`, the 102 MB local-only `data/` source dataset (`scripts/build-
  exercise-db.ts`'s input, already-committed output is what actually bundles), and `docs/`/`e2e/` —
  each exclusion has an explicit inline comment explaining *why* it's excluded.

**Best guess at cause:** this reads as deliberate, if incomplete, EAS-build + Sentry-release
configuration work — not an accidental side effect of a `pnpm install`/`expo-doctor` run. Reasoning:
(1) `eas.json`'s content is a real, considered profile config (the `SENTRY_DISABLE_AUTO_UPLOAD` env
var in particular implies someone was mid-way through wiring the Sentry EAS build plugin, not just
running `eas build:configure`'s bare default scaffold); (2) `.easignore`'s exclusion list and its
per-line comments are hand-written prose in this repo's own established comment style, not
boilerplate a CLI would generate; (3) `@sentry/cli` was added as an explicit, intentional
`pnpm add -D` (a single clean lockfile entry, not a transitive/incidental bump); (4) `app.json`'s
`extra.eas.projectId`/`owner` fields are exactly `eas init`'s own signature output, but paired with
the encryption-export and audio/foreground-service permission additions, which look like preparation
for a real build (in-app audio for rest-timer sounds, per `05` §3.5's `sounds` settings key) rather
than scaffold noise. Net: this looks like real in-progress work from a separate session/agent on this
shared machine (likely EAS build setup + Sentry release wiring, adjacent to M5-04's `sentry_enabled`
setting and M0-11's diagnostics scope) that was left mid-stream, not a byproduct of anything M5-01 or
M5-05 did. **Not verified against any task doc claiming this scope** — flagging for triage, not
concluding it's safe to keep or discard.

**Action needed:** whoever owns EAS/Sentry setup should `git stash show -p f1f2c182...` (or `git
stash list` if the index has shifted), decide whether to `git stash pop` and finish/commit it, or
drop it if it's stale/superseded. Left untouched by this review beyond stashing it.

## Everything else

Every other task — all of M0 through M7 except the six owner-gated tasks listed above — is
expected to be **fully implementable, unit/integration-testable, and code-reviewable** in this
environment: scaffolding, domain logic, data layer (`better-sqlite3`), UI components (RNTL),
navigation, business logic, CSV import/export, statistics/PR computation, MC sync logic code
(minus live-stack integration verification), settings, and polish work.

See `docs/plan/EXECUTION-LOG.md` for the running per-task status log.
