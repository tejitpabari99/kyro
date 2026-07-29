/**
 * Generic key/value persistence seam (06 §4.3 / §9's "KV cache:
 * `expo-sqlite/kv-store` (Zustand persistence, small flags)"). `restTimerStore`
 * (M2-10) is the first consumer — it persists the active rest timer under
 * the `active_timer` key (`RestTimerStore`'s own file header) so a
 * force-quit/relaunch within the timer's window can restore the remaining
 * time (06 §4.3, 02 §16.9 edge case #1). Future kv consumers (CloudSync
 * session storage, `12` §"Session persistence") go through this same
 * interface.
 *
 * --- Persistence backend: split by environment, same as the DB driver -----
 * Mirrors `src/data/sqlite/driver.ts`'s expo/better-sqlite3 device boundary:
 * `expo-sqlite/kv-store` needs a native module host and cannot run under
 * plain Jest/Node. `createMemoryKvStore()` below is the Jest-safe
 * implementation (also handy for any pure in-memory use); the real
 * on-device implementation lives in `kv-store.expo.ts` (`openExpoKvStore()`)
 * — see that file's header for why its methods each do their own dynamic
 * `import('expo-sqlite/kv-store')` rather than a static top-level one (a
 * `driver.expo.ts`-style file-level split alone isn't enough here, because
 * unlike that file, `kv-store.expo.ts` genuinely is reachable from a
 * component every layout-rendering RNTL test renders — `app/_layout.tsx`).
 * Wired at boot in `app/_layout.tsx` (`useRestTimerStore.getState()
 * .restore(openExpoKvStore())`, right after `activeWorkoutStore`'s own
 * rehydrate, 06 §5.1), wrapped in a try/catch there since a kv-store
 * failure must not block boot the way a DB/settings failure does.
 */

/** Minimal async key/value contract — every method is fire-and-forget-safe (callers already treat persistence as best-effort, never a source of truth). */
export interface KvStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/** In-memory `KvStore` — Jest-safe, and the app's default until a device-backed store is wired at boot (see file header). Each call constructs an independent instance (tests want isolation; mirrors `createSettingsStore()`/`createActiveWorkoutStore()`'s "factory, not shared singleton" rationale). */
export function createMemoryKvStore(): KvStore {
  const map = new Map<string, string>();
  return {
    async getItem(key) {
      return map.has(key) ? map.get(key)! : null;
    },
    async setItem(key, value) {
      map.set(key, value);
    },
    async removeItem(key) {
      map.delete(key);
    },
  };
}
