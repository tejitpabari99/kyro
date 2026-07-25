/**
 * `PRBannerHost` (M4-10, 04 §5.5) — connects `prBannerStore` to `ui/PRBanner`,
 * mirroring `TimerPill`'s own "store state -> primitive props" shape.
 * Mounted unconditionally by `ActiveWorkoutScreen` alongside `TimerPill`/
 * `KeepAwakeGate` (that screen's own established "always mount, the
 * component itself renders `null` when there's nothing to show" convention)
 * so unmounting the whole logger (any minimize path) tears this down for
 * free, exactly like those two.
 */
import React from 'react';

import { PRBanner } from '@/ui/PRBanner';

import { usePRBannerStore } from './prBannerStore';

export interface PRBannerHostProps {
  testID?: string;
}

export function PRBannerHost({ testID = 'pr-banner-host' }: PRBannerHostProps): React.JSX.Element {
  const message = usePRBannerStore((state) => state.message);

  return (
    <PRBanner
      testID={testID}
      visible={message != null}
      message={message ?? ''}
      onDismiss={() => usePRBannerStore.getState().dismiss()}
    />
  );
}
