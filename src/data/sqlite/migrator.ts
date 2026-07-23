/**
 * Migration runner (M0-09) — 05 §10: "applied sequentially at cold start
 * before UI ...; `app_meta.schema_version` tracks applied head." Deliberately
 * a small, hand-rolled runner over the raw `SqliteDriver` (`./driver.ts`)
 * rather than drizzle-kit's own migrator (drizzle-orm's per-dialect
 * `migrator` module, e.g. `drizzle-orm/better-sqlite3/migrator`): this
 * app tracks the applied head in `app_meta.schema_version` (05 §3.5) — a
 * table this very runner creates via migration 0001 — not in drizzle's
 * default `__drizzle_migrations` bookkeeping table, so a custom runner keeps
 * that single source of truth.
 *
 * Design:
 *  - Bootstrap: `app_meta` may not exist yet on a brand-new database (it is
 *    *created by* migration 0001), so the current version is read via
 *    `sqlite_master` first — table absent means version 0, no exceptions.
 *  - Each pending migration's SQL runs inside one transaction together with
 *    the `app_meta.schema_version` upsert that records it — a crash mid-
 *    migration never leaves a migration "half applied and unrecorded" (06
 *    §5.2's one-transaction-per-action principle, applied to migrations).
 *  - Idempotent: re-running against an already-migrated database applies
 *    nothing and returns an empty `applied` list (`fromVersion === toVersion`).
 *  - Runs on both backends unmodified (better-sqlite3 in Jest, expo-sqlite
 *    on device) since it only uses the shared `SqliteDriver` surface — 08
 *    §5 parity is exactly this file being backend-agnostic.
 */
import type { SqliteDriver } from './driver';
import { MIGRATIONS, type Migration } from '../migrations/manifest';

const STATEMENT_BREAKPOINT = '--> statement-breakpoint';
const SCHEMA_VERSION_KEY = 'schema_version';

export interface MigrationResult {
  /** `app_meta.schema_version` before this run (0 on a brand-new database). */
  fromVersion: number;
  /** `app_meta.schema_version` after this run. */
  toVersion: number;
  /** Tags of migrations applied this run, in order (empty when already up to date). */
  applied: readonly string[];
}

/**
 * Split a migration (or fixture — see `../migrations/__fixtures__/`) file's
 * SQL into individually-executable statements on the shared
 * `--> statement-breakpoint` marker. Exported so fixture-upgrade tests (08
 * §5.3) can load a committed multi-statement fixture dump through the same
 * splitting logic the real runner uses, rather than duplicating it.
 */
export function splitStatements(sql: string): string[] {
  return sql
    .split(STATEMENT_BREAKPOINT)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);
}

function appMetaTableExists(driver: SqliteDriver): boolean {
  const rows = driver.queryAll(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_meta'`,
  );
  return rows.length > 0;
}

function readSchemaVersion(driver: SqliteDriver): number {
  if (!appMetaTableExists(driver)) {
    return 0;
  }
  const rows = driver.queryAll<{ value: string }>(
    `SELECT value FROM app_meta WHERE key = ?`,
    [SCHEMA_VERSION_KEY],
  );
  if (rows.length === 0) {
    return 0;
  }
  const parsed = Number.parseInt(rows[0]!.value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function applyMigration(driver: SqliteDriver, migration: Migration): void {
  driver.transaction(() => {
    for (const statement of splitStatements(migration.sql)) {
      driver.execute(statement);
    }
    driver.execute(
      `INSERT INTO app_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [SCHEMA_VERSION_KEY, String(migration.version)],
    );
  });
}

/**
 * Apply every migration in `migrations` (default: the real `MIGRATIONS`
 * manifest) newer than the database's current `app_meta.schema_version`, in
 * order. Safe to call on every cold start (06 §5.1) — a fully-migrated
 * database is a no-op.
 *
 * `migrations` is injectable (rather than always reading the module-level
 * `MIGRATIONS` constant) purely for testability — the runner's ordering
 * logic is exercised deterministically in `__tests__/migrator.test.ts`
 * without depending on how many real migrations happen to exist yet.
 */
export function migrate(
  driver: SqliteDriver,
  migrations: readonly Migration[] = MIGRATIONS,
): MigrationResult {
  const fromVersion = readSchemaVersion(driver);
  const applied: string[] = [];

  const pending = [...migrations]
    .sort((a, b) => a.version - b.version)
    .filter((migration) => migration.version > fromVersion);

  for (const migration of pending) {
    applyMigration(driver, migration);
    applied.push(migration.tag);
  }

  return {
    fromVersion,
    toVersion: readSchemaVersion(driver),
    applied,
  };
}
