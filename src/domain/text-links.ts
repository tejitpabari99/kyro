/**
 * `splitTextWithUrls` (M2-09) — 02 §3's exercise-note row: "URLs in notes
 * render as tappable links." Pure text-segmentation so the URL-detection
 * regex is unit-testable without mounting any component; the feature layer
 * (`src/features/workout/NoteText.tsx`) turns the returned segments into
 * `Text`/`onPress` nodes.
 *
 * Deliberately minimal (`http(s)://` only, no bare `www.` / mailto
 * detection) — 02 §9/§3 only ever say "URLs", not a general link-detection
 * spec, and a permissive regex would risk false-positive matches inside
 * plain workout notes ("3x8 @ 80%" etc.). Trailing punctuation immediately
 * after a URL (`.`, `,`, `;`, `:`, `!`, `?`, and closing brackets) is kept
 * out of the link segment — a note ending "...see https://example.com."
 * should not swallow the sentence's own period into the tappable region.
 */
export interface TextSegment {
  type: 'text' | 'url';
  value: string;
}

const URL_REGEX = /https?:\/\/[^\s]+/gi;
const TRAILING_PUNCTUATION_REGEX = /[.,;:!?)\]}'"]+$/;

export function splitTextWithUrls(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_REGEX)) {
    const index = match.index ?? 0;
    let raw = match[0];

    // Peel off trailing punctuation into the following text run rather than
    // the link itself (see file header). `raw` can never become empty here
    // — `URL_REGEX` requires a `http(s)://` scheme before any punctuation
    // could match, so there is always at least the scheme left after
    // trimming a trailing-punctuation suffix.
    const trailingMatch = TRAILING_PUNCTUATION_REGEX.exec(raw);
    let trailing = '';
    if (trailingMatch) {
      trailing = trailingMatch[0];
      raw = raw.slice(0, raw.length - trailing.length);
    }

    if (index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, index) });
    }
    segments.push({ type: 'url', value: raw });
    lastIndex = index + raw.length;
    if (trailing.length > 0) {
      segments.push({ type: 'text', value: trailing });
      lastIndex += trailing.length;
    }
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}

/** `true` iff `text` contains at least one detectable URL — lets callers skip the tappable-segments render path entirely for the common plain-note case. */
export function containsUrl(text: string): boolean {
  return new RegExp(URL_REGEX.source, 'i').test(text);
}
