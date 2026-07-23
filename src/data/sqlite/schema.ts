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
 * Not yet wired into a live query client (`drizzle(...)`): nothing in this
 * task needs one (the migration runner works directly against the raw
 * `SqliteDriver`, `06` §10/`08` §5 parity). `SettingsRepository` (M0-10) is
 * the first consumer that needs typed query-builder access — it should
 * import this schema when it wires its own `drizzle-orm` client.
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
