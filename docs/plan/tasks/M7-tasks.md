# M7 Tasks — App Store Launch

Milestone spec: `../09-milestones-and-delivery.md` (M7) + `../10-app-store-launch.md`. Exit = approved & live; owner running the store build daily; 01 §6 success criteria all true.

**Owner-gated boundary:** M7-01 … M7-03 are dev-executable with no owner action. M7-04 … M7-06 are `blocked-by-owner` (they require the owner's Apple Developer / App Store Connect access and decisions) and are deliberately the last tasks in the whole plan.

Task count: **6**

---

### M7-01 — Privacy policy page + privacy label prep
**Description:** The static policy site content and the nutrition-label answers, ready to paste.
**How:** Author the policy page (single static page for GitHub Pages or equivalent) per 10 §6: fitness data is stored on device and backed up to a private database controlled solely by the developer/owner (Supabase, TLS in transit, encrypted at rest); no third-party access, sale, or sharing; optional anonymous crash diagnostics via Sentry; contact email; data deletion = delete the app for on-device data, owner deletes cloud copies via the Supabase dashboard. Prepare the App Privacy label worksheet per 10 §6: Health & Fitness (Fitness + Health) and Contact Info (email) collected, linked to identity, not for tracking, App Functionality — mandatory either way; plus the Sentry rows (Crash + Performance Data, not linked) for posture (a) Sentry on vs omitted for (b) Sentry off. The a/b decision is the owner's (O-10c); default recommendation per 10 §6 is (a). Publish under the repo's Pages if dev has repo admin; otherwise hand the ready-to-publish content to O-11.
**References:** 10 §6; 06 §9 (Sentry data posture).
**Dependencies:** M6-09 (beta posture known) — content authoring can start any time after M6-08.
**Acceptance / test gate:** Policy content committed (`docs/store/privacy-policy.md`); label worksheet for both postures committed; URL live or handed off (O-11).
**Est:** 0.5 d

### M7-02 — Listing metadata, review notes, versioning & changelog
**Description:** Every text/metadata artifact for submission, finalized.
**How:** Finalize from M6-07 drafts: description, keywords, subtitle, support URL (policy site). Review notes verbatim base from 10 §5 incl. the prepared free-exercise-db licensing answer and the "how to test logging" walkthrough. Set marketing version 1.0.0; write `CHANGELOG.md`; confirm version/tag conventions (10 §8: store submissions `v1.0.0`, OTA `v1.0.1-ota.1`). Add the owner's pre-update backup habit note to the repo README (10 §9).
**References:** 10 §5, §7, §8, §9.
**Dependencies:** M6-07.
**Acceptance / test gate:** All texts committed under `docs/store/`; review-notes file includes the licensing answer; version fields set in app config.
**Est:** 0.5 d

### M7-03 — Release pipeline finalization
**Description:** `release.yml` completed end-to-end (tag → build → smoke → submit → monitoring).
**How:** Finish the M6-08 skeleton: tag-triggered EAS production build → Maestro smoke against the artifact where feasible → `eas submit` → Sentry release creation + sourcemap upload (P13); EAS Update channel `production` mapped with runtime policy `appVersion`; secrets documented (names only) for the owner-provided credentials. Dry-run everything that doesn't need credentials; the first real run happens in M7-04.
**References:** 08 §9 (release.yml); 10 §2, §8–9.
**Dependencies:** M6-08, M6-09 (secrets exist once owner done).
**Acceptance / test gate:** Workflow reviewed + lints; local dry-run of each scripted step; secret checklist committed.
**Est:** 0.5 d

### M7-04 — Production build + App Store submission `[blocked-by-owner: O-02, O-03, O-10, O-11]`
**Description:** The actual 1.0.0 store submission.
**How:** With owner approvals in hand (assets O-10, privacy label decision O-10, policy URL live O-11): verify bundle id + app record (O-02/O-03); upload listing assets (icon, 2 screenshot sets, description, keywords, support URL); enter privacy label; attach review notes; run the 10 §10 launch checklist top to bottom (incl. owner data backup before installing store build — belt-and-suspenders); trigger `release.yml` on tag `v1.0.0` → production build → full Maestro + manual QA **on the TestFlight store binary, not dev client** → submit for review. Optional external TestFlight group first (triggers Beta App Review) per owner preference.
**References:** 10 §4–5, §10; 09 M7 scope.
**Dependencies:** M7-01, M7-02, M7-03; owner O-02/O-03/O-10/O-11.
**Acceptance / test gate:** Every 10 §10 checklist box ticked; submission in "Waiting for Review".
**Est:** 1 d

### M7-05 — Review feedback iteration → approval `[blocked-by-owner: Apple review cycle]`
**Description:** Respond to App Review until approved.
**How:** Monitor review status; for rejections: metadata issues → fix in Connect and resubmit; binary issues → fix (regression test per 08 §2), new build via release pipeline, resubmit; use the prepared licensing/review-notes answers for 1.1.6/5.1.3 questions. Expedited review only for genuine emergencies (10 §9).
**References:** 10 §5; 08 §8 (P2 blocks submission — keep bar).
**Dependencies:** M7-04.
**Acceptance / test gate:** App approved and live on the App Store; owner installs the store build.
**Est:** 0.5–1 d (elapsed time Apple-dependent)

### M7-06 — Post-launch operations setup `[blocked-by-owner: O-05 access]`
**Description:** Monitoring, OTA path, and data-safety defaults for life after launch.
**How:** Sentry release health for 1.0.0 (sessions, crash-free ≥ 99.5%, alert email on new crash signature); verify sourcemaps symbolicate; EAS Update channel mapped to the 1.0.0 runtime — push a trivial OTA to prove the hotfix path (10 §9 same-day JS fix drill); flip backup-reminder default on (M5-09 toggle); tag `v1.0.0`; confirm 01 §6 success criteria list with the owner (the real test: owner logs exclusively in Kyro). Roadmap intake: new ideas → `11-future-roadmap.md` (cloud sync shipped in MC; its extensions — photo backup, second-device polish — live in `11` §2).
**References:** 10 §9; 09 M7 exit; 01 §6; 05 §9.
**Dependencies:** M7-05.
**Acceptance / test gate:** OTA drill succeeded; Sentry alerting verified with a test event; success-criteria review recorded in `docs/qa/M7-launch.md`.
**Est:** 0.5 d
