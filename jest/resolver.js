/**
 * Custom Jest resolver for the `ui` project (M0-08), chaining two scoped
 * platform-extension overrides on top of `defaultResolver`:
 *
 * 1. `react-native-worklets`'s own resolver (M0-07, `jest.config.js`'s
 *    `ui` project header has the full rationale): strips `.native.*`
 *    extensions, but only when resolving *inside* the
 *    `react-native-worklets` package itself — so its `NativeWorklets`
 *    class (which throws synchronously if the native module isn't
 *    registered, true under Jest) is never picked over the web-safe
 *    fallback Reanimated 4 otherwise self-selects via
 *    `process.env.JEST_WORKER_ID`.
 * 2. Same technique, applied to `expo-router`'s internal `toolbar/native`
 *    module (added M0-08): `expo-router`'s native-stack unconditionally
 *    imports a router-toolbar native view (iOS 26 "Liquid Glass" toolbar
 *    support) whose `.ios.tsx`/`.android.tsx` variants call
 *    `requireNativeViewManager('ExpoRouterToolbarModule')` /
 *    `@expo/ui/jetpack-compose` at module-eval time — both throw
 *    synchronously under Jest (no simulator/device, and neither ships a
 *    jest-expo `mocks/<Name>.js`, so jest-expo's own native-view-manager
 *    auto-mock in `jest-expo/src/preset/setup.js` can't help here).
 *    `expo-router` ships a third variant with **no** platform suffix
 *    (`toolbar/native.ts`) that is a plain no-op (`return null`) — exactly
 *    what every `ui`-project test wants, since none renders on a real iOS/
 *    Android host. Stripping the `.ios.`/`.android.` extensions only when
 *    resolving inside `expo-router` forces that fallback without touching
 *    resolution anywhere else in the project.
 *
 * Scoped to `options.basedir`/`request` containing the package name in
 * each case, same pattern `react-native-worklets/jest/resolver.js` already
 * uses — this file only adds the second rule and delegates everything
 * else straight through.
 */
const workletsResolver = require('react-native-worklets/jest/resolver.js');

const PLATFORM_EXTENSION_PATTERN = /\.(ios|android)\./;

module.exports = function resolver(request, options) {
  const touchesExpoRouter =
    options.basedir.includes('expo-router') || request.includes('expo-router');

  if (touchesExpoRouter && options.extensions != null) {
    const routerOptions = {
      ...options,
      extensions: options.extensions.filter((ext) => !PLATFORM_EXTENSION_PATTERN.test(ext)),
    };
    return workletsResolver(request, routerOptions);
  }

  return workletsResolver(request, options);
};
