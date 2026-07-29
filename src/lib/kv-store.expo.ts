/**
 * Device backend for {@link KvStore} (see `kv-store.ts`'s file header for
 * the full rationale). Only ever imported from app bootstrap code
 * (`app/_layout.tsx`) — mirrors `src/data/sqlite/driver.expo.ts`'s exact
 * split for the same underlying reason: `expo-sqlite/kv-store` needs a
 * native module host and cannot run under plain Node/Jest.
 *
 * ## Why every method does its own lazy, try/caught `require('expo-sqlite/kv-store')`
 * Unlike `driver.expo.ts` (kept fully out of the Jest module graph by a
 * `jest.mock('@/data/sqlite/boot')` factory, since nothing else statically
 * imports it), this file's only caller (`app/_layout.tsx`) is a component
 * every layout-rendering RNTL test (`db-gate`, `tabs-layout`,
 * `settings-theme-e2e`) renders for real. A top-level
 * `import { Storage } from 'expo-sqlite/kv-store'` throws synchronously the
 * instant *anything* imports this file under `jest-expo` — confirmed
 * empirically: `Cannot find native module 'ExpoSQLite'`, because that
 * package's entry point eagerly `requireNativeModule`s at
 * module-evaluation time (the exact same class of issue
 * `src/lib/notifications.ts` documents for `expo-notifications`, and its
 * identical fix here too — see that file's header for why lazy `require()`
 * wrapped in `try/catch`, not a dynamic `import()`, is the form that
 * actually works under this repo's Jest/Babel setup). Each method below
 * loads lazily and degrades to a no-op/`null` read if the native module is
 * unavailable, so `app/_layout.tsx`'s one call site (already wrapped in its
 * own try/catch — a kv-store failure must not block boot) never actually
 * needs to catch anything in this environment, and would behave
 * sensibly even if it somehow didn't.
 *
 * Not exercised by any test in this environment (no iOS Simulator/device
 * available — see `docs/plan/BLOCKERS.md`); this file's job is to exist,
 * typecheck, and mirror `driver.expo.ts`'s device-only-file shape.
 */
import type { KvStore } from './kv-store';

/** See file header — `null` means "unavailable," every method treats that as a safe no-op/empty read. */
function loadExpoKvStorage(): typeof import('expo-sqlite/kv-store') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy load, see file header.
    return require('expo-sqlite/kv-store') as typeof import('expo-sqlite/kv-store');
  } catch {
    return null;
  }
}

/** The on-device `KvStore` — SQLite-backed, survives relaunch (unlike `createMemoryKvStore()`). */
export function openExpoKvStore(): KvStore {
  return {
    async getItem(key) {
      const mod = loadExpoKvStorage();
      return mod ? mod.Storage.getItem(key) : null;
    },
    async setItem(key, value) {
      const mod = loadExpoKvStorage();
      if (mod) {
        await mod.Storage.setItem(key, value);
      }
    },
    async removeItem(key) {
      const mod = loadExpoKvStorage();
      if (mod) {
        await mod.Storage.removeItem(key);
      }
    },
  };
}
