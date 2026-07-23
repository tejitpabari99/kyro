# M6 Tasks — Polish, Hardening, Beta

Milestone spec: `../09-milestones-and-delivery.md` (M6). Exit = zero P0/P1, zero known P2; crash-free ≥ 99.5% over the beta window; full Maestro suite + full manual QA green; a11y signed off.

**Owner-gated boundary:** M6-01 … M6-08 are fully executable with no owner action — the complete app is testable on iOS Simulator / local dev build. Only **M6-09** (TestFlight beta) is `blocked-by-owner` (O-01…O-05). If owner accounts aren't ready, M6 closes on M6-01…08 evidence + local-build dogfood, and M6-09 runs as soon as accounts exist.

Task count: **9**

---

### M6-01 — Accessibility pass
**Description:** VoiceOver, Dynamic Type, Reduce Motion across core flows.
**How:** Per 07 §9 + 08 §7: VoiceOver through Maestro flows 1–3 scenarios manually — set row reads "Set 2, previous 45 kilograms times 9, weight field 45, reps field 9, completed" with actions toggle/set-type/delete; timer pill announces remaining time on focus and at 10 s; PR banner polite; calendar days read date + count. Dynamic Type: all text scales, set table clamps at 1.4× and PREVIOUS switches to stacked two-line at ≥ 1.2×; matrix 100/120/140% (+200% non-table screens). Reduce Motion: springs/slides → 150 ms fades; Reduce Transparency: scrims ~75% opaque. Fix all findings; add `maxFontSizeMultiplier` audit lint/check where feasible.
**References:** 07 §9, §8 (motion); 08 §7 (a11y pass).
**Dependencies:** all feature milestones (M2–M5 complete).
**Acceptance / test gate:** A11y checklist in `docs/qa/M6-a11y.md` signed off; RNTL accessibility-label tests for SetRow/TimerPill/PRBanner/calendar day.
**Est:** 2 d

### M6-02 — Visual QA sweep + motion/haptics tuning
**Description:** Screen-by-screen design-system conformance in both themes.
**How:** Sweep every screen dark + light on the simulator device matrix (owner's iPhone class, SE-class small, Dynamic Island class — 08 §7): token conformance (no raw hex — grep/lint), spacing/radii per 07 §4, typography incl. tabular numerals on every mutable number, empty states per 07 §10, sentence-case copy audit. Tune motion durations (150/250/350 ms per 07 §8) and haptic placements against the 07 §8 table. Log every deviation as P2/P3 and fix P2s.
**References:** 07 §2–§8, §10; 08 §7 (device matrix).
**Dependencies:** M2–M5 complete.
**Acceptance / test gate:** Sweep table committed (`docs/qa/M6-visual.md`); both-themes screenshot set archived for the store-asset task (M6-07).
**Est:** 2 d

### M6-03 — First-run experience + empty-state audit
**Description:** Onboarding-lite hints and coherent empty states everywhere.
**How:** First-run hints (no full onboarding): e.g. Workout tab pointer to Start/Routines, one-time rest-timer permission rationale already covered (M2-10) — keep hints dismissible, stored in kv-store flags. Audit every list/chart empty state exists per 07 §5 EmptyState + 07 §10 (one encouraging line + one CTA): routines hub, history, calendar day sheet, exercise tabs, measures, photos, records, charts ("No data yet" dashed baseline).
**References:** 09 M6 scope; 07 §5, §7, §10.
**Dependencies:** M2–M5 complete.
**Acceptance / test gate:** Fresh-install walkthrough shows hints once; every empty state RNTL-smoked; screenshots in the sweep doc.
**Est:** 1 d

### M6-04 — Performance audit + bundle size
**Description:** Final perf verification against all budgets.
**How:** Cold start < 1.5 s (06 §5.1 sequence: verify Sentry deferred past first frame, sounds lazy, dataset seed skipped on non-first runs); keypress-to-paint < 50 ms re-check; check-to-feedback < 100 ms; 60 fps: exercise list, history at 1000 workouts (M4-11 fixture), charts pan/tooltip; stats < 300 ms re-check. React DevTools re-render profiling on logger typing and dashboard. Bundle/app size: measure IPA-equivalent (expo export + asset sizes); confirm the M1-11 dataset decision still holds; trim dead deps.
**References:** 06 §8 (budget table), §5.1; 09 M6 scope; 03 §6.5.
**Dependencies:** M2–M5 complete.
**Acceptance / test gate:** All budget numbers recorded in `docs/qa/M6-perf.md`, each within budget or ticketed P1.
**Est:** 1.5 d

### M6-05 — Bug bash #1 (P0–P2 burn-down)
**Description:** Dedicated fix week for everything found in M6-01…04 plus backlog.
**How:** Triage the full bug list per 08 §8 severities ("wrong number anywhere" = P1). Fix all P0–P2; every fix lands with a regression test in the same PR (08 §2 policy, no exceptions). Re-run affected Maestro flows per fix batch.
**References:** 08 §8, §2; 09 M6 scope.
**Dependencies:** M6-01…M6-04.
**Acceptance / test gate:** Tracker shows zero open P0/P1 and zero known P2; regression tests merged; CI green.
**Est:** 2 d

### M6-06 — Full regression: Maestro suite + manual QA checklist
**Description:** Complete E2E + manual gate before any distribution.
**How:** Run all Maestro flows 1–7 (nightly config) green consecutively; execute the full 08 §7 manual checklist: device matrix, logging drill, backgrounding drill (simulator-feasible parts; physical parts flagged to O-09), data-integrity audit, perf spot-checks. Second bug pass on findings (same regression-test rule). This is the "release candidate on local build" moment — owner can run everything via simulator or `npx expo run:ios` on their own device **without any Apple Developer account** (free personal-team signing works for local installs).
**References:** 08 §6, §7; 09 M6 exit.
**Dependencies:** M6-05.
**Acceptance / test gate:** `docs/qa/M6-checklist.md` fully green; full Maestro run recorded; zero P0/P1/known-P2.
**Est:** 1.5 d

### M6-07 — App icon, screenshots, store copy (drafts for owner approval)
**Description:** Produce all launch creative as dev deliverables; owner approves in O-10.
**How:** Icon per 07 §4 direction: emerald→teal diagonal gradient, white geometric "K" with barbell-plate counterform; 1024 px master + iOS 18 tinted/dark variants; wire into app config. Screenshots per 10 §7: 6.9" + 6.5" classes from real simulator builds, dark theme primary — logger mid-workout with timer pill, exercise detail, charts/records, routine hub, calendar/statistics, measurements; token-styled caption strips. Copy: name "Kyro — Workout Tracker", subtitle "Fast, private lifting log.", feature-focused description, keyword list per 10 §7. Store all under `docs/store/`.
**References:** 10 §7; 07 §4.
**Dependencies:** M6-02 (visual sign-off first).
**Acceptance / test gate:** Assets committed; icon renders correctly on device/simulator home screen (all variants); owner approval requested (O-10) — approval gates M7-04 upload, not any dev work.
**Est:** 1.5 d

### M6-08 — Release engineering config (no accounts needed)
**Description:** Everything file-level for EAS/TestFlight, written and validated without owner credentials.
**How:** `eas.json` profiles per 10 §2: `development` (dev client, simulator + device internal), `preview` (ad hoc), `production` (auto-increment build number, Sentry sourcemap hook, EAS Update channel `production`). App config: permission strings **only** camera + photo library per 10 §3 (omit PhotoLibraryAdd), `ITSAppUsesNonExemptEncryption=false`, notification sounds bundled, no UIBackgroundModes. `release.yml` skeleton (tag-triggered: build → Maestro smoke → submit → Sentry release + sourcemaps) with credential steps parameterized on secrets that O-01…O-05 will provide. Runtime version policy `appVersion`. Validate config via `npx expo config` + `eas build --profile production --platform ios --local --dry-run`-style checks where possible without login.
**References:** 10 §2–3, §8; 08 §9 (release pipeline).
**Dependencies:** M6-06 (RC quality), M0-04 (CI patterns).
**Acceptance / test gate:** `expo config` resolves cleanly with all plugins; eas.json schema-valid; plist strings present and minimal; workflow file reviewed; nothing requires a login to merge.
**Est:** 1 d

### M6-09 — TestFlight internal beta + 2-week dogfood `[blocked-by-owner: O-01…O-05, O-08]`
**Description:** First cloud build, TestFlight distribution, Sentry-watched beta.
**How:** Once owner completes Apple Developer enrollment (O-01), bundle-id/app-record (O-02/O-03), Expo account (O-04), Sentry org + DSN (O-05): `eas init` link, `eas build --platform ios --profile production`, `eas submit` → TestFlight internal group (owner + friends per 10 §4); wire real Sentry DSN into the build + verify events arrive; activate `release.yml` with real secrets. Run the ≥ 2-week dogfood window (O-08): owner logs real workouts on the TestFlight build; watch Sentry release health + TestFlight feedback; each fix ships as a new build (version stays 1.0.0). Physical-device drills that the simulator couldn't cover (O-09): lock-screen rest-timer notification 10/10, device-restart resume.
**References:** 10 §1–2, §4; 09 M6 scope/exit; 08 §7 (backgrounding drill).
**Dependencies:** M6-08; **owner O-01…O-05**; runs alongside nothing — it is the last M6 item.
**Acceptance / test gate:** Crash-free ≥ 99.5% over the window; physical-device drills 10/10; all beta feedback triaged to zero P0/P1/known-P2; M6 tag.
**Est:** 1 d active dev (+ 2-week elapsed window)
