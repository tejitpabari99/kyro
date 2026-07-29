/**
 * Settings → About → Licenses (M5-04, 04 §7 / `10` §5's "Licenses (dataset
 * credit + OSS licenses)" requirement). A static screen, no data layer —
 * same "nav row → its own simple sub-route" pattern `sounds.tsx`/
 * `plate-calculator.tsx`/`warmup-calculator.tsx` already establish for the
 * parent Settings screen.
 *
 * ## free-exercise-db credit — the exact text `10` §5 requires
 *
 * `10-app-store-launch.md` §5's App Store review prep table states the
 * dataset licensing answer verbatim: "built-in exercise database and images
 * derive from free-exercise-db (github.com/yuhonas/free-exercise-db),
 * released under the Unlicense (public domain) — attribution provided
 * in-app (Settings → About → Licenses)." This screen is that attribution
 * surface; the pinned commit/vendor date below is read from
 * `data/free-exercise-db/VENDORED.md` (M1-03), not re-typed from memory.
 *
 * ## OSS dependency list — hand-maintained, not a license-scanning tool
 *
 * M5-04's own task brief is explicit that "a hand-maintained list of the
 * handful of real runtime deps with SPDX license names is fine" — this is
 * that list: every direct runtime dependency in `package.json` visible to
 * an end user's actual app bundle (build tooling / type-only devDependencies
 * — `typescript`, `eslint`, `jest`, `drizzle-kit`, `@sentry/cli`, `sharp`,
 * `tsx`, `@testing-library/react-native`, `@babel/*` — are omitted; they
 * never ship in the compiled app), each with its real, verified SPDX license
 * identifier (verified by reading each package's own installed
 * `package.json` `"license"` field directly, not guessed from memory —
 * checked 2026-07-26, all MIT except `drizzle-orm` (Apache-2.0) and
 * `lucide-react-native` (ISC)). If a future dependency is added or removed,
 * this list needs a manual edit — there is no automated sync, by design
 * (that would be the license-scanning-tool alternative this task's own
 * brief explicitly says isn't required).
 */
import React from 'react';
import { ScrollView, Text, View } from 'react-native';

import { useTheme } from '@/ui/theme-provider';

interface OssLicenseEntry {
  name: string;
  license: string;
}

/** See file header — hand-maintained, verified against each package's own installed `package.json`. */
const OSS_LICENSES: readonly OssLicenseEntry[] = [
  { name: 'react / react-dom', license: 'MIT' },
  { name: 'react-native', license: 'MIT' },
  { name: 'expo', license: 'MIT' },
  { name: 'expo-router', license: 'MIT' },
  { name: 'zustand', license: 'MIT' },
  { name: '@tanstack/react-query', license: 'MIT' },
  { name: 'zod', license: 'MIT' },
  { name: 'drizzle-orm', license: 'Apache-2.0' },
  { name: 'victory-native', license: 'MIT' },
  { name: 'react-native-svg', license: 'MIT' },
  { name: 'react-native-reanimated', license: 'MIT' },
  { name: 'react-native-worklets', license: 'MIT' },
  { name: 'react-native-gesture-handler', license: 'MIT' },
  { name: 'react-native-reanimated-dnd', license: 'MIT' },
  { name: 'react-native-screens', license: 'MIT' },
  { name: 'react-native-safe-area-context', license: 'MIT' },
  { name: '@shopify/react-native-skia', license: 'MIT' },
  { name: '@shopify/flash-list', license: 'MIT' },
  { name: 'lucide-react-native', license: 'ISC' },
  { name: '@sentry/react-native', license: 'MIT' },
];

export default function LicensesScreen(): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  return (
    <ScrollView
      testID="licenses-screen"
      style={{ flex: 1, backgroundColor: colors.bg.base }}
      contentContainerStyle={{ padding: spacing['4'] }}
    >
      <Text style={[typography.title2, { color: colors.text.primary, marginBottom: spacing['3'] }]}>
        Licenses
      </Text>

      <View
        testID="licenses-exercise-db-credit"
        style={{
          backgroundColor: colors.bg.surface,
          borderRadius: 12,
          padding: spacing['4'],
          marginBottom: spacing['6'],
        }}
      >
        <Text style={[typography.headline, { color: colors.text.primary, marginBottom: spacing['2'] }]}>
          Exercise database
        </Text>
        <Text style={[typography.body, { color: colors.text.secondary, marginBottom: spacing['2'] }]}>
          Kyro&apos;s built-in exercise database and images are derived from free-exercise-db
          (github.com/yuhonas/free-exercise-db), released under the Unlicense (public domain).
        </Text>
        <Text style={[typography.footnote, { color: colors.text.tertiary }]}>
          No Hevy assets, trademarks, code, or copy are used — Kyro is an original implementation
          with an original design system.
        </Text>
      </View>

      <Text
        style={[typography.footnote, { color: colors.text.secondary, marginBottom: spacing['2'] }]}
      >
        OPEN SOURCE SOFTWARE
      </Text>
      <View style={{ borderRadius: 12, overflow: 'hidden', backgroundColor: colors.bg.surface }}>
        {OSS_LICENSES.map((entry, index) => (
          <View
            key={entry.name}
            testID={`licenses-oss-row-${index}`}
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              paddingHorizontal: spacing['4'],
              paddingVertical: spacing['3'],
              borderBottomWidth: index === OSS_LICENSES.length - 1 ? 0 : 1,
              borderBottomColor: colors.border.hairline,
            }}
          >
            <Text style={[typography.body, { color: colors.text.primary, flex: 1 }]}>
              {entry.name}
            </Text>
            <Text style={[typography.subhead, { color: colors.text.secondary }]}>
              {entry.license}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
