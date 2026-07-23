# 07 — Design System

**Source of truth** for color tokens, typography, spacing, components, chart styling, motion, and accessibility. Implemented as `src/ui/tokens.ts` + `src/ui/*` components (`06` §2). Direction (D7): Hevy's layout quality and single-accent discipline, re-skinned as **green/teal energy** — emerald accent, dark-first, full light theme.

## 1. Principles

1. **One accent.** Emerald is the only interactive color. If something is tappable and not destructive, it's emerald or neutral. Semantic colors (orange/blue/red) appear *only* as set-type badges, warnings, and destructive actions.
2. **Dark-first.** Design and QA every screen dark first; light must be equally polished. Theme = System default, overridable.
3. **Numbers are the interface.** Stat and set-table numerals always use tabular figures; alignment never jitters as values change.
4. **Flat, iOS-native feel.** Cards on grouped backgrounds, hairline separators, no drop shadows except sheets/mini-bar; system materials for blur where cheap.

## 2. Color tokens

All UI code references semantic tokens, never raw hex. Scale reference (brand ramp): `emerald-300 #6EE7B7 · 400 #34D399 · 500 #10B981 · 600 #059669 · 700 #047857`; `teal-400 #2DD4BF · 500 #14B8A6`.

### 2.1 Dark theme (default)

| Token | Hex | Use |
|---|---|---|
| `bg.base` | `#0B0D0C` | Screen background |
| `bg.surface` | `#161A18` | Cards, sheets, tab bar |
| `bg.elevated` | `#1E2422` | Inputs, chips, nested surfaces, thumbnails |
| `bg.accentSubtle` | `#10B981` @ 8% | Checked set-row tint, selected states |
| `border.hairline` | `#242A27` | Separators (0.5 pt) |
| `border.input` | `#2E3532` | Input boxes, chip outlines |
| `text.primary` | `#F4F7F5` | Titles, values |
| `text.secondary` | `#9CA8A2` | Subtitles, PREVIOUS column, placeholders-adjacent labels |
| `text.tertiary` | `#66716C` | Placeholders, disabled, captions |
| `accent.primary` | `#10B981` | Buttons, active tab, checked ✓, live duration, chart lines |
| `accent.text` | `#34D399` | Text links, exercise names, tinted icons |
| `accent.onAccent` | `#04231A` | Label on accent-filled controls |
| `accent.pressed` | `#0DA271` | Pressed fills |

### 2.2 Light theme

| Token | Hex | Use |
|---|---|---|
| `bg.base` | `#F3F6F4` | Grouped background |
| `bg.surface` | `#FFFFFF` | Cards, sheets, tab bar |
| `bg.elevated` | `#EDF1EF` | Inputs, chips |
| `bg.accentSubtle` | `#059669` @ 8% | Checked-row tint, selection |
| `border.hairline` | `#E3E9E5` | Separators |
| `border.input` | `#D3DCD7` | Input boxes |
| `text.primary` | `#16211C` | Titles, values |
| `text.secondary` | `#56635D` | Subtitles |
| `text.tertiary` | `#8B958F` | Placeholders, disabled |
| `accent.primary` | `#059669` | Buttons, active states, chart lines |
| `accent.text` | `#047857` | Links, exercise names |
| `accent.onAccent` | `#FFFFFF` | Label on accent fills (17 pt semibold ⇒ large-text AA) |
| `accent.pressed` | `#04785C` | Pressed fills |

### 2.3 Semantic (both themes; dark/light variant where two values given)

| Token | Hex | Use |
|---|---|---|
| `danger` | `#EF4444` / `#DC2626` | Destructive text/buttons, failure badge `F`, delete swipe |
| `warning` | `#F59E0B` / `#D97706` | Warm-up badge `W`, cautions |
| `info` | `#3B82F6` / `#2563EB` | Drop-set badge `D` only |
| `success` | = `accent.primary` | Checked states, PR banner (no separate green) |
| `chart.secondary` | `#2DD4BF` / `#14B8A6` | Second chart series (teal) |
| `overlay` | `#000000` @ 50% | Sheet scrim |

### 2.4 Set-type badge colors
`W` = `warning`, `D` = `info`, `F` = `danger`, normal = `text.secondary` numeral. Badge = 24 pt circle, `bg.elevated` fill, colored letter (semibold 13).

### 2.5 Superset palette (cycled by group index; same both themes)
`#8B5CF6` violet · `#06B6D4` cyan · `#EC4899` pink · `#A3E635` lime · `#6366F1` indigo · `#D946EF` fuchsia. Used for the 3 pt card edge bar + "Superset A/B…" label; deliberately excludes accent/semantic hues.

### 2.6 Contrast requirements
`text.primary` on all backgrounds ≥ 7:1; `text.secondary` ≥ 4.5:1; `accent.text` on `bg.base/surface` ≥ 4.5:1 (both themes verified); accent-filled controls ≥ 3:1 label contrast (large/bold text only on fills). Checked-row tint must keep all cell text at ≥ 4.5:1. Verified per theme in the M0 token test (contrast unit test over the token table, `08` §4.8).

## 3. Typography

System font (SF Pro on iOS; platform default elsewhere — no bundled fonts). Dynamic Type: all styles scale via `allowFontScaling` with `maxFontSizeMultiplier` 1.4 in the set table / 2.0 elsewhere (§9).

| Style | Size/weight | Use |
|---|---|---|
| `display` | 34 bold | Large titles (tab roots) |
| `title1` | 28 bold | Screen titles, finish-screen stats |
| `title2` | 22 semibold | Card titles, sheet headers |
| `title3` | 20 semibold | Section headers |
| `headline` | 17 semibold | Exercise names, buttons, emphasized rows |
| `body` | 17 regular | Default text, inputs |
| `subhead` | 15 regular | List subtitles, notes |
| `footnote` | 13 regular | Column headers (uppercase, +0.5 tracking), meta text |
| `caption` | 12 / 11 regular | Badges, chart axes, timestamps |
| `statLarge` | 28 semibold **tabular** | Duration/volume counters, timer pill |
| `statSmall` | 15 semibold **tabular** | Meta-row stats, card stat strips |
| `setValue` | 17 semibold **tabular** | Set-table inputs, PREVIOUS values |

Tabular numerals via `fontVariant: ['tabular-nums']` — mandatory for every style that renders a mutable number.

## 4. Layout, spacing, iconography

- **Spacing scale (pt):** 2, 4, 8, 12, 16, 20, 24, 32, 40, 48 (`space.05–12`). Screen gutters 16; card inner padding 16; vertical rhythm between cards 12.
- **Radii:** `sm` 8 (inputs, chips) · `md` 12 (cards, buttons) · `lg` 16 (sheets, modals) · `pill` 999 (Finish pill, timer pill, badges).
- **Hit targets:** ≥ 44×44 pt everywhere; set-table check cell 44 pt despite 32 pt visual.
- **Hairlines:** `StyleSheet.hairlineWidth`, `border.hairline`; inset 16 from left within cards.
- **Icons:** `lucide-react-native`, 1.75 pt stroke, sizes 16/20/24; chosen over SF Symbols for Android portability (E2). Tab icons: Workout `dumbbell`, History `history`, Exercises `book-open` (library), Profile `user`. Trophy `trophy`, timer `timer`, folder `folder`, calendar `calendar-days`.
- **App icon direction:** emerald→teal diagonal gradient field, white geometric "K" monogram with a barbell-plate counterform; dark-tinted + light variants (`10` §7).

## 5. Component inventory (→ `src/ui/`)

Core primitives — every screen composes these; no feature-local one-off buttons:

| Component | Notes | Used in |
|---|---|---|
| `Button` | variants: `primary` (accent fill), `tonal` (accent @ 12% bg, accent text), `ghost` (accent text), `destructive` (danger text / danger fill for confirms); sizes lg (50 pt, full-width) / md (40) / sm (32 pill) | everywhere |
| `Card` | `bg.surface`, radius md, padding 16 | routine cards, exercise cards, chart cards |
| `ListRow` | leading icon/thumb, title/subtitle, trailing accessory, chevron; hairline | settings, pickers, history |
| `Sheet` | bottom sheet (detents 0.5/0.9), grabber, scrim; keyboard-aware | pickers, set-type menu, RPE, rest-timer, save screen |
| `SegmentedControl` | iOS-style | detail tabs, chart ranges, theme |
| `Chip` | filter chips w/ dropdown caret + active accent tint | library filters |
| `SearchBar` | `bg.elevated`, radius sm | library, picker |
| `StatColumn` / `StatTile` | label (footnote, secondary) over value (statLarge/Small) | meta row, dashboards, finish screen |
| `SetTable` + `SetRow` + `SetCell` | the crown jewel; column-layout engine per exercise type (`02` §4); memoized per-row | logger, routine editor, workout detail (read-only mode) |
| `SetTypeBadge` | §2.4 | set tables |
| `NumericInput` | boxed `bg.elevated`, radius sm, setValue type, placeholder `text.tertiary`; select-all-on-focus | set cells, measurements, calculators |
| `KeyboardAccessoryBar` | Calculator (left, contextual) + Next (right) | logger |
| `TimerPill` | floating pill: progress ring, statLarge countdown, −15s/+15s/Skip | logger, global |
| `GlobalWorkoutBar` | mini-player bar above tab bar: title + elapsed/rest countdown | app-wide |
| `PRBanner` | top toast, `bg.surface` + accent border-left, trophy icon | logger |
| `Snackbar` | undo affordance, 5 s | remove exercise, deletions |
| `EmptyState` | icon + title + caption + CTA | all lists |
| `Avatar/Thumb` | exercise thumbnail w/ initial fallback | library, cards |
| `CalendarMonth` | custom grid, accent dot/fill days | calendar |
| `PhotoGrid` / `CompareView` | measurements | measures |
| `WheelPicker` | duration/rest picker | rest timer, duration sheet |
| `ProgressRing` | timer full-screen | timer sheet |

Feature screens must be assembled ≥ 90% from this inventory; new primitives require adding them here first (keeps agent-built UI coherent).

## 6. Key screen specs (visual deltas from Hevy)

- **Tab bar:** `bg.surface` with subtle top hairline; active = accent icon + label; inactive `text.tertiary`. No center FAB — Start lives in the Workout tab (research §2.1 clone recommendation).
- **Logger:** `bg.base`; exercise cards `bg.surface`; Finish = accent pill (accent.onAccent label); Duration stat in `accent.text`; checked rows `bg.accentSubtle`.
- **Routine card:** Start Routine as full-width `tonal` button (Hevy uses solid; tonal keeps single-accent hierarchy under the page-level primary).
- **PR banner & trophies:** trophy glyph in `warning` gold? No — trophies use `accent.text` (single-accent discipline; the 🏆 emoji only in history-card copy).

## 7. Chart styling

- Line charts: 2 pt `accent.primary` stroke, gradient area fill accent 20% → 0%, no dots except selection (6 pt accent dot + tooltip card `bg.elevated`, radius sm, statSmall value + caption date); dashed hairline y-gridlines (max 4); axis labels caption/`text.tertiary`; no x-gridlines.
- Bar charts: radius-top 3, accent bars; muted variant `accent.primary` @ 30% for non-goal-met bars; goal line dashed `text.secondary`.
- Stacked muscle bars: superset palette order (§2.5) + teal, capped at 8 + `text.tertiary` "Other".
- Sparklines: 1.5 pt accent, no axes.
- Empty chart state: dashed baseline + caption "No data yet".
- Ranges as `SegmentedControl` (3M/1Y/All) right-aligned in the card header.

## 8. Motion & haptics

Durations: 150 ms (state changes: check fill, chip toggle) · 250 ms (sheets, banner in/out) · 350 ms (logger present/minimize spring, damping 0.85). Use Reanimated springs for surface transitions, timing for opacity. Respect Reduce Motion: replace springs/slides with 150 ms fades.

| Event | Haptic |
|---|---|
| Set checked | `impactLight` |
| Invalid check (missing required) | `notificationWarning` + row shake 300 ms |
| PR banner | `notificationSuccess` |
| Rest timer done (foreground) | `notificationSuccess` |
| Timer ±15/skip, chip/segment change | `selection` |
| Destructive confirm shown | `impactMedium` |
| Drag reorder pickup/drop | `impactLight` |

Sounds only where settings allow (`02` §7); haptics always on (system setting governs globally).

## 9. Accessibility

- **Dynamic Type:** all text scales; set table clamps at 1.4× and switches PREVIOUS to a stacked two-line cell at ≥ 1.2× rather than truncating; test matrix at 100%/120%/140%/200% (non-table screens).
- **Contrast:** §2.6 enforced by token test; never rely on color alone — set-type badges carry letters, superset groups carry A/B labels, checked rows carry the ✓ glyph.
- **VoiceOver (core flows must be fully usable):** set row reads "Set 2, previous 45 kilograms times 9, weight field 45, reps field 9, completed" with actions "toggle complete / set type / delete"; timer pill announces remaining time on focus and at 10 s; PR banner is announced politely; calendar days read date + workout count. QA checklist in `08` §7.
- **Reduce Motion / Reduce Transparency:** §8 fades; scrims go opaque-ish (75%).
- Touch targets §4; keyboard `Next` order matches visual order (`02` §4).

## 10. Content style

Sentence case everywhere ("Start empty workout" — except proper nouns and column headers SET/PREVIOUS/KG/REPS which are uppercase footnote style). Numerals never spelled out. Destructive verbs are explicit ("Discard workout", "Delete routine"). Empty states: one encouraging line + one CTA, no lorem fluff. No exclamation points except the PR banner.
