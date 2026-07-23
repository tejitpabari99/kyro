/**
 * `generateUuid` (M1-06 review fix) unit tests — both branches, without ever
 * touching the real `expo-crypto` native module (which cannot load outside a
 * real native-module host; see `../uuid.ts`'s header). `expo-crypto` is
 * mocked at the module-resolution level via `jest.mock`, which intercepts
 * the dynamic `import('expo-crypto')` the same way it would a static
 * `import`/`require` once Babel's CommonJS interop transform (active for
 * this Jest project) rewrites it.
 */
import { generateUuid } from '../uuid';

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'mocked-expo-crypto-uuid'),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports -- need the mocked module's jest.fn spy handle.
const ExpoCrypto = require('expo-crypto') as { randomUUID: jest.Mock };

describe('generateUuid', () => {
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

  afterEach(() => {
    if (originalCrypto) {
      Object.defineProperty(globalThis, 'crypto', originalCrypto);
    }
    ExpoCrypto.randomUUID.mockClear();
  });

  it('uses globalThis.crypto.randomUUID when present, and never touches expo-crypto', async () => {
    const id = await generateUuid();

    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(ExpoCrypto.randomUUID).not.toHaveBeenCalled();
  });

  it('falls back to expo-crypto.randomUUID when globalThis.crypto is unavailable', async () => {
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });

    const id = await generateUuid();

    expect(id).toBe('mocked-expo-crypto-uuid');
    expect(ExpoCrypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it('falls back to expo-crypto.randomUUID when globalThis.crypto lacks randomUUID', async () => {
    Object.defineProperty(globalThis, 'crypto', { value: {}, configurable: true });

    const id = await generateUuid();

    expect(id).toBe('mocked-expo-crypto-uuid');
    expect(ExpoCrypto.randomUUID).toHaveBeenCalledTimes(1);
  });
});
