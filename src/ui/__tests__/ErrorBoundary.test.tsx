/**
 * `ErrorBoundary` RNTL test (M0-11 acceptance gate): render a component that
 * throws, wrapped in `ErrorBoundary`, and assert the themed fallback UI
 * appears — not a crash. Also asserts `onError` is invoked with the
 * boundary name + the thrown error, and that "Try again" resets state.
 */
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { ErrorBoundary } from '@/ui/ErrorBoundary';
import { ThemeProvider } from '@/ui/theme-provider';

function Bomb(): React.JSX.Element {
  throw new Error('kaboom');
}

function ThrowsNonError(): React.JSX.Element {
  // Exercises the non-Error branch of `getDerivedStateFromError` — React
  // allows throwing any value, not only `Error` instances.
  throw 'stringy failure';
}

async function renderBoundary(
  children: React.ReactNode,
  onError?: (name: string, error: Error) => void,
) {
  return render(
    <ThemeProvider>
      <ErrorBoundary boundaryName="tab:workout" onError={onError}>
        {children}
      </ErrorBoundary>
    </ThemeProvider>,
  );
}

describe('ErrorBoundary', () => {
  // React logs the caught error to the console by default; keep test output clean.
  let consoleErrorSpy: jest.SpyInstance;
  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('renders children normally when nothing throws', async () => {
    await renderBoundary(<Text>All good</Text>);

    expect(screen.getByText('All good')).toBeTruthy();
  });

  it('catches a thrown render error and renders the themed fallback instead of crashing', async () => {
    await renderBoundary(<Bomb />);

    expect(screen.getByTestId('error-boundary-fallback')).toBeTruthy();
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  it('calls onError with the boundary name and the thrown error', async () => {
    const onError = jest.fn();
    await renderBoundary(<Bomb />, onError);

    expect(onError).toHaveBeenCalledTimes(1);
    const [name, error] = onError.mock.calls[0];
    expect(name).toBe('tab:workout');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('kaboom');
  });

  it('renders the fallback even when no onError prop is provided', async () => {
    await renderBoundary(<Bomb />);

    expect(screen.getByTestId('error-boundary-fallback')).toBeTruthy();
  });

  it('wraps a thrown non-Error value in an Error before rendering the fallback', async () => {
    const onError = jest.fn();
    await renderBoundary(<ThrowsNonError />, onError);

    expect(screen.getByTestId('error-boundary-fallback')).toBeTruthy();
    const [, error] = onError.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('stringy failure');
  });

  it('"Try again" resets the boundary so children re-render', async () => {
    let shouldThrow = true;
    function MaybeBomb(): React.JSX.Element {
      if (shouldThrow) {
        throw new Error('kaboom');
      }
      return <Text>Recovered</Text>;
    }

    await renderBoundary(<MaybeBomb />);
    expect(screen.getByTestId('error-boundary-fallback')).toBeTruthy();

    shouldThrow = false;
    await fireEvent.press(screen.getByTestId('error-boundary-retry'));

    expect(screen.getByText('Recovered')).toBeTruthy();
  });
});
