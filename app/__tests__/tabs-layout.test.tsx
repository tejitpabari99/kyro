/**
 * Tab shell smoke test (M0-08 acceptance gate): "app boots to tabs ...
 * all 4 tabs navigable ... RNTL smoke on the tab layout itself."
 *
 * `renderRouter` (expo-router/testing-library) builds the real navigation
 * tree from the actual `app/` directory (via a require-context ponyfill —
 * see `node_modules/expo-router/build/testing-library/require-context-
 * ponyfill.js`) and renders it through the project's real root layout
 * (providers included), so this exercises the genuine route tree rather
 * than a hand-rolled stand-in — the closest thing to "boots on a
 * simulator" available without one (see M0-08's report for the
 * `expo export` bundling-only verification that stands in for a real
 * device boot).
 *
 * `renderRouter` must be **awaited**: `@testing-library/react-native`
 * 14's `render()` is `async`, but `expo-router`'s `renderRouter` helper
 * (56.2.15) does not await its internal `render()` call before attaching
 * its extra `getPathname`/etc. helpers and returning — the returned value
 * is the still-pending render `Promise` with those helpers tacked on as
 * own properties. Querying `screen` before that promise settles hits
 * RNTL's `defaultScreen` stub (every query method throws "`render`
 * function has not been called" — see `@testing-library/react-native`'s
 * `dist/screen.js`), since `setRenderResult` only runs once the async
 * `render()` actually finishes. Awaiting the `renderRouter(...)` call
 * fixes this (matches every other RNTL test in this repo already
 * `await render(...)`-ing for the same reason).
 */
import { renderRouter, screen } from 'expo-router/testing-library';

describe('tab shell — boots to tabs, all 4 tabs navigable', () => {
  it('redirects "/" to the Workout tab', async () => {
    await renderRouter('app', { initialUrl: '/' });
    expect(await screen.findByText('No active routines yet')).toBeTruthy();
  });

  it('navigates to the Workout tab', async () => {
    await renderRouter('app', { initialUrl: '/workout' });
    expect(await screen.findByText('No active routines yet')).toBeTruthy();
  });

  it('navigates to the History tab', async () => {
    await renderRouter('app', { initialUrl: '/history' });
    expect(await screen.findByText('No workouts logged yet')).toBeTruthy();
  });

  it('navigates to the Exercises tab', async () => {
    await renderRouter('app', { initialUrl: '/exercises' });
    expect(await screen.findByText('Exercise library coming soon')).toBeTruthy();
  });

  it('navigates to the Profile tab', async () => {
    await renderRouter('app', { initialUrl: '/profile' });
    expect(await screen.findByText('Profile coming soon')).toBeTruthy();
  });
});
