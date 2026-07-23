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
