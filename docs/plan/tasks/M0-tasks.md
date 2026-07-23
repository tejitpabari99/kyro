# M0 Tasks — Scaffold & Design System

Milestone spec: `../09-milestones-and-delivery.md` (M0). Exit = app boots to tabs < 1.5 s, theme switching app-wide, token contrast test green, primitives smoke-tested in both themes, migration runner integration-tested, CI green with coverage plumbing.

No owner tasks gate anything in M0. (CI workflow files are authored here; if the repo has no GitHub remote yet, all checks are runnable locally via `pnpm` scripts — see O-06 in `OWNER-TASKS.md`.)

Task count: **12**

---

### M0-01 — Repo init: Expo SDK 56 TypeScript app [done]
**Description:** Initialize the Expo app in the repo root: Expo SDK 56 TS template, pnpm, expo-router v6, strict TypeScript, `@/` path alias.
**How:** `pnpm create expo-app` with the TS template (or `npx create-expo-app`), then pin SDK 56. Add `expo-dev-client`. Configure `tsconfig.json` with `"strict": true` and `paths: {"@/*": ["src/*"]}` + `babel`/metro alias. `app.json`: name `Kyro`, slug `kyro`, iOS bundle id placeholder `com.tejitpabari.kyro`, `newArchEnabled` default, minimum iOS 16. Add `package.json` scripts: `start`, `ios`, `typecheck`, `lint`, `test`. Do NOT run `eas init` (needs an Expo account — owner-gated, M6).
**References:** 06 §1 (platform & deps), 00 D2, 10 §1 (bundle id placeholder).
**Dependencies:** none.
**Acceptance / test gate:** `npx expo start` boots the template on iOS Simulator; `pnpm typecheck` clean; repo committed structure matches 06 §2 top level.
**Est:** 0.5 d

### M0-02 — Folder structure, ESLint/Prettier, import-boundary rules [done]
**Description:** Create the full `src/` feature-folder skeleton and enforce the dependency rule with lint.
**How:** Create `app/`, `src/features/{workout,exercises,routines,history,stats,measurements,settings,data-transfer}`, `src/domain`, `src/data`, `src/ui`, `src/lib`, `assets/exercises/`, `data/`, `scripts/`, `e2e/` (with `.gitkeep`/index files). ESLint flat config + Prettier; add `eslint-plugin-import` (or `eslint-plugin-boundaries`) rules encoding: `app → features → {domain,data,ui,lib}`; `domain` imports nothing app-side (no `react`, no `expo-*`); `data` imports `domain` types only; `ui` imports tokens only. Add the single lint-allowed list for `Platform.OS` branching in `src/lib/` only (06 §10).
**References:** 06 §2 (structure + dependency rule), 06 §10 (portability), 01 E2/E3.
**Dependencies:** M0-01.
**Acceptance / test gate:** A deliberate violation (e.g. `src/domain/x.ts` importing `react`) fails `pnpm lint`; clean tree passes lint + prettier check.
**Est:** 0.5 d

### M0-03 — Test infrastructure: Jest, RNTL, better-sqlite3 harness, fixtures
**Description:** Stand up the whole test toolchain so every later task can add tests without setup work.
**How:** Two jest projects: (a) node env for `src/domain/**` + `src/data/**` (no RN preset), (b) `jest-expo` + RNTL for UI. Install `better-sqlite3` as devDependency; create the driver shim in `src/data/sqlite/driver.ts` that abstracts expo-sqlite (device) vs better-sqlite3 (tests) — same API surface used by Drizzle (08 §5). Create `src/test/fixtures/` with builder helpers skeleton (`aWorkout().with(exercise('bench').sets('80x8','W:40x10'))` per 08 §1 — implement incrementally; land the builder shape now). Configure `coverageThreshold` per 08 §3 (domain 95/90, data 90/85, features/workout 85/80, overall 75/70) — thresholds active from day one, trivially met while dirs are near-empty. Mock seams for natives (notifications/haptics/keep-awake/files) via `src/lib/` module mocks.
**References:** 08 §1, §3, §5; 05 (P1 dual-driver rationale).
**Dependencies:** M0-02.
**Acceptance / test gate:** `pnpm test` runs both projects green; a sample domain test and a sample RNTL render test exist and pass; coverage report generated with thresholds enforced.
**Est:** 1 d

### M0-04 — CI PR workflow
**Description:** GitHub Actions `ci.yml` running the full static + test gate on every PR/push to `main`.
**How:** Steps per 08 §9: checkout → pnpm install (with cache) → `tsc --noEmit` → eslint → jest (both projects) with coverage gate → `npx expo-doctor` → `npx expo export` sanity (bundle compiles). Target < 8 min. Also add the local equivalent `pnpm ci` script so the gate is runnable without GitHub. Add branch-protection notes to the workflow README comment (activation itself is a repo-settings step, see O-06). `nightly.yml` and `release.yml` come later (M2-18, M7-03).
**References:** 08 §9; 09 M0 scope ("CI PR workflow live from day one").
**Dependencies:** M0-03.
**Acceptance / test gate:** `pnpm ci` passes locally end-to-end; workflow file lints (actionlint or review); if a remote exists, first push shows green run.
**Est:** 0.5 d

### M0-05 — Design tokens, theme provider, contrast test
**Description:** Implement `src/ui/tokens.ts` with the complete 07 §2–4 token set (dark + light + semantic + superset palette, typography styles, spacing, radii) and a theme provider honoring System/Light/Dark.
**How:** Token tables verbatim from 07 §2.1–2.5 (hex values are the source of truth — do not invent). Typography per 07 §3 incl. `fontVariant: ['tabular-nums']` on `statLarge/statSmall/setValue`; spacing scale + radii per 07 §4. Theme provider: React context exposing resolved tokens; `theme` setting `system|light|dark` (reads OS scheme via `useColorScheme` when `system`). Write the programmatic WCAG contrast unit test over the token tables per 07 §2.6 (text.primary ≥ 7:1, text.secondary ≥ 4.5:1, accent.text ≥ 4.5:1 on bg.base/surface, accent fills ≥ 3:1, checked-row tint keeps ≥ 4.5:1) — both themes.
**References:** 07 §2–4 (source of truth), 08 §4.8 (token contrast test).
**Dependencies:** M0-02, M0-03.
**Acceptance / test gate:** Contrast test green for both themes; tokens module has zero React Native imports beyond types; theme switch re-renders consumers.
**Est:** 1 d

### M0-06 — Core primitives, batch 1: Button, Card, ListRow, Chip, SearchBar, EmptyState
**Description:** First half of the 07 §5 M0 primitive set, in `src/ui/`.
**How:** `Button` with variants primary/tonal/ghost/destructive and sizes lg 50pt / md 40 / sm 32-pill per 07 §5; `Card` (bg.surface, radius md, padding 16); `ListRow` (leading icon/thumb, title/subtitle, trailing accessory, chevron, hairline inset 16); `Chip` (dropdown caret + active accent tint); `SearchBar` (bg.elevated, radius sm); `EmptyState` (icon + title + caption + CTA). Icons via `lucide-react-native` (1.75 pt stroke, 16/20/24). Hit targets ≥ 44 pt. All components consume tokens only — no raw hex (lint-guard if cheap).
**References:** 07 §4 (iconography, hit targets), §5 (component inventory), §10 (content style).
**Dependencies:** M0-05.
**Acceptance / test gate:** RNTL smoke render for each component in **both themes** (08 §2 policy); Button press/disabled behavioral test; visual check in dev gallery (M0-08).
**Est:** 1.5 d

### M0-07 — Core primitives, batch 2: Sheet, SegmentedControl, NumericInput, Snackbar, StatColumn/StatTile, Avatar/Thumb
**Description:** Second half of the M0 primitive set.
**How:** `Sheet`: bottom sheet on `react-native-gesture-handler` + Reanimated, detents 0.5/0.9, grabber, scrim (`overlay` token), keyboard-aware — component-level, not a route (06 §3). `SegmentedControl` iOS-style. `NumericInput`: boxed bg.elevated, radius sm, `setValue` typography, placeholder text.tertiary, select-all-on-focus, decimal/integer modes. `Snackbar` with Undo affordance, 5 s auto-dismiss. `StatColumn`/`StatTile` (footnote label over statLarge/Small value). `Avatar/Thumb` exercise thumbnail with initial-letter fallback circle. Install `react-native-gesture-handler` + `react-native-reanimated` 4 here.
**References:** 07 §5; 06 §1 (gestures/animation deps), §3 (sheets are components).
**Dependencies:** M0-05.
**Acceptance / test gate:** RNTL smoke both themes for all; Sheet open/dismiss behavioral test; NumericInput select-all-on-focus + decimal filtering tests.
**Est:** 2 d

### M0-08 — Tab shell, navigation skeleton, dev gallery
**Description:** expo-router route tree with 4 tabs and placeholder screens, plus a dev-only design-gallery route rendering every primitive in both themes.
**How:** Routes per 06 §3: `app/_layout.tsx` (root Stack: QueryClientProvider, theme provider, DB-ready gate placeholder), `app/(tabs)/_layout.tsx` with tabs workout/history/exercises/profile (icons: dumbbell, history, book-open, user; active accent, inactive text.tertiary; bg.surface + top hairline, no center FAB), placeholder index screens per tab. Dev gallery at e.g. `app/dev/gallery.tsx`, linked only in `__DEV__`. Reserve the `GlobalWorkoutBar` overlay slot in the tabs layout (empty component until M2-13).
**References:** 06 §3 (navigation map), 07 §6 (tab bar spec).
**Dependencies:** M0-06, M0-07.
**Acceptance / test gate:** App boots to tabs on simulator; all 4 tabs navigable; gallery shows every primitive and toggles theme; RNTL smoke on tab layout.
**Est:** 1 d

### M0-09 — SQLite + Drizzle wiring, migration runner, initial migration
**Description:** Wire expo-sqlite + Drizzle with a bundled-migrations runner and land migration 0001 creating `app_meta` + `settings`.
**How:** `src/data/sqlite/`: db open (WAL mode on), drizzle-kit config generating versioned SQL into `src/data/migrations/`; runner applies pending migrations sequentially at cold start behind a splash gate (06 §5.1) and records head in `app_meta.schema_version`. Migration 0001: `settings(key TEXT PK, value TEXT)` + `app_meta(key TEXT PK, value TEXT)` per 05 §3.5. Note: the **full** v1 schema (workouts/exercises/etc.) lands in M1-01 as migration 0002 — 09's "empty → v1 schema" gate is interpreted as: runner mechanism proven here on 0001, extended and fixture-tested in M1. Runner integration test on better-sqlite3: empty DB → migrate → assert tables + schema_version; re-run → no-op.
**References:** 05 §3.5, §10 (migrations); 06 §5.1 (cold start); 08 §5 (parity harness).
**Dependencies:** M0-03.
**Acceptance / test gate:** Migration-runner integration test green (empty→migrated, idempotent re-run); device/simulator boots through the migration gate; migration failure path shows the blocking error screen stub (06 §9).
**Est:** 1 d

### M0-10 — SettingsRepository + settingsStore; theme & units settings end-to-end
**Description:** Typed settings layer: Zod-validated `Settings` interface with all keys + defaults, SQLite-backed repository, Zustand store loaded at boot; wire theme + units settings to real UI.
**How:** Define the full `Settings` TS interface + Zod schema + code defaults for **every** key listed in 05 §3.5 (weight_unit, distance_unit, body_measurement_unit, theme, first_day_of_week, weekly_goal, default_rest_seconds, previous_values_mode, warmup_in_stats, rpe_enabled, plate_calc{…}, warmup_calc{…}, smart_superset_scroll, inline_timer, keep_awake, live_pr_banner, sounds{…}, rest_notifications_enabled, sentry_enabled) — storage is ready even though most UIs come later. `SettingsRepository.get/set` (JSON-encoded values); `settingsStore` (Zustand) loaded at boot, synchronous reads, write-through. Minimal Profile → Settings screen with theme selector (System/Light/Dark via SegmentedControl) and weight-unit toggle, both persisting and applying instantly.
**References:** 05 §3.5 (settings keys), 06 §4 (settingsStore), 04 §7, 02 §13 #12.
**Dependencies:** M0-09, M0-08.
**Acceptance / test gate:** Repo integration tests (get defaults, set/get round-trip, bad JSON → Zod default fallback); theme change is instant app-wide and survives relaunch; units value persists.
**Est:** 1 d

### M0-11 — Sentry, error boundaries, logger
**Description:** Crash/monitoring scaffolding that works with **no owner account**: Sentry integrated but a no-op until a DSN exists.
**How:** `@sentry/react-native` via Expo config plugin; init **after first frame** (06 §8), reading DSN from env/app config — when DSN is empty, skip init entirely (SDK no-ops; this is the not-blocked-by-owner path; real DSN arrives with O-05 by M6). `sendDefaultPii: false`, no user identifiers, breadcrumbs = one-line action names, no payloads (06 §9). Root ErrorBoundary per tab + one for the logger route (preserves store on remount). `src/lib/logger.ts`: ring buffer of last 500 events in `expo-sqlite/kv-store`, with an export hook for the future diagnostics screen (M5-04).
**References:** 06 §9; 00 P13; 10 §6 (privacy posture).
**Dependencies:** M0-08, M0-09.
**Acceptance / test gate:** App runs identically with and without DSN set; ErrorBoundary catches a thrown test error and renders fallback (RNTL test); logger unit tests (ring overflow, ordering).
**Est:** 1 d

### M0-12 — M0 QA, bug iteration & exit gate
**Description:** Milestone-close hardening pass per 08/09.
**How:** Verify every M0 exit criterion; fix all P0–P1 (P2 triaged); each fix lands with a regression test where applicable. Measure cold start to tabs on simulator + note methodology (< 1.5 s budget; device number re-measured at M6-04). Write `docs/qa/M0-checklist.md` (booted-to-tabs timing, theme sweep across all screens/gallery, CI green evidence). Tag `v0.0.0`-style milestone tag per 09 working agreements.
**References:** 09 M0 exit criteria + working agreements; 08 §8.
**Dependencies:** all M0 tasks.
**Acceptance / test gate:** Checklist file committed; zero P0/P1 open; CI green; tag pushed.
**Est:** 0.5 d
