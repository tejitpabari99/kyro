/**
 * Test/Node backend for `SqliteDriver` (08 §5). Only ever imported from
 * Jest (the node-env `src/domain`/`src/data` project, per M0-03) — never
 * from app code, so `better-sqlite3` (a native Node addon incompatible with
 * the Metro/Hermes bundle) never ends up in the shipped app.
 */
import Database from 'better-sqlite3';

import type { SqliteDriver, SqliteRow, SqliteRunResult } from './driver';

/**
 * Open a `better-sqlite3`-backed driver. Pass `:memory:` for the fast,
 * per-test in-memory database integration tests use (08 §5: "per-test fresh
 * in-memory DB").
 */
export function openBetterSqlite3Driver(databaseName: string): SqliteDriver {
  const db = new Database(databaseName);
  // `PRAGMA foreign_keys` is a per-connection setting (SQLite does not
  // persist it in the database file, and it is OFF by default per the
  // SQLite C library unless the library happens to be compiled with
  // `SQLITE_DEFAULT_FOREIGN_KEYS=1` — true of the prebuilt `better-sqlite3`
  // binary in this environment, but that is an accident of this particular
  // build, not something to rely on, and almost certainly NOT true of the
  // on-device `expo-sqlite` backend, `driver.expo.ts`, which needs this
  // same statement for the same reason). Set explicitly on every open so
  // `workout_exercises`/`sets`/`routine_exercises`/`routine_sets`/
  // `progress_photos`'s `REFERENCES ... ON DELETE CASCADE` (05 §3.1-3.4)
  // are actually enforced on both backends, not just the one that happens
  // to default it on.
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');

  const driver: SqliteDriver = {
    dialect: 'better-sqlite3',

    execute(sql, params = []): SqliteRunResult {
      const info = db.prepare(sql).run(...(params as unknown[]));
      return {
        changes: info.changes,
        lastInsertRowId: Number(info.lastInsertRowid),
      };
    },

    queryAll<Row = SqliteRow>(sql: string, params: unknown[] = []): Row[] {
      return db.prepare(sql).all(...params) as Row[];
    },

    transaction<T>(fn: () => T): T {
      return db.transaction(fn)();
    },

    close(): void {
      db.close();
    },
  };

  return driver;
}
