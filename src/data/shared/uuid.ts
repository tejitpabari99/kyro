/**
 * `generateUuid` (M1-06 review fix) — the one RFC 4122 v4 UUID generator
 * every `src/data/**` repository that mints a new primary key for a
 * user-created row should import, instead of each repository growing its
 * own copy. 05's conventions line is explicit: "ids: UUIDv4 TEXT for
 * user-created rows" — that is `ExerciseRepositoryImpl.create` today
 * (M1-06) and will be `WorkoutRepository`/`RoutineRepository` (M2/M3) next;
 * all three need the exact same primitive, so it lives here, once.
 *
 * ## Why `src/data/shared/`, not `src/domain/` or `src/lib/`
 *
 * - `src/domain/**` must stay zero-Expo-import pure TS — its own ESLint zone
 *   rule (`eslint.config.js`) hard-blocks any `expo-*` import from that
 *   directory. The real on-device path below needs `expo-crypto`, so this
 *   cannot live in `domain/`.
 * - `src/lib/**` is exactly where a native-capability wrapper like this
 *   would normally go (see `haptics.ts`/`notifications.ts` there), but
 *   `eslint.config.js`'s `import/no-restricted-paths` for the `src/data`
 *   zone explicitly forbids `src/data` importing `src/lib` (06 §2: "data
 *   imports domain types only" — enforced, not just documented). Putting it
 *   in `src/lib/` would make it unimportable from here without breaking the
 *   lint gate.
 * - `src/data/shared/` is a same-zone import for every current and future
 *   `src/data/<table>/` repository, so it crosses no boundary and needs no
 *   lint carve-out.
 *
 * ## Why not `crypto.randomUUID()` alone, and not a `Math.random` fallback
 *
 * The previous implementation (M1-06's original commit) fell back to a
 * hand-rolled `Math.random`-based v4 UUID whenever `globalThis.crypto`
 * lacked `randomUUID`, reasoning it was "unconfirmed" whether on-device
 * Hermes exposes it. Confirmed directly for this fix: it does not.
 * `node_modules/react-native` ships no JS-facing `crypto.getRandomValues`/
 * `crypto.randomUUID` polyfill anywhere in its source (grepped the whole
 * package — only unrelated native-side `randomUUID()` calls inside
 * Android's own networking/blob modules turn up, never anything exposed to
 * JS), so `globalThis.crypto` is simply `undefined` in the on-device Hermes
 * runtime. That means the `Math.random` branch was not a rare degraded-mode
 * fallback — it was the **only** branch that could ever run in a real,
 * on-device build, for every exercise a user ever creates. `Math.random` is
 * not a cryptographically-secure source and gives no real collision
 * guarantee; for ids that must stay globally unique across devices for
 * idempotent cloud-sync upserts (`12` §5/§9, once MC-03 lands), that is a
 * real (if currently latent) data-integrity risk, not a style nit — worth
 * fixing now while only one repository depends on this primitive, rather
 * than after M2/M3 also start calling it.
 *
 * The fix: prefer `globalThis.crypto.randomUUID()` when present (true
 * unconditionally in the Node/Jest process both Jest projects in
 * `jest.config.js` run in — Node has shipped a global `crypto.randomUUID`
 * since Node 19; confirmed empirically against this repo's Node 20 runtime
 * with no import needed), else fall back to `expo-crypto`'s `randomUUID()`
 * — an Expo **first-party** module (06 §1's dependency table rationale:
 * "first-party modules for every native need"), backed by the OS's real
 * CSPRNG on both iOS and Android (`SecRandomCopyBytes` / `SecureRandom`),
 * not an approximation. Added as a real dependency: `expo-crypto@~56.0.4`
 * (matches every other `expo-*` package's SDK 56 pin style in
 * `package.json`).
 *
 * The `expo-crypto` import is a **deferred dynamic `import()`** (not a
 * top-level `import`) so this module stays importable from the fast `node`
 * Jest project (`src/data/**` tests run with no React/Expo native-module
 * host present at all — `jest.config.js`'s `node` project has no
 * `jest-expo` preset). `expo-crypto`'s entry point calls
 * `requireNativeModule('ExpoCrypto')` at module-evaluation time, which
 * throws outside a real native-module host; deferring the import means that
 * line is only ever reached if the `crypto.randomUUID` branch above is
 * unavailable, which — per the paragraph above — is never true in the
 * Node/Jest process, only in the real Metro/Hermes bundle where the native
 * module host actually exists to satisfy it. (Tests for both branches live
 * in `./__tests__/uuid.test.ts`, using `jest.mock('expo-crypto', ...)` so
 * the real native module is never touched even when exercising the
 * fallback branch.)
 */
export async function generateUuid(): Promise<string> {
  const globalCrypto = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (typeof globalCrypto?.randomUUID === 'function') {
    return globalCrypto.randomUUID();
  }
  const ExpoCrypto = await import('expo-crypto');
  return ExpoCrypto.randomUUID();
}
