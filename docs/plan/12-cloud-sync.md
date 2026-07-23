# 12 — Cloud Sync (Supabase)

Cloud persistence of **saved** user data is part of v1 (decision D9). Provider selection and rationale: `research/cloud-provider-research.md` (Supabase; runner-up Cloudflare D1). This doc is the implementable spec; `05` remains the source of truth for local schema (its cloud-sync additions are marked there and referenced here).

The one-paragraph model: the workout in progress is local-only. On save (finish a workout, save a routine, edit a measurement, …) the repository writes locally **and** enqueues a `sync_outbox` row; a background push engine drains the outbox to a private Supabase Postgres project via idempotent UUID-keyed upserts. The home page workout list and every other screen read **only** local SQLite — the UI never reads from the network. A watermark pull (`updated_at > last_pulled_at`) on cold start makes reinstall/second-device a full restore. Sync never blocks and never fails a save; its only proactive voice is a single informational offline notice ("saved on device, will sync later" — §11.1), everything else is passive status.

---

## 1. Goals & non-goals

### Goals

- **G-C1 — Durable saves.** Every completed workout, routine, folder, custom exercise, body measurement, and setting change reaches the cloud within seconds when online, and eventually (outbox retry) when not.
- **G-C2 — Local remains the read model.** No screen, query, or store ever reads from the network. Offline behavior of every feature is byte-identical to the pre-sync app.
- **G-C3 — Reinstall restore.** Fresh install + sign-in + one pull rebuilds full history (minus photos and the in-progress workout, by design) with PRs/stats recomputing identically (P10 makes this free).
- **G-C4 — Failure never blocks, and offline is acknowledged once.** A save always succeeds locally and immediately, no matter what the network is doing. When a save's push can't go out because the device is offline, the app says so once, non-blockingly ("No network — saved on device, will sync when online", §11.1), then retries silently. A paused free-tier project or a Supabase outage produce zero UX difference beyond the passive "sync pending" state in Settings.
- **G-C5 — Never block development.** All sync code is built and tested against `supabase start` (local Docker stack) with deterministic keys, plus a no-op stub; the owner's real project gates only production builds.

### Non-goals (v1)

- Multi-user, sharing, collaboration — single Auth user, forever (per `01` §5).
- Real-time / continuous multi-device sync — pull is cold-start + manual; a second device works but is "eventually consistent on open", not live (polish tracked in `11` §2).
- Progress-photo cloud backup — files stay local in v1; Supabase Storage path sketched in `11` §2.
- Syncing the active workout, the bundled exercise dataset, or `app_meta` — see §3.
- End-to-end encryption — data is TLS-in-transit and at-rest-encrypted by Supabase; the owner controls the project. Revisit only if the trust model changes.

## 2. Topology & environments

One Supabase **production project** (owner-created, free tier, region near owner) + the **local stack** (`supabase start`, Docker: Postgres, PostgREST, Auth, Studio) for all development and CI. Both run the same migrations from `supabase/` in this repo.

| Environment | URL / key source | Auth user | Used by |
|---|---|---|---|
| Local stack | `http://127.0.0.1:54321` + the CLI's deterministic anon key (safe to commit as dev defaults) | seeded test user in `supabase/seed.sql` | dev builds, jest integration suite, CI |
| Production | owner's project URL + anon key, via EAS env/secrets (§13) | one email/password user created by owner in dashboard | preview/production builds only |
| None (stub) | env vars absent | — | any build without config; CloudSync is a no-op and status reads "Off" |

Free-tier notes that shape the design: the project **pauses after 7 days without DB activity** (data retained; manual resume). A paused project is indistinguishable from being offline (§11), organic use resets the timer, and a weekly GitHub Actions heartbeat (§14.3) is insurance. No automated backups on free tier — acceptable because local SQLite + the `05` §9 backup zip are additional durable copies and `supabase db dump` works on demand.

## 3. What syncs (and what doesn't)

Table names and columns below are exactly `05` §3 (on conflict, `05` wins).

| Local table | Syncs? | Notes |
|---|---|---|
| `workouts` | **Yes** — `state='completed'` rows only | Root entity. Active workout never syncs (in-progress = local by invariant). |
| `workout_exercises`, `sets` | **Yes** — as children of their workout | Pushed/pulled only as part of the parent batch; no independent lifecycle. |
| `routines` | **Yes** | Root entity. |
| `routine_exercises`, `routine_sets` | **Yes** — as children of their routine | Same child rule. |
| `routine_folders` | **Yes** | Root entity (UUID PK per `05` §3.3 cloud-sync change). |
| `exercises` | **Yes** — `is_custom=1` rows only | Built-ins are bundled + dataset-versioned (`03` §6.4); they never touch the cloud. `archived_at` syncs as a normal column. |
| `body_measurements` | **Yes** | Root entity keyed on `date` (natural idempotent upsert key). |
| `progress_photos` | **No (v1)** | Rows and files stay local; cloud backup via Supabase Storage is roadmap (`11` §2). A pulled measurement date with no local photos simply shows none. |
| `settings` | **Yes** — per key | Cloud mirror `settings(key, value, updated_at)`. All keys sync (single user, one preference set). |
| `app_meta` | **No** | Device/install-local bookkeeping (schema version, dataset version, sync watermarks themselves). |
| `sync_outbox` | **No** | Local sync infrastructure (`05` §3.6). |

**Root entities** (own an outbox entry, a tombstone, and a watermark): `workouts`, `routines`, `routine_folders`, `exercises` (custom), `body_measurements`, `settings` keys. **Children** (`workout_exercises`, `sets`, `routine_exercises`, `routine_sets`) are value objects of their root: replaced wholesale on push, re-hydrated wholesale on pull, hard-deleted in the cloud when removed — no per-child tombstones or watermarks.

## 4. Cloud schema (Postgres mirror)

- Same table names, same column names, synced tables only. Type mapping: `TEXT` → `text`, `INTEGER` epoch-ms → `bigint`, `REAL` → `double precision`, `INTEGER` 0/1 booleans → `boolean` is **not** used — keep `smallint` 0/1 to make push/pull a dumb copy (no per-column transforms). JSON-array TEXT columns stay `text` (verbatim strings) for the same reason.
- Every root table has `updated_at bigint not null` and `deleted_at bigint` (client-written epoch ms — see §9 for why client timestamps are correct here). Child tables carry neither.
- CHECK constraints from `05` §2 are reproduced (enums, RPE domain) — the cloud rejects rows local SQLite would reject.
- FKs child→root `on delete cascade`, matching local.
- `settings` mirror: `settings(key text primary key, value text not null, updated_at bigint not null)`.
- One extra table: `heartbeat(id smallint primary key, beat_at timestamptz)` + RPC `heartbeat()` (security definer) for §14.3.
- Migrations are plain SQL files in `supabase/migrations/`, committed to the repo, applied to the local stack by `supabase start`/`db reset` and to production by `supabase db push` (owner-token session, release-time only). drizzle-kit is **not** used for the Postgres side — one tool per side (research §2.1).
- Schema drift rule: any `05` §3 migration touching a synced table lands in the same PR as its `supabase/migrations/` mirror + a note in both files cross-referencing the other.

## 5. Local schema additions

Specified and marked in `05` (authoritative): `sync_outbox` table (`05` §3.6), `deleted_at` tombstones added to `routines`, `routine_folders`, `exercises`, `routine_folders.id` changed to UUID TEXT, and the `app_meta` sync keys (`last_pulled_at:<table>`, `last_push_ok_at`, `cloud_auth_state`). UUID confirmation: all synced root PKs are globally unique strings (UUIDv4, dataset slugs never sync, `body_measurements.date` natural key) — upserts are idempotent everywhere.

## 6. Write path — `sync_outbox`

`sync_outbox` is a **journal, not a payload store**: it records *that* an entity changed, never *what* changed. The payload is read fresh from the local DB at push time, so the newest local version always wins and N edits collapse into one push.

```
sync_outbox(id, entity_type, entity_id, op ('upsert'|'delete'), created_at, attempts, last_error)
UNIQUE (entity_type, entity_id)   -- one pending row per entity
```

Coalescing rules (unit-tested, §15):
- Enqueue for an entity already pending → keep the single row, reset `attempts`/`last_error`, refresh `created_at`.
- `delete` supersedes a pending `upsert`. An `upsert` after a `delete` (e.g. measurement date re-created) supersedes back to `upsert`.
- At push time, `op='upsert'` with the local row missing/tombstoned degrades to a tombstone push; `op='delete'` with a live local row is ignored and dropped (stale).

### 6.1 What enqueues, where

Enqueue happens inside the same repository call as the local write, **after** the local transaction commits (never inside it — a sync bug must not roll back a save). Implemented as decorators over the `05` §6 repositories:

| User action | Repository call | Enqueues |
|---|---|---|
| Finish workout | `WorkoutRepository.finish` | `('workout', id, 'upsert')` |
| Edit past workout | `WorkoutRepository.update` | `('workout', id, 'upsert')` |
| Delete workout | `WorkoutRepository.softDelete` | `('workout', id, 'upsert')` (tombstone travels as a column) |
| Routine create/edit/reorder/duplicate/update-from-workout | `RoutineRepository.*` | `('routine', id, 'upsert')` per affected routine |
| Routine delete | `RoutineRepository.delete` | `('routine', id, 'upsert')` (soft-deleted per `05` §3.3 addition) |
| Folder CRUD/reorder | `RoutineRepository.*folder*` | `('routine_folder', id, 'upsert')` per affected folder |
| Custom exercise create/edit/archive/restore/delete | `ExerciseRepository.*` (`is_custom=1` only) | `('exercise', id, 'upsert')` |
| Measurement save/clear-field | `MeasurementRepository.upsert/clearField` | `('measurement', date, 'upsert')`; row removed entirely → `('measurement', date, 'delete')` |
| Setting change | `SettingsRepository.set` | `('setting', key, 'upsert')` |
| Hevy CSV import / backup restore | bulk | one `'upsert'` per imported/restored root entity (batched inserts into the outbox in the same pass; push then drains gradually) |

**Not decorated, by design:** every active-workout granular mutator (`addSet`, `updateSet`, `setCompleted`, …), `startEmpty`/`startFromRoutine`, `discard`, photo APIs, `seedBuiltins`. Reorder operations that touch many siblings (folder/routine position) enqueue every affected root — positions are row data.

## 7. Push engine

Runs in `src/data/cloud/` (module boundary in `06` §11). Single-flight: at most one drain loop at a time.

**Triggers:** (a) ~2 s debounce after any enqueue; (b) app foreground (`AppState → active`); (c) connectivity regained (`@react-native-community/netinfo`); (d) manual "Sync now" (§12). No background-fetch scheduling in v1 — a save made seconds before force-quit simply pushes on next launch (the data is already durable locally; G-C4).

**Drain algorithm:** read outbox oldest-first → group by root entity → for each:
1. Read the current local root + children fresh (skip + drop if stale per §6 rules).
2. `upsert` root row (PostgREST `on_conflict` on the PK) — includes `updated_at`/`deleted_at` verbatim.
3. `upsert` all current children; then delete cloud children `WHERE parent_id = :id AND id NOT IN (:current_child_ids)` — covers past-workout edits that removed sets/exercises.
4. On success: delete the outbox row, set `app_meta.last_push_ok_at`.

All upserts are keyed on UUIDs/natural keys → **fully idempotent**: a retry after a half-applied batch (e.g. crash between root and children) simply re-applies. Order within a batch (root before children) satisfies FKs; folders push before routines that reference them when both are pending (topological nicety, enforced by ordering `routine_folder` before `routine` in the drain).

**Failure per batch:** increment `attempts`, record `last_error`, leave the row, continue with the next entity (one poison row must not dam the queue — but see §11 for the 4xx quarantine rule).

## 8. Pull — watermark & restore

**Triggers:** cold start when `now − last_pull_completed_at ≥ 6 h` (throttle; runs after first frame, never gates boot — `06` §5.1); after first successful sign-in on a device; manual "Sync now". Pull never runs mid-active-workout (deferred until no active workout — avoids any chance of stats churn under the logger).

**Algorithm, per root table** (watermarks stored per table in `app_meta` as `last_pulled_at:<table>`, initial value 0):
1. Fetch pages of rows `WHERE updated_at > :watermark ORDER BY updated_at ASC LIMIT 500` until exhausted.
2. For each row, merge (pure function, unit-tested):
   - Entity has a **pending outbox row** → skip (local intent wins; push will overwrite cloud — §9).
   - Local row missing → insert; if tombstoned (`deleted_at` set) skip insert entirely for `body_measurements` (hard-delete semantics) and insert-as-tombstone for soft-delete tables (keeps LWW stable).
   - Local row exists → compare `updated_at`: cloud newer → replace local row; local newer/equal → skip.
   - Applying a root that has children → fetch cloud children by parent id, replace local children wholesale (delete-by-parent + insert) in one transaction with the root.
   - Cloud `deleted_at` set and cloud newer → apply tombstone: soft-delete locally (workouts/routines/folders/exercises) or hard-delete the row (`body_measurements`).
3. Advance the watermark to the max cloud `updated_at` **processed** (not device `now` — immune to clock skew).
4. After any rows applied: bulk-invalidate TanStack Query keys + records caches, exactly like CSV import (`04` §5.6, `05` §7.2).

**Reinstall / second device restore** is the same code path with empty tables and zero watermarks: sign in → full pull → complete history, routines, custom exercises, measurements, settings restored; PRs/stats recompute from pulled data (P10). Restore of the owner's realistic dataset (~low thousands of rows) must complete < 30 s on Wi-Fi and shows the passive "Syncing…" state in Settings while running (never a blocking screen; the app is usable immediately with whatever has landed).

## 9. Conflicts & tombstones

Single user, one phone at a time — conflicts are near-impossible and are resolved mechanically:

- **Last-write-wins per root row on `updated_at`** (client-written epoch ms). Client timestamps are acceptable here precisely because there is one writer; we are ordering one person's own edits, not arbitrating between parties.
- **Tombstones win ties:** at equal `updated_at`, a row with `deleted_at` set beats one without.
- **Pending-outbox skip** (§8) is the tiebreak for "edited locally while a stale cloud row exists": local intent is preserved and pushed.
- Children never conflict independently — they ride their root's timestamp.
- Tombstoned rows are never hard-deleted from the cloud (they *are* the deletion record). Local soft-deleted rows already excluded from all queries per `05`. A periodic cloud tombstone purge is explicitly out of scope for v1 (row counts are trivial).
- `body_measurements`: `date` natural key makes create/delete/re-create on the same date safe — the final state is whatever has the newest `updated_at`.

## 10. Auth

- **One user**, created by the owner in the Supabase dashboard (email/password). No sign-up UI in the app, ever. RLS is authenticated-only with no per-row `user_id` (§14.1).
- Sign-in surface: Settings → Data → Cloud Sync → email/password form (shown only in the signed-out state). Signing in is a once-per-install event.
- Session persistence: supabase-js storage adapter backed by `expo-sqlite/kv-store` (not AsyncStorage — `06` §1); `autoRefreshToken` on; `react-native-url-polyfill` imported at app entry.
- **Auth failure semantics:** if refresh fails permanently (password changed, user deleted): sync engine moves to `signed_out` state, outbox keeps accumulating, Settings row shows "Sign-in required" — no modal, no toast, no interruption of any feature (G-C4). Signing back in drains the backlog.
- The app is 100% functional signed out (stub-equivalent behavior); sign-in is optional at first-run and never prompted outside Settings.

## 11. Failure, retry & offline semantics

Classification of every push/pull error:

| Class | Examples | Behavior |
|---|---|---|
| Offline | netinfo unreachable, fetch network error | No attempt counted. Show the one-time offline notice (§11.1) when the failed push was save-triggered; wait for connectivity trigger. |
| Transient server | 5xx, 503 from a **paused project**, timeouts | Exponential backoff per entity: 1 min → 5 min → 30 min → 6 h (cap), plus the event triggers (§7) which reset eagerness. Silent — a paused project is indistinguishable from a server blip; the user can do nothing actionable, and the data is already durable locally. Pending state visible in Settings (§12). |
| Auth | 401 after refresh attempt | §10 signed-out state. |
| Permanent client | 4xx (constraint violation, schema drift) | Keep the outbox row, mark quarantined after 5 attempts (skipped by the drain loop, badge per §12), log to Sentry **without payload content** (`06` §9 privacy rule). This should never happen; it indicates a schema-mirror bug. |

### 11.1 The offline save notice (the one proactive surface)

Saving always succeeds locally, instantly — that is non-negotiable. But an offline save is not totally silent: when a **save-triggered** push (workout finish, routine save, measurement save, …) fails or cannot start because the device is offline, show a non-blocking toast/banner: **"No network — saved on device, will sync when online."** Rules:

- Shown at most **once per offline period** (first save while offline; subsequent saves while still offline stay quiet — the pending count in Settings carries the state). Regaining connectivity resets the once-guard.
- Informational tone, auto-dismissing, never a modal, never an error style — the save *succeeded*.
- Background retries (§7 triggers + backoff) then run automatically; the pending state remains visible via the sync status surface (§12) until pushed; the eventual successful drain is silent.
- Background/pull failures and non-save-triggered drains never toast — only the save moment earns a voice.

Invariants: sync never shows a blocking error; never rolls back, fails, or delays a local save; the airplane-mode manual QA drill (`08` §7) must show the notice once and otherwise zero behavioral difference; force-quit during a drain leaves a consistent state (idempotent retry, §7).

## 12. Sync status UI

Deliberately minimal — one surface plus one passive badge:

- **Settings → Data → Cloud Sync** row/section: status line — `Off` (no config) · `Sign-in required` · `Synced — 5 min ago` (from `last_push_ok_at`/pull time) · `Pending — 3 items` · `Syncing…` · `Sync issue — will retry` (quarantine present). Below it: **"Sync now"** button (drains outbox + runs pull; spinner inline; result stated in the status line — a toast only on manual invocation failure), and the signed-in email with a Sign out action.
- **Passive badge:** a small dot on the Profile tab's Settings entry appears only when (a) sign-in is required, or (b) the oldest pending outbox item is > 24 h old / quarantined. Normal pending-for-seconds state shows nothing anywhere.
- **The offline save notice** (§11.1) — the only proactive surface: one non-blocking "No network — saved on device, will sync when online" toast per offline period, on the first offline save.
- **Nothing else.** No indicator in the logger, home list, or finish flow. Finish-workout UX is unchanged from `02` §14 (the offline toast, when it fires, appears over whatever screen follows the save — it is not part of the finish flow).

## 13. Environment & configuration

- Two env vars: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
  - Dev default (committed, safe): local stack URL + the deterministic `supabase start` anon key.
  - Production values: owner's project URL + anon key, stored as **EAS env vars/secrets** on the `preview`/`production` build profiles (`10` §2) — never committed.
  - Absent/blank → **no-op stub**: `CloudSync` interface (`enqueue`, `syncNow`, `status`, `signIn/out`) has two implementations — `SupabaseCloudSync` and `NoopCloudSync` (accepts everything, does nothing, status `Off`). Selection at boot from env. The entire app, test suite, and every other milestone run green with the stub — **development is never blocked on Docker, the network, or the owner's account** (G-C5).
- `supabase/` directory in-repo: `config.toml`, `migrations/*.sql`, `seed.sql` (test auth user + nothing else). `supabase start` is required only for the cloud integration suite and for devs actively working on sync.

## 14. Security notes

1. **RLS:** enabled on every table; single policy per table: all operations `USING/WITH CHECK (auth.role() = 'authenticated')`. The `anon` role can do nothing except call `heartbeat()`. No per-row `user_id` — single-user project (add columns + policies only if multi-user ever happens; explicitly out of scope).
2. **Anon key exposure:** the anon key ships in the app binary and is treated as public — RLS is the security boundary. The service-role key exists only in the owner's dashboard; it is never placed in EAS, CI, or the repo. Repo-committed keys are only the local stack's deterministic dev keys.
3. **Heartbeat:** `heartbeat()` RPC (security definer, anon-callable, writes one timestamp row) + a weekly GitHub Actions cron calling it with the anon key (repo Actions secrets `SUPABASE_URL`, `SUPABASE_ANON_KEY`) keeps the free-tier project from pausing during vacations. Optional insurance — organic use suffices in normal weeks; worst case is a manual dashboard resume with zero data loss.
4. **Transport/at-rest:** TLS everywhere (standard exemption in `10` §2 still applies); Supabase encrypts at rest. Data lives in one owner-controlled project; privacy label implications in `10` §6.

## 15. Testing

Extends `08` (same pyramid, thresholds, and policy — `src/data/**` 90/85 applies to `src/data/cloud/`):

- **Unit (Node, no network):** outbox coalescing matrix (§6 rules incl. delete-supersedes-upsert, stale-op dropping); backoff schedule + error classification; the pure pull-merge decision function (LWW, tombstone-tie, pending-outbox skip — full truth table); watermark advance logic (max-processed, not now).
- **Integration (against `supabase start`):** jest suite in `src/data/cloud/__tests__/`, pointed at the local stack, seeded auth user. Named cases: finished-workout batch lands (root+children row counts, values verbatim); edit removing a set → cloud child deleted; workout softDelete → cloud tombstone; fresh-DB pull = full restore deep-equals source DB (modulo photos/active/app_meta); LWW both directions; tombstone pull applies (soft and hard variants); drain idempotence (kill mid-batch, re-drain, deep-equal); settings key round-trip; paused-project simulation (stack stopped → outbox retains, restart → drains).
- **Stub regression:** the entire pre-existing test suite runs with `NoopCloudSync` — proving sync is additive (G-C2).
- **E2E note:** no dedicated Maestro flow (network mocking in E2E buys little here); the integration suite + one manual reinstall-restore drill on simulator (documented in the MC milestone checklist) cover it. Airplane-mode drill already in `08` §7 gains the assertions "offline notice shown once on first offline save (§11.1); sync state shows Pending; nothing else changes".
- **CI:** cloud integration job runs `supabase start` headless (Ubuntu runner, supabase CLI) — on PRs touching `src/data/cloud/**` or `supabase/**`, and nightly. The default PR workflow stays < 8 min and needs no Docker.

## 16. Owner vs dev responsibilities

| Who | What | When | Blocks |
|---|---|---|---|
| Dev | Everything in §§4–15 against the local stack + stub | MC milestone (`09`) | Nothing — never blocked on owner |
| Owner | Create Supabase account + one project (region near home); create the single Auth user; paste project URL + anon key into EAS env/secrets (O-13) | Before the M6 TestFlight beta ideally (so the beta exercises real sync); hard-required only before the M7 production build | Production/preview builds' *sync feature only* — builds without the secrets still work with the stub |
| Owner (optional) | Add `SUPABASE_URL`/`SUPABASE_ANON_KEY` Actions secrets + enable the heartbeat workflow (O-14) | Any time after O-13 | Nothing (insurance only) |
| Dev (release) | `supabase link` + `supabase db push` to the owner's project (needs a ~10-min owner access-token session); verify a release build syncs end-to-end | MC-14 / M6-09 window | — |
| Owner (once) | Sign in inside the app on the real device | First run of a real-config build | — |

## 17. Acceptance criteria

1. Finish a workout online → rows visible in Supabase (Studio) within 10 s; app UX identical to pre-sync.
2. Finish a workout in airplane mode → local save instant and successful; the "No network — saved on device, will sync when online" toast appears once (§11.1); a second offline save shows no second toast; Settings shows Pending; disable airplane mode → outbox drains without any user action, silently.
3. Edit a past workout removing a set → cloud reflects exactly the new child set within one drain.
4. Delete a workout → excluded locally immediately; cloud row tombstoned, never hard-deleted; a fresh-install pull does not resurrect it.
5. Wipe simulator → install → sign in → pull restores all workouts, routines, folders, custom exercises, measurements, settings; records tab equals pre-wipe (P10 recompute); photos absent as documented.
6. Stop the local stack mid-session → zero user-visible change; save 3 workouts; start stack → all 3 land, idempotently (re-run drain: no duplicates).
7. Change the auth user's password server-side → app degrades to "Sign-in required" passively; saves continue locally; re-sign-in drains the backlog.
8. Build with no Supabase env vars → status "Off"; full test suite and all `01` §6 criteria unaffected.
9. "Sync now" performs push + pull with inline progress and accurate resulting status line.
10. All §15 unit + integration suites green in CI; coverage thresholds hold for `src/data/cloud/`.
