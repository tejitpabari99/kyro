/**
 * `getAppVersion` (M5-04, 04 §7 "About: version") — the marketing version
 * string (`10` §8: "SemVer-ish marketing versions", `app.json`'s
 * `expo.version`) for the Settings → About screen.
 *
 * Reads `expo-constants`'s `Constants.expoConfig?.version` first — the
 * documented, on-device-correct way to read the *running* build's own
 * manifest version (matches whatever `app.json`/EAS actually shipped, not
 * necessarily the same source tree this line was compiled from, if those
 * ever drift) — falling back to `app.json`'s `expo.version` field directly
 * when that's unavailable. The fallback isn't just defensive dead code: this
 * app's `expo-constants` install has **no native module** under Jest
 * (`jest-expo`'s test environment — confirmed empirically, `Constants
 * .expoConfig` resolves to `null` there, with a console warning), so every
 * Jest run exercises the `app.json` fallback path, never the
 * `Constants.expoConfig` branch — this is also why the fallback must be a
 * plain, `resolveJsonModule`-imported read (`expo/tsconfig.base` already
 * enables it) rather than something that itself needs a native module.
 */
import Constants from 'expo-constants';

import appConfig from '../../app.json';

export function getAppVersion(): string {
  return Constants.expoConfig?.version ?? appConfig.expo.version;
}
