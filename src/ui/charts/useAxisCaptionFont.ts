/**
 * Shared axis-label font for `LineChart`/`BarChart`/`StackedBarChart` (07
 * §7: "axis labels caption/`text.tertiary`"). Uses Skia's `matchFont`
 * against the `'System'` family — this project bundles no custom fonts (07
 * §3: "System font ... no bundled fonts"), and `matchFont`'s whole purpose
 * is resolving the OS's real system font by name at the native layer, so
 * this is the correct on-device choice (SF Pro on iOS).
 *
 * Wrapped in a `try/catch` for one specific, verified reason: under this
 * project's Jest/`canvaskit-wasm` test environment (`jest.config.js`'s `ui`
 * project, M4-07) there is no real OS font manager — `matchFont`'s
 * `Skia.FontMgr.System()` fallback can't resolve a `'System'` typeface
 * against the headless CanvasKit-wasm engine and throws
 * (`BindingError: Cannot pass "undefined" as a sk_sp<Typeface>`, confirmed
 * empirically). `@shopify/react-native-skia` ships a `jestSetup.js` meant
 * to no-op `matchFont` entirely under Jest, but that mock targets its
 * `lib/commonjs` build while this project's Jest config resolves the
 * package's `"react-native"` field (`lib/module`, matching Metro's
 * resolution on-device) — the two mismatch, so the mock never applies here.
 * Returning `null` on failure degrades exactly the way a `null` font
 * already does elsewhere in this file (`CartesianAxis` skips rendering
 * label text when `font` is falsy but still draws the gridlines) — real
 * devices never hit the `catch` branch.
 */
import { useMemo } from 'react';
import { matchFont, type SkFont } from '@shopify/react-native-skia';

export function useAxisCaptionFont(fontSize: number): SkFont | null {
  return useMemo(() => {
    try {
      return matchFont({ fontFamily: 'System', fontSize, fontWeight: '400' });
    } catch {
      return null;
    }
  }, [fontSize]);
}
