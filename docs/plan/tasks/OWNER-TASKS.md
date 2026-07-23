# OWNER Tasks — Everything the Owner Must Personally Do

The dev/agent plan (M0–MC–M7) is sequenced so that **no owner task blocks development**: the entire app — including cloud sync, which is built and tested against the local `supabase start` Docker stack — can be built and fully tested on the iOS Simulator and/or a local dev build (`npx expo run:ios` with free personal-team signing) before any item below is done. Owner tasks gate only **distribution** (TestFlight/App Store — dev tasks M6-09, M7-04…M7-06) and **production sync credentials** (MC-14), plus a few data inputs and taste decisions that have safe defaults.

Legend: **Needed by** = the milestone whose *gated* tasks wait on it (dev work up to that point proceeds regardless).

---

## Accounts & money

### O-01 — Apple Developer Program enrollment + payment
**What:** Enroll as an individual at developer.apple.com ($99/yr, credit card). No DUNS needed. Processing can take days — start early.
**Why:** Required for TestFlight, App Store, push of any build to a store channel. Gates M6-09 and all of M7-04+.
**Needed by:** early **M6** (per 10 §1).
**Effort:** ~30 min + up to a few days' processing.

### O-02 — Confirm bundle ID + check app name availability
**What:** Decide the final bundle identifier (placeholder `com.tejitpabari.kyro`) and register it in the developer portal; check "Kyro — Workout Tracker" name availability in App Store Connect (10 §7 — name is claimed when the app record is created).
**Why:** Bundle ID can never change after first submission (10 §1). Dev builds use the placeholder until then; a late change before first submission is a one-line config edit.
**Needed by:** **M6** (with O-03).
**Effort:** 15 min.

### O-03 — App Store Connect app record
**What:** Create the app record (primary language English (U.S.), category Health & Fitness, age 4+), add any internal testers' Apple IDs for TestFlight.
**Why:** Target for `eas submit`; TestFlight internal group lives here. Gates M6-09/M7-04.
**Needed by:** **M6** (before first TestFlight build).
**Effort:** 30 min.

### O-04 — Expo (EAS) account
**What:** Create an Expo account (free tier suffices, 10 §1), share credentials/robot token with the dev agent or run `eas init`/`eas login` yourself on the repo.
**Why:** EAS Build/Submit/Update all need the account. All config files are authored account-free in M6-08; this only gates running cloud builds (M6-09+).
**Needed by:** **M6**.
**Effort:** 15 min.

### O-05 — Sentry org/project (or decide to skip)
**What:** Create a free Sentry org + project, hand the DSN over (env/secret). Tied to decision O-10c.
**Why:** Crash monitoring (P13). The app is coded to run with Sentry fully no-op'd when no DSN is set (M0-11), so this never blocks dev. Gates only real crash monitoring in the M6-09 beta and M7-06 release health.
**Needed by:** **M6** (beta watch).
**Effort:** 20 min.

### O-06 — GitHub repository hosting + Actions (if not already set up)
**What:** Ensure the repo has a GitHub remote with Actions enabled; turn on branch protection for `main` (CI required) per 08 §9; add EAS/Sentry secrets when they exist (O-04/O-05) and, optionally, the heartbeat secrets (O-14).
**Why:** CI/nightly/release workflows are authored from M0 but only *run in the cloud* with a remote. Everything is mirrored by local `pnpm ci` scripts, so dev is never blocked — cloud CI is still strongly recommended from M0.
**Needed by:** ideally **M0–M1** (nice-to-have), hard-needed by **M6** (release workflow secrets).
**Effort:** 15 min.

### O-13 — Supabase account, project, auth user + hand over URL/anon key
**What:** Create a free Supabase account + one project (pick a region near home, e.g. us-east). In the dashboard: Authentication → create the single email/password user (your sync sign-in). Copy the project URL + anon key into EAS env/secrets (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` on the `preview`/`production` profiles — dev can do this given the values; never committed to the repo). One ~10-minute access-token session with the dev for the first `supabase db push` (MC-14). Total ~10 min of clicking.
**Why:** Production cloud sync (D9, `12` §16). **All sync development and testing runs on the local Docker stack — this gates nothing except real-project sync in distributed builds** (MC-14). Without it, TestFlight/production builds run with sync in stub mode (fully functional otherwise).
**Needed by:** ideally before the **M6** TestFlight beta (so the dogfood soaks real sync); hard-needed by **M7-04** submission (or record a conscious ship-with-stub decision, 10 §10).
**Effort:** ~10–15 min.

### O-14 — (Optional) Heartbeat keep-alive secrets
**What:** Add two GitHub Actions secrets to the repo — `SUPABASE_URL`, `SUPABASE_ANON_KEY` (same values as O-13) — which activates the already-authored weekly `heartbeat.yml` (MC-12).
**Why:** Insurance against the Supabase free tier pausing after 7 idle days (vacations). Optional: normal training weeks reset the timer organically, and a paused project costs nothing but a one-click dashboard resume — never data (`12` §2).
**Needed by:** any time after O-13; skippable indefinitely.
**Effort:** 5 min.

## Data inputs

### O-07 — Provide your Hevy CSV export (full + permission to trim/anonymize a sample)
**What:** In Hevy: export workout CSV; deliver the full file to the repo/dev privately, and OK an anonymized trimmed slice becoming a committed test fixture (08 §4.6).
**Why:** M5-11 (real migration audit, success criterion G4) and the highest-fidelity import test fixture. Import development itself uses a synthetic Hevy-format fixture, so only the audit waits on this.
**Needed by:** **M5** close (ideally earlier — any time from M2 on).
**Effort:** 10 min.

## Testing & dogfooding

### O-08 — TestFlight install + beta feedback (2-week dogfood)
**What:** Install the TestFlight build, log every real workout in Kyro for ≥ 2 weeks, file feedback/screenshots through TestFlight for anything wrong or annoying.
**Why:** M6 exit gate: crash-free ≥ 99.5% over the beta window + all feedback triaged (09 M6). This is also success criterion #6 rehearsal (owner switches from Hevy).
**Needed by:** **M6** exit window (after M6-09 first build).
**Effort:** 2 weeks of normal gym life + ~1 h total feedback.

### O-09 — Physical-device testing
**What:** On your real iPhone (dev build from M2 onward — installable without a paid account via personal-team signing, or TestFlight from M6):
- Rest-timer notification drill: screen locked, notification fires with correct sound, ±15 s honored — 10/10 (M2 exit item; 08 §7).
- Force-quit resume ×10 and a device-restart resume (G2 evidence).
- M6 device-matrix passes on your device (visual, Dynamic Type, haptics feel).
**Why:** Simulators can't verify lock-screen delivery, real haptics, or restart behavior. Dev verifies everything simulator-verifiable; these physical checks are the owner's share.
**Needed by:** first pass during **M2–M3** (soft; doesn't block M3 dev), formal sign-off in **M6**.
**Effort:** ~1–2 h spread out.

## Decisions (flagged open in the PRD)

### O-10 — Decision bundle
| # | Decision | Context | Default if you don't decide | Needed by |
|---|---|---|---|---|
| a | Dataset size fallback | If bundled exercise images exceed 50 MB: thumbnails-bundled + on-demand full images? (03 §6.5, M1-11) | Take the documented fallback | M1 exit |
| b | App icon + screenshots + store copy approval | Dev produces drafts in M6-07 (10 §7) | Dev's drafts ship as-is | M7-04 |
| c | Sentry on (declare Crash Data) vs off-by-default | 10 §6; PRD recommends keeping Sentry on. Note: a blanket "Data Not Collected" label is off the table either way — the fitness-data sync declaration (D9, 10 §6) stands regardless | Sentry on, honest label | M7-04 |
| d | External TestFlight group (triggers Beta App Review) or internal-only | 10 §4 | Internal-only | M7-04 |
| e | GIF/animation sourcing (post-v1 milestone) | 03 §7 / 11 §1 options 1–4; taste + possible budget call | Deferred; no v1 impact | post-launch |
**Effort:** ~1 h total, mostly (b).

### O-11 — Privacy policy page publish
**What:** Approve the policy text (M7-01) and publish it (GitHub Pages on the repo is easiest — one click if O-06 done; dev can do this part if given repo admin). Provide the contact email to list.
**Why:** Privacy policy URL is a required App Store field (10 §6). Gates M7-04 only.
**Needed by:** **M7**.
**Effort:** 15 min.

## Ongoing

### O-12 — Dogfood from M2 onward (recommended, not gating)
**What:** Once M2 exits, start logging real workouts in a local/preview build alongside Hevy (09: "Owner starts dogfooding real workouts from here").
**Why:** Earliest possible signal on the make-or-break logging UX; feeds bug bashes with real usage.
**Needed by:** rolling, from **M2**.
**Effort:** normal gym time.

---

## Summary timeline

| When | Do |
|---|---|
| Anytime now | O-06 (GitHub), O-07 (Hevy export) |
| M2 exit | O-12 start dogfooding; O-09 first notification drill |
| M5 | O-07 delivered at the latest (for M5-11 audit) |
| MC exit / start of M6 | O-13 (Supabase project + keys — ~10 min; lets the beta soak real sync); O-14 optional |
| Start of M6 (or earlier — processing lag!) | O-01, O-02, O-03, O-04, O-05 |
| M6 beta window | O-08, O-09 formal, O-10b; sign in once in the app (O-13 account) |
| M7 | O-10c/d, O-11, final approvals; O-13 hard deadline if skipped earlier |
