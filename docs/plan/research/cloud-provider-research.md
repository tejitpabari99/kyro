# Research — Cloud Backend for Kyro (completed-workout durable store)

**Question:** Where do completed workouts, routines, measurements, and custom exercises go when saved, given local-first expo-sqlite + Drizzle (`05`), repository seam already designed for a cloud decorator (`05` §6), single user, kilobytes per workout, low-thousands of rows per year?

**Owner requirement recap:** in-progress workout stays local; on finish/save it is pushed to the cloud, which becomes the durable store. Home list + detail read from local cache (offline-tolerant). Static exercise dataset/images are out of scope. Progress-photo cloud backup is optional/later.

**Selection criteria (in order):** $0 durable free tier → low setup/ops → fit with expo-sqlite + Drizzle → simple single-user auth → local dev without a cloud account → export/lock-in → provider longevity.

**Owner preference (2026-07-23):** the owner is leaning toward **Supabase**. Research below validates that preference — no disqualifier found (see §4).

Pricing/limits verified July 2026.

---

## 1. Comparison table

| | Free tier (2026) | $ at Kyro scale | Setup effort | Expo/RN SDK | Single-user auth | Local dev w/o account | Export / lock-in | Longevity | Fit w/ SQLite+Drizzle stack |
|---|---|---|---|---|---|---|---|---|---|
| **Supabase** | 2 projects, 500 MB DB, 1 GB storage, 5 GB egress; **pauses after 7 days of no DB activity**; no automated backups on free | $0 (Pro $25/mo never needed) | ~½ day account→sync skeleton | supabase-js mature in Expo (needs URL polyfill + session storage adapter) | 1 email/password Auth user + RLS `authenticated` policy | **Excellent** — `supabase start` (Docker) runs the full stack locally | pg_dump via CLI; plain Postgres — low lock-in | Large, GA, huge community | Good: Postgres mirror of the SQLite schema; sync via PostgREST upserts; Drizzle optional server-side |
| **Turso / libSQL** | 5 GB, 100 DBs, 500 M row reads/mo, 10 M writes/mo, ~10 GB/mo embedded-replica sync | $0 (Developer $4.99/mo not needed) | ~1 day, but **requires replacing expo-sqlite with op-sqlite/libSQL RN bindings** | Official RN bindings + op-sqlite libsql path; Expo plugin still maturing | Platform API token baked into app (acceptable single-user) | Good — plain SQLite file / `turso dev` | SQLite file = perfect export | Startup; 2025 engine rewrite pivot = some churn risk | Conceptually best (DB *is* the sync) but **overturns locked decision P1** (driver swap) |
| **Firebase Firestore** | Spark: 1 GiB, 50 K reads / 20 K writes per day; no pausing | $0 forever at this scale | ~1 day (config plugin + data mapping) | react-native-firebase solid in Expo dev builds | Firebase Auth email/password | **Excellent** — Firestore emulator suite | Proprietary export scripts; highest lock-in | Google-grade infra, Google-grade deprecation reputation | Poor: document model vs 11 relational tables; per-workout doc mapping layer needed |
| **Cloudflare Workers + D1** | Workers 100 K req/day; D1 5 GB, 5 M row reads/day, 100 K writes/day; no pausing, no sleeping | $0 (paid tier $5/mo never needed) | ~1–1.5 days (must write a small Hono API + token auth) | No SDK needed — plain `fetch` | Static bearer token in app config | **Excellent** — `wrangler dev` local Miniflare D1 | `wrangler d1 export` → SQL dump; SQLite dialect | Excellent | **Best schema reuse**: D1 is SQLite; the same Drizzle schema file drives expo-sqlite and D1 |
| **PocketBase (self-host)** | Software free; hosting is not: Fly.io free tier gone (trial credits only), VPS $3–5/mo, PocketHost $5/instance | **$36–60+/yr** | ~1 day + ongoing ops (updates, TLS, backups) | JS SDK works in RN | Built-in auth | Excellent — single binary | SQLite file underneath; collections schema is PocketBase-shaped | One-maintainer project + your own ops | Mediocre: schema lives in PocketBase collections, not your Drizzle DDL |
| **Neon Postgres** | 0.5 GB/project, 100 CU-hrs/mo, scale-to-zero (cold start ~0.5 s), 100 projects | $0 | ~1–1.5 days (Data API/PostgREST or thin API + auth assembly) | No mobile SDK; HTTP via Data API | Neon Auth (new) or hand-rolled token | Moderate — local Postgres in Docker approximates it | pg_dump; low lock-in | Databricks-owned since 2025 (funding fine; product focus drifting analytics-ward) | Same Postgres story as Supabase but with more assembly and less tooling |
| **Snapshot upload (R2 or iCloud)** | R2: 10 GB free; iCloud via react-native-cloud-storage: $0, no account, owner's own iCloud quota | $0 | ~½ day (reuses existing BackupService zip from `05` §9) | R2 = fetch/S3 presign; iCloud = config-plugin lib | R2 token / none (iCloud) | Excellent (write to a local dir stub) | The backup zip *is* the export | Cloudflare/Apple | Trivial fit — but see honest assessment in §3.7 |

---

## 2. Per-candidate analysis

### 2.1 Supabase — owner's preference; validated
- **Free tier reality:** 500 MB Postgres vs. Kyro's ~kilobytes/workout → decades of headroom. The two real free-tier caveats: (1) **pausing after 7 days without DB activity** — data retained, project offline until manually resumed (~30 s wake after resume); (2) **no automated backups on free** — mitigated because local SQLite + Kyro's own backup zip are additional durable copies, and `supabase db dump` works any time.
- **Why pausing is *not* disqualifying here:** Kyro is local-first by design. A paused project is indistinguishable from being offline — the save lands in the local outbox and retries later (see §5). The owner training a few times a week resets the 7-day timer organically; for vacation gaps, a free GitHub Actions weekly cron hitting a heartbeat RPC keeps it awake (§5.6). Worst case is a manual dashboard "restore" click, never data loss.
- **Expo fit:** supabase-js is mature in Expo dev builds. Needs `react-native-url-polyfill` and a storage adapter for the auth session — use `expo-sqlite/kv-store` (already in the stack, `06` §1) instead of AsyncStorage. No native module beyond what Kyro already ships.
- **Auth:** one email/password user created by the owner in the dashboard. RLS on every table: `USING (auth.role() = 'authenticated')` — no `user_id` columns needed for a single-user project (add them later only if the app ever becomes multi-user). The anon key ships in app config (safe: RLS blocks anon reads/writes). Session auto-refreshes; sign-in happens once per install.
- **Local dev:** best-in-class — `supabase start` runs the full stack (Postgres, PostgREST, Auth, Studio) in Docker with a deterministic anon key. Dev and CI point supabase-js at `http://127.0.0.1:54321`. **Development is never blocked on the owner's account.**
- **Drizzle fit:** app never speaks Postgres wire protocol — it uses PostgREST via supabase-js, so the local Drizzle/SQLite layer is untouched. Cloud schema is a Postgres mirror of `05` §3 (same table/column names; `INTEGER` epoch-ms → `bigint`, JSON-array TEXT columns → `jsonb` optionally), managed as SQL files in `supabase/migrations/` checked into the repo. (drizzle-kit's Postgres dialect *could* manage it, but plain Supabase CLI migrations are simpler and keep one tool per side.)
- **Export/lock-in:** it's Postgres — `pg_dump`, CSV via Studio, or Kyro's own exporters. Low.
- **Longevity:** among the safest picks — large revenue-generating company, core product GA for years.

### 2.2 Turso / libSQL
The conceptually cleanest fit (embedded replica = your local SQLite file syncs itself), and free limits are generous (5 GB, 500 M row reads/mo, ~10 GB/mo replica sync). Two real problems: (1) using it means **replacing expo-sqlite with op-sqlite/libSQL RN bindings** — reversing locked decision P1 and the dual-driver Node test story that motivated it; the official RN bindings + Expo plugin are still maturing. (2) Platform churn: Turso spent 2025 rewriting its engine (libSQL → "Turso database"), and pricing/plans have been reshuffled twice in two years — weaker longevity confidence than Supabase/Cloudflare. Verdict: elegant, but it buys sync by destabilizing the most load-bearing local decision. Revisit only if a future milestone demands continuous multi-device sync.

### 2.3 Firebase Firestore
Spark tier (1 GiB, 50 K reads/20 K writes per day, hard-stop not billed) comfortably covers Kyro and never pauses. Emulator suite gives a perfect no-account dev story; react-native-firebase works in Expo dev builds via config plugin. Disqualifying friction: the document model fights the 11-table relational schema — you'd maintain a bidirectional mapper (workout doc with nested exercises/sets), lose SQL-shaped export, and take the highest lock-in of any candidate. Nothing here beats Supabase for this app.

### 2.4 Cloudflare Workers + D1 — strongest technical runner-up
Free tier is effectively unbounded for Kyro (5 M row reads/day, 100 K writes/day, 5 GB), never sleeps or pauses. **Unique advantage: D1 is SQLite** — the Drizzle schema file from `data/schema.ts` compiles for the `drizzle-orm/d1` driver nearly unchanged, so local and cloud schema are literally one source. `wrangler dev` runs a fully local Worker + D1 with no account. Costs: you must write and maintain a small API (Hono + bearer-token auth + upsert/pull endpoints, ~200–400 LOC) — roughly one extra day versus Supabase, and there's no auth/storage/dashboard ecosystem when you later want photo backup. Chosen as runner-up because it's the only candidate that beats Supabase on both free-tier durability (no pausing) and schema reuse; it loses on setup effort and batteries-included scope.

### 2.5 PocketBase (self-hosted)
Fails criterion #1: there is no longer a $0 durable home for it — Fly.io's free tier is gone (trial credits only; realistic $2–8/mo), PocketHost is $5/instance, a VPS is $3–5/mo, i.e. **$36–60+/year** plus ops (updates, TLS, backups, monitoring) for one user. Schema would live in PocketBase collections rather than the repo's Drizzle DDL. Great single-binary local dev doesn't rescue it. Not recommended.

### 2.6 Neon Postgres
Free tier is fine (0.5 GB, 100 CU-hrs/mo, scale-to-zero; post-Databricks the free plan actually improved). But there's no mobile SDK: you assemble the Data API (PostgREST-flavored, still newish) or a thin serverless API, plus auth, plus your own local-dev stack — i.e., Supabase with more work and less tooling. Databricks ownership secures funding but tilts the roadmap toward data-platform workloads. Strictly dominated by Supabase for this use case.

### 2.7 Snapshot upload to object storage (R2) or iCloud — the honest "do you even need a database?" option
For one user, uploading the existing `kyro_backup_{date}.zip` (`05` §9) after each finished workout (debounced) to R2 (10 GB free) — or to the owner's own iCloud via `react-native-cloud-storage` (zero backend, zero account, zero cost) — delivers *durability* with half a day of work, reusing BackupService. Honest assessment: it satisfies "my data survives losing the phone" but **not the stated requirement** — the cloud never holds queryable rows, restore is all-or-nothing replace, there is no second-device or reinstall-and-pull-history story, and per-save granularity is snapshot-grade. Recommended **as a complementary layer** (cheap belt-and-braces alongside Supabase), not as the answer.

---

## 3. Recommendation

**Primary: Supabase** (also the owner's stated preference — preference and analysis agree).

Rationale: $0 at this scale with decades of headroom; the only free-tier defect (7-day inactivity pause) is neutralized by Kyro's local-first architecture (a paused project = offline = outbox retry, §5) plus a trivial keep-alive; best-in-class no-account local dev (`supabase start`); mature supabase-js in Expo dev builds; single-user auth is one dashboard click + one RLS policy; Postgres = low lock-in; strongest provider-longevity signal of the non-Google options; and Supabase Storage gives a free 1 GB path for optional progress-photo backup later without adding a second vendor.

**Runner-up: Cloudflare Workers + D1.** Switch to it if the owner's Supabase preference changes or free-tier pausing/backup policy worsens: it never pauses, its free limits are the most generous, and being SQLite it shares Kyro's exact Drizzle schema — at the cost of writing and owning a small API and losing the auth/storage/dashboard ecosystem.

Explicitly rejected: Turso (destabilizes locked decision P1; platform churn), Firestore (relational mismatch, lock-in), PocketBase (not $0, ops burden), Neon (Supabase minus the tooling). Snapshot-to-iCloud/R2: adopt later as an optional secondary backup layer, not as the cloud store.

---

## 4. Owner-preference check (was anything disqualifying?)

No. The two candidate disqualifiers examined:
1. **Free-tier pausing** — not disqualifying: local-first design means a paused cloud degrades to "sync pending", never blocks logging or reading history, and never loses data. Mitigation in §5.6.
2. **Expo fit** — supabase-js is proven in Expo dev builds; no native module conflicts with the `06` §1 dependency table.

---

## 5. Recommended sync architecture (Supabase)

Implements the `SyncedRepository` decorator seam already reserved in `05` §6 / `11` §2. Local SQLite remains the single read model for the UI — **no screen ever reads from the network.**

### 5.1 Cloud schema
Postgres mirror of `05` §3 for the synced entities only: `workouts`, `workout_exercises`, `sets`, `routines`, `routine_folders`, `routine_exercises`, `routine_sets`, `exercises` (custom rows only — built-ins stay bundled), `body_measurements`. `settings` optionally synced as one jsonb row. Same names; epoch-ms `bigint`; keep `updated_at`/`deleted_at`. Migrations as SQL in `supabase/migrations/`. RLS on all tables: authenticated-only, all operations.

### 5.2 Writes (push on save)
- New local table `sync_outbox(id, entity_type, entity_id, op, created_at, attempts, last_error)` — a journal, not a payload store (payload is read fresh from the DB at push time, so the newest version always wins).
- Decorated repository methods enqueue: `WorkoutRepository.finish/update/softDelete`, routine + folder CRUD, `MeasurementRepository.upsert/clearField`, custom-exercise CRUD. Active-workout granular mutators are **not** decorated — in-progress data stays local by design.
- Push worker drains the outbox: after each enqueue, on app foreground, and on connectivity regain (`@react-native-community/netinfo`). A finished workout pushes as one batch: upsert workout row, then child rows, then delete-by-parent-id for children no longer present (covers past-workout edits). All upserts keyed on UUID PKs → fully idempotent; safe to retry.
- Failure (offline, paused project, 5xx): exponential backoff, attempts counted, silent up to N attempts, then a passive "sync pending" badge in Settings → Data. Never a blocking error — the workout is already durable locally.

### 5.3 Reads / cache
UI reads local SQLite via existing repositories + TanStack Query, unchanged. Home list and workout detail therefore work fully offline and are instant.

### 5.4 Pull (reinstall / second device)
- Watermark pull: on cold start (throttled, e.g. ≥ 6 h since last) and manual "Sync now": fetch rows per table where `updated_at > last_pulled_at` (stored in `app_meta`), upsert locally, apply `deleted_at` tombstones. Fresh install with an empty local DB → the same pull is a full restore of history.
- This also makes an eventual second device (iPad) work with no new machinery.

### 5.5 Conflicts
Single user, one phone at a time: conflicts are near-impossible. Policy: **last-write-wins per row on `updated_at`**, tombstones win over edits at equal timestamps. `body_measurements` keys on `date` (natural upsert). No vector clocks, no merge UI — deliberately.

### 5.6 Free-tier pause mitigation
1. Organic: any workout save or watermark pull resets Supabase's 7-day inactivity timer.
2. Insurance: GitHub Actions weekly cron (free) calling a `heartbeat()` RPC (security-definer, callable with anon key) — one secret (`SUPABASE_URL` + anon key) in the repo's Actions secrets.
3. If it ever pauses anyway: dashboard → Restore (~30 s); the outbox drains on next app open. No data loss possible.

### 5.7 Photos (later, optional)
Progress photos stay local per plan. When wanted: upload originals to Supabase Storage (1 GB free) from the same outbox mechanism. Alternative/parallel: monthly backup-zip upload to owner's iCloud via `react-native-cloud-storage` (§2.7).

---

## 6. Dev vs. owner responsibilities

| Who | What | Blocks development? |
|---|---|---|
| Dev | `supabase init` in repo; write `supabase/migrations/*.sql`; run `supabase start` (Docker) for local stack; build `SyncedRepository` decorator + outbox + pull; integration tests against local stack in CI (`supabase start` works headless) | Never blocked — the entire sync feature is built and tested against the local Docker stack with its deterministic anon key |
| Owner | Create Supabase account + one project (pick region near home, e.g. us-east); create the single Auth user (email/password) in dashboard; hand dev the project URL + anon key (goes into EAS env/secrets, *not* committed); optionally add the keep-alive Actions secret; sign in once in the app | Only blocks **production** sync, i.e. the final "point the release build at the real project" step. First `supabase db push` to the real project needs the owner's access token — a 10-minute session |
| Dev (release) | `supabase link` + `db push` to apply migrations to the owner's project; set `EXPO_PUBLIC_SUPABASE_URL`/`ANON_KEY` per environment (local values in dev, real in release builds) | — |

**Anti-blocking rule:** the app reads Supabase URL/key from env with the local-stack values as dev defaults; a `CloudSync` interface with a no-op stub keeps every other feature buildable even without Docker.

---

## Sources
- [Supabase pausing/limits (itpathsolutions)](https://www.itpathsolutions.com/supabase-free-tier-limits) · [designrevision Supabase pricing](https://designrevision.com/blog/supabase-pricing) · [keep-alive guide](https://shadhujan.medium.com/how-to-keep-supabase-free-tier-projects-active-d60fd4a17263)
- [Turso pricing](https://turso.tech/pricing) · [Turso Developer plan](https://turso.tech/blog/turso-cloud-debuts-the-new-developer-plan) · [Turso RN bindings](https://turso.tech/blog/react-native-bindings-for-turso) · [Turso + Expo offline-first](https://expo.dev/blog/build-offline-first-mobile-apps) · [op-sqlite libsql Expo demo](https://github.com/expo-starter/expo-opsqlite-libsql-turso)
- [Cloudflare Workers pricing docs](https://developers.cloudflare.com/workers/platform/pricing/) · [CF free stack 2026](https://www.buildmvpfast.com/blog/cloudflare-workers-hono-d1-r2-free-fullstack-2026) · [D1 calculator](https://flarecalc.com/calculators/d1/)
- [Firestore quotas (Google docs)](https://docs.cloud.google.com/firestore/quotas) · [Firebase free tier 2026](https://agentdeals.dev/vendor/firebase)
- [Neon free tier 2026](https://agentdeals.dev/vendor/neon) · [Neon pricing breakdown](https://vela.simplyblock.io/articles/neon-serverless-postgres-pricing-2026/) · [Koyeb Postgres free tiers 2026](https://www.koyeb.com/blog/top-postgresql-database-free-tiers-in-2026)
- [Fly.io alternatives / free tier removal](https://expresstech.io/7-fly-io-alternatives-in-2026-real-pricing-after-the-free-tier-died/) · [PocketHost pricing](https://pockethost.io/pricing) · [Fly.io pricing 2026](https://kuberns.com/blogs/flyio-pricing/)
