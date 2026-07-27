/**
 * `lib/zip.ts` tests (M5-09) — real `fflate`/`base64-js` round-trips, no
 * mocking (both packages are pure JS with no native/Expo surface — see that
 * file's header for why they're safe to exercise directly under Jest).
 */
import { base64ToBytes, bytesToBase64, bytesToUtf8, unzipEntries, utf8ToBytes, zipEntries } from '../zip';

describe('utf8ToBytes / bytesToUtf8', () => {
  it('round-trips plain ASCII text', () => {
    expect(bytesToUtf8(utf8ToBytes('hello world'))).toBe('hello world');
  });

  it('round-trips multi-byte UTF-8 text (not a naive one-byte-per-char encoding)', () => {
    const text = 'Kyro 💪 café 日本語';
    expect(bytesToUtf8(utf8ToBytes(text))).toBe(text);
  });
});

describe('base64ToBytes / bytesToBase64', () => {
  it('round-trips arbitrary bytes, including 0x00 and 0xff', () => {
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 254, 255]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });

  it('round-trips empty input', () => {
    expect(base64ToBytes(bytesToBase64(new Uint8Array(0)))).toEqual(new Uint8Array(0));
  });
});

describe('zipEntries / unzipEntries', () => {
  it('round-trips a single text entry', () => {
    const zipped = zipEntries([{ path: 'db.json', data: utf8ToBytes('{"a":1}') }]);
    const unzipped = unzipEntries(zipped);

    expect(Object.keys(unzipped)).toEqual(['db.json']);
    expect(bytesToUtf8(unzipped['db.json']!)).toBe('{"a":1}');
  });

  it('round-trips multiple entries under nested paths, preserving exact bytes', () => {
    const photoBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]); // fake JPEG-ish bytes
    const zipped = zipEntries([
      { path: 'db.json', data: utf8ToBytes('{"tables":{}}') },
      { path: 'photos/progress/abc.jpg', data: photoBytes, store: true },
      { path: 'photos/progress/def.jpg', data: photoBytes },
    ]);
    const unzipped = unzipEntries(zipped);

    expect(new Set(Object.keys(unzipped))).toEqual(
      new Set(['db.json', 'photos/progress/abc.jpg', 'photos/progress/def.jpg']),
    );
    expect(unzipped['photos/progress/abc.jpg']).toEqual(photoBytes);
    expect(unzipped['photos/progress/def.jpg']).toEqual(photoBytes);
    expect(bytesToUtf8(unzipped['db.json']!)).toBe('{"tables":{}}');
  });

  it('a `store: true` entry round-trips identically to a compressed one (level 0 is still a valid, losslessly-inflatable zip entry)', () => {
    const data = utf8ToBytes('a'.repeat(500)); // highly compressible if deflated
    const stored = zipEntries([{ path: 'x.txt', data, store: true }]);
    const compressed = zipEntries([{ path: 'x.txt', data }]);

    expect(unzipEntries(stored)['x.txt']).toEqual(data);
    expect(unzipEntries(compressed)['x.txt']).toEqual(data);
    // Storing 500 identical bytes uncompressed is larger than deflating them
    // — a cheap sanity check that `store` really did skip compression rather
    // than silently falling back to the default level.
    expect(stored.length).toBeGreaterThan(compressed.length);
  });

  it('throws on a corrupt/non-zip input', () => {
    expect(() => unzipEntries(utf8ToBytes('not a zip file'))).toThrow();
  });

  it('round-trips through base64 end-to-end, matching the real expo-file-system write/read boundary', () => {
    const zipped = zipEntries([{ path: 'db.json', data: utf8ToBytes('{"ok":true}') }]);
    const base64 = bytesToBase64(zipped);
    const roundTripped = base64ToBytes(base64);
    const unzipped = unzipEntries(roundTripped);

    expect(bytesToUtf8(unzipped['db.json']!)).toBe('{"ok":true}');
  });
});
