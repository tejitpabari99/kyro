/**
 * Settings model (M0-10) — the full `Settings` shape from 05 §3.5, typed +
 * Zod-validated + defaulted in one place. This is the single source of
 * truth every other M0-10 piece builds on:
 *
 *  - `SettingsRepository` (`./settings-repository.ts`) JSON-decodes each
 *    `settings` row's `value` column against `SETTINGS_KEY_SCHEMAS[key]`,
 *    falling back to `SETTINGS_DEFAULTS[key]` per-key on corruption.
 *  - `settingsStore` (`src/features/settings/settings-store.ts`) holds a
 *    fully-populated `Settings` object in memory, seeded from these same
 *    defaults before the repository's initial `load()` resolves.
 *
 * Field naming is deliberately **snake_case**, matching 05 §3.5's literal
 * key names (`weight_unit`, `plate_calc.bars[].weight_kg`,
 * `sounds.timer_sound`, …) verbatim rather than translating to camelCase —
 * these shapes round-trip through JSON in the `settings` table today and
 * will round-trip through CSV/backup export and cloud sync (`12`) later, so
 * matching the doc's field names 1:1 avoids a translation layer at every
 * future consumer.
 *
 * Units note (06 §5, 05 §5): `plate_calc`/`warmup_calc` weights are stored
 * in kilograms regardless of the user's `weight_unit` display preference —
 * canonical storage, display-only conversion happens in `lib/units.ts`
 * (future milestone). `plate_calc.plates[].count: null` means "unlimited"
 * (05 §11's "×∞" plate-inventory defaults) — `null` rather than `Infinity`
 * because `JSON.stringify(Infinity) === 'null'` already collapses to that
 * value silently; encoding the sentinel explicitly avoids a footgun.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Nested shapes
// ---------------------------------------------------------------------------

const plateCalcBarSchema = z.object({
  name: z.string().min(1),
  weight_kg: z.number().positive(),
});
export type PlateCalcBar = z.infer<typeof plateCalcBarSchema>;

const plateCalcPlateSchema = z.object({
  weight_kg: z.number().positive(),
  /** `null` = unlimited count available (05 §11 default inventory). */
  count: z.number().int().nonnegative().nullable(),
});
export type PlateCalcPlate = z.infer<typeof plateCalcPlateSchema>;

const plateCalcSchema = z.object({
  enabled: z.boolean(),
  bars: z.array(plateCalcBarSchema),
  plates: z.array(plateCalcPlateSchema),
});
export type PlateCalcSettings = z.infer<typeof plateCalcSchema>;

const warmupCalcSetSchema = z.object({
  percent: z.number().min(0).max(100),
  reps: z.number().int().positive(),
});
export type WarmupCalcSet = z.infer<typeof warmupCalcSetSchema>;

const warmupCalcSchema = z.object({
  sets: z.array(warmupCalcSetSchema),
  plate_increment_kg: z.number().positive(),
  dumbbell_increment_kg: z.number().positive(),
});
export type WarmupCalcSettings = z.infer<typeof warmupCalcSchema>;

const soundChoiceSchema = z.enum(['default', 'bell', 'beep', 'none']);
export type SoundChoice = z.infer<typeof soundChoiceSchema>;

const volumeLevelSchema = z.enum(['off', 'low', 'normal', 'high']);
export type VolumeLevel = z.infer<typeof volumeLevelSchema>;

const soundsSchema = z.object({
  timer_sound: soundChoiceSchema,
  timer_volume: volumeLevelSchema,
  set_check_volume: volumeLevelSchema,
  notification_volume: volumeLevelSchema,
});
export type SoundsSettings = z.infer<typeof soundsSchema>;

/**
 * Profile vanity (M5-04, 04 §7: "Profile tab: avatar/name (local vanity
 * only)") — no such key existed in 05 §3.5 before this task; added here
 * following the exact per-key-nested-object pattern `sounds`/`plate_calc`
 * already establish, since 04 §7 explicitly scopes this to M5-04 ("add a
 * minimal settings key if none exists"). `name` is a free-text display name
 * (never an auth identity — this is a single-user, sign-in-free app, 06 §9's
 * privacy posture); `avatar_emoji` is one emoji string standing in for a
 * profile picture (no image picker/crop pipeline for this — that's the
 * `progress_photos` capture path's job, not vanity chrome). Both purely
 * cosmetic, never read by any domain/query logic.
 */
const profileSchema = z.object({
  name: z.string().max(60),
  avatar_emoji: z.string().min(1).max(8),
});
export type ProfileSettings = z.infer<typeof profileSchema>;

// ---------------------------------------------------------------------------
// Top-level keys — every key from 05 §3.5, in the doc's listed order.
// ---------------------------------------------------------------------------

/** The user-facing theme preference (05 §3.5 `theme` key) — mirrors `ThemePreference` in `src/ui/theme-provider.tsx`. */
const themeSchema = z.enum(['system', 'light', 'dark']);

export const SETTINGS_KEY_SCHEMAS = {
  weight_unit: z.enum(['kg', 'lbs']),
  distance_unit: z.enum(['km', 'miles']),
  body_measurement_unit: z.enum(['metric', 'imperial']),
  theme: themeSchema,
  first_day_of_week: z.enum(['monday', 'sunday', 'saturday']),
  /** `null` = no weekly goal set ("default off", 04 §5.1/§7). */
  weekly_goal: z.number().int().min(0).max(14).nullable(),
  default_rest_seconds: z.number().int().min(0).max(600),
  previous_values_mode: z.enum(['any_workout', 'same_routine']),
  warmup_in_stats: z.boolean(),
  rpe_enabled: z.boolean(),
  plate_calc: plateCalcSchema,
  warmup_calc: warmupCalcSchema,
  smart_superset_scroll: z.boolean(),
  inline_timer: z.boolean(),
  keep_awake: z.boolean(),
  live_pr_banner: z.boolean(),
  sounds: soundsSchema,
  rest_notifications_enabled: z.boolean(),
  sentry_enabled: z.boolean(),
  profile: profileSchema,
  /**
   * M5-09 addition (05 §9, 10 §9): "Suggested monthly reminder toggle (local
   * notification)" / "monthly backup reminder ... opt-in default **on**
   * post-launch". This app is pre-launch (no released build yet) — 10 §9's
   * "on post-launch" default explicitly does not apply today, and
   * `M5-tasks.md`'s own M5-09 "How" line says so directly: "default flips on
   * post-launch per 10 §9 — default off for now, M7-06 flips." Defaulting
   * `true` now would mean every dev/test install silently schedules a real
   * local notification before the app has ever shipped, which is the
   * behavior 10 §9 itself only wants *after* launch — `false` here is the
   * literal, non-speculative reading of that instruction, not a weaker
   * substitute for it.
   */
  backup_reminder_enabled: z.boolean(),
} as const;

/** The full settings object schema — every key required, per-key shapes above. */
export const SettingsSchema = z.object(SETTINGS_KEY_SCHEMAS);

/** The typed settings shape — 05 §3.5, every key. */
export type Settings = z.infer<typeof SettingsSchema>;

/** Every settings key, in the same order as `SETTINGS_KEY_SCHEMAS`/05 §3.5. */
export const SETTINGS_KEYS = Object.keys(SETTINGS_KEY_SCHEMAS) as readonly SettingsKey[];

export type SettingsKey = keyof Settings;

// ---------------------------------------------------------------------------
// Code defaults — one literal per key, referenced by both the repository
// (per-key fallback on corrupt/missing rows) and the store (pre-load seed).
// ---------------------------------------------------------------------------

/**
 * Default plate inventory (05 §11): kg bars (Barbell 20 / EZ Bar 7.5 / Short
 * Bar 10) and the default kg plate set (25/20/15/10/5/2.5/1.25, unlimited
 * count each). Plate calculator itself defaults **off** (05 §11: "off by
 * default").
 */
const DEFAULT_PLATE_CALC: PlateCalcSettings = {
  enabled: false,
  bars: [
    { name: 'Barbell', weight_kg: 20 },
    { name: 'EZ Bar', weight_kg: 7.5 },
    { name: 'Short Bar', weight_kg: 10 },
  ],
  plates: [
    { weight_kg: 25, count: null },
    { weight_kg: 20, count: null },
    { weight_kg: 15, count: null },
    { weight_kg: 10, count: null },
    { weight_kg: 5, count: null },
    { weight_kg: 2.5, count: null },
    { weight_kg: 1.25, count: null },
  ],
};

/**
 * Default warm-up formula (05 §12, decision P8): bar × 10 (0% = empty bar),
 * 40% × 8, 60% × 5, 80% × 3; rounding 2.5 kg (plate-loaded) / 2 kg (dumbbell).
 */
const DEFAULT_WARMUP_CALC: WarmupCalcSettings = {
  sets: [
    { percent: 0, reps: 10 },
    { percent: 40, reps: 8 },
    { percent: 60, reps: 5 },
    { percent: 80, reps: 3 },
  ],
  plate_increment_kg: 2.5,
  dumbbell_increment_kg: 2,
};

const DEFAULT_SOUNDS: SoundsSettings = {
  timer_sound: 'default',
  timer_volume: 'normal',
  set_check_volume: 'normal',
  notification_volume: 'normal',
};

/** Default profile vanity (M5-04): no name set, a generic dumbbell emoji avatar. */
const DEFAULT_PROFILE: ProfileSettings = {
  name: '',
  avatar_emoji: '💪',
};

/** Code defaults for every settings key (05 §3.5: "defaults in code"). */
export const SETTINGS_DEFAULTS: Settings = {
  weight_unit: 'kg',
  distance_unit: 'km',
  body_measurement_unit: 'metric',
  theme: 'system',
  first_day_of_week: 'monday',
  weekly_goal: null,
  default_rest_seconds: 90,
  previous_values_mode: 'any_workout',
  warmup_in_stats: false,
  rpe_enabled: false,
  plate_calc: DEFAULT_PLATE_CALC,
  warmup_calc: DEFAULT_WARMUP_CALC,
  smart_superset_scroll: true,
  inline_timer: true,
  keep_awake: true,
  live_pr_banner: true,
  sounds: DEFAULT_SOUNDS,
  rest_notifications_enabled: true,
  sentry_enabled: true,
  profile: DEFAULT_PROFILE,
  backup_reminder_enabled: false,
};
