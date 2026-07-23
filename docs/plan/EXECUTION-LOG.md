# Execution Log

Running log of task-by-task execution progress for the Kyro dev task list
(`docs/plan/tasks/M0-tasks.md` … `M7-tasks.md`, `M-CLOUD-tasks.md`). This is a companion to
the inline `[status]` tags used in the task files themselves (see
`docs/plan/tasks/TASKS-INDEX.md` → "Status legend"): the task files record the current status
next to each task title, while this log is the append-only, chronological record of *what
actually happened* each time a task was picked up — which sub-agent ran it, what commit(s) it
produced, and any notes (including test results, and any environment blockers encountered —
cross-reference `docs/plan/BLOCKERS.md`).

**Convention:** each task's sub-agent appends exactly one row (or more, if it required
multiple sessions/attempts) when it finishes working on that task. Do not edit or delete prior
rows — if a task is revisited, add a new row rather than rewriting history. Keep notes concise;
put detail in the commit message or PR description instead.

| Task ID | Status | Commit(s) | Notes |
|---|---|---|---|
| M0-01 | done | `57e9c9c` | Expo SDK 56 TS app scaffolded at repo root via `create-expo-app` (default/router template) then pinned down from SDK 57 to `~56.0.16` with `expo install expo@^56.0.0` + `expo install --fix` + a clean `pnpm install` (fresh lockfile resolve) to clear all peer-dep conflicts — verified zero peer-dep warnings on final install. `expo-dev-client` and `expo-build-properties` added. Routes moved from the template's default `src/app/` to top-level `app/` per 06 §2 (routes-only, thin screens); template demo content (themed components, tutorial screens, react/expo logos, tab icons) stripped in favor of a minimal placeholder `_layout.tsx`/`index.tsx`; `src/` left present but empty (`.gitkeep`) — feature-folder skeleton is M0-02. `tsconfig.json` came pre-configured by the template with `strict: true` and `@/* -> ./src/*` (plus a bonus `@/assets/* -> ./assets/*`) — verbatim match to spec, no edits needed. `app.json`: name `Kyro`, slug `kyro`, iOS bundle id `com.tejitpabari.kyro`, `newArchEnabled` left unset (SDK 56 default is on). Deviation: iOS deploymentTarget set to **16.4**, not the task's literal "16" — `expo-doctor`/`expo-build-properties` hard-error below 16.4 on SDK 56 (that's the SDK's actual floor); 16.4 is the closest-compliant reading of "minimum iOS 16". `package.json` scripts: start/android/ios/web/typecheck/lint/test (lint and test are placeholders — ESLint config lands in M0-02, Jest config in M0-03, per task dependency order). Verified: `pnpm install` clean (no peer warnings), `pnpm typecheck` clean, `npx expo-doctor` 21/21 checks green, `npx expo export --platform ios` bundles 1078 modules to a working Hermes bundle (deleted the `dist/` output after, it's gitignored). **Not verifiable in this environment** (no macOS/Xcode/iOS Simulator, no Expo account): `npx expo start` actually booting on an iOS Simulator, and `eas init` (correctly skipped per task instructions — owner-gated). Environment note: `corepack prepare pnpm@latest --activate` failed on this machine's Node 20.20.1 (latest pnpm requires Node ≥22.13); used `corepack prepare pnpm@9 --activate` (pnpm 9.15.9) instead — added to `docs/plan/BLOCKERS.md`. |
