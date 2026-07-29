import { containsUrl, splitTextWithUrls } from '../text-links';

describe('splitTextWithUrls', () => {
  it('returns the whole string as one text segment when there is no URL', () => {
    expect(splitTextWithUrls('3x8 @ 80% — focus on tempo')).toEqual([
      { type: 'text', value: '3x8 @ 80% — focus on tempo' },
    ]);
  });

  it('splits a lone URL into a single url segment', () => {
    expect(splitTextWithUrls('https://example.com/video')).toEqual([
      { type: 'url', value: 'https://example.com/video' },
    ]);
  });

  it('splits surrounding text from an embedded URL', () => {
    expect(splitTextWithUrls('See https://example.com/video for form')).toEqual([
      { type: 'text', value: 'See ' },
      { type: 'url', value: 'https://example.com/video' },
      { type: 'text', value: ' for form' },
    ]);
  });

  it('keeps trailing sentence punctuation out of the link segment', () => {
    expect(splitTextWithUrls('Form cue: https://example.com/video.')).toEqual([
      { type: 'text', value: 'Form cue: ' },
      { type: 'url', value: 'https://example.com/video' },
      { type: 'text', value: '.' },
    ]);
  });

  it('handles multiple URLs in one note', () => {
    const result = splitTextWithUrls('https://a.com then https://b.com');
    expect(result).toEqual([
      { type: 'url', value: 'https://a.com' },
      { type: 'text', value: ' then ' },
      { type: 'url', value: 'https://b.com' },
    ]);
  });

  it('does not treat a bare "www." mention or plain text as a URL', () => {
    expect(splitTextWithUrls('www.example.com without scheme')).toEqual([
      { type: 'text', value: 'www.example.com without scheme' },
    ]);
  });
});

describe('containsUrl', () => {
  it('is true for a note containing a URL', () => {
    expect(containsUrl('see https://example.com')).toBe(true);
  });

  it('is false for a plain note', () => {
    expect(containsUrl('keep elbows tucked')).toBe(false);
  });
});
