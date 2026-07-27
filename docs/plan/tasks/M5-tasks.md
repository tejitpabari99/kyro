# M5 Tasks — Measurements, Settings Completion, Import/Export

Milestone spec: `../09-milestones-and-delivery.md` (M5). Exit = CSV suite incl. golden files + both round-trips green; Maestro flow 5 green; owner's history imported (0 dropped rows, PRs sane, Hevy spot-check — G4); backup → wipe → restore drill passes.

Owner input note: M5-11 (real-data migration audit) needs the owner's actual Hevy CSV export (O-07). It is the **only** owner-gated task here and blocks nothing downstream — all import development and tests run on the synthetic/anonymized fixture from M5-07. If the owner file isn't available at milestone close, M5 exits on the fixture evidence and M5-11 rolls forward into M6's beta window.

Task count: **11**

---

### M5-01 — MeasurementRepository + integration suite [done]
**Description:** Date-keyed measurement storage with merge-upsert and series queries.
**How:** Per 05 §6/§3.4: `upsert(date, fields)` merges non-null fields into the `'YYYY-MM-DD'`-keyed row; `clearField(date, field)` explicit per-field clear; empty rows (all fields null, no photos) removed; `list(range?)`, `series(field, range)` (sorted points, gaps preserved), `addPhoto(date, sourceUri)` (creates the measurement row if absent — FK), `photos(range?)`, `deletePhoto` (removes file too). Canonical units kg/cm; conversion at boundary via M1-02.
**References:** 05 §3.4, §6, §8; 04 §6.1.
**Dependencies:** M1-01, M1-09 (lib/files).
**Acceptance / test gate:** Integration: two same-date saves merge (second weight keeps earlier waist — 04 §6 acceptance); clearField; last-field+photos deletion removes entry; series with sparse data; photo file lifecycle.
**Est:** 1 d

### M5-02 — Measures home, log entry, detail charts `[done]`
**Description:** The measurement UI surface.
**How:** Measures home (Profile → Measures): list of the 17 measurement types with latest value + delta vs previous + 90-day `Sparkline`; `+` FAB → log entry sheet: date picker (default today), all 17 optional numeric fields unit-labeled per body-measurement unit setting (metric kg/cm | imperial lb/in — independent from workout units), photo attach section (M5-03), Save (upsert). Detail per measurement: `LineChart` 3M/1Y/All + reverse-chron entries, edit/delete (delete = clearField). Charts connect existing points only — no interpolation/zero-fill.
**References:** 04 §6.1; 05 §5 (cm↔in, kg↔lb); 07 §7.
**Dependencies:** M5-01, M4-07 (charts).
**Acceptance / test gate:** 04 §6 acceptance: imperial entry stores canonical exactly and round-trips display; sparse-data charts render correctly; RNTL smoke both themes; unit-setting independence verified.
**Est:** 1.5 d

### M5-03 — Progress photos: gallery, compare, orphan sweep `[done]`
**Description:** Photo capture/storage, gallery grid, side-by-side compare, and the startup orphan sweep.
**How:** Camera/library via expo-image-picker; re-encode ≤ 2048 px q80 (expo-image-manipulator) to `photos/progress/{uuid}.jpg` (relative names in DB). Gallery: Photos tab within Measures, grid by date; tap → full-screen pager with date + that date's weight overlay. Compare: select two → side-by-side with dates + weight/measurement deltas. Delete with confirm. Orphan sweep on app start (05 §8): files without rows → delete; rows without files → placeholder + warning log. Photos excluded from CSV; included in backup (M5-09).
**References:** 04 §6.2; 05 §8.
**Dependencies:** M5-01.
**Acceptance / test gate:** 04 §6 acceptance: photos persist across app updates (relative-path storage verified); compare renders deltas; orphan sweep integration test (both directions) — runs without measurable boot cost.
**Est:** 1.5 d

### M5-04 — Settings surface completion + About/licenses `[done]`
**Description:** All remaining settings groups per 04 §7.
**How:** General: first day of week (monday/sunday/saturday) with **recompute hooks** — invalidate streaks/stats queries on change; weekly workout goal (feeds M4-08 goal line); theme already done. Notifications: rest-timer notifications toggle (`rest_notifications_enabled`). Data group: entries wiring to M5-06/07/09. About: version, licenses (free-exercise-db credit + OSS licenses), Sentry toggle (`sentry_enabled`), "Export diagnostics" (logger ring buffer from M0-11 via share sheet). Profile tab completion: avatar/name vanity, workout count + streak, shortcut cards (Statistics · Exercises/Archived · Measures · Calendar), recent workouts (3).
**References:** 04 §7; 06 §9 (diagnostics); 10 §5 (license credit).
**Dependencies:** M0-10, M4-06/08 (recompute targets), M0-11.
**Acceptance / test gate:** 04 §7 acceptance: every setting persists + applies without restart; first-day change re-buckets calendar/stats (integration); Maestro flow 6 covers the sweep in M5-10.
**Est:** 1.5 d

### M5-05 — domain/csv-codec.ts: export encoding + golden files `[done]`
**Description:** The RFC-4180 CSV writer producing Hevy's exact 14-column schema.
**How:** Dependency-free `lib/csv.ts` writer + `domain/csv-codec.ts` encode: exact column order per 05 §7.1; unit-dependent headers (`weight_kg`↔`weight_lbs`, `distance_km`↔`distance_miles`) with converted values (weight ≤ 2 decimals, distance 2); one row per set, completed workouts only, ordered start_time → exercise position → set position; `set_index` 0-based; dates `d MMM yyyy, HH:mm` English month abbreviations, **local time**; empty string nulls; all fields double-quoted; embedded quotes doubled; UTF-8 `\n`; custom_metric NOT exported.
**References:** 05 §7.1; 00 P11; 08 §4.6.
**Dependencies:** M1-02, M2-01 (data shapes).
**Acceptance / test gate:** Golden-file tests: fixture DB → byte-exact expected CSV, kg AND lbs variants; quote/comma/newline escaping cases; date formatting incl. single-digit days.
**Est:** 1 d

### M5-06 — CSV export UI (all + single workout) `[done]`
**Description:** `CsvService.exportAll/exportWorkout` + share-sheet surfaces.
**How:** Settings → Data → Export CSV → writes `kyro_workouts.csv` to cache, opens iOS share sheet (expo-sharing); single-workout export from workout detail ⋯ (un-hide the M4-04 menu item). Export uses current unit settings for headers/values.
**References:** 05 §7.1 (surfaces); 04 §3.1 (detail menu).
**Dependencies:** M5-05, M4-04.
**Acceptance / test gate:** Integration: exportAll on fixture DB matches golden file; single-workout export contains only that workout; share sheet invoked (mock).
**Est:** 0.5 d

### M5-07 — Hevy CSV import: parser, matching, preview, report `[done]`
**Description:** The import pipeline with preview screen.
**How:** `importHevy(fileUri)` per 05 §7.2: parse (RFC 4180 reader in `lib/csv.ts`); accept metric and imperial headers → canonical; group by (title, start_time); parse Hevy date format + ISO 8601 defensively; exercise matching — exact case-insensitive vs library incl. aliases, else auto-create **custom** with type inferred from populated columns (weight+reps → weight_reps; reps → reps_only; duration → duration; weight+duration → weight_duration; distance+duration → distance_duration; weight+distance → short_distance_weight), flagged in report; set_type 1:1, unknown → normal + warning; out-of-enum RPE → nearest valid + warning; duplicate (title+start_time exists) → skip + count; malformed row → skip with line number; all-or-nothing per workout; transactional batches; bulk records invalidation after. UI: `import/hevy` modal — document picker → preview (workouts found, date range, matched/unmatched exercises, skipped rows + reasons) → confirm → report screen. **Fixture:** build an anonymized Hevy-format fixture now from the research doc's documented schema (research §CSV) so tests never wait on the owner file; swap in the owner's trimmed export when O-07 delivers.
**References:** 05 §7.2, §7.4; 06 §3 (route); 08 §4.6; research/hevy-deep-dive.md (CSV shape).
**Dependencies:** M5-05, M4-02 (invalidation), M1-06 (matching/create).
**Acceptance / test gate:** 08 §4.6 import cases: sample-fixture counts/supersets/RPE/set types correct; imperial-header conversion; one fixture per type-inference rule; duplicate skipped; malformed row line-numbered; custom-name re-link (7.4).
**Est:** 2 d

### M5-08 — CSV round-trip tests + import performance `[done]`
**Description:** The two round-trip contracts and the bulk-import budget.
**How:** Automated tests per 05 §7.3: `import(export(db))` → 0 new rows (all duplicates skipped); `export(import(hevy.csv))` semantically equal to source (canonical-unit comparison). Superset ids survive the round-trip (02 §8 acceptance). Perf: import 1000-workout synthetic CSV (M4-11 generator → CSV via M5-05) < 10 s, single-transaction batches, UI-thread-free in the integration harness (08 §4.9).
**References:** 05 §7.3; 08 §4.6, §4.9.
**Dependencies:** M5-06, M5-07, M4-11.
**Acceptance / test gate:** Both round-trip tests green in CI; timed import test < 10 s on the node harness with the number recorded.
**Est:** 1 d

### M5-09 — Backup & restore (zip) + reminder
**Description:** Full-fidelity backup beyond CSV.
**How:** `BackupService.export()`: `kyro_backup_{date}.zip` = `db.json` (schema-versioned full logical dump of all tables) + `photos/` tree; share-sheet destination. `restore(fileUri)`: validate version (migrate logical dump forward if older), **replace-all with double confirm** ("This replaces all current data"), then orphan sweep + full query/cache invalidation. Settings → Data surfaces both. Monthly backup-reminder toggle (local notification; default flips on post-launch per 10 §9 — default off for now, M7-06 flips). Record `last_backup_at` in app_meta.
**References:** 05 §9; 10 §9; 06 §9 (migration-failure guidance references backup).
**Dependencies:** M5-01/03 (photos), M2-01, M3-01 (all tables exist), M5-07 (shared validation patterns).
**Acceptance / test gate:** Integration: export → wipe DB+files → restore → deep-equal logical state incl. photos; older-version dump migrates forward; double-confirm flow (RNTL). Manual backup→wipe simulator→restore drill recorded (08 §7).
**Est:** 1.5 d

### M5-10 — Maestro flows 5 & 6 + M5 QA & exit gate
**Description:** E2E for import + settings sweep, and milestone close.
**How:** Flow 5: import bundled fixture CSV via mocked picker → preview counts → confirm → history populated, PRs visible. Flow 6: units kg→lb (logger values convert), theme dark→light, RPE on (column appears), first-day-of-week (calendar shifts). Data-integrity audit (08 §7): export CSV → diff vs in-app history for 10 random fixture workouts. Fix P0/P1 + regression tests; `docs/qa/M5-checklist.md`; tag.
**References:** 08 §6 flows 5–6, §7; 09 M5 exit.
**Dependencies:** M5-04, M5-07, M5-08, M5-09.
**Acceptance / test gate:** Flows 5 & 6 green; CSV suite green in CI; backup drill evidenced; zero P0/P1; checklist + tag.
**Est:** 1 d

### M5-11 — Owner-data migration audit `[blocked-by-owner: O-07]`
**Description:** Import the owner's real full Hevy export and audit it (G4).
**How:** Receive the owner's export (O-07). Import on a clean build; verify: 0 dropped rows (report), workout/set counts vs Hevy, supersets/RPE/set types spot-check on 10 workouts vs Hevy's display, PRs sane (records tab vs owner's known PRs), unmatched-exercise list reviewed (auto-created customs re-typed via edit where inference guessed wrong). Trim + anonymize a slice into the permanent test fixture (replacing/augmenting the synthetic one from M5-07). Findings → bugs with regression tests.
**References:** 09 M5 exit (G4); 01 §6.2; 08 §4.6 (fixture note), §7.
**Dependencies:** M5-07, M5-08; **owner input O-07** (does not block M6 dev tasks — only the G4 exit evidence).
**Acceptance / test gate:** Audit table committed to `docs/qa/M5-owner-import.md`: 0 dropped rows, spot-check pass, PR sanity pass.
**Est:** 0.5 d (+ owner time)
