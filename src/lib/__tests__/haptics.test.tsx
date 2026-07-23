/**
 * Sample RNTL test (M0-03 acceptance gate) doubling as the worked example
 * for the `src/lib/` native-seam mocking pattern (08 §5): mock the seam
 * module, not the underlying native package, and never mock a repository
 * in an integration suite.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { triggerImpact } from '@/lib/haptics';

jest.mock('@/lib/haptics');

function TapButton() {
  return (
    <Pressable accessibilityRole="button" onPress={() => triggerImpact('light')}>
      <Text>Tap</Text>
    </Pressable>
  );
}

describe('src/lib/haptics mocking pattern (sample RNTL test)', () => {
  it('renders and calls the mocked haptics seam on press', async () => {
    await render(<TapButton />);

    expect(screen.getByText('Tap')).toBeTruthy();

    fireEvent.press(screen.getByRole('button'));

    expect(triggerImpact).toHaveBeenCalledWith('light');
  });
});
