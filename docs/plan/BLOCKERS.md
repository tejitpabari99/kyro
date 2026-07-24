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

## Everything else

Every other task — all of M0 through M7 except the six owner-gated tasks listed above — is
expected to be **fully implementable, unit/integration-testable, and code-reviewable** in this
environment: scaffolding, domain logic, data layer (`better-sqlite3`), UI components (RNTL),
navigation, business logic, CSV import/export, statistics/PR computation, MC sync logic code
(minus live-stack integration verification), settings, and polish work.

See `docs/plan/EXECUTION-LOG.md` for the running per-task status log.
