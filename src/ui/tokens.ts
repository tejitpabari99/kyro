/**
 * Design tokens — the single source of truth for color, typography,
 * spacing, and radii across `src/ui/*`. Verbatim from
 * `docs/plan/07-design-system.md` §2 (color), §3 (typography), §4
 * (spacing/radii) — hex values, sizes, and weights are copied exactly from
 * that doc; nothing here is invented. If a value ever needs to change, the
 * doc changes first and this file follows.
 *
 * Architecture (06 §2 dependency rule, enforced by the M0-02 ESLint
 * boundary "ui imports tokens only"): this module is pure data/TS with
 * **zero React or React Native imports** — no `react`, no `react-native`,
 * no `expo*`. That keeps it cheap to unit-test in the `node` Jest project
 * (see `src/ui/__tests__/tokens.test.ts`, the WCAG contrast suite) and
 * keeps the base layer of `src/ui/` free of RN runtime weight. The React
 * context / `useColorScheme` wiring that turns these tokens into a live
 * theme lives in the separate `src/ui/theme-provider.tsx`, which is the
 * file allowed to depend on React/RN.
 */

/** The two themes the design system ships (07 §1 principle 2: dark-first, full light theme). */
export type ThemeName = 'dark' | 'light';

/**
 * A color expressed as a base hex value composited at partial opacity over
 * whatever sits beneath it (07 §2: `bg.accentSubtle` "#10B981 @ 8%",
 * `overlay` "#000000 @ 50%"). Kept as `{ hex, opacity }` rather than a
 * pre-flattened rgba string so the hex stays verbatim/traceable to the doc
 * and so the contrast test can alpha-composite it over an arbitrary
 * background to check the *resulting* on-screen color, not just the token
 * in isolation.
 */
export interface AlphaOverlay {
  /** Source color hex, before alpha blending. */
  readonly hex: string;
  /** Opacity applied over the surface beneath it, 0–1. */
  readonly opacity: number;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

function toHexChannel(value: number): string {
  return Math.round(value).toString(16).padStart(2, '0');
}

/** Flattens an `AlphaOverlay` to a plain `rgba(...)` CSS/RN color string. */
export function alphaOverlayToRgba({ hex, opacity }: AlphaOverlay): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/**
 * Composites an `AlphaOverlay` over an opaque hex background, returning the
 * resulting flattened hex color. Used by the contrast test to verify the
 * *effective* on-screen color of things like the checked-row tint, since
 * WCAG contrast math needs opaque colors on both sides.
 */
export function compositeOverlayOverHex(overlay: AlphaOverlay, backgroundHex: string): string {
  const fg = hexToRgb(overlay.hex);
  const bg = hexToRgb(backgroundHex);
  const r = overlay.opacity * fg.r + (1 - overlay.opacity) * bg.r;
  const g = overlay.opacity * fg.g + (1 - overlay.opacity) * bg.g;
  const b = overlay.opacity * fg.b + (1 - overlay.opacity) * bg.b;
  return `#${toHexChannel(r)}${toHexChannel(g)}${toHexChannel(b)}`;
}

// ---------------------------------------------------------------------------
// §2 Color tokens
// ---------------------------------------------------------------------------

/**
 * Brand ramp reference (07 §2 intro) — not a semantic token itself, but the
 * scale `accent.primary`/`accent.text`/etc. are drawn from. Kept here for
 * traceability and future use (e.g. the app-icon gradient, 07 §4).
 */
export const brandRamp = {
  emerald300: '#6EE7B7',
  emerald400: '#34D399',
  emerald500: '#10B981',
  emerald600: '#059669',
  emerald700: '#047857',
  teal400: '#2DD4BF',
  teal500: '#14B8A6',
} as const;

export interface ThemeColors {
  bg: {
    /** Screen background. */
    base: string;
    /** Cards, sheets, tab bar. */
    surface: string;
    /** Inputs, chips, nested surfaces, thumbnails. */
    elevated: string;
    /** Checked set-row tint, selected states — flattened rgba string. */
    accentSubtle: string;
  };
  border: {
    /** Separators (0.5 pt). */
    hairline: string;
    /** Input boxes, chip outlines. */
    input: string;
  };
  text: {
    /** Titles, values. */
    primary: string;
    /** Subtitles, PREVIOUS column, placeholders-adjacent labels. */
    secondary: string;
    /** Placeholders, disabled, captions. */
    tertiary: string;
  };
  accent: {
    /** Buttons, active tab, checked check, live duration, chart lines. */
    primary: string;
    /** Text links, exercise names, tinted icons. */
    text: string;
    /** Label on accent-filled controls. */
    onAccent: string;
    /** Pressed fills. */
    pressed: string;
  };
  semantic: {
    /** Destructive text/buttons, failure badge `F`, delete swipe. */
    danger: string;
    /** Warm-up badge `W`, cautions. */
    warning: string;
    /** Drop-set badge `D` only. */
    info: string;
    /** Label on `semantic.info`-filled controls (e.g. the rest-timer panel's Skip button). */
    onInfo: string;
    /** Checked states, PR banner — equals `accent.primary` (no separate green). */
    success: string;
    /** Second chart series (teal). */
    chartSecondary: string;
    /** Sheet scrim — flattened rgba string. */
    overlay: string;
  };
}

/** Raw alpha-overlay sources for tokens that are "@ X%" in the doc, kept
 * alongside the flattened `colors` values so the contrast test can
 * re-composite them over any background. */
export interface ThemeAlphaOverlays {
  bgAccentSubtle: AlphaOverlay;
  overlay: AlphaOverlay;
}

const darkAlphaOverlays: ThemeAlphaOverlays = {
  bgAccentSubtle: { hex: '#10B981', opacity: 0.08 },
  overlay: { hex: '#000000', opacity: 0.5 },
};

const lightAlphaOverlays: ThemeAlphaOverlays = {
  bgAccentSubtle: { hex: '#059669', opacity: 0.08 },
  overlay: { hex: '#000000', opacity: 0.5 },
};

export const alphaOverlays: Record<ThemeName, ThemeAlphaOverlays> = {
  dark: darkAlphaOverlays,
  light: lightAlphaOverlays,
};

// 07 §2.1 — Dark theme (default)
const darkColors: ThemeColors = {
  bg: {
    base: '#0B0D0C',
    surface: '#161A18',
    elevated: '#1E2422',
    accentSubtle: alphaOverlayToRgba(darkAlphaOverlays.bgAccentSubtle),
  },
  border: {
    hairline: '#242A27',
    input: '#2E3532',
  },
  text: {
    primary: '#F4F7F5',
    secondary: '#9CA8A2',
    tertiary: '#66716C',
  },
  accent: {
    primary: '#10B981',
    text: '#34D399',
    onAccent: '#04231A',
    pressed: '#0DA271',
  },
  semantic: {
    danger: '#EF4444',
    warning: '#F59E0B',
    info: '#3B82F6',
    onInfo: '#FFFFFF',
    success: '#10B981', // = accent.primary (dark)
    chartSecondary: '#2DD4BF',
    overlay: alphaOverlayToRgba(darkAlphaOverlays.overlay),
  },
};

// 07 §2.2 — Light theme
const lightColors: ThemeColors = {
  bg: {
    base: '#F3F6F4',
    surface: '#FFFFFF',
    elevated: '#EDF1EF',
    accentSubtle: alphaOverlayToRgba(lightAlphaOverlays.bgAccentSubtle),
  },
  border: {
    hairline: '#E3E9E5',
    input: '#D3DCD7',
  },
  text: {
    primary: '#16211C',
    secondary: '#56635D',
    tertiary: '#8B958F',
  },
  accent: {
    primary: '#059669',
    text: '#047857',
    onAccent: '#FFFFFF',
    pressed: '#04785C',
  },
  semantic: {
    danger: '#DC2626',
    warning: '#D97706',
    info: '#2563EB',
    onInfo: '#FFFFFF',
    success: '#059669', // = accent.primary (light)
    chartSecondary: '#14B8A6',
    overlay: alphaOverlayToRgba(lightAlphaOverlays.overlay),
  },
};

/** 07 §2.1/§2.2/§2.3 — semantic color tokens, resolved per theme. */
export const colors: Record<ThemeName, ThemeColors> = {
  dark: darkColors,
  light: lightColors,
};

/**
 * 07 §2.4 — Set-type badge colors. Not new hex values: `W`/`D`/`F` reference
 * the semantic tokens above, and "normal" reuses `text.secondary`. Badge
 * chrome itself (24 pt circle, `bg.elevated` fill, semibold 13 letter) is a
 * component concern (`src/ui/` primitives, M0-06), not a token.
 */
export function setTypeBadgeColors(theme: ThemeName): {
  W: string;
  D: string;
  F: string;
  normal: string;
} {
  const t = colors[theme];
  return {
    W: t.semantic.warning,
    D: t.semantic.info,
    F: t.semantic.danger,
    normal: t.text.secondary,
  };
}

/**
 * 07 §2.5 — Superset palette, cycled by group index. Identical in both
 * themes; deliberately excludes accent/semantic hues.
 */
export const supersetPalette = [
  '#8B5CF6', // violet
  '#06B6D4', // cyan
  '#EC4899', // pink
  '#A3E635', // lime
  '#6366F1', // indigo
  '#D946EF', // fuchsia
] as const;

// ---------------------------------------------------------------------------
// §3 Typography
// ---------------------------------------------------------------------------

/**
 * A single typography style. Deliberately not typed against React Native's
 * `TextStyle` (that would pull an RN import into this file) — the shape is
 * structurally compatible with `TextStyle` (`fontWeight` as a numeric
 * string, `fontVariant` as an array of RN's `FontVariant` literals) so
 * spreading a `TypographyStyle` into a `<Text style={...}>` in `src/ui/`
 * components type-checks without this file depending on `react-native`.
 */
export interface TypographyStyle {
  fontSize: number;
  fontWeight: '400' | '600' | '700';
  /** Present only where the doc specifies tracking (footnote column headers). */
  letterSpacing?: number;
  /** Mandatory tabular figures for every style that renders a mutable number (07 §3). */
  fontVariant?: readonly ['tabular-nums'];
}

const FONT_WEIGHT = {
  regular: '400',
  semibold: '600',
  bold: '700',
} as const;

/**
 * 07 §3 typography table, verbatim sizes/weights. System font only (SF Pro
 * on iOS, platform default elsewhere) — no bundled font family here;
 * consumers that need `fontFamily` add it at the component layer.
 *
 * `footnote` carries only its base size/weight here. The doc's "+0.5
 * tracking, uppercase" note is specific to its *column-header* usage, not
 * footnote's general "meta text" usage — baking `letterSpacing`/
 * `textTransform` into the base token would wrongly apply header tracking
 * to every meta-text footnote. Column-header components (M0-06+) should
 * layer `letterSpacing: 0.5` + `textTransform: 'uppercase'` on top of this
 * base style at the call site.
 */
export const typography = {
  display: { fontSize: 34, fontWeight: FONT_WEIGHT.bold },
  title1: { fontSize: 28, fontWeight: FONT_WEIGHT.bold },
  title2: { fontSize: 22, fontWeight: FONT_WEIGHT.semibold },
  title3: { fontSize: 20, fontWeight: FONT_WEIGHT.semibold },
  headline: { fontSize: 17, fontWeight: FONT_WEIGHT.semibold },
  body: { fontSize: 17, fontWeight: FONT_WEIGHT.regular },
  subhead: { fontSize: 15, fontWeight: FONT_WEIGHT.regular },
  footnote: { fontSize: 13, fontWeight: FONT_WEIGHT.regular },
  caption: { fontSize: 12, fontWeight: FONT_WEIGHT.regular },
  statLarge: {
    fontSize: 28,
    fontWeight: FONT_WEIGHT.semibold,
    fontVariant: ['tabular-nums'],
  },
  statSmall: {
    fontSize: 15,
    fontWeight: FONT_WEIGHT.semibold,
    fontVariant: ['tabular-nums'],
  },
  setValue: {
    fontSize: 17,
    fontWeight: FONT_WEIGHT.semibold,
    fontVariant: ['tabular-nums'],
  },
} as const satisfies Record<string, TypographyStyle>;

/** Dynamic Type ceilings (07 §3): 1.4x in the set table, 2.0x elsewhere. */
export const maxFontSizeMultiplier = {
  setTable: 1.4,
  default: 2.0,
} as const;

// ---------------------------------------------------------------------------
// §4 Layout: spacing scale, radii
// ---------------------------------------------------------------------------

/**
 * 07 §4 spacing scale (pt): 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, named
 * `space.05–12` in the doc — a 4pt base-unit scale (0.5x, 1x, 2x, 3x, 4x,
 * 5x, 6x, 8x, 10x, 12x of 4pt). Keyed by that multiplier here.
 */
export const spacing = {
  '0.5': 2,
  '1': 4,
  '2': 8,
  '3': 12,
  '4': 16,
  '5': 20,
  '6': 24,
  '8': 32,
  '10': 40,
  '12': 48,
} as const;

/** Named layout constants called out explicitly in 07 §4 (aliases into the scale above). */
export const layout = {
  /** Screen gutters. */
  screenGutter: spacing['4'],
  /** Card inner padding. */
  cardPadding: spacing['4'],
  /** Vertical rhythm between cards. */
  cardGap: spacing['3'],
} as const;

/** 07 §4 radii (pt). */
export const radii = {
  /** Inputs, chips. */
  sm: 8,
  /** Cards, buttons. */
  md: 12,
  /** Sheets, modals. */
  lg: 16,
  /** Finish pill, timer pill, badges. */
  pill: 999,
} as const;
