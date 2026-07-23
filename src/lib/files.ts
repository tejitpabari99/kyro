/**
 * File-picker / filesystem seam (06 §10) — CSV import/export (M5) will go
 * through this module rather than importing `expo-document-picker` /
 * `expo-file-system` directly, so it stays the single mockable seam
 * (08 §5: "... file pickers ... via src/lib/ seams").
 *
 * Placeholder for M0-03: neither native package is installed yet (CSV
 * import/export lands in M5). Stub bodies exist so the seam and its
 * manual-mock pattern (`src/lib/__mocks__/files.ts`) are ready for that
 * task to fill in.
 */

export interface PickedFile {
  uri: string;
  name: string;
}

/** TODO(M5): wire to `expo-document-picker` `getDocumentAsync`. */
export async function pickFile(_options?: { type?: string }): Promise<PickedFile | null> {
  throw new Error('pickFile is not implemented yet — see M5 CSV import tasks.');
}

/** TODO(M5): wire to `expo-file-system` for writing the exported CSV. */
export async function writeFile(_uri: string, _contents: string): Promise<void> {
  throw new Error('writeFile is not implemented yet — see M5 CSV export tasks.');
}
