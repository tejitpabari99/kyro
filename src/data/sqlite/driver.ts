/**
 * SqliteDriver — the abstraction that lets the rest of `src/data/` (the
 * migration runner, and later Drizzle repositories, M0-09/M1) talk to SQLite
 * without caring whether it is running on-device (`expo-sqlite`) or in a
 * Jest/Node test process (`better-sqlite3`).
 *
 * Rationale (05 §"P1", 08 §5): repositories are integration-tested against
 * `better-sqlite3` running the **exact same migrations** the device runs —
 * that parity is only trustworthy if both drivers are reached through one
 * narrow, shared surface. This file defines that surface only; it has zero
 * runtime dependencies on either backend so it is safe to import from
 * anywhere in `src/data/` without pulling native code into the wrong
 * bundle (Metro for the app, Node for tests).
 *
 * Concrete implementations live beside this file:
 * - `driver.expo.ts`    — device backend, `expo-sqlite` (Metro/app only).
 * - `driver.better-sqlite3.ts` — test backend, `better-sqlite3` (Node/Jest only).
 *
 * Neither implementation file is imported by the other, and neither is
 * imported here — callers (app bootstrap in M0-09; test fixtures now) pick
 * the one appropriate for their environment. That keeps `better-sqlite3`
 * (a native Node addon) out of the Metro bundle, and keeps `expo-sqlite`
 * (which needs a native module host) out of the Node/Jest process.
 *
 * This is a skeleton (M0-03 scope): the shape exists and is proven with a
 * trivial round-trip test on the better-sqlite3 side. Drizzle wiring,
 * migrations, and WAL setup land in M0-09.
 */

/** Result of a write statement (INSERT/UPDATE/DELETE/DDL). */
export interface SqliteRunResult {
  /** Number of rows affected by the statement. */
  changes: number;
  /** Rowid of the last inserted row, when applicable. */
  lastInsertRowId: number;
}

/** A loosely-typed result row — callers narrow this at the call site. */
export type SqliteRow = Record<string, unknown>;

/**
 * The common surface both backends implement. Intentionally small: this is
 * not meant to replace Drizzle's query builder (that wraps the native
 * handles directly in M1) — it exists for the migration runner and other
 * raw-SQL needs that must behave identically on both drivers.
 */
export interface SqliteDriver {
  /** Which concrete backend this instance is — useful in assertions/logs. */
  readonly dialect: 'expo-sqlite' | 'better-sqlite3';

  /** Run a statement that does not return rows (DDL, INSERT/UPDATE/DELETE). */
  execute(sql: string, params?: unknown[]): SqliteRunResult;

  /** Run a SELECT and return every matching row. */
  queryAll<Row = SqliteRow>(sql: string, params?: unknown[]): Row[];

  /** Run `fn` inside a single transaction; rolls back if `fn` throws. */
  transaction<T>(fn: () => T): T;

  /** Release the underlying connection/handle. */
  close(): void;
}

/** Shape of the two backends' `open*Driver` factory functions. */
export type SqliteDriverFactory = (databaseName: string) => SqliteDriver;
