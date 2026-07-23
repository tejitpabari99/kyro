# 11 — Future Roadmap (Deferred Work)

Everything intentionally out of v1, with enough design detail that picking an item up later starts from a plan, not a blank page. Ordered by expected value to the owner.

## 1. Exercise animations/GIFs (first post-launch milestone candidate)

v1 ships the two-frame crossfade + placeholder tiers; the media slot contract (`03` §4) means this milestone is pure content + one column (`exercises.animation_uri`, already in schema).

Plan:
1. **Spike (1–2 days):** build-pipeline experiment converting free-exercise-db image pairs into eased 2-frame animated WebP (sharp/img2webp); judge quality on 20 staples. Zero licensing risk. If acceptable → ship for all built-ins, done.
2. If quality disappoints: **licensed GIF pack** for the owner's top ~100 exercises (evaluate vendors' redistribution terms for app bundling; one-time cost preferred) mapped by name+equipment into `overrides.json`; remaining exercises keep crossfade.
3. **wger media** (CC-BY-SA) only as a fallback: requires per-file attribution screen and share-alike legal comfort for bundled media — more process than value.
4. Optional: self-record the owner's staple lifts; drop-in via the same pipeline.

Delivery: assets bundled (size-check; move to on-demand download if > 50 MB added) + dataset version bump; media slot needs no code change beyond `expo-image` playback (already GIF/WebP-capable).

## 2. Cloud-sync extensions (core sync shipped in v1 — see `12`)

Single-user Supabase sync of saved data is **implemented in v1** (D9, spec `12`, milestone MC): outbox push on save, watermark pull on cold start, LWW + tombstones. What remains future:

- **Progress-photo cloud backup:** upload originals to Supabase Storage (1 GB free) through the same outbox mechanism (`12` §3 excludes photos in v1); pull-side download on restore. Alternative/parallel belt-and-braces: debounced upload of the `05` §9 backup zip to the owner's iCloud via `react-native-cloud-storage` (research §2.7) — zero backend, all-or-nothing granularity.
- **Second-device polish (iPad/new phone):** the machinery already works (fresh install + sign-in + pull = full restore, `12` §8); polish items are live-ish freshness (pull on foreground, shorter throttle), a first-run "Restore from cloud?" prompt instead of the silent pull, and conflict soak-testing with two devices genuinely alternating.
- **E2E encryption** if the trust model ever changes (client-side encryption before push; costs queryability in Studio).
- **Provider exit:** Cloudflare Workers + D1 is the researched runner-up if Supabase's free tier degrades (research §3); the outbox/pull design ports — D1 is SQLite, so the mirror schema gets *simpler*.

## 3. Apple Health integration

Most-likely first integration (owner already excluded it from v1 deliberately).
- Write: completed workouts as HKWorkout (traditional strength training) with duration + estimated energy off; body mass from measurements.
- Read: body weight (prefill measurement entries), optionally heart rate overlay post-Watch (see §4).
- Implementation: `@kingstinct/react-native-healthkit` or a thin custom module; all behind `lib/health.ts`; settings toggles per stream; privacy label update (Health data category) + `NSHealthShareUsageDescription`/`NSHealthUpdateUsageDescription`.
- Effort: small (1 milestone-week); sync is settled (v1, `12`), so the only ordering note left: HealthKit writes happen on workout finish alongside the sync enqueue — one more decorator on the same seam.

## 4. Apple Watch app

Large effort; requires leaving pure-Expo comfort (WatchOS target = native SwiftUI + a bridge, e.g. `@bacons/apple-targets` or bare workflow module).
- v1 scope if built: mirror of the active workout — current exercise/set, previous values, check set, rest countdown with haptics; heart-rate capture attached to the workout.
- Data path: WatchConnectivity messages into the activeWorkoutStore's action set (same mutators — the store API becomes the sync protocol).
- Recommendation: only after Live Activities (§6) prove insufficient at the gym.

## 5. Android release

Codebase is portable by guardrail (`06` §10). The work is: QA pass on Android hardware (keyboard accessory behavior, notification channels + exact-alarm timing for rest timers, back-gesture handling, FlashList perf), design adjustments (Material ripple? no — keep Kyro identity, adjust status/navigation bar treatment), Play Console setup (privacy data safety form, closed testing track — note Play's 12-tester/14-day requirement for personal accounts), EAS Android profiles. Estimate: 2–3 focused weeks. Trigger: owner switches phone or wants to share the app.

## 6. Widgets & Live Activities

- **Live Activity + Dynamic Island for rest timer/active workout** (P14 deferral): highest gym value of this group. Requires a native widget-extension target (`@bacons/apple-targets` config plugin or prebuilt module like `expo-live-activity`) + `NSSupportsLiveActivities`; content: current exercise, set x of y, rest countdown (native timer text — survives app suspension), optional check-set intent (App Intents). Design tokens have dark/light lock-screen variants.
- **Home-screen widgets** (WidgetKit): week streak + last workouts; "start routine" deep links (expo-router URLs already exist); data via App Group shared file the app writes on each save.
- Sequence: Live Activity first; widgets after sync/backup stabilizes the write points.

## 7. Smaller backlog

- **Strong-CSV import** (Hevy supports it; same importer skeleton, different column map).
- **Monthly report / Year in Review** generated summary screens (pure derived data; fun December project).
- **Exercise merge tool** — merge an imported auto-created custom exercise into a built-in (re-point workout_exercises, recompute records; import report links here — `05` §7.2).
- **Undo system** beyond snackbars (command-pattern over repository mutators).
- **Advanced stats:** per-muscle weekly volume targets, rep-range distribution, RPE trends, estimated-1RM overlays across exercises.
- **Routine scheduling** (day-of-week plan + reminder notifications; pairs with the day-of-week widget).
- **iPad layout** (multi-column: library + detail; logger unchanged).
- **App lock** (FaceID via `expo-local-authentication`) if the device is ever shared.
- **iCloud photo/backup automation** (see §2 — secondary backup-zip upload option).

## 8. Explicit never-list (re-affirmed)

Social feed/friends/likes/comments, community routine marketplace, AI coach/chat, paywall/subscriptions, ads, analytics beyond crash reporting. These are contrary to the product's reason for existing (`01` §1).
