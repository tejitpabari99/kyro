# 10 — App Store Launch Plan

Kyro ships through TestFlight and the App Store like a commercial product (D1), even with one intended user. Executed in M6–M7 (`09`).

## 1. Accounts & prerequisites

- **Apple Developer Program** (individual), $99/yr — enroll by early M6 (processing can take days). Individual enrollment is fine; no DUNS needed.
- **App Store Connect:** create app record; primary language English (U.S.); category **Health & Fitness** (secondary: none); age rating 4+.
- **Bundle ID:** `com.tejitpabari.kyro` (placeholder — confirm at enrollment; register in the developer portal; never changes after first submission).
- **EAS:** Expo account, project linked (`eas init`); free tier is sufficient (build queue waits acceptable for a personal cadence); credentials managed by EAS (auto-generated distribution cert + provisioning profiles — do not hand-manage).
- Sentry org/project (free tier) for release monitoring (P13).
- **Supabase project (D9, `12`):** owner-created (O-13); its URL + anon key stored as **EAS env vars/secrets** on the `preview`/`production` profiles (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) — never committed. Builds without these secrets still pass review-quality QA with sync in stub mode (`12` §13), so this gates the sync feature only, not the build.

## 2. Build & submit workflow (EAS)

`eas.json` profiles:

- `development` — dev client, simulator + device internal distribution.
- `preview` — internal distribution (ad hoc) for quick device installs mid-milestone.
- `production` — store build: auto-increment build number, Sentry sourcemap upload, EAS Update channel `production`.

Flow (automated in `release.yml`, `08` §9): tag → `eas build --platform ios --profile production` → Maestro smoke on the artifact where feasible → `eas submit --platform ios` → TestFlight processing.

Config notes (`app.json`/config plugins): `expo-notifications` (sounds bundled), Sentry plugin, `UIBackgroundModes`: none needed (local notifications don't require background modes; cloud sync runs foreground-only, `06` §11), `ITSAppUsesNonExemptEncryption=false` (standard HTTPS/TLS-only exemption — Supabase traffic is ordinary TLS) to skip export-compliance questions per build.

## 3. Permission strings (Info.plist via app config)

Only what's used, phrased for review:
- `NSCameraUsageDescription` — "Take progress photos and photos for custom exercises."
- `NSPhotoLibraryUsageDescription` — "Choose progress photos and images for custom exercises."
- `NSPhotoLibraryAddUsageDescription` — only if we add save-to-library; otherwise omit.
- Notifications: runtime permission with in-app rationale (`06` §6.2); no plist string needed.
- Nothing else — no location, no health, no tracking.

## 4. TestFlight

- **Internal testing:** owner + a couple of friends/family Apple IDs (internal testers need App Store Connect users; alternatively external group). Builds available immediately after processing, no beta review for internal.
- **External group (optional):** first external build triggers lightweight Beta App Review — same prep as §5 applies.
- Beta period: ≥ 2 weeks dogfood (M6 gate) watching Sentry + TestFlight feedback/screenshots; each fix ships as a new build (build number auto-increments; version stays 1.0.0).

## 5. App Store review — risk assessment & prep

This app is low-risk: no public accounts or sign-up, no UGC sharing, no payments, no health claims. Specific guideline touchpoints:

| Guideline | Position |
|---|---|
| 2.1 Completeness | Fully functional without any sign-in — the optional Cloud Sync sign-in (Settings → Data) is a personal-backup feature for the single pre-provisioned owner account; there is no registration flow. State this in review notes so reviewers don't hunt for an account flow or demand a demo login (every feature is testable signed out). |
| 5.1.1 Data collection | Minimal; see §6. No account required to use the app — sync is opt-in via sign-in. |
| 5.1.3 Health & Fitness data | Workout data is stored on device and synced only to a developer/owner-controlled private Supabase backend for backup; never shared with or sold to third parties — state this in review notes. Not HealthKit-integrated in v1, so HealthKit rules don't apply. |
| 4.2 Minimum functionality | Rich native feature set — comfortably clears. |
| 1.1.6 / IP | **Exercise images/dataset licensing answer (prepared):** built-in exercise database and images derive from *free-exercise-db* (github.com/yuhonas/free-exercise-db), released under the **Unlicense (public domain)** — attribution provided in-app (Settings → About → Licenses). No Hevy assets, trademarks, code, or copy are used; Kyro is an original implementation with an original design system. |
| Design 4.0 | Original iconography/branding; no confusion with existing apps ("Kyro" name + distinct emerald identity). |

**Review notes draft:** "Kyro is a personal workout logbook. All data is stored locally on device and read from local storage only; saved workouts optionally back up to a private, developer-controlled Supabase database (no third-party sharing, no analytics on fitness data). There is no user registration — the optional sign-in under Settings → Data is a single pre-provisioned backup account; every feature works without signing in. Exercise database: free-exercise-db (public domain, credited in Settings → About). To test logging: Workout tab → Start Empty Workout → add an exercise → enter weight/reps → tap the checkmark → Finish."

## 6. Privacy nutrition label & policy

- **Fitness data now leaves the device (D9):** with cloud sync configured, workout/routine/measurement data transmits to the owner-controlled Supabase project, and Apple's definition of "collected" covers data transmitted off-device that isn't processed only ephemerally — regardless of who owns the server. Declare honestly: **Health & Fitness → Fitness** (workout data) and **Health** (body measurements) as collected, **linked to identity** (rows tie to the single signed-in account), **not used for tracking**, purpose "App Functionality". Also declare **Contact Info → Email Address** (the sync sign-in email), linked, app-functionality. Do **not** claim "Data Not Collected" for fitness data — the local-only era phrasing is obsolete.
- **Sentry posture (unchanged):** with Sentry enabled → additionally declare **Crash Data** and **Performance Data**, "not linked to identity," "not used for tracking" (`sendDefaultPii: false`, no user identifiers, breadcrumbs stripped of content — `06` §9; workout content is never sent to Sentry).
- The old "cleanest label" option (ship with Sentry off for a blanket "Data Not Collected") is no longer meaningful once sync ships — the fitness-data declaration stands either way. Decision O-10c now only toggles the Crash/Performance rows.
- **Privacy policy URL** (required field): one static page (GitHub Pages) stating: fitness data is stored on device and backed up to a private database controlled solely by the developer/owner (Supabase, TLS in transit, encrypted at rest); no third-party access, sale, or sharing; optional anonymous crash diagnostics via Sentry; contact email.
- App Privacy "Data Deletion": deleting the app deletes on-device data; cloud copies are deleted by the owner via the Supabase dashboard (single-user app — the account holder *is* the developer; say so in the policy).

## 7. Store listing assets

- **Name:** Kyro — Workout Tracker (check availability at submission). **Subtitle:** "Fast, private lifting log."
- **Icon:** per `07` §4 direction (emerald→teal gradient, K/plate monogram); 1024 px master; also iOS 18+ tinted/dark icon variants.
- **Screenshots** (required: 6.9" and 6.5" classes; generate via device-frame tool from real builds, dark theme primary): 1 logger mid-workout with timer pill, 2 exercise library detail, 3 per-exercise charts/records, 4 routine hub, 5 calendar/statistics, 6 measurements. Caption strip per shot, token-styled.
- **Description:** feature-focused copy (logging speed, 870+ exercise library, PRs, charts, private — your data lives on your device and your own backup, no subscription). **Keywords:** workout log, gym tracker, lifting, strength, routine planner, PR tracker.
- **Support URL:** same GitHub Pages site; **marketing URL** optional.

## 8. Versioning strategy

- SemVer-ish marketing versions: `1.0.0` launch; patch = fixes (1.0.x), minor = features (1.x.0); `CFBundleVersion` (build number) auto-incremented by EAS every build, never reused.
- Native-affecting changes (new native module, SDK upgrade, permissions) ⇒ store build + review. JS-only fixes ⇒ **EAS Update** (§9) on a patch version, runtime version policy `appVersion` — updates only apply to matching store builds.
- Tag every store submission (`v1.0.0`) and every update push (`v1.0.1-ota.1`); changelog kept in repo.

## 9. Post-launch operations

- **Crash monitoring:** Sentry release health per version (sessions, crash-free rate — target ≥ 99.5%); alert email on new crash signature. Sourcemaps uploaded in CI (`08` §9).
- **Hotfix path:** P0/P1 in production → fix → jest+Maestro smoke → `eas update --channel production` same day for JS issues; store expedited review request reserved for native-level breakage.
- **Update cadence:** personal — batch improvements; keep App Store version fresh at least quarterly so review-era metadata stays accurate.
- **Data safety:** monthly backup reminder (local notification, opt-in default on post-launch, `05` §9); before each app update the owner exports a backup (habit, documented in README).
- **Roadmap intake:** post-launch ideas go to `11-future-roadmap.md`; App Store rating prompts: none (single user — skip `SKStoreReviewController`).

## 10. Launch checklist (M7 gate)

- [ ] Developer account active; bundle id registered; app record created.
- [ ] Production build passes full Maestro + manual QA on the store binary (TestFlight build, not dev client).
- [ ] Privacy label + policy URL live and accurate w.r.t. Sentry decision **and** the fitness-data sync declaration (§6).
- [ ] Supabase EAS secrets set on the production profile (O-13) and a release-class build verified to sync end-to-end (MC-14) — or a conscious decision recorded to ship with sync stubbed.
- [ ] Permission strings present and minimal; export compliance flag set.
- [ ] Listing assets uploaded (icon, 2 screenshot sets, description, keywords, support URL).
- [ ] Review notes (incl. dataset licensing answer) attached.
- [ ] Sentry release created; EAS Update channel mapped to 1.0.0 runtime.
- [ ] Owner's data backed up before installing store build over dogfood build (container migrates, but belt-and-suspenders).
