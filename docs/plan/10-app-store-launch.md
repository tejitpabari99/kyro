# 10 — App Store Launch Plan

Kyro ships through TestFlight and the App Store like a commercial product (D1), even with one intended user. Executed in M6–M7 (`09`).

## 1. Accounts & prerequisites

- **Apple Developer Program** (individual), $99/yr — enroll by early M6 (processing can take days). Individual enrollment is fine; no DUNS needed.
- **App Store Connect:** create app record; primary language English (U.S.); category **Health & Fitness** (secondary: none); age rating 4+.
- **Bundle ID:** `com.tejitpabari.kyro` (placeholder — confirm at enrollment; register in the developer portal; never changes after first submission).
- **EAS:** Expo account, project linked (`eas init`); free tier is sufficient (build queue waits acceptable for a personal cadence); credentials managed by EAS (auto-generated distribution cert + provisioning profiles — do not hand-manage).
- Sentry org/project (free tier) for release monitoring (P13).

## 2. Build & submit workflow (EAS)

`eas.json` profiles:

- `development` — dev client, simulator + device internal distribution.
- `preview` — internal distribution (ad hoc) for quick device installs mid-milestone.
- `production` — store build: auto-increment build number, Sentry sourcemap upload, EAS Update channel `production`.

Flow (automated in `release.yml`, `08` §9): tag → `eas build --platform ios --profile production` → Maestro smoke on the artifact where feasible → `eas submit --platform ios` → TestFlight processing.

Config notes (`app.json`/config plugins): `expo-notifications` (sounds bundled), Sentry plugin, `UIBackgroundModes`: none needed (local notifications don't require background modes), `ITSAppUsesNonExemptEncryption=false` (standard HTTPS-only exemption; app is offline anyway) to skip export-compliance questions per build.

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

This app is low-risk: no accounts, no UGC sharing, no payments, no health claims. Specific guideline touchpoints:

| Guideline | Position |
|---|---|
| 2.1 Completeness | Fully functional offline app; no login. Provide review notes explaining local-only design so reviewers don't hunt for an account flow. |
| 5.1.1 Data collection | Minimal; see §6. No account required — inherently compliant. |
| 5.1.3 Health & Fitness data | Workout data stays on device; no sharing/selling — state this in review notes. Not HealthKit-integrated in v1, so HealthKit rules don't apply. |
| 4.2 Minimum functionality | Rich native feature set — comfortably clears. |
| 1.1.6 / IP | **Exercise images/dataset licensing answer (prepared):** built-in exercise database and images derive from *free-exercise-db* (github.com/yuhonas/free-exercise-db), released under the **Unlicense (public domain)** — attribution provided in-app (Settings → About → Licenses). No Hevy assets, trademarks, code, or copy are used; Kyro is an original implementation with an original design system. |
| Design 4.0 | Original iconography/branding; no confusion with existing apps ("Kyro" name + distinct emerald identity). |

**Review notes draft:** "Kyro is a personal workout logbook. All data is stored locally on device; there is no account, no server, and no third-party data sharing. Exercise database: free-exercise-db (public domain, credited in Settings → About). To test logging: Workout tab → Start Empty Workout → add an exercise → enter weight/reps → tap the checkmark → Finish."

## 6. Privacy nutrition label & policy

- **Data collection declaration:** with Sentry enabled → declare **Crash Data** and **Performance Data**, "not linked to identity," "not used for tracking" (Sentry configured with `sendDefaultPii: false`, no user identifiers, breadcrumbs stripped of content — `06` §9). Everything else: **Data Not Collected**.
- If we prefer the cleanest possible label ("Data Not Collected" across the board), ship v1.0 with Sentry **disabled by default** and a Settings opt-in; decision at M7 — default: keep Sentry on and declare crash data honestly (recommended; monitoring matters more than label vanity).
- **Privacy policy URL** (required field): one static page (GitHub Pages) stating: all fitness data stays on device; optional crash diagnostics via Sentry (anonymous); no sale/sharing; contact email.
- App Privacy "Data Deletion": N/A — no account; deleting the app deletes all data (say so in the policy).

## 7. Store listing assets

- **Name:** Kyro — Workout Tracker (check availability at submission). **Subtitle:** "Fast, private lifting log."
- **Icon:** per `07` §4 direction (emerald→teal gradient, K/plate monogram); 1024 px master; also iOS 18+ tinted/dark icon variants.
- **Screenshots** (required: 6.9" and 6.5" classes; generate via device-frame tool from real builds, dark theme primary): 1 logger mid-workout with timer pill, 2 exercise library detail, 3 per-exercise charts/records, 4 routine hub, 5 calendar/statistics, 6 measurements. Caption strip per shot, token-styled.
- **Description:** feature-focused copy (logging speed, 870+ exercise library, PRs, charts, 100% private/on-device, no subscription). **Keywords:** workout log, gym tracker, lifting, strength, routine planner, PR tracker.
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
- [ ] Privacy label + policy URL live and accurate w.r.t. Sentry decision.
- [ ] Permission strings present and minimal; export compliance flag set.
- [ ] Listing assets uploaded (icon, 2 screenshot sets, description, keywords, support URL).
- [ ] Review notes (incl. dataset licensing answer) attached.
- [ ] Sentry release created; EAS Update channel mapped to 1.0.0 runtime.
- [ ] Owner's data backed up before installing store build over dogfood build (container migrates, but belt-and-suspenders).
