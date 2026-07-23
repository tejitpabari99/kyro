/**
 * App-only DB-open wiring (M0-09) — opens the on-device database through
 * the `expo-sqlite` driver shim (`driver.expo.ts`, M0-03) and turns WAL mode
 * on (05 §10 / 06 §5.3: "WAL mode on"). Mirrors `driver.expo.ts`'s own
 * app-only boundary: only ever imported from app bootstrap code
 * (`src/data/sqlite/boot.ts`) so `expo-sqlite` never enters the Node/Jest
 * test path (08 §5) — Jest/Node integration tests open their own
 * `better-sqlite3` driver directly instead (that backend already sets WAL
 * itself, see `driver.better-sqlite3.ts`).
 */
import { openExpoSqliteDriver } from './driver.expo';
import type { SqliteDriver } from './driver';

/** The on-device database file name (passed through to `expo-sqlite`). */
export const DATABASE_NAME = 'kyro.db';

/** Open the app's real on-device database with WAL mode enabled. */
export function openAppDatabase(databaseName: string = DATABASE_NAME): SqliteDriver {
  const driver = openExpoSqliteDriver(databaseName);
  driver.execute('PRAGMA journal_mode = WAL;');
  return driver;
}
