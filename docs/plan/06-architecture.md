# 06 — Architecture

Technical blueprint. Data-layer specifics in `05`; testing of everything here in `08`.

---

## 1. Platform & core dependencies

- **Expo SDK 56** (latest stable, May 2026; React Native 0.85, React 19.2, New Architecture default). Custom dev client via `expo-dev-client` (we use config plugins — Sentry, notifications; still fully EAS-managed workflow, no bare eject). Minimum iOS 16.
- Rationale: Expo gives EAS Build/Submit/Update (`10`), first-party modules for every native need below, and the best agent-buildable DX. SDK pinned per milestone; upgrade only at milestone boundaries (`09`).
- TypeScript strict; ESLint + Prettier; absolute imports via `@/` alias.

| Need | Choice |
|---|---|
| DB/ORM | `expo-sqlite` + Drizzle (P1, `05`) |
| Router | `expo-router` v6 (P2, §3) |
| State | Zustand 5 + TanStack Query 5 (P3, §4) |
| Charts | Victory Native XL (`victory-native` 41+, Skia + Reanimated) (P4) |
| Lists | `@shopify/flash-list` v2 |
| Images | `expo-image` (caching, GIF/WebP-ready for `03` §4) |
| Notifications | `expo-notifications` (local only) |
| Keep awake | `expo-keep-awake` |
| Haptics/sound | `expo-haptics`, `expo-audio` |
| Files/share | `expo-file-system`, `expo-sharing`, `expo-document-picker`, `expo-image-picker`, `expo-image-manipulator` |
| Gestures/animation | `react-native-gesture-handler`, `react-native-reanimated` 4 |
| Drag reorder | `react-native-reanimated-dnd` (or `react-native-draggable-flatlist` if it proves more stable on RN 0.85 — decide at M3 spike) |
| KV cache | `expo-sqlite/kv-store` (Zustand persistence, small flags) |
| Crash/monitoring | `@sentry/react-native` via config plugin (P13) |
| CSV | custom `lib/csv.ts` (RFC 4180 subset; dependency-free, fully unit-tested) |
| Validation | Zod (settings, CSV rows, backup dumps, dataset build) |
| Dates | `date-fns` (tree-shakeable; no moment/luxon) |

## 2. Project structure (feature folders)

```
kyro/
  app/                        # expo-router routes only — thin screens
  src/
    features/
      workout/        # active-workout store, logger UI, timers, calculators
      exercises/      # library browse/detail/custom CRUD, dataset seed
      routines/       # routines + folders + editor
      history/        # history list, detail, calendar
      stats/          # dashboard, per-exercise charts, records UI
      measurements/   # measures, photos, compare
      settings/       # settings screens + store
      data-transfer/  # CSV import/export, backup/restore
    domain/           # PURE TS, no React/Expo imports: records.ts, volume.ts,
                      # epley.ts, warmup-calc.ts, plate-calc.ts, streaks.ts,
                      # stats-buckets.ts, previous-values.ts, csv-codec.ts, units.ts
    data/             # repository interfaces + sqlite/drizzle implementations,
                      # schema.ts, migrations/, seed/
    ui/               # design-system components (07 §5), tokens.ts, icons
    lib/              # notifications.ts, sound.ts, haptics.ts, files.ts, logger.ts
  assets/exercises/   # built dataset output (03 §6.4)
  data/               # vendored free-exercise-db + curation (build input)
  scripts/            # build-exercise-db.ts etc.
  e2e/                # Maestro flows
```

Dependency rule (enforced by ESLint import boundaries): `app → features → {domain, data, ui, lib}`; `domain` imports nothing app-side; `data` imports `domain` types only; `ui` imports tokens only. This keeps domain logic Node-testable (E3).

## 3. Navigation (expo-router)

Chosen over bare react-navigation for typed routes, file-system clarity (agents navigate it well), and built-in deep links (future widgets). It compiles to react-navigation underneath — no capability loss.

```
app/
  _layout.tsx                 # root Stack: providers (Query, theme, DB-ready gate), migrations splash
  (tabs)/_layout.tsx          # Tab bar: workout | history | exercises | profile  + GlobalWorkoutBar overlay
  (tabs)/workout/index.tsx    # routines hub
  (tabs)/history/index.tsx    # + history/calendar.tsx
  (tabs)/exercises/index.tsx
  (tabs)/profile/index.tsx    # + profile/statistics.tsx, profile/measures*, profile/settings/* 
  workout/active.tsx          # ACTIVE LOGGER — fullScreenModal, slide-from-bottom
  workout/[id]/index.tsx      # workout detail  · workout/[id]/edit.tsx (edit past, modal)
  routine/new.tsx · routine/[id]/edit.tsx        # modals
  exercise/[id].tsx           # detail (push or sheet) · exercise/new.tsx · exercise/[id]/edit.tsx
  import/hevy.tsx             # import preview flow (modal)
```

- **Minimize pattern:** the logger is a `fullScreenModal` route; "minimize" = `router.back()` while the workout stays active in the store; `GlobalWorkoutBar` (rendered in the tabs layout, above the tab bar) appears whenever `activeWorkout != null && !loggerVisible`, and re-presents the route on tap. State never lives in the route — the route is a pure view of the store, so dismissal is always safe.
- Sheets (pickers, set-type menu, rest-timer picker, RPE) are component-level bottom sheets (`ui/Sheet` on gesture-handler), not routes — they must coexist with the keyboard and not disturb navigation state.

## 4. State management

Decision P3 — three cleanly separated stores + server-state library:

1. **`activeWorkoutStore` (Zustand)** — the only complex store. Holds the full active workout object + UI bits (focused cell, timer). Every mutation is an action that (a) updates the in-memory draft optimistically and (b) awaits the matching `WorkoutRepository` mutator in the same call; on repo failure the action rolls back and surfaces an error toast (`§9`). SQLite is the durable copy — the store rehydrates from `WorkoutRepository.getActive()` on cold start. No store-level persistence middleware needed (DB *is* the persistence).
2. **`settingsStore` (Zustand)** — loaded at boot from `SettingsRepository`, synchronous reads everywhere (units, toggles), writes through.
3. **`restTimerStore` (Zustand)** — `{endsAt, exerciseId, setId, notificationId} | null`; derived remaining-time via a 250 ms ticker hook active only while a timer surface is visible. Persisted inside the active workout row (timer state column-free: stored in `settings`-style kv `active_timer` key via kv-store) so relaunch restores it.
4. **TanStack Query** — all read models: history pages, exercise lists, charts, stats, records, measurements. Query keys namespaced (`['workouts','list']`, `['records', exerciseId]`, …). Mutations (finish workout, edit, import, routine CRUD) invalidate affected keys; a single `invalidateAfterWorkoutMutation(exerciseIds)` helper centralizes the recompute story (PR caches + query invalidation, `04` §5.6).

Why not Redux/MobX/Jotai: one writer (the user), no remote sync, small object graphs — Zustand's plain-function actions are the easiest for tests and agents; Query removes hand-rolled cache invalidation for the read-heavy screens.

### 4.4 RecordsService

`domain/records.ts` pure functions + a memoized per-exercise cache keyed by `updated_at` watermark. Exposed via Query (`['records', exerciseId]`); invalidation per above. Live PR check (`04` §5.5) calls the pure evaluator against the cached baseline + current session's checked sets — synchronous, no DB hit per check.

## 5. Boot, persistence & lifecycle

### 5.1 Cold start sequence
splash → open DB → run pending migrations (`05` §10) → seed/refresh dataset if version differs → load settings → rehydrate active workout + timer → render tabs (target < 1.5 s on device; dataset seed only on first run/update).

### 5.2 One transaction per user action
Repository mutators wrap each logical action (check set, add exercise with N sets, finish) in a single SQLite transaction — crash leaves the DB at an action boundary, never mid-action.

### 5.3 Write-through durability
No debounced autosave for structural changes. Text inputs (values, notes) commit on blur/check/next — the at-most-one-field loss guarantee of `02` §10. SQLite writes are on-device sub-millisecond at this scale; WAL mode on.

### 5.4 Foreground/background
On `AppState → active`: recompute stopwatch/timer displays from wall clock; reconcile timer (fire "ended while away" state silently). On background: nothing to flush (write-through), keep-awake released automatically.

## 6. Timers, notifications, keep-awake

### 6.1 Workout stopwatch
Display-only derivation: `now − start_time − pause_offset` (paused: frozen at stored offset). Implemented as a 1 s interval hook mounted only in logger/mini-bar. Pause/resume and manual edits mutate `start_time`/`duration_pause_offset_ms` via repo (`05` §3.2).

### 6.2 Rest timer
Single source of truth `endsAt` (epoch ms). Start: compute `endsAt`, store, schedule local notification (`expo-notifications`, time-interval trigger, sound per settings, `interruptionLevel: timeSensitive`). Adjust ±15 s / skip / uncheck: cancel by `notificationId`, reschedule if needed. Foreground completion: in-app chime + haptic, and the scheduled notification is cancelled just-in-time (foreground handler suppresses banner). Permissions requested lazily on first timer start with rationale copy; denial → in-app-only mode + inline warning (`02` §16.9).

### 6.3 Keep awake
`useKeepAwake()` mounted in the logger screen only, gated by the setting; released on minimize (mini-bar mode allows sleep — notification covers the timer).

### 6.4 Sounds & haptics
`lib/sound.ts` preloads timer/check chimes (expo-audio, `playsInSilentMode: false`, volumes from settings); `lib/haptics.ts` wraps expo-haptics with semantic names (`tickCheck`, `warnInvalid`, `successPR`) — single place to tune (`07` §8).

## 7. Charts

**Victory Native XL** (Skia-based): 60 fps pan/tooltip on large series, Reanimated-native, actively maintained, composable `CartesianChart` API. Alternatives rejected: `react-native-gifted-charts` (styling ceiling, perf on long series), `react-native-svg-charts` (unmaintained), custom Skia (unjustified effort now — the `ui/charts/` wrapper keeps a swap possible). All chart components live in `ui/charts/` (`LineChart`, `BarChart`, `StackedBarChart`, `Sparkline`) consuming design tokens (`07` §7); features never import victory directly.

## 8. Performance requirements & tactics

| Hotspot | Tactic | Budget |
|---|---|---|
| Set-table typing | No list virtualization inside the logger (bounded content in a ScrollView); each `SetRow` memoized, subscribes only to its own set slice (Zustand selectors); keyboard stays mounted; input state local-first, committed on blur/check | keypress-to-paint < 50 ms; zero keyboard flicker between fields |
| Check ripple | Counters/PR check are derived selectors; PR eval in-memory (§4.4) | check-to-feedback < 100 ms |
| Exercise list | FlashList, fixed row height, thumbnail via expo-image with memory-disk cache, search debounce 150 ms in-memory over preloaded array (~870 rows trivially fits) | 60 fps scroll |
| History | FlashList + paged Query (20), summary rows precomputed at save time? No — computed in the page query, cached by Query | 60 fps with 1000+ workouts |
| Charts/stats | Single ranged feed query (`05` §4) + pure bucketing; Query cache per range | < 300 ms per `04` §4 |
| Cold start | §5.1 sequence; defer non-critical (Sentry init after first frame, sounds lazy) | < 1.5 s warm device |
| JS bundle | Hermes (default); avoid moment-class deps | — |

Re-render discipline verified with React DevTools profiling in M2 exit review (`09`).

## 9. Error handling & logging

- **Repository errors** (SQLite failure, disk full): typed `DataError`; store actions roll back optimistic state, show retryable error toast; never swallow. Migration failure at boot → blocking screen with "Restore from backup / contact" guidance (should never happen — migration tests).
- **Domain invariant violations** (e.g. two active workouts found): auto-heal where safe (keep newest active, complete the other with `end_time=updated_at`), log to Sentry as warning.
- **React errors**: root ErrorBoundary per tab + logger (logger boundary preserves the store — remount re-renders from state; data is already in DB).
- **Sentry**: crashes + handled `DataError`s + one-line breadcrumbs for user actions (no payloads — privacy: no workout content is sent; toggleable in Settings → About, default on; declared in privacy label `10` §6).
- **Local log ring buffer** (`lib/logger.ts`, last 500 events, in kv-store) exportable from Settings → About → "Export diagnostics" for debugging without Sentry.

## 10. Portability guardrails (E2)

- No direct `Platform.OS === 'ios'` branching outside `lib/` (single lint-allowed list).
- All native capabilities behind `lib/` wrappers (notifications, haptics, files, keep-awake) — Android later means auditing `lib/`, not features.
- Design tokens/typography reference system fonts abstractly (`07` §3) — SF Pro on iOS, Roboto fallback free on Android.
