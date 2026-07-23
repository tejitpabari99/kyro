/**
 * Cold-start DB boot (M0-09) — 06 §5.1: "splash -> open DB -> run pending
 * migrations -> ...". This is the seam `app/_layout.tsx`'s DB-ready gate
 * calls: open the real on-device database (WAL on, `open-database.ts`) and
 * run every pending migration (`migrator.ts`) before the gate lets the tab
 * `<Stack>` render.
 *
 * Kept as its own module (rather than inlined in the layout) so RNTL tests
 * can `jest.mock('@/data/sqlite/boot')` to control the resolve/reject
 * outcome deterministically without touching `expo-sqlite` or a real
 * filesystem (08 §5: "mock only true natives").
 */
import { openAppDatabase } from './open-database';
import { migrate, type MigrationResult } from './migrator';
import type { SqliteDriver } from './driver';

let appDriver: SqliteDriver | undefined;

/**
 * The live app database connection, available only after `runDbBoot()`
 * resolves. Future repositories (M0-10+) should reuse this single
 * connection rather than opening a second one.
 */
export function getAppDriver(): SqliteDriver {
  if (!appDriver) {
    throw new Error('getAppDriver() called before runDbBoot() resolved.');
  }
  return appDriver;
}

/**
 * Open the app database and run pending migrations. Resolves once the
 * database is ready for the rest of the app to use; rejects (never throws
 * synchronously) if migration fails — 06 §9: "Migration failure at boot ->
 * blocking screen", which is exactly what a rejected boot promise triggers
 * in `app/_layout.tsx`.
 */
export async function runDbBoot(): Promise<MigrationResult> {
  const driver = openAppDatabase();
  try {
    const result = migrate(driver);
    appDriver = driver;
    return result;
  } catch (error) {
    driver.close();
    throw error;
  }
}
