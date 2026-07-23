/**
 * `GlobalWorkoutBar` smoke test (M0-08) — confirms the reserved render slot
 * really is a no-op today (renders nothing) until M2-13 wires it up.
 */
import { render } from '@testing-library/react-native';
import React from 'react';

import { GlobalWorkoutBar } from '../GlobalWorkoutBar';

describe('GlobalWorkoutBar — reserved seam, no-op until M2-13', () => {
  it('renders nothing', async () => {
    const result = await render(<GlobalWorkoutBar />);
    expect(result.toJSON()).toBeNull();
  });
});
