/**
 * OS share-sheet native seam (M5-06) — the one file that touches
 * `expo-sharing`, mirroring `sentry.ts`/`sound.ts`/`files.ts`'s own "one file
 * per native seam" convention (`progress-photos.ts`'s header names this
 * exact precedent for the identical reason: keep an unmocked-under-Jest
 * native import isolated to the smallest possible surface).
 *
 * `expo-sharing` is a **new** dependency this task adds (`npx expo install
 * expo-sharing`) — `M5-04`'s own `diagnostics-export.ts` explicitly deferred
 * it (see that file's header: "not installed... use whatever sharing
 * mechanism is already available") since diagnostics export plain text via
 * React Native's own `Share.share({message})`, which needs no file URI. CSV
 * export (this task) and the eventual M5-09 backup zip both share a real
 * file already written to disk, which `Share.share` cannot target (it has no
 * `url`/file param on iOS) — the case `diagnostics-export.ts`'s header
 * itself predicted would "finally justify adding expo-sharing."
 *
 * ## Why `expo-sharing` is `require()`d lazily, inside a `try/catch` —
 * `src/lib/notifications.ts`/`sound.ts`'s own established pattern, not a new
 * one (found the hard way — a real regression, not a hypothetical)
 *
 * A plain top-level `import * as Sharing from 'expo-sharing'` was tried
 * first and **broke two existing full-app-router tests**
 * (`app/__tests__/settings-theme-e2e.test.tsx`,
 * `app/(tabs)/history/__tests__/history.test.tsx`) that render the real route
 * tree via `expo-router/testing-library`'s `renderRouter` — neither test
 * presses any export/share button, but merely *loading* the
 * `SettingsScreen`/`HistoryDetailScreen` route module was enough:
 * `expo-sharing`'s `SharingNativeModule` calls
 * `requireNativeModule('ExpoSharing')` at **module-evaluation time**
 * (confirmed via the real failing stack trace: `Cannot find native module
 * 'ExpoSharing'`, thrown the instant the module loads, not when a function
 * runs) — the exact same failure mode `notifications.ts`'s own header
 * documents for `expo-notifications`' push-token binding. A deferred dynamic
 * `import()` was tried next and **also failed**, for the identical reason
 * that file's header already names: "this Jest config's Babel transform
 * doesn't lower dynamic `import()` to a `require()`-based interop under the
 * `ui` project" — confirmed empirically here too (`A dynamic import callback
 * was invoked without --experimental-vm-modules`). Plain lazy `require()`
 * (inside the function, never at module scope) is the form that actually
 * works under this repo's Jest config *and* bundles identically under Metro
 * on-device — `loadExpoSharing` below is `notifications.ts`'s
 * `loadExpoNotifications`/`sound.ts`'s `loadExpoAudio`, same shape, third
 * instance of the same fix for the same class of native-eager-throw problem.
 *
 * `expo-sharing` has no jest-expo built-in automock (confirmed empirically —
 * absent from `jest-expo/src/preset/setup.js`'s mock list, unlike
 * `expo-file-system/legacy`) — both `SettingsScreen` and
 * `HistoryDetailScreen` call this file rather than importing `expo-sharing`
 * directly, so only this file's own test needs to actually exercise the raw
 * native module; the two screen tests mock this file's `shareFile` export
 * instead of the native package.
 *
 * No `app.json` config-plugin entry was needed for `expo-sharing` itself —
 * verified against the installed package (`node_modules/expo-sharing/
 * package.json` has no `plugin` field, and there is no `app.plugin.js` in
 * the package) confirming it is a pure JS-API wrapper around the OS share
 * sheet with no native config to inject. `npx expo install` still appended
 * `"expo-sharing"` as a bare string to `app.json`'s `plugins` array —
 * verified harmless (`npx expo config` resolves cleanly with it present) and
 * consistent with several other already-present bare-string entries for
 * equally plugin-less first-party packages (`expo-font`, `expo-image`,
 * `expo-status-bar`, `expo-web-browser`, `expo-audio`, `expo-asset`) — left
 * in place rather than removed, matching that established convention.
 */
export interface ShareFileOptions {
  /** Sets `mimeType` for the Android `Intent` (e.g. `'text/csv'`). */
  mimeType?: string;
  /** iOS Uniform Type Identifier — e.g. `'public.comma-separated-values-text'` for CSV. */
  UTI?: string;
  /** Android/web share-dialog title. */
  dialogTitle?: string;
}

/** See file header — `null` means "module unavailable" (no native host, e.g. under Jest, or a genuinely broken/unlinked install), handled by {@link shareFile} identically to the OS reporting sharing unavailable. */
function loadExpoSharing(): typeof import('expo-sharing') | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy load, see file header.
    return require('expo-sharing') as typeof import('expo-sharing');
  } catch {
    return null;
  }
}

/**
 * Opens the OS share sheet for `uri` (a `file://` URI already written to
 * disk by `lib/csv-export-file.ts` or, eventually, M5-09's backup writer).
 * Throws a plain, catchable `Error` when `expo-sharing` itself is
 * unavailable (see file header) or when the platform reports sharing
 * unavailable (`Sharing.isAvailableAsync()` — per `expo-sharing`'s own docs,
 * some Android configurations/older devices) rather than calling
 * `shareAsync` blindly and surfacing whatever native error that would raise
 * instead.
 *
 * `shareAsync` itself resolves once the OS share sheet is dismissed, whether
 * or not the user actually picked a destination app — the platform gives no
 * distinguishable signal for "user cancelled" vs. "user shared," so callers
 * only ever learn "the sheet was shown," never a shared/cancelled outcome
 * (documented here since it's easy to assume otherwise; callers must not
 * treat this function's resolution as "the user definitely shared the
 * file").
 */
export async function shareFile(uri: string, options?: ShareFileOptions): Promise<void> {
  const Sharing = loadExpoSharing();
  if (!Sharing) {
    throw new Error('Sharing is not available on this device.');
  }
  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(uri, options);
}
