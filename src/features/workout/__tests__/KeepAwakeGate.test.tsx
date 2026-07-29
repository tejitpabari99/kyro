/**
 * `KeepAwakeGate` tests (M2-13, 06 §6.3).
 *
 * `expo-keep-awake` is mocked via a **factory** (`jest.mock('expo-keep-
 * awake', () => ({...}))`), not `jest.requireActual`/a bare
 * `jest.mock('expo-keep-awake')` — both of those still have to load the
 * real module once (to run its actual code, or to introspect its shape for
 * an automatic mock, respectively), and `expo-keep-awake`'s own
 * `src/ExpoKeepAwake.ts` calls `requireNativeModule('ExpoKeepAwake')`
 * **synchronously at module-import time**. `jest-expo`'s own
 * `requireNativeModule` shim (`jest-expo/src/preset/setup.js`) throws
 * `Cannot find native module 'ExpoKeepAwake'` for any package with no
 * `mocks/<ModuleName>.js` file of its own shipped inside `node_modules`
 * (confirmed directly — `expo-keep-awake@56.0.3` ships no such file, and
 * both `jest.requireActual(...)` and a bare `jest.mock(...)` were each
 * reproduced throwing this exact error while writing this suite). A factory
 * mock is the only option that never touches the real module at all.
 *
 * Consequence: the real library's activate-on-mount/deactivate-on-unmount
 * control flow can't be *executed* inside this Jest environment — there is
 * no way to patch `node_modules` from a test file, and hand-rolling a fake
 * native module here would just be re-testing our own fake, not the real
 * library. `KeepAwakeGate.tsx`'s own header instead documents that contract
 * as verified by *reading the installed package's source directly*. This
 * file's job is narrower and fully within reach: prove `KeepAwakeGate`
 * itself calls `useKeepAwake` with the right tag and renders nothing.
 */
import { render } from '@testing-library/react-native';
import React from 'react';
import { useKeepAwake } from 'expo-keep-awake';

import { KeepAwakeGate } from '../KeepAwakeGate';

jest.mock('expo-keep-awake', () => ({
  useKeepAwake: jest.fn(),
}));

const mockUseKeepAwake = useKeepAwake as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('KeepAwakeGate (M2-13)', () => {
  it('calls useKeepAwake with a stable, explicit tag on mount', async () => {
    await render(<KeepAwakeGate />);
    expect(mockUseKeepAwake).toHaveBeenCalledTimes(1);
    expect(mockUseKeepAwake).toHaveBeenCalledWith('active-workout-logger');
  });

  it('renders nothing (pure side-effect component)', async () => {
    const result = await render(<KeepAwakeGate />);
    expect(result.toJSON()).toBeNull();
  });

  it('unmounts cleanly (no thrown error tearing down the hook)', async () => {
    const result = await render(<KeepAwakeGate />);
    expect(() => result.unmount()).not.toThrow();
  });
});
