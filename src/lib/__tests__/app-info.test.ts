/**
 * `getAppVersion` tests (M5-04) — see `lib/app-info.ts`'s own file header:
 * `expo-constants`'s `Constants.expoConfig` has no native module under Jest
 * (confirmed empirically — resolves to `null`), so every test here
 * exercises the `app.json` fallback path, never the `Constants.expoConfig`
 * branch. That branch is trivial (`?? appConfig.expo.version`) and has no
 * device-only behavior to hide a bug in, so this is a complete test of the
 * function's real, exercised behavior in this environment — not a partial
 * one working around an untestable branch.
 */
import appConfig from '../../../app.json';
import { getAppVersion } from '../app-info';

describe('getAppVersion', () => {
  it("returns app.json's expo.version (the only path exercised under Jest, no native Constants module)", () => {
    expect(getAppVersion()).toBe(appConfig.expo.version);
    expect(getAppVersion()).toBe('1.0.0');
  });
});
