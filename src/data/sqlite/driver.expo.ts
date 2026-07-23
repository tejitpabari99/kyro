/**
 * Device backend for `SqliteDriver` (08 §5). Only ever imported from app
 * bootstrap code (wired up in M0-09) — never from the node-env Jest
 * project, so `expo-sqlite` (which needs a native module host and cannot
 * run under plain Node) never ends up on the test path.
 *
 * Not exercised by any test in this environment (no iOS Simulator/device
 * available here — see docs/plan/BLOCKERS.md); parity with the
 * better-sqlite3 backend is asserted by the shared `SqliteDriver` contract
 * plus the device smoke test via Maestro flow #1 (08 §5). This file's job
 * for M0-03 is to exist, typecheck, and mirror driver.better-sqlite3.ts's
 * shape exactly.
 */
import { openDatabaseSync } from 'expo-sqlite';

import type { SqliteDriver, SqliteRow, SqliteRunResult } from './driver';

/** Open an `expo-sqlite`-backed driver for the on-device database. */
export function openExpoSqliteDriver(databaseName: string): SqliteDriver {
  const db = openDatabaseSync(databaseName);

  const driver: SqliteDriver = {
    dialect: 'expo-sqlite',

    execute(sql, params = []): SqliteRunResult {
      const result = db.runSync(sql, params as (string | number | null)[]);
      return {
        changes: result.changes,
        lastInsertRowId: result.lastInsertRowId,
      };
    },

    queryAll<Row = SqliteRow>(sql: string, params: unknown[] = []): Row[] {
      return db.getAllSync<Row>(sql, params as (string | number | null)[]);
    },

    transaction<T>(fn: () => T): T {
      let result: T | undefined;
      db.withTransactionSync(() => {
        result = fn();
      });
      return result as T;
    },

    close(): void {
      db.closeSync();
    },
  };

  return driver;
}
