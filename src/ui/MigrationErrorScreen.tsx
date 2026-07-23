/**
 * `MigrationErrorScreen` (M0-09) — 06 §9's blocking-error stub: "Migration
 * failure at boot -> blocking screen with 'Restore from backup / contact'
 * guidance (should never happen — migration tests)." Rendered by the DB-
 * ready gate in `app/_layout.tsx` in place of the tab `<Stack>` when
 * `runDbBoot()` rejects.
 *
 * Deliberately minimal per M0-09's scope: this is a stub that exists and is
 * reachable, not a polished error-UX pass (that's a later milestone's job).
 * Themed via `useTheme()` (no raw hex) so it isn't visually broken in
 * either theme, and offers a "Try again" retry hook since the gate can
 * re-attempt `runDbBoot()` cheaply — full backup-restore/contact flows
 * don't exist yet, so the guidance here is copy-only.
 */
import React from 'react';
import { Text, View } from 'react-native';

import { Button } from './Button';
import { useTheme } from './theme-provider';

export interface MigrationErrorScreenProps {
  /** The error `runDbBoot()` rejected with, for diagnostics copy. */
  error: unknown;
  /** Re-attempt the DB boot sequence. */
  onRetry: () => void;
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }
  return 'An unknown error occurred.';
}

export function MigrationErrorScreen({
  error,
  onRetry,
}: MigrationErrorScreenProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  return (
    <View
      testID="migration-error-screen"
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: spacing['6'],
        backgroundColor: colors.bg.base,
      }}
    >
      <Text style={[typography.title2, { color: colors.text.primary, textAlign: 'center' }]}>
        Kyro couldn&apos;t start
      </Text>
      <Text
        style={[
          typography.subhead,
          {
            color: colors.text.secondary,
            textAlign: 'center',
            marginTop: spacing['2'],
          },
        ]}
      >
        Your data is safe, but the app database couldn&apos;t be prepared. Restore from a backup or
        contact support if this keeps happening.
      </Text>
      <Text
        style={[
          typography.footnote,
          {
            color: colors.text.tertiary,
            textAlign: 'center',
            marginTop: spacing['3'],
          },
        ]}
        testID="migration-error-detail"
      >
        {describeError(error)}
      </Text>
      <Button
        label="Try again"
        onPress={onRetry}
        variant="tonal"
        style={{ marginTop: spacing['5'] }}
        testID="migration-error-retry"
      />
    </View>
  );
}
