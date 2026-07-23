# 01 — Vision & Scope

## 1. Product vision

Kyro is a **personal weightlifting logbook** for iPhone that makes recording a set take under three seconds, keeps every byte of data on the owner's device, and turns years of training history into trustworthy records and charts.

It is a deliberate clone of Hevy's tracking core — the best-in-class logging UX — with three deliberate departures:

1. **No cloud, no account, no social.** One user, one device, local SQLite. Nothing is gated, nothing phones home.
2. **Everything unlocked.** Every feature Hevy sells as Pro (unlimited routines and custom exercises, all-time statistics, full body measurements, warm-up calculator) ships free.
3. **Its own identity.** Hevy's layout quality and interaction patterns with a distinct emerald/teal, dark-first design language.

The one-sentence pitch: *Hevy, if it were mine.*

## 2. Target user

Exactly one: the owner —

- Lifts several times a week, primarily barbell/dumbbell strength training with some cardio and bodyweight work.
- Currently a Hevy user with existing history to migrate (hence Hevy-CSV import is in scope for v1).
- Cares about progressive overload: previous-performance visibility, rep ranges, PR tracking, and the "update routine after workout" flow are the daily-value features.
- Uses the phone at the gym, often locked between sets — rest-timer notifications must work when the app is backgrounded and the screen is off.
- Technical; will build and maintain the app with AI-agent assistance, so the PRD must be precise enough for agents to implement from.

Although single-user, the app ships through TestFlight and the App Store like a real product (owner decision D1). This forces real quality: crash-free operation, review-compliant privacy posture, proper assets.

## 3. Goals

### Product goals

- **G1 — Logging speed.** Recording a typical set (tap previous or type, tap ✓) takes ≤ 3 seconds; a full workout adds < 1 minute of interaction overhead versus pen and paper.
- **G2 — Zero data loss.** An in-progress workout survives app kill, phone restart, and crash, resuming exactly where it left off. Completed history is never silently mutated; edits always recompute derived stats correctly.
- **G3 — Feature parity with Hevy's tracker.** Every behavior in `research/hevy-deep-dive.md` §1 (minus exclusions in §5 below) is present and works at least as well.
- **G4 — Migration in one sitting.** Import the owner's full Hevy CSV export with correct workouts, sets, units, supersets, RPE, and recomputed PRs.
- **G5 — Rich exercise library.** 800+ built-in exercises with muscles, equipment, instructions, and images; custom exercises indistinguishable from built-ins.
- **G6 — Shipping quality.** Passes App Store review; crash-free sessions ≥ 99.5% in TestFlight; the test suite in `08` green before each milestone exit.

### Engineering goals

- **E1 — Sync-ready without sync.** All data access goes through repository interfaces (`05` §6); domain logic never touches SQL directly, so a cloud backend can be added later by swapping/extending repositories (`11` §2).
- **E2 — Portable.** No iOS-only code paths except where the feature is iOS-only (notifications config, haptics tuning, keep-awake). Android should be a config-and-QA project later, not a rewrite.
- **E3 — Testable by construction.** Domain logic (PRs, 1RM, volume, calculators, CSV, timers) is pure TypeScript with no React/Expo imports, unit-testable in Node.

## 4. Scope — what v1 includes

Full details in docs 02–04; summary:

- **Workout logging:** empty or from-routine start; one active workout invariant; all 8 exercise types + custom metric; set types normal/warmup/failure/dropset; RPE (opt-in); previous-values with tap-to-autofill and commit-on-check; per-exercise auto rest timers with notification, ±15s/skip; supersets (2+ members, color-coded, smart scrolling); exercise + workout notes; plate calculator; warm-up set calculator; minimize-to-bar; crash persistence; finish flow with discard-unchecked confirm; edit/delete past workouts with full recompute; retro-logging past workouts.
- **Exercise library:** bundled free-exercise-db (~870 exercises), search + equipment/muscle filters, recents, detail page (about, instructions, image slot with animation placeholder, charts, records, history), custom exercise CRUD with optional user image.
- **Routines:** unlimited routines and folders; per-exercise rest_seconds, notes, supersets; per-set targets incl. rep ranges; drag reorder; duplicate; save-workout-as-routine; update-routine-after-workout prompt.
- **History & progress:** history list, workout detail, calendar with streaks, statistics dashboard (workouts/week, volume/reps/duration charts, muscle distribution), per-exercise charts, 5 PR types + per-rep set records with live in-workout banner, all time ranges free.
- **Body:** all 17 measurement fields, date-keyed; progress photos with gallery and side-by-side compare.
- **Settings:** units (weight, distance, body measurements), first day of week, theme (system/light/dark), and the 12 workout settings (research §1.6).
- **Data:** Hevy-compatible CSV export; Hevy CSV import; local backup export (see `05` §9).
- **Launch:** TestFlight beta, App Store submission, Sentry crash monitoring, EAS Update for JS fixes.

## 5. Non-goals (explicit, v1)

| Non-goal | Rationale / future |
|---|---|
| Social: feed, profiles, follows, likes, comments, leaderboards, shared/community routines, share cards | Permanently out — single-user app. Workout "share" reduces to CSV/backup export. |
| Third-party integrations: Apple Health, Strava, Garmin, AI/coach features | Out of v1. Apple Health is the most likely future addition (`11` §3). |
| Cloud sync, accounts, auth | Out of v1 by design (D3). Repository layer keeps the door open (`11` §2). |
| Android | Later; keep portable (E2), plan no Android work now. |
| Apple Watch app | Later (`11` §4). |
| Home-screen widgets, Live Activities / Dynamic Island | Stretch/roadmap (`11` §6). Rest timer uses local notifications in v1 (P14). |
| iPad layout, multi-language | iPhone-only layout; English only. |
| Animated exercise GIFs at launch | Image pairs ship in v1; animation slot + placeholder designed now, media sourced later (D6, `03` §7). |
| Strong-CSV import, curated routine library, monthly report / year-in-review screens | Nice-to-haves; roadmap only. |
| %1RM-based routine programming | Absent in Hevy too; out. |

## 6. Success criteria

v1 is done when all are true:

1. **Parity checklist green:** every acceptance criterion in docs 02–04 passes manual QA on a physical iPhone.
2. **Migration proven:** the owner's real Hevy export imports with zero dropped rows, spot-checked historical workouts match Hevy's display, and exported CSV re-imports losslessly (round-trip test, `08` §4.6).
3. **Reliability proven:** kill-app-mid-workout resume works 10/10 attempts including after force-quit and device restart; rest-timer notification fires with screen locked 10/10.
4. **Quality gates:** coverage targets met (`08` §6); zero P0/P1 bugs open (`08` §8); crash-free ≥ 99.5% across a 2-week personal beta.
5. **Shipped:** approved on the App Store, installable on the owner's phone from the store build.
6. **Owner switches:** the owner logs workouts exclusively in Kyro and stops opening Hevy. This is the real test.

## 7. Constraints & assumptions

- Solo developer + AI coding agents; milestones in `09` are sequenced for that (small vertical slices, test gates).
- iOS minimum: iOS 16.0 (Expo SDK 56 supports it; covers every device the owner uses).
- Device storage is not a concern (dataset images ≈ 25–40 MB bundled; acceptable, see `03` §6.5).
- No backend budget: $99/yr Apple Developer Program + free tiers of EAS/GitHub Actions/Sentry suffice (`10` §1).
- All Hevy behaviors marked `[confidence: medium]` in the research doc have been resolved into explicit specified behavior in these docs — implementers follow this PRD, not Hevy observation.
