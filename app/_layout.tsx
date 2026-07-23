import { Stack } from 'expo-router';

// Placeholder root layout for M0-01 (repo scaffold). The real root layout —
// providers (TanStack Query, theme, DB-ready gate) and the migrations splash
// gate — lands in M0-08/M0-09/M0-10 per docs/plan/06-architecture.md §3, §5.1.
export default function RootLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
