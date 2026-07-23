/**
 * DB-ready gate RNTL tests (M0-09 acceptance gate) — 06 §5.1/§9. Mocks the
 * `@/data/sqlite/boot` seam (not `expo-sqlite`/a real driver — 08 §5: "mock
 * only true natives" via `src/lib/`-style seams; this is the equivalent
 * seam for DB boot) so both outcomes of `runDbBoot()` are deterministic:
 *
 *  - resolves -> the real tab shell renders (mirrors `tabs-layout.test.tsx`).
 *  - rejects -> `MigrationErrorScreen` renders instead of any tab content.
 */
import { renderRouter, screen } from 'expo-router/testing-library';

import { runDbBoot } from '@/data/sqlite/boot';

// A factory mock (rather than bare `jest.mock('@/data/sqlite/boot')`) is
// required here: automocking without a factory still `require`s the real
// module first to infer its shape, which would pull in `open-database.ts`
// -> `driver.expo.ts` -> `expo-sqlite`'s native module (unavailable under
// Jest, 08 §5 — the exact reason `driver.expo.ts` itself has no direct
// Jest test). The factory below never touches the real module at all.
jest.mock('@/data/sqlite/boot', () => ({
  runDbBoot: jest.fn(),
  getAppDriver: jest.fn(),
}));

const mockRunDbBoot = runDbBoot as jest.MockedFunction<typeof runDbBoot>;

describe('DB-ready gate (M0-09)', () => {
  afterEach(() => {
    mockRunDbBoot.mockReset();
  });

  it('renders the tab content once migration resolves', async () => {
    mockRunDbBoot.mockResolvedValue({
      fromVersion: 0,
      toVersion: 1,
      applied: ['0000_app_meta_and_settings'],
    });

    await renderRouter('app', { initialUrl: '/' });

    expect(await screen.findByText('No active routines yet')).toBeTruthy();
    expect(screen.queryByTestId('migration-error-screen')).toBeNull();
  });

  it('renders the blocking error screen instead of tabs when migration fails', async () => {
    mockRunDbBoot.mockRejectedValue(new Error('disk full'));

    await renderRouter('app', { initialUrl: '/' });

    expect(await screen.findByTestId('migration-error-screen')).toBeTruthy();
    expect(screen.getByTestId('migration-error-detail')).toHaveTextContent('disk full');
    expect(screen.queryByText('No active routines yet')).toBeNull();
  });
});
