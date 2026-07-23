/**
 * Token contrast test (08 §4.8, gated by 07 §2.6): a programmatic WCAG
 * relative-luminance / contrast-ratio check over the actual token tables in
 * `src/ui/tokens.ts` — real math against the real hex values, not a
 * hardcoded pass. Runs in the `node` Jest project (see jest.config.js)
 * since `tokens.ts` has zero React Native imports.
 *
 * Requirements under test, verbatim from 07 §2.6, both themes:
 *   - text.primary on all backgrounds            >= 7:1
 *   - text.secondary on all backgrounds          >= 4.5:1
 *   - accent.text on bg.base / bg.surface        >= 4.5:1
 *   - accent-filled controls (label on fill)     >= 3:1
 *   - checked-row tint (bg.accentSubtle) keeps cell text >= 4.5:1
 */
import {
  alphaOverlays,
  colors,
  compositeOverlayOverHex,
  setTypeBadgeColors,
  type ThemeName,
} from '../tokens';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

/** WCAG relative luminance (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance). */
function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const channel = (c: number): number => {
    const cs = c / 255;
    return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio between two opaque hex colors (https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio). */
function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

const THEMES: ThemeName[] = ['dark', 'light'];

describe.each(THEMES)('token contrast (%s theme, 07 §2.6)', (theme) => {
  const t = colors[theme];
  const backgrounds: [name: string, hex: string][] = [
    ['bg.base', t.bg.base],
    ['bg.surface', t.bg.surface],
    ['bg.elevated', t.bg.elevated],
  ];

  describe.each(backgrounds)('text.primary on %s', (_name, bgHex) => {
    it('is >= 7:1', () => {
      expect(contrastRatio(t.text.primary, bgHex)).toBeGreaterThanOrEqual(7);
    });
  });

  describe.each(backgrounds)('text.secondary on %s', (_name, bgHex) => {
    it('is >= 4.5:1', () => {
      expect(contrastRatio(t.text.secondary, bgHex)).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe.each([
    ['bg.base', t.bg.base],
    ['bg.surface', t.bg.surface],
  ] as [string, string][])('accent.text on %s', (_name, bgHex) => {
    it('is >= 4.5:1', () => {
      expect(contrastRatio(t.accent.text, bgHex)).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('accent-filled controls (label on fill)', () => {
    it('accent.onAccent on accent.primary is >= 3:1', () => {
      expect(contrastRatio(t.accent.onAccent, t.accent.primary)).toBeGreaterThanOrEqual(3);
    });

    it('accent.onAccent on accent.pressed is >= 3:1', () => {
      expect(contrastRatio(t.accent.onAccent, t.accent.pressed)).toBeGreaterThanOrEqual(3);
    });
  });

  describe('checked-row tint (bg.accentSubtle) keeps cell text readable', () => {
    const overlay = alphaOverlays[theme].bgAccentSubtle;
    const tintedBackgrounds: [name: string, hex: string][] = [
      ['bg.base', compositeOverlayOverHex(overlay, t.bg.base)],
      ['bg.surface', compositeOverlayOverHex(overlay, t.bg.surface)],
    ];

    it.each(tintedBackgrounds)('text.primary on accentSubtle-over-%s is >= 4.5:1', (_name, tintedHex) => {
      expect(contrastRatio(t.text.primary, tintedHex)).toBeGreaterThanOrEqual(4.5);
    });

    it.each(tintedBackgrounds)('text.secondary on accentSubtle-over-%s is >= 4.5:1', (_name, tintedHex) => {
      expect(contrastRatio(t.text.secondary, tintedHex)).toBeGreaterThanOrEqual(4.5);
    });
  });
});

describe.each(THEMES)('setTypeBadgeColors (%s theme, 07 §2.4)', (theme) => {
  it('maps W/D/F/normal to the semantic + text.secondary tokens', () => {
    const t = colors[theme];
    expect(setTypeBadgeColors(theme)).toEqual({
      W: t.semantic.warning,
      D: t.semantic.info,
      F: t.semantic.danger,
      normal: t.text.secondary,
    });
  });
});

describe('contrastRatio helper sanity checks', () => {
  it('is 21:1 for pure black on pure white', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 1);
  });

  it('is 1:1 for identical colors', () => {
    expect(contrastRatio('#10B981', '#10B981')).toBeCloseTo(1, 5);
  });

  it('is symmetric regardless of argument order', () => {
    expect(contrastRatio('#0B0D0C', '#F4F7F5')).toBeCloseTo(
      contrastRatio('#F4F7F5', '#0B0D0C'),
      10,
    );
  });
});
