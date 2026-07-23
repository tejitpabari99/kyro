/**
 * Root redirect (M0-08). 06 §3's route tree has no top-level `index.tsx` of
 * its own — the app's entry point is the tabs shell. `(tabs)` is a pathless
 * group (its segment doesn't appear in the URL) and none of its four tabs
 * is named `index`, so `/` has no leaf route without this redirect. Lands
 * on the Workout tab (06 §3: "routines hub" — the natural landing tab,
 * where Start lives per 07 §6).
 */
import { Redirect } from 'expo-router';

export default function Index(): React.JSX.Element {
  return <Redirect href="/workout" />;
}
