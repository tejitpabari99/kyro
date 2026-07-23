/**
 * Drizzle schema (M0-09) — 05 §3.5 minimal DDL, migration 0001 scope ONLY:
 * `app_meta` + `settings`. This file is the source drizzle-kit diffs against
 * to generate `src/data/migrations/*.sql` (`drizzle.config.ts`); it is also
 * the file M1-01 **extends** (adding the full v1 schema — workouts,
 * exercises, etc., 05 §3.1-3.4 — as migration 0002) rather than replaces.
 * Do not add any table here beyond these two — that would duplicate M1-01's
 * scope and desync this file from the migration it actually generated.
 *
 * Both tables are plain `key/value` stores (JSON-encoded `value` for
 * `settings`; loosely-typed string values for `app_meta` such as
 * `schema_version`, `dataset_version`, `last_backup_at`, 05 §3.5) — no
 * relations, no indexes beyond the primary key.
 *
 * Not wired into a live query client (`drizzle(...)`): the migration runner
 * works directly against the raw `SqliteDriver` (`06` §10/`08` §5 parity),
 * and M0-10's `SettingsRepository` (`src/data/settings/settings-repository.ts`)
 * deliberately did the same rather than standing up a second, backend-
 * specific Drizzle client (`drizzle-orm/expo-sqlite` vs `drizzle-orm/
 * better-sqlite3` — neither takes a `SqliteDriver`) for two trivial
 * statements (`SELECT * FROM settings`, upsert-by-key) — see that file's
 * header for the full rationale. This file's exported `settings`/`appMeta`
 * table objects are therefore reviewed-and-intentionally-unused at runtime
 * today, consumed only by drizzle-kit (`drizzle.config.ts`) for schema-diff
 * codegen — **not** stale/orphaned, just not yet a live query-builder
 * source. M1-01 is expected to be the first consumer that actually imports
 * this schema into a live `drizzle(...)` client, once it lands the full v1
 * tables (workouts/exercises/etc., 05 §3.1-3.4) whose queries are complex
 * enough that a query builder earns its keep — a bar the settings table's
 * two-statement repository never cleared.
 */
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** `settings(key TEXT PRIMARY KEY, value TEXT NOT NULL)` — JSON-encoded values (05 §3.5). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/**
 * `app_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)` — plain string
 * values: `'schema_version'`, `'dataset_version'`, `'last_backup_at'`, … (05
 * §3.5). The migration runner (`migrator.ts`) owns writes to the
 * `schema_version` row; nothing else should write that key.
 */
export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
