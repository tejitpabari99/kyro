/**
 * Theme provider — the React/RN-dependent half of the token system
 * (`src/ui/tokens.ts` holds the pure data half, see that file's header for
 * the architectural rationale). Exposes the resolved token set for the
 * *current* theme via context, and resolves `system` against the OS
 * appearance via `useColorScheme`.
 *
 * --- Integration seam for M0-10 (read before changing) -------------------
 * `SettingsRepository`/`settingsStore` don't exist yet (M0-10 builds them).
 * Until then, this provider is a **controlled component with an
 * uncontrolled fallback**:
 *   - Pass `preference` + `onPreferenceChange` and this provider is fully
 *     controlled by the caller (the intended M0-10 shape: app root reads
 *     `settingsStore.theme`, passes it as `preference`, and wires
 *     `onPreferenceChange` to `SettingsRepository.set('theme', …)` +
 *     `settingsStore` update so the change is instant app-wide and
 *     persists across relaunch, per M0-10's acceptance gate).
 *   - Leave both undefined (today, pre-M0-10) and the provider manages its
 *     own local `useState<ThemePreference>('system')` so consumers still
 *     get a working theme during M0-06 through M0-09.
 * M0-10 should wire the controlled props at the app-root `ThemeProvider`
 * usage and can delete the local-state fallback branch only once nothing
 * still depends on the uncontrolled mode (dev gallery, tests) — until then
 * leaving the fallback in place is harmless and keeps this component
 * usable in isolation (Storybook-less RNTL smoke tests, dev gallery, etc).
 */
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';

import {
  alphaOverlays,
  colors,
  layout,
  maxFontSizeMultiplier,
  radii,
  spacing,
  supersetPalette,
  typography,
  type ThemeAlphaOverlays,
  type ThemeColors,
  type ThemeName,
} from './tokens';

/** The user-facing setting value (05 §3.5 `theme` key): resolves against OS scheme when `'system'`. */
export type ThemePreference = 'system' | 'light' | 'dark';

export interface ThemeContextValue {
  /** The effective resolved theme ('dark' | 'light') after resolving 'system'. */
  themeName: ThemeName;
  /** The raw preference currently in effect — may be 'system'. */
  preference: ThemePreference;
  /** Request a preference change. No-ops the local fallback state when controlled (see file header). */
  setPreference: (preference: ThemePreference) => void;
  colors: ThemeColors;
  alphaOverlays: ThemeAlphaOverlays;
  typography: typeof typography;
  spacing: typeof spacing;
  layout: typeof layout;
  radii: typeof radii;
  supersetPalette: typeof supersetPalette;
  maxFontSizeMultiplier: typeof maxFontSizeMultiplier;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export interface ThemeProviderProps {
  children: React.ReactNode;
  /** Controlled theme preference — see file header. Omit to use local state (pre-M0-10 default). */
  preference?: ThemePreference;
  /** Called on every preference change request — wire to SettingsRepository in M0-10. */
  onPreferenceChange?: (preference: ThemePreference) => void;
}

/** 07 §1 principle 2: dark-first — the fallback when OS scheme is unavailable/unknown. */
const FALLBACK_THEME: ThemeName = 'dark';

export function ThemeProvider({
  children,
  preference: controlledPreference,
  onPreferenceChange,
}: ThemeProviderProps): React.JSX.Element {
  const systemScheme = useColorScheme(); // 'light' | 'dark' | null | undefined
  const [localPreference, setLocalPreference] = useState<ThemePreference>('system');

  const isControlled = controlledPreference !== undefined;
  const preference = isControlled ? controlledPreference : localPreference;

  const setPreference = useCallback(
    (next: ThemePreference) => {
      onPreferenceChange?.(next);
      if (!isControlled) {
        setLocalPreference(next);
      }
    },
    [isControlled, onPreferenceChange],
  );

  const themeName: ThemeName = useMemo(() => {
    if (preference === 'system') {
      return systemScheme === 'light' || systemScheme === 'dark' ? systemScheme : FALLBACK_THEME;
    }
    return preference;
  }, [preference, systemScheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      themeName,
      preference,
      setPreference,
      colors: colors[themeName],
      alphaOverlays: alphaOverlays[themeName],
      typography,
      spacing,
      layout,
      radii,
      supersetPalette,
      maxFontSizeMultiplier,
    }),
    [themeName, preference, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Reads the resolved token set for the current theme. Must be used within a `ThemeProvider`. */
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme() must be called within a <ThemeProvider>.');
  }
  return ctx;
}
