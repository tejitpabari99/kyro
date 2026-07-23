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

## Everything else

Every other task — all of M0 through M7 except the six owner-gated tasks listed above — is
expected to be **fully implementable, unit/integration-testable, and code-reviewable** in this
environment: scaffolding, domain logic, data layer (`better-sqlite3`), UI components (RNTL),
navigation, business logic, CSV import/export, statistics/PR computation, MC sync logic code
(minus live-stack integration verification), settings, and polish work.

See `docs/plan/EXECUTION-LOG.md` for the running per-task status log.
