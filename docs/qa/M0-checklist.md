# M0 Exit Checklist — Scaffold & Design System

Milestone-close verification for M0, per `docs/plan/tasks/M0-tasks.md` (M0-12) and the M0
exit criteria in `docs/plan/09-milestones-and-delivery.md`. This is the "milestone exit =
tag `v0.<M>.0` + checklist file committed under `docs/qa/`" artifact referenced by 09's
working agreements.

**Scope of this pass:** verification + hardening of M0-01…M0-11's combined output. Not a
new-feature task. See `docs/plan/EXECUTION-LOG.md` for the full per-task implementation +
code-review history this checklist is built on top of (every M0-01…M0-11 row was reviewed
"pass, clean" or "pass, with a non-blocking fix" — **zero P0/P1 found in any prior review**).

Verified at commit `17edce1` (tip of `users/tejitpabari/init` at the start of this task),
with two integration fixes landed during this pass (see "Fixes made during this pass" below).

---

## 1. Full CI gate (`pnpm run ci`)

Ran end-to-end on a clean `pnpm install` (Node v20.20.1, pnpm 9.15.9 via corepack — see
`docs/plan/BLOCKERS.md` for why this pinned toolchain is required on this machine).

Steps: `tsc --noEmit` → `eslint .` → `pnpm test -- --coverage` → `npx expo-doctor` →
`npx expo export --platform ios`.

**Result: green, exit 0.**

```
Test Suites: 31 passed, 31 total
Tests:       198 passed, 198 total
Snapshots:   0 total
Time:        13.9 s
Ran all test suites in 2 projects.

Running 21 checks on your project...
21/21 checks passed. No issues detected!

React Compiler enabled
Starting Metro Bundler
iOS Bundled 87828ms .../expo-router/entry.js (3995 modules)
Exported: dist

real    2m34.7s   (well under the 8 min CI target, 08 §9)
```

Coverage (all thresholds from `jest.config.js` met):

| Area | Threshold | Actual |
|---|---|---|
| `src/data/**` | 90% / 85% | 100% / 100% (files touched this milestone) |
| global | 75% / 70% | 94.73% / 90.68% |

`src/domain/**` (95/90) and `src/features/workout/**` (85/80) thresholds are present in
`jest.config.js` but intentionally commented out — those directories have no source files
yet (M1/M2 land the first ones). This is a **documented, tracked** deferral, not a gap: each
commented line carries a `TODO(M1)` / `TODO(M2)` pointing at the exact file, and M0-03's own
review additionally wired an acceptance-gate line into `M1-02` and `M2-03` naming the exact
line to uncomment — two independent tripwires, not one. See `EXECUTION-LOG.md` M0-03 row.

## 2. Fixes made during this pass (integration issues, not new features)

Per the M0-12 task's charter ("if anything is currently broken … FIX it yourself now — this
is exactly the kind of integration issue a milestone-exit pass exists to catch"), two issues
were found and fixed:

1. **`expo-doctor` was failing (20/21)** at the tip of the branch: 9 Expo SDK-56 packages
   (`@expo/ui`, `expo`, `expo-build-properties`, `expo-constants`, `expo-dev-client`,
   `expo-linking`, `expo-router`, `expo-splash-screen`, `expo-web-browser`) and
   `react-native-screens` had drifted patch/minor versions behind their SDK-pinned ranges —
   confirmed via `git worktree` bisection against the parent commit that this was pre-existing
   upstream-registry drift (newer SDK-56 patch releases became available after each task last
   ran `expo-doctor`), not something any M0 task's diff introduced. Fixed with
   `npx expo install --fix`, which surfaced one knock-on unmet peer dependency
   (`@expo/metro-runtime@^56.0.18`, found 56.0.17) resolved with a follow-up
   `npx expo install @expo/metro-runtime`. Re-ran the full gate clean afterward
   (`expo-doctor` 21/21, `expo export` still bundles, all 198 tests still green). All bumps
   are patch/minor within the pinned SDK-56 `~` ranges — no major-version or React Native
   core changes. `package.json` / `pnpm-lock.yaml` diffs are version-bump-only.

2. **`app/__tests__/tabs-layout.test.tsx` flaked under full-suite load**: the first
   `redirects "/" to the Workout tab` test (a cold `renderRouter(...)` call, the most
   CPU-sensitive render in the suite — it cold-builds the whole route tree via expo-router's
   require-context ponyfill) took ~2.9 s in isolation but exceeded the default 5000 ms Jest
   timeout when run inside `pnpm run ci` (CPU contention from the preceding `tsc`/`eslint`
   steps plus parallel Jest workers). Reproduced twice via `pnpm run ci`, confirmed it passes
   reliably standalone (`npx jest tabs-layout.test.tsx`), and fixed by raising the per-test
   timeout to 15000 ms for every test in the file (not just the first, since worker scheduling
   can put any of them first). No functional/production-code change — purely a test-timing
   fix, with the reasoning recorded in a comment in the test file itself.

No other regressions found across the 11 prior tasks' interactions.

## 3. M0 exit criteria — evidence

### 3.1 App boots to tabs (< 1.5 s budget)

- **No simulator/device available in this environment** (`docs/plan/BLOCKERS.md`: headless
  Linux, no Xcode/macOS/iOS Simulator) — cold-start-to-tabs wall-clock timing cannot be
  measured directly here. Per BLOCKERS.md and how every M0 task already handled this, the
  evidence obtainable headless is:
  - `npx expo export --platform ios` bundles the real route tree cleanly: 3995 modules,
    Hermes bytecode bundle produced (`_expo/static/js/ios/entry-*.hbc`, 7.9 MB), zero route
    errors. This proves the app *can* boot (the bundle is valid and loads the full tab tree)
    but says nothing about wall-clock time on a device.
  - `app/__tests__/tabs-layout.test.tsx` (RNTL, via `expo-router/testing-library`'s
    `renderRouter`) renders the **real** route tree — `app/_layout.tsx`'s DB-ready gate,
    `app/(tabs)/_layout.tsx`'s 4 tabs, and each tab's placeholder screen — and asserts all
    4 tabs are reachable and render their placeholder content after the (mocked-resolved)
    DB-ready gate flips to `ready`: `redirects "/" to the Workout tab`, `navigates to the
    Workout/History/Exercises/Profile tab` (5 tests, all green).
  - `app/__tests__/db-gate.test.tsx` separately covers the gate's pending/error/ready states
    (so the "gate resolves, then tabs render" sequencing is genuinely exercised, not assumed).
  - **Methodology placeholder for the owner:** re-measure cold start on a real device/simulator
    once available (see `BLOCKERS.md`) — e.g. `xcrun simctl` launch-to-first-frame timestamp
    diff, or a manual stopwatch against the M6-04 TestFlight build. Budget: < 1.5 s. **Not
    measured in this pass — no device exists to measure it on.**

### 3.2 Theme switching works app-wide

- `app/__tests__/settings-theme-e2e.test.tsx` (M0-10's acceptance gate) renders the **real**
  root layout via `renderRouter('app', { initialUrl: '/profile/settings' })`, presses the
  real Dark segmented-control button on the real settings screen, and asserts:
  1. the same mounted tree (no manual remount) re-colors to the dark `bg.base` token
     (`#0B0D0C`) — proving `ThemeProvider`'s controlled `preference` prop is genuinely wired
     to `settingsStore`, not just read locally by the settings screen; and
  2. the write round-trips through a real `SettingsRepository` (`better-sqlite3`, not a
     stub) — `settings.theme === 'dark'` on the very next read.
- Both tests pass. `src/features/settings/__tests__/settings-store.test.ts`'s "fresh store
  instance + relaunch" case additionally proves survival across process boundaries (closes
  the driver, opens a brand-new one against the same on-disk file, brand-new store instance,
  values still correct) — theme survives relaunch, not just in-memory.

### 3.3 Token contrast test green, both themes (07 §2.6 / 08 §4.8)

`src/ui/__tests__/tokens.test.ts` — 33 tests, all green, both themes. Exact ratios computed
(reproduced independently during this pass via the same WCAG relative-luminance/contrast-ratio
formulas, run directly against `src/ui/tokens.ts`'s live hex values — not re-stating the test's
own numbers uncritically):

| Pair | Requirement | Dark | Light |
|---|---|---|---|
| text.primary / bg.base | ≥ 7:1 | 18.08 | 15.22 |
| text.primary / bg.surface | ≥ 7:1 | 16.29 | 16.56 |
| text.primary / bg.elevated | ≥ 7:1 | 14.63 | 14.53 |
| text.secondary / bg.base | ≥ 4.5:1 | 7.93 | 5.78 |
| text.secondary / bg.surface | ≥ 4.5:1 | 7.14 | 6.29 |
| text.secondary / bg.elevated | ≥ 4.5:1 | 6.42 | 5.52 |
| accent.text / bg.base | ≥ 4.5:1 | 10.14 | 5.04 |
| accent.text / bg.surface | ≥ 4.5:1 | 9.14 | 5.48 |
| accent.onAccent / accent.primary (fill) | ≥ 3:1 | 6.57 | 3.77 |
| accent.onAccent / accent.pressed (fill) | ≥ 3:1 | 5.10 | 5.46 |
| text.primary / accentSubtle-over-bg.base | ≥ 4.5:1 | 16.47 | 13.86 |
| text.primary / accentSubtle-over-bg.surface | ≥ 4.5:1 | 14.47 | 15.08 |
| text.secondary / accentSubtle-over-bg.base | ≥ 4.5:1 | 7.22 | 5.26 |
| text.secondary / accentSubtle-over-bg.surface | ≥ 4.5:1 | 6.35 | 5.73 |

All 14 pairs clear their required floor in both themes, several by a wide margin. Sanity
checks (black/white = 21:1, identical colors = 1:1, symmetry) also pass.

### 3.4 Primitives have RNTL smoke tests in both themes

Spot-checked 4 of the 12 M0 primitives' test files directly (not trusting commit-message
claims) to confirm both-theme coverage is real, distinct assertions per theme — not a
copy-pasted expectation:

- **`Card.test.tsx`**: dark case asserts `flatStyle.backgroundColor === colors.dark.bg.surface`;
  light case asserts the corresponding `colors.light.bg.surface` — genuinely different
  expected values.
- **`NumericInput.test.tsx`**: separate `preference="dark"` / `preference="light"` smoke
  renders, plus dedicated behavioral tests (select-all-on-focus, decimal/integer filtering)
  layered on top.
- **`Snackbar.test.tsx`**: separate dark/light smoke renders, plus Undo-behavior and
  auto-dismiss (5 s) behavioral tests.
- **`Avatar.test.tsx`** (covers both `Avatar` and `Thumb`): separate dark/light smoke renders
  for each, plus fallback-initial-derivation tests.

Full inventory (`grep` count of `preference="dark"` / `preference="light"` occurrences across
all 14 `src/ui/__tests__/*.tsx` files): 13 of 14 component test files exercise both themes.
The one exception, `ErrorBoundary.test.tsx`, is correctly out of scope — `ErrorBoundary` is
catch/reset infrastructure (06 §9), not one of the 12 primitives in 07 §5's inventory
(Button, Card, ListRow, Chip, SearchBar, EmptyState, Sheet, SegmentedControl, NumericInput,
Snackbar, StatColumn/StatTile, Avatar/Thumb — all 12 present and confirmed both-theme tested).

`theme-provider.test.tsx` (the provider itself, not a primitive) also covers both themes plus
all three `system`-resolution branches.

**Dev gallery sweep:** `app/dev/gallery.tsx` imports and renders all 12 primitives plus a
live `SegmentedControl` theme toggle (`setPreference`) wired to the shared app-root
`ThemeProvider` — confirmed by reading the file directly (not re-stated from a prior task's
claim). This is the closest available headless equivalent to 08 §7's "visual check in dev
gallery" manual step; actual pixel-level visual sweep across both themes on-device is one of
the manual-QA items deferred to real-device availability (see §5 below).

### 3.5 Migration runner integration-tested

`src/data/sqlite/__tests__/migrator.test.ts` (better-sqlite3, real generated migration SQL —
the same file the on-device driver applies, 08 §5 parity):

- Empty DB → `migrate()` → `app_meta` + `settings` tables created, `schema_version` recorded
  as `'1'`, both tables round-trip a real row.
- **Migration-scope assertion, explicit test**: `'this migration creates ONLY app_meta +
  settings (M1-01 owns the full v1 schema)'` — passes.
- Re-running against an already-migrated DB is a no-op (`applied: []`, versions unchanged).
- Out-of-order manifest entries are sorted by `version` before applying (not manifest order).

**Scope clarification (important — do not confuse with M1):** 09's M0 exit criterion reads
"migration runner integration-tested (empty → v1 schema)". Per M0-09's own scoping decision
(recorded in its task text and confirmed unchanged by this pass), **"v1 schema" here means
migration `0001`/`0000_app_meta_and_settings.sql` only** — `app_meta` + `settings`, nothing
else. The **full** v1 DDL (workouts, exercises, sets, routines, etc., per `05` §3 in full) is
explicitly out of scope for M0 and lands as migration `0002` in **M1-01**. What M0 actually
proves is that the migration-runner *mechanism* (sequential apply, transactional rollback on
failure, idempotent re-run, version tracking) is sound and will extend cleanly — not that the
app's real schema is complete. M1-01's own task text and fixture tests are where "empty → full
v1 schema" gets its real exit gate.

### 3.6 CI green with coverage plumbing

Covered in §1 above. `coverageThreshold` is active (not aspirational) in `jest.config.js`:
`src/data/**` (90/85, met at 100/100) and `global` (75/70, met at 94.73/90.68) are live gates
today; `src/domain/**` (95/90) and `src/features/workout/**` (85/80) are pre-configured with
tracked TODOs + cross-referenced task acceptance gates (M1-02, M2-03) for when those
directories gain their first files — not silently absent.

## 4. Code-consistency sweep

- **Raw hex literals** (`grep -rnE "#[0-9a-fA-F]{3,8}" src/ui/`, excluding `tokens.ts` and
  test files): **zero matches.** All primitive components consume tokens only.
- **Debug `console.log`/`.warn`/`.error`/`.debug`** in `src/`/`app/` (excluding tests/mocks):
  **zero matches.**
- **`TODO`/`FIXME`/`XXX` comments**: all existing instances (in `src/lib/{files,haptics,
  notifications,keep-awake}.ts`, `src/lib/sentry.ts`, `src/features/workout/GlobalWorkoutBar.tsx`,
  `src/test/fixtures/workout-builder.ts`) are already milestone-tagged (`TODO(M2)`,
  `TODO(M5)`, `TODO(M2-13)`, `TODO(M1+)` etc.) pointing at the exact future task that owns
  wiring the real native module or domain extension — these are deliberate native-module/
  future-feature seams (06 §10 portability pattern: mock now, wire when the owning milestone
  lands), not untracked debt. No action needed.
- **`eslint-disable` comments**: two found, both in `src/ui/Sheet.tsx` — a single-line
  `react-hooks/exhaustive-deps` disable on an intentional mount-only effect, and a narrowly
  bracketed `react-hooks/immutability` disable/enable pair around exactly the
  `Gesture.Pan()` `useMemo` block (Reanimated's `useSharedValue` mutable-ref-by-design
  pattern, documented inline with a rationale comment immediately above). Both confirmed
  narrowly scoped, not blanket-disabled files. No action needed.
- **Jest test-environment shims** (`react-native-gesture-handler/jestSetup.js`,
  `react-native-worklets/jest/resolver.js`, `expo-glass-effect`/`expo-image` manual mocks):
  previously verified load-bearing by the M0-07/M0-08 code reviews (temporary-removal +
  re-run each reproduced its documented failure); not re-litigated in this pass since nothing
  in this diff touched them.

## 5. Environment limitations affecting this milestone's QA-equivalent verification

Full detail lives in `docs/plan/BLOCKERS.md` — not duplicated here, only cross-referenced with
the specific M0-12 impact:

- **No simulator/device**: cold-start-to-tabs timing (§3.1), on-device visual theme sweep,
  Dynamic Type / VoiceOver passes, and haptics/lock-screen behavior are all **not verifiable
  headless**. This milestone's "manual QA" is necessarily bundle-export + RNTL-test evidence
  standing in for what 08 §7's device-matrix checklist would otherwise cover — consistent
  with how every individual M0 task already handled this gap, not a new gap introduced here.
- **No EAS/Expo account, no Apple Developer access**: irrelevant to M0 specifically (M0 has
  no owner-gated tasks per M0-tasks.md's header), but worth restating since it's why "boots on
  simulator" downstream (M6) is the first point real device numbers become available.
- Everything else (typecheck, lint, Jest unit/RNTL/integration, `expo-doctor`, `expo export`)
  runs natively in this environment and is exercised for real, not stubbed — per
  `BLOCKERS.md`'s "Everything else" section.

## 6. Verdict

**Zero P0/P1 open.** Every M0-01…M0-11 task was independently code-reviewed clean or with
only non-blocking fixes (see `EXECUTION-LOG.md`); this milestone-close pass found and fixed
two integration issues (expo-doctor dependency drift, one flaky test timeout — both
described in §2), re-verified the full gate green afterward, and found no further defects in
the code-consistency sweep. **M0 exit criteria are met** to the extent verifiable in this
headless environment, with cold-start timing and on-device theme/visual sweeps explicitly
flagged as re-measurement items for the owner once device access exists (§3.1, §5).
