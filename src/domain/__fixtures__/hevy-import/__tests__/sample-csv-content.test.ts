/**
 * Drift guard for `../sample-csv-content.ts` (M5-10) — that file is a
 * generated, byte-for-byte TS-string copy of `../sample.csv` (see its own
 * header for why it exists as a separate module at all: `HevyImportScreen`'s
 * `__DEV__`-gated mocked-picker bypass needs the fixture bundled as ordinary
 * TS, not a raw `.csv` asset). This test is what actually keeps that promise
 * true rather than just asserting it in a comment: it reads the real file
 * from disk on every run and fails loudly the moment anyone edits
 * `sample.csv` without regenerating the `.ts` copy.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { HEVY_IMPORT_SAMPLE_CSV_CONTENT } from '../sample-csv-content';

describe('HEVY_IMPORT_SAMPLE_CSV_CONTENT', () => {
  it('is byte-for-byte identical to sample.csv on disk', () => {
    const fileContent = readFileSync(join(__dirname, '../sample.csv'), 'utf8');
    expect(HEVY_IMPORT_SAMPLE_CSV_CONTENT).toBe(fileContent);
  });
});
