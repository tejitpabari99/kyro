# M4 Tasks — History, Calendar, Statistics, PRs

Milestone spec: `../09-milestones-and-delivery.md` (M4). Exit = full PR suite 08 §4.1 (13 named cases) green — **hard gate**; edit/delete recompute acceptance passes; stats < 300 ms on 5-year fixture; history 60 fps at 1000 workouts. May partially overlap M3 (M4-01/02/06/07 have no M3 dependency).

No owner tasks gate M4.

Task count: **12**

---

### M4-01 — domain/records.ts + epley.ts: PR computation engine [done]
**Description:** The highest-risk pure logic: all record types, set records, trophy attribution, live-check evaluator.
**How:** `domain/epley.ts`: `1RM = w × (1 + reps/30)`, only 1 ≤ reps ≤ 10, reps=1 → w (P5). `domain/records.ts` over `HistoricalSet[]`: record types per 04 §5.1 (Heaviest Weight, Best Est. 1RM, Best Set Volume, Most Reps, Longest Duration, Set Records per rep count 1–10 + "10+" bucket); eligibility — checked non-warm-up only, failure/dropset eligible, weight 0 excluded from weight records, reps/duration 0 excluded everywhere; bodyweight uses **added** weight, assisted excluded from Heaviest/volume records (least-assistance informational min); strictly-greater beats, kg comparisons with 0.001 tolerance. Trophy attribution: set holds trophy for type R iff it strictly beats best of R among all **earlier** sets (workout start_time, then set order) — 04 §5.2. Live-check evaluator: baseline = completed history + current session's already-checked sets (04 §5.5); uncheck removes contribution.
**References:** 04 §5.1–5.3, §5.5; 00 P5/P10; 05 §1 (derived, never stored).
**Dependencies:** M0-03 (fixtures/builders), M1-02.
**Acceptance / test gate:** **All 13 named cases of 08 §4.1 green** — this task owns them: (1) single-history values, (2) warm-up never beats, (3) failure/dropset eligible, (4) strict-greater, (5) Epley bounds, (6) set-record buckets, (7) kg tolerance, (8) trophy attribution sequence + edit reflow, (9) delete → next-best, (10) live-check in-session baseline, (11) bodyweight/assisted/reps-only, (12) duration type, (13) uncheck/re-check/finish-unchecked.
**Est:** 2 d

### M4-02 — RecordsService: cache, queries, invalidation helper
**Description:** Query-layer wrapper making PRs cheap everywhere.
**How:** `setsForExercise(exerciseId)` repo feed (05 §6) + memoized per-exercise cache keyed by `updated_at` watermark (06 §4.4); exposed via TanStack Query `['records', exerciseId]`. Central `invalidateAfterWorkoutMutation(exerciseIds)` helper invalidating records + history + stats + calendar keys — used by finish/edit/delete/import (06 §4). Live PR check runs synchronously against cached baseline + session sets, no DB hit per check.
**References:** 06 §4.4; 04 §5.6; 05 §4 (query notes).
**Dependencies:** M4-01, M2-02.
**Acceptance / test gate:** Integration: create/edit/delete a workout → affected exercise caches invalidated (union of old+new ids on edit, 08 §4.9); watermark cache hit/miss unit tests; live check does not touch the driver (spy).
**Est:** 1 d

### M4-03 — History tab: cards + pagination
**Description:** Replace M2's minimal list with the real History tab.
**How:** Per 04 §3.1: FlashList + paged Query (20/page, `listCompleted({before,limit})`), card = title, relative date ("Yesterday", "Tue, 15 Jul"), stats strip Duration · Volume · 🏆 N PRs (omit at 0; N = count of (set, record-type) awards from RecordsService), exercise summary lines "3 × Bench Press (Barbell) — best 80kg × 8". Header: Calendar icon → M4-06; `+` menu → Log past workout (M4-05). Summary rows computed in the page query, cached by Query (06 §8).
**References:** 04 §3.1; 06 §8 (history perf).
**Dependencies:** M4-02, M2-14.
**Acceptance / test gate:** Cards show accurate volume/PR counts (integration with records fixtures); pagination loads correctly; deleting a workout updates the list immediately (04 §3 acceptance). 60 fps validation deferred to M4-11 fixture.
**Est:** 1 d

### M4-04 — Workout detail: full read-only view with trophies
**Description:** Complete `workout/[id]` detail per 04 §3.1.
**How:** Read-only logger layout: meta stats, exercise cards with all sets (type badges, values, RPE), **trophy icon on record-defining sets** (accent.text glyph per 07 §6, record-type label on tap), notes, "(deleted routine)" handling. ⋯ menu: Edit Workout (M4-05) / Repeat Workout (M3-07) / Save as Routine (M3-07) / Export CSV single (arrives M5-06 — hide until then) / Delete (confirm → soft delete → recompute via M4-02).
**References:** 04 §3.1, §5.4; 02 §15; 07 §6.
**Dependencies:** M4-02, M3-07.
**Acceptance / test gate:** Trophy badges match domain attribution on a fixture history (RNTL + integration); delete recomputes list/calendar/records; both-themes smoke.
**Est:** 1 d

### M4-05 — Edit past workout + retro-logging entry points
**Description:** Full edit flow with recompute, and the two retro-log entry points.
**How:** `workout/[id]/edit` modal reopening the full logger against the saved workout: all sets checked, no stopwatch, no rest timers, everything editable; Save = repo `update(id, full)` replace-content + `updated_at` bump + invalidate union of old+new exercise ids (08 §4.9). Editing while another workout is active is allowed (separate modal; active untouched; must not violate one-active invariant — the edited workout stays `completed`). Retro entry points: Calendar day → "Log past workout" (M4-06 wiring) and History `+` → same; both open the logger in retro mode (M2-05: start_time = chosen date 12:00, stopwatch paused at 0).
**References:** 02 §15, §1 (retro); 04 §5.6; 08 §4.9.
**Dependencies:** M4-02, M2-05.
**Acceptance / test gate:** 02 §15 acceptance: raising an old weight above current PR moves the trophy (charts update once M4-09 lands); deleting PR-holder reassigns next-best; edit cannot corrupt one-active invariant (integration test). Retro workout lands on the chosen day.
**Est:** 1.5 d

### M4-06 — domain/streaks.ts + calendar screen
**Description:** Streak math and the month-pager calendar.
**How:** `domain/streaks.ts`: consecutive calendar weeks with ≥ 1 completed workout, respecting first-day-of-week (monday/sunday/saturday), counting back from current week; current week counts if it has a workout **or is still in progress** (shows but doesn't break until the week ends workoutless); midnight-crossing workouts belong to start_time's day (02 §16.3). `CalendarMonth` primitive (custom grid, 07 §5): swipe/chevron month pager, accent dot/fill on workout days, today outlined, ×2 badge on multi-workout days; day tap → sheet listing that day's workouts (tap-through) + "Log past workout" on empty days. Streak header "🔥 N-week streak". Data via `workoutDates(range)`.
**References:** 04 §3.2; 02 §16.3; 08 §4.8 (streak cases); 05 §6.
**Dependencies:** M4-03 (nav), M2-01 (workoutDates).
**Acceptance / test gate:** 08 §4.8 streak suite: consecutive weeks, first-day variants, current-week grace, gap breaks, midnight-crossing. UI: deleting a workout updates dots + streak immediately; first-day change re-buckets (recompute hook verified again in M5-04).
**Est:** 1.5 d

### M4-07 — Chart wrappers (`ui/charts/`)
**Description:** Victory Native XL wrappers so features never import victory directly.
**How:** Install `victory-native` 41+ (Skia + Reanimated). Build `LineChart`, `BarChart`, `StackedBarChart`, `Sparkline` in `src/ui/charts/` consuming tokens per 07 §7: 2 pt accent line, gradient fill 20%→0%, selection-only dots + tooltip card (bg.elevated, statSmall value + caption date), ≤ 4 dashed y-gridlines, no x-gridlines, caption axes; bars radius-top 3, muted variant accent @ 30%, dashed goal line; stacked bars superset-palette + teal, top-8 + Other; sparkline 1.5 pt no axes; empty state dashed baseline + "No data yet". Range `SegmentedControl` slot in card header.
**References:** 06 §7; 07 §7; 00 P4.
**Dependencies:** M0-05.
**Acceptance / test gate:** RNTL smoke both themes for all four; tooltip interaction test; gap handling — line connects existing points, no zero-fill (04 §6 chart rule, applies globally).
**Est:** 1.5 d

### M4-08 — domain/stats-buckets.ts + statsFeed + statistics dashboard
**Description:** Dashboard aggregation logic and the Profile → Statistics screen.
**How:** Repo `statsFeed(range)`: single ranged query of `(start_time, exercise_id, primary_muscle_group, set fields)` — no N+1 (05 §4). `domain/stats-buckets.ts`: weekly buckets respecting first-day-of-week; monthly switch when range = All and span > 2 y; volume per P7 (reuse M2-04); warm-up inclusion per setting; muscle distribution — primary counts 1, secondaries 0.5 each, ranges 7D/30D/3M/1Y/All. Dashboard (`profile/statistics`): summary tiles (total workouts, volume, time, current streak) + 4 chart cards per 04 §4.1 — workouts/week bars with optional goal line (weekly_goal setting; goal-met accent vs muted), aggregate trend (Duration|Volume|Reps switcher), muscle distribution horizontal bars, sets-per-muscle-group stacked weekly (top-8 + Other). Ranges 3M/1Y/All. Query-cached per range.
**References:** 04 §4.1–4.2; 05 §4, §6; 08 §4.8 (bucketing cases).
**Dependencies:** M4-07, M2-04, M4-06 (streak tile).
**Acceptance / test gate:** 08 §4.8 bucketing suite: week boundaries, All-range monthly switch; 04 §4 acceptance: bodyweight +10×8 → 80 kg volume, assisted/reps-only → 0; warm-up toggle flips dashboard live but never Records; first-day switch re-buckets. Perf budget verified in M4-11.
**Est:** 2 d

### M4-09 — Per-exercise charts + exercise-detail tabs go live
**Description:** Fill the History/Charts/Records tabs stubbed in M1-08.
**How:** History tab: reverse-chron performances — workout title + date + set lines (`1 · 80kg × 8 @9`, W badge), tap → workout detail, infinite scroll 20/page. Charts tab: metric selector per type (04 §4.3 — rep/weight: Heaviest, Est 1RM, Best Set Volume, Session Volume, Total Reps; duration: Longest/Total Duration (+Heaviest for weighted); cardio: Total Distance, Total Duration, Best Pace min/km|mi; short_distance_weight: Heaviest, Total Distance); one point per workout date; tooltip; ranges 3M/1Y/All. Records tab: PR cards (value + date + link to workout) + **Set Records table** (1–10, "10+" bucket, best weight + date); assisted shows least-assistance info line. Unit settings + warm-up exclusion respected everywhere.
**References:** 03 §3; 04 §4.3, §5.1, §5.4.
**Dependencies:** M4-01/02, M4-07, M1-08.
**Acceptance / test gate:** 03 §3 acceptance: all four tabs identical for built-in and custom; charts respect units + warm-up rules; set-records table matches domain fixtures; detail-as-sheet mid-workout doesn't disturb active workout.
**Est:** 2 d

### M4-10 — Live PR banner + records earned + remaining PR surfaces
**Description:** Wire the live evaluator into logging and finish.
**How:** Replace M2's no-op hooks: on check, run the live evaluator (M4-01/02) — beaten record → `PRBanner` (07 §5): top toast, bg.surface + accent border-left, trophy icon, combined types in one banner ("Heaviest Weight PR — 102.5 kg"), auto-dismiss 3 s, `notificationSuccess` haptic, announced politely (a11y); setting-gated (`live_pr_banner`, default on). Uncheck removes contribution; duplicate equal value → no banner. Finish/save screen: "Records earned" trophy rows from post-save evaluation (M2-14 slot). History cards PR counts (M4-03) and detail trophies (M4-04) verified against the same engine.
**References:** 04 §5.4–5.5; 02 §14; 07 §5; 08 §4.1 cases 10/13.
**Dependencies:** M4-02, M2-07, M2-14.
**Acceptance / test gate:** 04 §5 acceptance: 102.5 over 100 banners + appears post-save; second identical set no banner; uncheck/re-check re-banners; finish-with-unchecked persists no record. RNTL banner behavior; integration through store.
**Est:** 1 d

### M4-11 — Synthetic fixtures + performance budgets
**Description:** Big-data fixtures and the perf gates.
**How:** Fixture generator in `src/test/fixtures/`: 5-year history (~1000+ workouts, realistic exercise spread) — loadable into the app DB via a dev-only route/script (also reused by M5 import perf + 08 §7 spot-checks). Measure: all stats ranges < 300 ms compute; history scroll 60 fps at 1000 workouts (FlashList config tuning if needed); records computation per exercise acceptable (low-thousands rows, 05 §4). Profile re-renders on dashboard range switches.
**References:** 09 M4 exit; 05 §4; 06 §8; 08 §7.
**Dependencies:** M4-03, M4-08, M4-09.
**Acceptance / test gate:** Automated timing test (node) for bucketing/records on the fixture; manual scroll + range-switch numbers recorded in the M4 checklist.
**Est:** 1 d

### M4-12 — Maestro flow 4 + M4 QA & exit gate
**Description:** Custom-exercise lifecycle E2E and milestone close.
**How:** Maestro flow 4: create custom (bodyweight_reps) → log it → detail shows history/records → delete → archive path → still renders in history. Manual QA: edit/delete recompute acceptance (02 §15, 04 §5.6) both themes; full 04 §3–5 acceptance sweep. Fix P0/P1 + regression tests; `docs/qa/M4-checklist.md`; tag.
**References:** 08 §6 flow 4; 09 M4 exit.
**Dependencies:** all M4 tasks.
**Acceptance / test gate:** **08 §4.1 suite green in CI (hard gate)**; flow 4 green; perf numbers meet budgets; zero P0/P1; checklist + tag.
**Est:** 1 d
