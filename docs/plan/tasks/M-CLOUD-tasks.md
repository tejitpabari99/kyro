# MC Tasks — Cloud Sync (Supabase)

Milestone spec: `../09-milestones-and-delivery.md` (MC) + `../12-cloud-sync.md` (the sync PRD; `12 §n` below refers to it). Exit = all 12 §17 acceptance criteria pass on the local stack; 12 §15 suites green in CI; reinstall-restore and airplane-mode drills pass; full pre-existing suite green with the sync stub; tag `v0.5.1`.

**Owner-gated boundary (hard rule preserved):** MC-01 … MC-13 are fully executable with **no owner action** — every task runs against the local `supabase start` Docker stack (deterministic keys, seeded test user) and/or the no-op stub. Only **MC-14** (production-credential wiring) is `blocked-by-owner` (O-13; optional O-14 enables the heartbeat), and it is deliberately the last task: it gates nothing except real-project sync in preview/production builds, and it may complete as late as the M6-09 TestFlight window. No other task below may ever grow an owner dependency.

Task count: **14**

---

### MC-01 — Local Supabase stack, env plumbing, CloudSync no-op stub
**Description:** The foundation: in-repo Supabase project scaffold, env-driven client config, and the `CloudSync` interface with a no-op implementation so every other feature (and CI) is indifferent to sync.
**How:** `supabase init` → commit `supabase/config.toml`; document `supabase start`/`stop`/`db reset` in the repo README (Docker required only for sync work). Env: `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` read at boot; committed dev defaults = local stack URL (`http://127.0.0.1:54321`) + the CLI's deterministic anon key (safe to commit per 12 §13); absent/blank → stub. Define `CloudSync` interface (`enqueue`, `syncNow`, `status`, `signIn`, `signOut`) in `src/data/cloud/` with `NoopCloudSync` (accepts everything, does nothing, status `Off`) and boot-time selection (06 §11). Add deps: `@supabase/supabase-js`, `react-native-url-polyfill`, `@react-native-community/netinfo` (wrapped in `lib/`, per 06 §10). ESLint boundary rule: supabase importable only inside `src/data/cloud/`.
**References:** 12 §2, §13; 06 §2, §11; research/cloud-provider-research.md §5/§6.
**Dependencies:** M0-02 (boundaries), M0-04 (CI patterns).
**Acceptance / test gate:** App boots and full existing suite passes with (a) no env vars → stub selected, status `Off`; (b) local-stack env vars set but Docker down → SupabaseCloudSync selected, everything still green (engine arrives later; interface calls are inert until MC-07). Lint fails on a supabase import outside `data/cloud`.
**Est:** 1 d

### MC-02 — Cloud schema, RLS policies, heartbeat RPC (supabase/migrations)
**Description:** The Postgres mirror of the synced tables, locked down to the single authenticated user.
**How:** SQL migrations in `supabase/migrations/` per 12 §4: mirror `workouts`, `workout_exercises`, `sets`, `routines`, `routine_folders`, `routine_exercises`, `routine_sets`, `exercises` (custom rows), `body_measurements`, `settings(key,value,updated_at)` — same names/columns as 05 §3; `INTEGER` epoch-ms → `bigint`, `REAL` → `double precision`, 0/1 flags stay `smallint`, JSON-array TEXT stays `text`; CHECK constraints reproduced (05 §2 enums, RPE domain); child→root FKs `on delete cascade`; roots carry `updated_at`/`deleted_at`, children carry neither. RLS: enable on every table; one policy per table — all operations for `authenticated`; `anon` gets nothing. `heartbeat` table + `heartbeat()` security-definer RPC callable by `anon` (12 §14.3). `supabase/seed.sql`: one test auth user (deterministic email/password) for local/CI. Cross-reference comment linking each mirror file to its 05 §3 source, per the 12 §4 drift rule.
**References:** 12 §4, §14.1, §14.3; 05 §2–§3.
**Dependencies:** MC-01, M1-01 (source schema shape).
**Acceptance / test gate:** `supabase db reset` applies cleanly. Smoke script (node, supabase-js): anon client insert/select on every table → rejected; signed-in test user CRUDs a row in every table → succeeds; a CHECK-violating row (bad enum, RPE 5) → rejected; `heartbeat()` callable with anon key.
**Est:** 1 d

### MC-03 — Local schema migration: sync_outbox, tombstones, folder UUIDs
**Description:** The 05 `[sync]` additions as a Drizzle migration, plus repository query updates for the new tombstone columns.
**How:** New migration per 05 §3.6 and `[sync]` marks: create `sync_outbox` (unique `(entity_type, entity_id)`); add `deleted_at` to `routines`, `routine_folders`, `exercises`; rebuild `idx_exercises_name_active` with the `deleted_at IS NULL` clause; convert `routine_folders.id` INTEGER→TEXT UUID **remapping existing data** (dogfood devices have real folders since M3: create new table, generate UUIDs, rewrite `routines.folder_id`, swap — standard SQLite table-rebuild migration). Repository updates: `RoutineRepository.delete`/folder delete become soft (set `deleted_at`); `ExerciseRepository.delete` becomes soft for custom rows (unreferenced-only rule unchanged); every read query on the three tables filters `deleted_at IS NULL`. `app_meta` keys documented (no schema change — kv).
**References:** 05 §3.1, §3.3, §3.6, §10; 12 §5, §9.
**Dependencies:** MC-01 (file layout only), M1-01; touches repos from M1-06, M3-01.
**Acceptance / test gate:** Migration fixture test (08 §5.3): seed at previous version with folders/routines/customs → migrate → UUID folder ids, `folder_id` remapped, all data intact. Integration: soft-deleted routine/folder/exercise invisible to every list/picker/query; re-creating a custom exercise with a deleted one's name succeeds (partial unique index).
**Est:** 1.5 d

### MC-04 — Auth: supabase-js client, sign-in surface, session persistence
**Description:** Single-user email/password auth with a kv-store-persisted session and passive failure states.
**How:** Create the supabase client in `data/cloud/client.ts`: `react-native-url-polyfill` imported at entry; auth storage adapter over `expo-sqlite/kv-store`; `autoRefreshToken: true`, `persistSession: true`, `detectSessionInUrl: false`. Auth state machine per 12 §10: `off` (stub) · `signed_out` · `signed_in` · `sign_in_required` (permanent refresh failure → keep outbox accumulating, no interruption). Sign-in form lives inside the Settings → Data → Cloud Sync section (built fully in MC-09; here a minimal dev-gallery/settings stub proves the flow): email + password → `signInWithPassword`, errors inline only. Sign-out clears session, keeps local data and outbox. No sign-up, no password reset in-app.
**References:** 12 §10; 06 §11; research §2.1 (Expo fit).
**Dependencies:** MC-01, MC-02 (seeded test user).
**Acceptance / test gate:** Integration (local stack): sign in as seed user → session persists across client re-creation (kv-store); wrong password → typed error, state `signed_out`; simulate revoked refresh (delete user server-side) → state `sign_in_required`, no throw to callers. RNTL: sign-in form happy/error paths.
**Est:** 1 d

### MC-05 — Outbox enqueue decorators (every save path) + coalescing
**Description:** The journal write path: repository decorators covering exactly the 12 §6.1 table, with the coalescing rules.
**How:** Implement enqueue as decorators over the 05 §6 repositories, registered only when CloudSync ≠ stub: `WorkoutRepository.finish/update/softDelete` → `('workout', id, 'upsert')`; routine CRUD/reorder/duplicate/updateFromWorkout + delete (soft) → `('routine', id, 'upsert')`; folder CRUD/reorder → `('routine_folder', id, 'upsert')`; custom-exercise create/update/archive/restore/delete → `('exercise', id, 'upsert')`; `MeasurementRepository.upsert/clearField` → `('measurement', date, 'upsert')`, full-row removal → `delete`; `SettingsRepository.set` → `('setting', key, 'upsert')`; CSV import + backup restore → bulk enqueue per imported root. Enqueue runs **after** the local transaction commits and never throws into the save path. Coalescing per 12 §6: unique row per entity; re-enqueue resets attempts; `delete` supersedes `upsert` and vice versa; push-time degradation rules (upsert-of-missing-row → delete; stale delete dropped) implemented as a pure resolver. Active-workout mutators, start/discard, photos, seedBuiltins: **not** decorated — assert via test.
**References:** 12 §6, §6.1; 05 §3.6, §6.
**Dependencies:** MC-03; repos from M2-01, M3-01, M1-06/M1-09/M1-10, M5-01, M0-10; M5-07/M5-09 (import/restore hooks).
**Acceptance / test gate:** Unit: full coalescing matrix (enqueue-over-pending, delete-over-upsert, upsert-after-delete, stale-op resolution). Integration: each action in the 12 §6.1 table produces exactly its outbox row; finish → single `workout` row regardless of set count; 50 active-workout mutations produce zero rows; import of N workouts produces N rows; save path latency unchanged (enqueue outside the txn).
**Est:** 1.5 d

### MC-06 — Sync domain logic: merge, watermark, backoff (pure) + unit suite
**Description:** Every sync *decision* as pure, Node-tested functions — the engine tasks (MC-07/08) become plumbing around these.
**How:** In `src/data/cloud/logic/` (pure TS, no supabase/RN imports): `mergeDecision(localRow?, cloudRow, hasPendingOutbox)` → `insert | replace | tombstone-soft | tombstone-hard | skip` implementing the full 12 §8–§9 truth table (LWW on `updated_at`, tombstone wins ties, pending-outbox skip, hard-delete for measurements vs soft elsewhere); `advanceWatermark(processedRows)` → max cloud `updated_at` processed (never device now, 12 §8 step 3); `classifyError(e)` → `offline | transient | auth | permanent` (12 §11 table) and `nextAttemptAt(attempts)` → 1 m/5 m/30 m/6 h cap; batch ordering (`routine_folder` before `routine`; root before children); child-diff (`cloudChildIdsToDelete(current, pushed)`).
**References:** 12 §7–§9, §11, §15 (unit list); 08 §1 (node-env unit layer).
**Dependencies:** MC-01 (types only) — may start in parallel with MC-02…05.
**Acceptance / test gate:** The 12 §15 unit suite: merge truth table exhaustively (all combinations of missing/older/newer/equal × tombstone × pending-outbox, per entity kind); watermark never regresses and ignores skipped rows; backoff sequence exact; error classification incl. 503-paused-project → `transient`. Coverage ≥ 95/90 (domain-grade logic).
**Est:** 1 d

### MC-07 — Push engine: drain, batching, idempotent upserts, retry
**Description:** The outbox drain loop against PostgREST, per 12 §7.
**How:** Single-flight drain in `SupabaseCloudSync`: triggers — ~2 s post-enqueue debounce, `AppState → active`, netinfo regain, manual. Per root entity (ordered per MC-06): read fresh local root + children → resolve stale ops (MC-05 resolver) → upsert root (`on_conflict` PK, `updated_at`/`deleted_at` verbatim) → upsert children → delete cloud children not in current set → delete outbox row + set `app_meta.last_push_ok_at`. Failures: classify (MC-06); offline → wait for trigger, no attempt counted; transient → attempts++/`last_error`/backoff; auth → state `sign_in_required`; permanent → quarantine after 5 attempts (drain skips, Sentry log **without payload content** per 06 §9), continue with next entity. No background-fetch scheduling (12 §7).
**References:** 12 §7, §11; 06 §11; 05 §3.6.
**Dependencies:** MC-04, MC-05, MC-06.
**Acceptance / test gate:** Integration (local stack): finished-workout batch lands with exact row counts/values; edit-removing-a-set → cloud child gone; softDelete → cloud tombstone, row never hard-deleted; kill-mid-batch simulation (abort between root and children) → re-drain converges, no duplicates (idempotence, run drain twice → identical state); stack stopped → outbox retained + backoff recorded, stack up + trigger → drains; quarantine path (force a constraint violation) skips without damming the queue.
**Est:** 2 d

### MC-08 — Watermark pull + reinstall restore
**Description:** The read-side of sync: per-table watermark pull applying MC-06 merge decisions, doubling as full restore on a fresh install.
**How:** Per 12 §8: triggers — post-first-frame cold start when `now − last_pull_completed_at ≥ 6 h`, after first sign-in, manual; deferred while a workout is active; never gates boot (06 §5.1). Per root table: page `updated_at > app_meta['last_pulled_at:<table>']` asc, limit 500; apply `mergeDecision` per row; roots with children → fetch cloud children by parent id and replace local children wholesale in one transaction with the root; advance watermark to max processed. After any applied rows: bulk invalidation identical to CSV import (`invalidateAfterWorkoutMutation` union + records caches + query keys, 04 §5.6). Fresh install path = same code with zero watermarks (restore).
**References:** 12 §8, §9, §3 (child rule); 04 §5.6; 06 §5.1.
**Dependencies:** MC-06, MC-07 (client/session plumbing, shared batch helpers).
**Acceptance / test gate:** Integration: seed cloud from DB A via push → fresh DB B pull deep-equals A (modulo photos/active/app_meta/outbox); LWW both directions (older cloud row skipped, newer replaces); tombstone pull soft-deletes workout/routine/folder/exercise and hard-deletes measurement; pending-outbox row survives a conflicting pull then wins via push; watermark persists so second pull transfers zero rows; 1000-workout synthetic cloud (M4-11 generator pushed) restores < 30 s in harness with UI-thread-free batching.
**Est:** 2 d

### MC-09 — Sync status UI: Settings section, "Sync now", passive badge
**Description:** The user-facing sync surfaces, per 12 §12: Settings section, manual sync, passive badge, and the one-time offline save notice (12 §11.1).
**How:** `syncStatusStore` (Zustand) mirroring engine state (06 §11). Settings → Data → **Cloud Sync** section: status line (`Off` · `Sign-in required` · `Synced — x ago` · `Pending — n items` · `Syncing…` · `Sync issue — will retry`); **Sync now** button → drain + pull, inline spinner, status line updates, toast only on manual-invocation failure; signed-out → the MC-04 email/password form; signed-in → email + Sign out. Passive badge: dot on the Profile tab's Settings entry only when `sign_in_required` or oldest pending item > 24 h / quarantined. **Offline save notice (12 §11.1):** when a save-triggered push fails/can't start because the device is offline, show the non-blocking auto-dismissing toast "No network — saved on device, will sync when online" (Snackbar primitive, informational style, never error-styled) — at most once per offline period (once-guard resets on connectivity regain); subsequent offline saves stay quiet; background/pull failures never toast; the save itself is always already committed locally before any of this. Nothing else in logger, home, history, or finish flow — assert by omission in RNTL snapshots.
**References:** 12 §11.1, §12, §10; 06 §11; 04 §7 (settings surface); 07 §5 (primitives).
**Dependencies:** MC-07, MC-08, M5-04 (Settings → Data group exists).
**Acceptance / test gate:** RNTL: every status renders correctly in both themes; Sync now happy/failure paths; badge appears/disappears per rule (fake timers for the 24 h case); offline notice — first offline save shows the toast exactly once, second offline save shows none, reconnect + go offline again re-arms it, save is committed locally before the toast, notice never renders as an error or blocks input; stub build shows `Off` with no sign-in form misbehavior and no offline toasts. 12 §17 criteria 2 and 9 demonstrable on simulator.
**Est:** 1.5 d

### MC-10 — Cloud integration suite + stub regression (the 12 §15 named cases)
**Description:** The consolidated test gate: every named integration case against `supabase start`, plus proof the app is unchanged with sync stubbed.
**How:** Jest project `cloud-integration` in `src/data/cloud/__tests__/`, pointed at the local stack (skips with a clear message when Docker/stack absent — never a red local run for non-sync devs). Consolidate + fill gaps from MC-07/08 gates so all 12 §15 integration cases exist as named tests: workout batch, child deletion, tombstones (both kinds), fresh-DB restore deep-equal, LWW both directions, drain idempotence, settings round-trip, paused-project simulation, auth-revocation degradation. Stub regression: full pre-existing jest suite + Maestro smoke run with `NoopCloudSync` forced — zero diffs vs pre-MC baseline. Extend the 08 §7 airplane-mode manual drill wording: "offline notice shown once on first offline save (12 §11.1); sync state shows Pending; nothing else changes".
**References:** 12 §15, §17; 08 §1–§3 (thresholds: `src/data/**` 90/85 applies), §7.
**Dependencies:** MC-07, MC-08, MC-09.
**Acceptance / test gate:** All 12 §15 cases green against the local stack; stub run green; coverage thresholds hold for `src/data/cloud/**`.
**Est:** 1.5 d

### MC-11 — CI wiring: cloud job with supabase start
**Description:** The cloud integration suite running headless in GitHub Actions without slowing the main PR loop.
**How:** New workflow job (extends M0-04 patterns): Ubuntu runner → install supabase CLI → `supabase start` (headless, deterministic keys) → run the `cloud-integration` jest project → `supabase stop`. Triggers: PRs touching `src/data/cloud/**` or `supabase/**` (path filter) + nightly (append to M2-18's nightly). Main `ci.yml` untouched (< 8 min budget, no Docker). Local mirror script `pnpm test:cloud` (start-if-needed → test → leave running). Secrets: none — local stack only; document that production credentials never enter CI (12 §14.2).
**References:** 12 §15 (CI), §2, §14.2; 08 §9; 06 §11.
**Dependencies:** MC-10, M0-04, M2-18 (nightly file).
**Acceptance / test gate:** Cloud job green on a PR touching `supabase/`; skipped (not failed) on an unrelated PR; nightly includes it; `pnpm test:cloud` documented and working; `ci.yml` runtime unchanged.
**Est:** 0.5 d

### MC-12 — Heartbeat GitHub Action (free-tier keep-alive)
**Description:** Weekly cron calling the `heartbeat()` RPC so the owner's project never pauses during gym-free weeks. Authored now, enabled by the owner later.
**How:** `heartbeat.yml`: weekly cron + manual dispatch → `curl` the RPC with `${{ secrets.SUPABASE_URL }}` / `${{ secrets.SUPABASE_ANON_KEY }}`; **no-ops cleanly (skip, exit 0) when secrets are absent** so the workflow is mergeable and green today. Verify end-to-end against the local stack via a workflow-dispatch input override or the same script run locally. README note for the owner: adding the two Actions secrets (O-14) turns it on; it is optional insurance — organic use resets the 7-day timer, worst case is a manual dashboard resume with zero data loss (12 §2).
**References:** 12 §14.3, §2; research §5.6; MC-02 (the RPC).
**Dependencies:** MC-02, M0-04. *(Enabling is owner-optional O-14 — authoring and testing are not owner-gated.)*
**Acceptance / test gate:** Workflow lints and runs green with secrets absent (skip path); script verified against local stack RPC; owner instructions committed.
**Est:** 0.5 d

### MC-13 — MC drills, QA & exit gate
**Description:** Milestone close: the two manual drills, acceptance sweep, checklist, tag.
**How:** Run every 12 §17 acceptance criterion against the local stack and record results. Manual drills: (1) reinstall-restore — dogfood-shaped fixture → push → wipe simulator → install → sign in → pull → history/routines/customs/measurements/settings deep-match, records tab identical (P10); (2) airplane-mode — finish a workout offline: save instant, offline notice toast exactly once (12 §11.1), second offline save silent, Settings shows `Pending`, reconnect → silent drain (08 §7 extended drill). Fix P0/P1 with regression tests (08 §2). `docs/qa/MC-checklist.md`; tag `v0.5.1`.
**References:** 12 §17; 09 MC exit; 08 §7, §8.
**Dependencies:** MC-10, MC-11, MC-12.
**Acceptance / test gate:** All 12 §17 criteria evidenced (1–6, 8–10 on local stack; 7 via integration test); both drills recorded; zero P0/P1; checklist committed; tag pushed.
**Est:** 1 d

### MC-14 — Production wiring + release-build sync verification `[blocked-by-owner: O-13; optional O-14]`
**Description:** Point real builds at the owner's Supabase project — the only owner-gated cloud task.
**How:** With O-13 done (owner's project + auth user + URL/anon key in EAS env/secrets for `preview`/`production` per 10 §1): `supabase link` + `supabase db push` to apply `supabase/migrations/` to the production project (needs a ~10-minute owner access-token session, 12 §16); build a preview-profile build → sign in as the owner's real user → finish a test workout → verify rows in the production project's Studio → wipe → restore-pull verification; confirm dev builds still default to the local stack. If O-14 done: add Actions secrets, dispatch `heartbeat.yml`, verify the RPC fires against production. Timing: any time from MC exit through the M6-09 TestFlight window; if O-13 lags, beta builds ship with the stub (09 M6 note) and this task rolls forward — it must be done before the M7-04 production submission *or* a conscious ship-with-stub decision recorded (10 §10 checklist).
**References:** 12 §16, §13; 10 §1, §2, §10; 09 MC/M6.
**Dependencies:** MC-13; **owner O-13** (optionally O-14). Blocks nothing in MC or M6 dev — only real-project sync in distributed builds.
**Acceptance / test gate:** Production project migrated; preview build syncs + restores end-to-end against production; EAS secret names documented (values never committed); heartbeat verified if enabled; evidence appended to `docs/qa/MC-checklist.md`.
**Est:** 0.5 d (+ owner's ~10 min)
