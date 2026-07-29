/**
 * `lib/zip.ts` (M5-09, 05 §9) — the zip codec `BackupService`
 * (`features/data-transfer/backup-service.ts`) builds `kyro_backup_{date}.zip`
 * on top of. Pure TS, zero React/RN/Expo imports — same "dependency-free
 * logic core" posture `lib/csv.ts` already established (that file's own
 * header names the precedent) — the only difference is this one wraps two
 * small third-party packages instead of being hand-rolled from scratch, for
 * the reasons below.
 *
 * ## Library choice: `fflate`, not `jszip` or a native zip module
 *
 * `M5-tasks.md`'s M5-09 "How" line and this task's own brief both flag the
 * real constraint driving this choice: this machine is headless Linux with
 * no Xcode/Simulator and no way to rebuild/verify a native module at all
 * (`docs/plan/BLOCKERS.md`'s "Machine profile") — so a zip library that
 * needs native linking (`react-native-zip-archive` and similar) would ship
 * completely unverified from this environment, not just "verified less
 * thoroughly." A pure-JS library is the only choice whose actual code path
 * is testable here.
 *
 * Within pure-JS options, `fflate` over `jszip`:
 * - **Zero runtime dependencies** (`pnpm view fflate dependencies` returns
 *   nothing) — `jszip` pulls in `pako`, `lie` (a Promise polyfill this app
 *   doesn't need, real Promises exist), `setimmediate`, and `readable-stream`
 *   (a full Node stream polyfill) as unconditional prod dependencies. Every
 *   one of those is extra surface Metro has to resolve/bundle correctly for
 *   Hermes, and `readable-stream` in particular pulls in more Node-core-shaped
 *   polyfilling than this app needs anywhere else in its dependency tree —
 *   more to go wrong in exactly the one place (on-device bundling) this
 *   machine cannot verify at all.
 * - **Sync API by default** (`zipSync`/`unzipSync`) — `fflate`'s async API
 *   opportunistically offloads to Web Workers (browser) / `worker_threads`
 *   (Node), neither of which exist under Hermes; the sync API never touches
 *   either and is the form used everywhere in this file, so there is no
 *   worker-fallback code path to reason about at all.
 *  - Small (~8 kB), actively maintained, and already a common choice in
 *    other React Native apps needing in-app zip read/write for exactly this
 *    "bundle a few files into one shareable archive" shape (backups, offline
 *    exports) — not a native-linking need in the first place, since neither
 *    compression nor the zip container format touches any OS API.
 *
 * ## What this file does NOT verify
 *
 * `pnpm install` + a real Node round-trip (`zipSync`→`unzipSync` byte-for-
 * byte, this file's own test) confirms the *logic* is correct and portable
 * — Uint8Array in, Uint8Array out, no Node-only globals referenced anywhere
 * in `fflate`'s or `base64-js`'s sync code paths (both grepped by hand: no
 * `Buffer`, no `require('fs')`/`require('stream')` in either package's
 * browser/sync build). What it does *not* verify is Metro's actual package-
 * exports resolution picking the right build for an on-device Hermes bundle
 * — `npx expo export --platform ios` (run for this task, see
 * `docs/plan/EXECUTION-LOG.md`'s M5-09 row) confirms Metro can bundle both
 * packages without a resolution error, which is the closest check available
 * on this machine; it is not the same as a real device/simulator round-trip,
 * logged accordingly in `docs/plan/BLOCKERS.md`.
 *
 * ## Why `base64-js`, not `Buffer`/`atob`/`btoa`
 *
 * `expo-file-system`'s `readAsStringAsync`/`writeAsStringAsync` only accept
 * `EncodingType.Base64` for binary content (there is no raw-bytes API) — so
 * every photo file and the final zip archive round-trips through a base64
 * string at the `src/lib/backup-file.ts`/`progress-photos.ts` boundary
 * (`../lib/backup-file.ts`'s own header). Converting between that string and
 * the `Uint8Array` shape `fflate` wants needs a base64 codec that works
 * identically under Node (Jest) and on-device Hermes — global `Buffer` is
 * Node-only (RN/Hermes has no built-in polyfill, confirmed empirically by
 * `data/shared/uuid.ts`'s own header for the analogous `crypto` case), and
 * global `atob`/`btoa` are DOM/browser-only (absent from both Node and
 * Hermes without an explicit polyfill, neither of which this app installs).
 * `base64-js` is a zero-dependency, ~2 kB implementation used internally by
 * React Native's own historical `Blob`/base64 handling — safe under both
 * runtimes with no polyfill needed.
 */
import { fromByteArray, toByteArray } from 'base64-js';
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';

/** One file to place inside the zip archive. */
export interface ZipEntry {
  /** Path inside the archive, e.g. `'db.json'` or `'photos/progress/abc.jpg'` — forward slashes, never a leading `/`. */
  path: string;
  data: Uint8Array;
  /**
   * Skip deflate compression for this entry (store-only, level 0) — for
   * data that's already compressed (a re-encoded JPEG, 05 §8: "≤ 2048 px
   * q80") attempting to deflate it again wastes CPU for a negligible size
   * reduction, sometimes a net *increase* once the zip container overhead is
   * counted. `BackupService`'s photo entries all set this; `db.json` (plain
   * JSON text, genuinely compressible) does not.
   */
  store?: boolean;
}

/** Builds one zip archive from `entries` — deterministic given the same input (no timestamps/OS-specific metadata baked in beyond what `fflate` itself always writes). */
export function zipEntries(entries: readonly ZipEntry[]): Uint8Array {
  const zippable: Zippable = {};
  for (const entry of entries) {
    zippable[entry.path] = entry.store ? [entry.data, { level: 0 }] : entry.data;
  }
  return zipSync(zippable);
}

/** Inverse of {@link zipEntries} — every archived file's path -> its raw bytes. Throws (via `fflate`'s own `unzipSync`) on a corrupt/non-zip input; callers (`BackupService.restore`) catch this and surface a clear "not a valid backup" error rather than letting it propagate as a raw parse exception. */
export function unzipEntries(zipBytes: Uint8Array): Record<string, Uint8Array> {
  return unzipSync(zipBytes);
}

/** UTF-8 text -> bytes (`fflate`'s own `strToU8`, real UTF-8 — not a naive one-byte-per-char encoder). Used for `db.json`'s own text. */
export function utf8ToBytes(text: string): Uint8Array {
  return strToU8(text);
}

/** Inverse of {@link utf8ToBytes}. */
export function bytesToUtf8(bytes: Uint8Array): string {
  return strFromU8(bytes);
}

/** Base64 text (as read from `expo-file-system`'s `EncodingType.Base64`) -> raw bytes. See file header, "Why base64-js". */
export function base64ToBytes(base64: string): Uint8Array {
  return toByteArray(base64);
}

/** Inverse of {@link base64ToBytes} — raw bytes -> base64 text (ready for `expo-file-system`'s `EncodingType.Base64` write). */
export function bytesToBase64(bytes: Uint8Array): string {
  return fromByteArray(bytes);
}
