/**
 * `SetRow` (M2-06) — one row of the set table: SET badge/number · PREVIOUS
 * (grey, tap-to-autofill) · the type-driven value columns (02 §4) · optional
 * RPE · ✓ check cell, plus swipe-left-to-delete chrome. Fully controlled,
 * dumb, presentation-only — no Zustand/domain imports (`src/ui/**`'s
 * "tokens only" dependency boundary, 06 §2). `src/features/workout/`'s
 * connected wrapper owns:
 *
 *  - subscribing to this set's own slice of `activeWorkoutStore`
 *    (`selectWorkoutSet(setId)`, 06 §8) and deriving `values`/`placeholders`
 *    /`previousLabel`/`badgeKind`/`workingIndex` from it — **not** this
 *    component, which only ever sees already-decided display strings/enums;
 *  - the local "typed-but-not-yet-committed" text-buffer state (06 §5.3:
 *    "text inputs commit on blur/check/next") that makes `onChangeValue`
 *    fire on every keystroke (cheap, local) while `onBlurValue` is the
 *    actual store-write boundary;
 *  - TIME-column digit-fill parsing (`parseTimeInput`/`formatDuration`,
 *    `domain/units.ts`) — this component just renders whatever formatted
 *    string it's handed as `values[column.key]`, it doesn't know mm:ss
 *    semantics itself.
 *
 * That split is why memoizing *this* component (`React.memo`, below) is
 * what actually delivers 06 §8's "typing in one row doesn't re-render
 * others": as long as the feature-layer wrapper only re-renders when *this*
 * set's own store slice changes, and only passes this component
 * referentially-stable `columns`/`workingIndex`/`previousLabel` props
 * (computed once per exercise-level structural change, not per keystroke —
 * see `ExerciseSetTableSection.tsx`), sibling rows' `SetRow` instances never
 * even re-render, regardless of how many times this one does.
 *
 * **Assisted-weight display** (02 §4: "Assisted weight entered as `20`
 * displays `−20kg`... stores positive"): the minus sign is a static prefix
 * glyph rendered *next to* the `NumericInput`, not part of its editable
 * text — the field itself always holds the plain positive number. Same
 * treatment for `bodyweight_reps`'s optional `+KG` (a static `+` prefix).
 *
 * **Swipe-to-delete:** the delete action (a full-height danger-tinted
 * button, revealed by dragging the row content left) is always present in
 * the tree — not conditionally mounted on gesture state — so it's directly
 * `fireEvent.press`-able in RNTL without simulating a real pan gesture
 * (gesture-handler is JS-mocked under Jest, `jest.config.js`'s own header
 * note); the row content is what actually translates via Reanimated,
 * mirroring `src/ui/Sheet.tsx`'s (M0-07) established
 * `Gesture.Pan()`/`useSharedValue` pattern.
 *
 * **Keyboard flow (M2-08, 02 §4 / 06 §8):** `fieldRefs`/`onFocusValue`/
 * `inputAccessoryViewID` are the seams `src/features/workout/
 * keyboardFocusStore.ts`'s Next-traversal registry needs — this component
 * stays "dumb" by only ever forwarding them to each value cell's
 * `NumericInput`, never importing the store itself (`src/ui/**` tokens-only
 * boundary, 06 §2). `inlineTimerEnabled`/`onDurationTimerPress` add a small
 * stopwatch-icon button next to TIME-kind cells only (Settings → Inline
 * Timer) — tapping it is the caller's job (`ConnectedSetRow` opens
 * `DurationTimerSheet`), this component only renders the affordance.
 */
import React, { useEffect, useMemo } from 'react';
import { Check, Timer, Trash2 } from 'lucide-react-native';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { NumericInput } from './NumericInput';
import { SetCell } from './SetCell';
import { SetTypeBadge, type SetBadgeKind } from './SetTypeBadge';
import { useTheme } from './theme-provider';
import type { SetRowColumn } from './set-table-types';

export type { SetBadgeKind } from './SetTypeBadge';

export interface SetRowProps {
  columns: SetRowColumn[];
  badgeKind: SetBadgeKind;
  /** Working-set number (1-based), or `null` for warm-up/dropset/failure rows (they show a letter badge instead, 02 §4). */
  workingIndex: number | null;
  /** Current editable text per `column.key` — already display-formatted (e.g. TIME's `"1:30"`). */
  values: Record<string, string>;
  /** Grey placeholder text per `column.key` (previous/target value), shown when `values[key]` is empty. */
  placeholders: Record<string, string>;
  /** PREVIOUS cell's compact grey label, or `null` to render `—`. */
  previousLabel: string | null;
  isCompleted: boolean;
  onChangeValue: (columnKey: string, text: string) => void;
  onBlurValue: (columnKey: string) => void;
  /** M2-08 — fires when a value cell's `NumericInput` gains focus (see file header). */
  onFocusValue?: (columnKey: string) => void;
  onPreviousPress: () => void;
  onSetCellPress: () => void;
  onToggleCompleted: () => void;
  onRpePress?: () => void;
  onDelete: () => void;
  /** M2-08 — per-column `ref` callbacks for each value cell's `NumericInput`, keyed by `column.key`. Supply a referentially-stable map (see `ConnectedSetRow.tsx`'s own `useMemo`) — an inline object recreated every render would thrash the registry (React detaches+reattaches on every ref-callback identity change). */
  fieldRefs?: Record<string, (instance: TextInput | null) => void>;
  /** M2-08 — shared `KeyboardAccessoryBar` `nativeID`, forwarded to every value cell's `NumericInput` as its `inputAccessoryViewID`. */
  inputAccessoryViewID?: string;
  /** M2-08, Settings → Inline Timer — shows a stopwatch-icon button next to TIME-kind cells when true. */
  inlineTimerEnabled?: boolean;
  /** M2-08 — fires when the inline-timer button is tapped, with the TIME column's key. */
  onDurationTimerPress?: (columnKey: string) => void;
  /**
   * Bump this (e.g. a monotonically increasing counter) to play the
   * blocked-check row shake (02 §4 / 07 §8: "row shakes 300 ms +
   * `notificationWarning` haptic"). The haptic itself is the caller's
   * responsibility (`ConnectedSetRow`, since `src/ui/**` doesn't touch
   * native seams) — this prop only drives the visual shake. `0`/unset never
   * shakes (so mounting with a fixed initial value is a no-op).
   */
  shakeSignal?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const SET_CELL_WIDTH = 44;
const CHECK_CELL_WIDTH = 44;
const CHECK_VISUAL_SIZE = 32;
const DELETE_ACTION_WIDTH = 88;
const SWIPE_ANIMATION_MS = 200;
const SWIPE_OPEN_THRESHOLD = -60;
/** 07 §8: "row shakes 300 ms" — five short translateX ticks summing to 300 ms. */
const SHAKE_TICK_MS = 60;
const SHAKE_OFFSET = 8;

const VALUE_PREFIX: Partial<Record<SetRowColumn['kind'], string>> = {
  weight_added: '+',
  weight_assisted: '−', // U+2212 minus sign (07 §2.4's own "−KG" spelling)
};

function inputModeFor(kind: SetRowColumn['kind']): 'decimal' | 'integer' {
  return kind === 'reps' || kind === 'time' ? 'integer' : 'decimal';
}

function SetRowImpl({
  columns,
  badgeKind,
  workingIndex,
  values,
  placeholders,
  previousLabel,
  isCompleted,
  onChangeValue,
  onBlurValue,
  onFocusValue,
  onPreviousPress,
  onSetCellPress,
  onToggleCompleted,
  onRpePress,
  onDelete,
  fieldRefs,
  inputAccessoryViewID,
  inlineTimerEnabled,
  onDurationTimerPress,
  shakeSignal,
  style,
  testID,
}: SetRowProps): React.JSX.Element {
  const { colors, typography, spacing } = useTheme();

  // `typography.setValue.fontVariant` is a readonly tuple (tokens.ts's own
  // traceability note); RN's `TextStyle` wants a mutable `FontVariant[]` —
  // same copy `NumericInput`/`StatColumn` already do.
  const setValueStyle: TextStyle = {
    ...typography.setValue,
    fontVariant: [...typography.setValue.fontVariant],
  };

  const translateX = useSharedValue(0);
  const shakeX = useSharedValue(0);

  /* eslint-disable react-hooks/immutability -- Reanimated's documented
   * shared-value mutation pattern, same exemption `Sheet.tsx` (M0-07)
   * already carries for the identical reason. */
  useEffect(() => {
    if (!shakeSignal) {
      return;
    }
    shakeX.value = withSequence(
      withTiming(-SHAKE_OFFSET, { duration: SHAKE_TICK_MS / 2 }),
      withTiming(SHAKE_OFFSET, { duration: SHAKE_TICK_MS }),
      withTiming(-SHAKE_OFFSET, { duration: SHAKE_TICK_MS }),
      withTiming(SHAKE_OFFSET, { duration: SHAKE_TICK_MS }),
      withTiming(0, { duration: SHAKE_TICK_MS * 1.5 }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shakeX is a stable Reanimated shared value ref, not reactive state.
  }, [shakeSignal]);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          if (e.translationX < 0) {
            translateX.value = Math.max(e.translationX, -DELETE_ACTION_WIDTH);
          }
        })
        .onEnd((e) => {
          if (e.translationX < SWIPE_OPEN_THRESHOLD) {
            translateX.value = withTiming(-DELETE_ACTION_WIDTH, { duration: SWIPE_ANIMATION_MS });
          } else {
            translateX.value = withTiming(0, { duration: SWIPE_ANIMATION_MS });
          }
        }),
    [translateX],
  );
  /* eslint-enable react-hooks/immutability */

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value + shakeX.value }],
  }));

  // No translateX reset needed here — the row unmounts once `onDelete`
  // removes it from the store, so there's nothing left to animate back.
  const handleDelete = (): void => {
    onDelete();
  };

  return (
    <View testID={testID} style={[{ overflow: 'hidden' }, style]}>
      <View
        testID={testID ? `${testID}-delete-action` : undefined}
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: colors.semantic.danger,
            alignItems: 'flex-end',
            justifyContent: 'center',
          },
        ]}
      >
        <Pressable
          testID={testID ? `${testID}-delete-button` : undefined}
          accessibilityRole="button"
          accessibilityLabel="Delete set"
          onPress={handleDelete}
          style={{
            width: DELETE_ACTION_WIDTH,
            height: '100%',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Trash2 size={20} strokeWidth={1.75} color={colors.accent.onAccent} />
        </Pressable>
      </View>

      <GestureDetector gesture={panGesture}>
        <Animated.View
          testID={testID ? `${testID}-content` : undefined}
          style={[
            animatedStyle,
            {
              flexDirection: 'row',
              alignItems: 'center',
              minHeight: 44,
              paddingVertical: spacing['1'],
              backgroundColor: isCompleted ? colors.bg.accentSubtle : colors.bg.surface,
            },
          ]}
        >
          <SetCell testID={testID ? `${testID}-set-cell` : undefined} width={SET_CELL_WIDTH}>
            <SetTypeBadge
              testID={testID ? `${testID}-badge` : undefined}
              kind={badgeKind}
              workingIndex={workingIndex}
              onPress={onSetCellPress}
            />
          </SetCell>

          <SetCell testID={testID ? `${testID}-previous-cell` : undefined} flex={1.3}>
            <Pressable
              testID={testID ? `${testID}-previous` : undefined}
              accessibilityRole="button"
              accessibilityLabel={previousLabel ? `Previous: ${previousLabel}` : 'No previous value'}
              onPress={onPreviousPress}
              hitSlop={8}
            >
              <Text
                style={[typography.subhead, { color: colors.text.secondary }]}
                numberOfLines={1}
              >
                {previousLabel ?? '—'}
              </Text>
            </Pressable>
          </SetCell>

          {columns.map((column) => {
            if (column.kind === 'rpe') {
              const rpeValue = values[column.key];
              return (
                <SetCell key={column.key} testID={testID ? `${testID}-cell-${column.key}` : undefined}>
                  <Pressable
                    testID={testID ? `${testID}-rpe` : undefined}
                    accessibilityRole="button"
                    accessibilityLabel={rpeValue ? `RPE ${rpeValue}` : 'RPE not set'}
                    onPress={onRpePress}
                    hitSlop={8}
                  >
                    <Text
                      style={[
                        setValueStyle,
                        { color: rpeValue ? colors.text.primary : colors.text.tertiary },
                      ]}
                    >
                      {rpeValue || '—'}
                    </Text>
                  </Pressable>
                </SetCell>
              );
            }

            const prefix = VALUE_PREFIX[column.kind];

            return (
              <SetCell key={column.key} testID={testID ? `${testID}-cell-${column.key}` : undefined}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {prefix ? (
                    <Text style={[setValueStyle, { color: colors.text.secondary, marginRight: 2 }]}>
                      {prefix}
                    </Text>
                  ) : null}
                  <NumericInput
                    ref={fieldRefs?.[column.key]}
                    testID={testID ? `${testID}-value-${column.key}` : undefined}
                    accessibilityLabel={`${column.label} field`}
                    mode={inputModeFor(column.kind)}
                    value={values[column.key] ?? ''}
                    placeholder={placeholders[column.key]}
                    onChangeText={(text) => onChangeValue(column.key, text)}
                    onBlur={() => onBlurValue(column.key)}
                    onFocus={onFocusValue ? () => onFocusValue(column.key) : undefined}
                    inputAccessoryViewID={inputAccessoryViewID}
                    style={{ minWidth: 56 }}
                  />
                  {column.kind === 'time' && inlineTimerEnabled && onDurationTimerPress ? (
                    <Pressable
                      testID={testID ? `${testID}-timer-${column.key}` : undefined}
                      accessibilityRole="button"
                      accessibilityLabel="Inline timer"
                      onPress={() => onDurationTimerPress(column.key)}
                      hitSlop={8}
                      style={{ marginLeft: spacing['1'] }}
                    >
                      <Timer size={18} strokeWidth={1.75} color={colors.text.secondary} />
                    </Pressable>
                  ) : null}
                </View>
              </SetCell>
            );
          })}

          <SetCell testID={testID ? `${testID}-check-cell` : undefined} width={CHECK_CELL_WIDTH}>
            <Pressable
              testID={testID ? `${testID}-check` : undefined}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: isCompleted }}
              accessibilityLabel={isCompleted ? 'Completed' : 'Mark set complete'}
              onPress={onToggleCompleted}
              hitSlop={6}
              style={{
                width: CHECK_VISUAL_SIZE,
                height: CHECK_VISUAL_SIZE,
                borderRadius: 6,
                borderWidth: isCompleted ? 0 : 1.5,
                borderColor: colors.border.input,
                backgroundColor: isCompleted ? colors.accent.primary : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isCompleted ? (
                <Check size={18} strokeWidth={2.25} color={colors.accent.onAccent} />
              ) : null}
            </Pressable>
          </SetCell>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/** Memoized — see file header for why this is what actually delivers per-row typing isolation (06 §8). */
export const SetRow = React.memo(SetRowImpl);
