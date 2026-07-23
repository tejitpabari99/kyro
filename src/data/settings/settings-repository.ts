/**
 * `SettingsRepository` (M0-10) — 05 §6's repository seam:
 * `interface SettingsRepository { get(): Promise<Settings>; set<K>(key: K, value: Settings[K]): Promise<void> }`.
 *
 * Talks to the `settings` table (`key TEXT PRIMARY KEY, value TEXT NOT NULL`
 * — migration 0001, M0-09) through the raw `SqliteDriver` surface
 * (`src/data/sqlite/driver.ts`) rather than a Drizzle query-builder client:
 * the driver already gives identical behavior on both backends
 * (`better-sqlite3` in Jest, `expo-sqlite` on device, 08 §5 parity) via the
 * exact same interface `migrator.ts` uses, and this repository's shape is
 * two trivial statements (`SELECT * FROM settings`, upsert-by-key) — a
 * second, backend-specific Drizzle client (`drizzle-orm/expo-sqlite` needs
 * the live `expo-sqlite` handle; `drizzle-orm/better-sqlite3` needs the raw
 * `better-sqlite3.Database` — neither takes a `SqliteDriver`) would
 * duplicate the dual-driver split `driver.expo.ts`/`driver.better-sqlite3.ts`
 * already solve, for no behavioral gain here. `src/data/sqlite/schema.ts`
 * remains the source of truth for the table's DDL shape (drizzle-kit still
 * diffs against it for migrations) — this file just reads/writes it.
 *
 * Per-key resilience (M0-10 acceptance gate): `get()` never throws or
 * corrupts sibling keys because one stored value is bad JSON or fails its
 * Zod shape — each key is decoded independently and falls back to
 * `SETTINGS_DEFAULTS[key]` on its own.
 */
import type { SqliteDriver } from '../sqlite/driver';
import {
  SETTINGS_DEFAULTS,
  SETTINGS_KEYS,
  SETTINGS_KEY_SCHEMAS,
  type Settings,
  type SettingsKey,
} from './settings-schema';

interface SettingsRow {
  key: string;
  value: string;
}

/** Decode one stored (possibly absent/corrupt) row into a valid `Settings[K]`, falling back to its code default. */
function decodeValue<K extends SettingsKey>(key: K, raw: string | undefined): Settings[K] {
  if (raw === undefined) {
    return SETTINGS_DEFAULTS[key];
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return SETTINGS_DEFAULTS[key];
  }

  const result = SETTINGS_KEY_SCHEMAS[key].safeParse(parsedJson);
  return result.success ? (result.data as Settings[K]) : SETTINGS_DEFAULTS[key];
}

export class SettingsRepository {
  constructor(private readonly driver: SqliteDriver) {}

  /**
   * The full, typed `Settings` object. Missing rows (fresh install, or a
   * key added to the schema after the row was last written) and corrupt
   * rows (bad JSON, or JSON that fails that key's Zod shape) both resolve
   * to that key's code default — every key is always present and valid.
   */
  async get(): Promise<Settings> {
    const rows = this.driver.queryAll<SettingsRow>('SELECT key, value FROM settings');
    const stored = new Map(rows.map((row) => [row.key, row.value]));

    const settings: Partial<Settings> = {};
    for (const key of SETTINGS_KEYS) {
      (settings as Record<SettingsKey, unknown>)[key] = decodeValue(key, stored.get(key));
    }
    return settings as Settings;
  }

  /** JSON-encode `value` and write it through to the `settings` table (upsert by key). */
  async set<K extends SettingsKey>(key: K, value: Settings[K]): Promise<void> {
    this.driver.execute(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, JSON.stringify(value)],
    );
  }
}
