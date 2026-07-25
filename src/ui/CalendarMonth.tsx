/**
 * `CalendarMonth` — 07 §5 component inventory: "custom grid, accent dot/fill
 * days," used by the History → Calendar screen (04 §3.2). Presentational
 * only — receives an already-built grid of day cells plus a month label as
 * plain props; every date/week/streak computation lives in
 * `src/features/calendar/calendar-month-model.ts` (`buildMonthGrid`) and is
 * threaded down by `CalendarScreen.tsx`, since `src/ui/**` may only depend
 * on its own tokens (06 §2's lint-enforced boundary) and can't reach that
 * feature-layer module directly — see that file's own header for the full
 * "why a feature module, not domain" reasoning. `CalendarMonthDayCell`
 * below is a hand-mirrored duplicate of `calendar-month-model.ts`'s
 * `CalendarDayCell`, the same cross-boundary type-mirroring convention
 * `SetRow.tsx`'s `SetRowColumn` already establishes for
 * `domain/set-table-columns.ts`.
 *
 * Visual (04 §3.2 / 07 §5): a small accent dot below the day number marks a
 * workout day; the day number itself gets an accent ring for "today"; a
 * `×N` badge (top-right of the cell) marks a multi-workout day — the design
 * doc's own literal "×2 badge" example generalized to the actual count so a
 * 3+-workout day reads correctly too, rather than lying "×2" for anything
 * above one.
 *
 * Paging (04 §3.2 "swipe/chevron month pager"): chevron buttons always
 * work; a horizontal `Gesture.Pan` over the week grid also fires
 * `onPrevMonth`/`onNextMonth` past a fixed translation threshold — the same
 * `Gesture.Pan()` + threshold-on-`onEnd` shape `SetRow.tsx`'s swipe-to-
 * delete already establishes (no persistent visual drag-follow, since 07 §5
 * doesn't call for a parallax/carousel effect, only "pager" behavior).
 * Gesture-driven paging isn't exercised by the RNTL suite — `Sheet.test.tsx`
 * (M0-07) already established that this codebase leaves native
 * `Gesture.Pan` drag sequences to manual/QA verification rather than faking
 * gesture-handler's internal state in Jest; `CalendarMonth.test.tsx` covers
 * the chevron-button path instead, which exercises the exact same
 * `onPrevMonth`/`onNextMonth` callbacks.
 */
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { useTheme } from './theme-provider';

/** Hand-mirrored duplicate of `calendar-month-model.ts`'s `CalendarDayCell` — see file header. */
export interface CalendarMonthDayCell {
  /** `'YYYY-MM-DD'` local date, passed back verbatim via `onDayPress`. */
  date: string;
  dayOfMonth: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  workoutCount: number;
  accessibilityLabel: string;
}

export interface CalendarMonthProps {
  /** e.g. "July 2026". */
  monthLabel: string;
  /** 7 weekday header labels, in display order (respecting first-day-of-week). */
  weekdayLabels: readonly string[];
  /** Full weeks of day cells, each exactly 7 long, in display order. */
  weeks: readonly (readonly CalendarMonthDayCell[])[];
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onDayPress: (cell: CalendarMonthDayCell) => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const HEADER_ICON_SIZE = 24;
const HEADER_ICON_STROKE_WIDTH = 1.75;
const DAY_CIRCLE_SIZE = 32;
const DOT_SIZE = 5;
/** Horizontal drag distance (pt) past which a release pages the month — mirrors `SetRow.tsx`'s own threshold-on-release swipe pattern. */
const SWIPE_PAGE_THRESHOLD = 50;

export function CalendarMonth({
  monthLabel,
  weekdayLabels: weekdayHeaderLabels,
  weeks,
  onPrevMonth,
  onNextMonth,
  onDayPress,
  style,
  testID,
}: CalendarMonthProps): React.JSX.Element {
  const { colors, typography, spacing, radii } = useTheme();

  const panGesture = useMemo(
    () =>
      Gesture.Pan().onEnd((e) => {
        if (e.translationX <= -SWIPE_PAGE_THRESHOLD) {
          onNextMonth();
        } else if (e.translationX >= SWIPE_PAGE_THRESHOLD) {
          onPrevMonth();
        }
      }),
    [onNextMonth, onPrevMonth],
  );

  return (
    <View testID={testID} style={style}>
      <View style={styles.headerRow}>
        <Pressable
          testID={testID ? `${testID}-prev-month` : undefined}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          hitSlop={8}
          onPress={onPrevMonth}
        >
          <ChevronLeft
            size={HEADER_ICON_SIZE}
            strokeWidth={HEADER_ICON_STROKE_WIDTH}
            color={colors.text.secondary}
          />
        </Pressable>
        <Text style={[typography.title3, { color: colors.text.primary }]}>{monthLabel}</Text>
        <Pressable
          testID={testID ? `${testID}-next-month` : undefined}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          hitSlop={8}
          onPress={onNextMonth}
        >
          <ChevronRight
            size={HEADER_ICON_SIZE}
            strokeWidth={HEADER_ICON_STROKE_WIDTH}
            color={colors.text.secondary}
          />
        </Pressable>
      </View>

      <View style={[styles.weekRow, { marginTop: spacing['3'] }]}>
        {weekdayHeaderLabels.map((label, index) => (
          <Text
            key={`weekday-${index}`}
            style={[
              typography.footnote,
              styles.dayCell,
              { color: colors.text.tertiary, textAlign: 'center', letterSpacing: 0.5 },
            ]}
          >
            {label.toUpperCase()}
          </Text>
        ))}
      </View>

      <GestureDetector gesture={panGesture}>
        <View testID={testID ? `${testID}-grid` : undefined}>
          {weeks.map((week, weekIndex) => (
            <View key={`week-${weekIndex}`} style={styles.weekRow}>
              {week.map((cell) => {
                const showBadge = cell.workoutCount >= 2;
                return (
                  <Pressable
                    key={cell.date}
                    testID={testID ? `${testID}-day-${cell.date}` : undefined}
                    accessibilityRole="button"
                    accessibilityLabel={cell.accessibilityLabel}
                    style={[styles.dayCell, { paddingVertical: spacing['1'] }]}
                    onPress={() => onDayPress(cell)}
                  >
                    <View style={styles.dayCellInner}>
                      <View
                        style={[
                          styles.dayCircle,
                          cell.isToday
                            ? { borderWidth: 1.5, borderColor: colors.accent.primary }
                            : null,
                        ]}
                      >
                        <Text
                          style={[
                            typography.body,
                            {
                              color: cell.inCurrentMonth ? colors.text.primary : colors.text.tertiary,
                            },
                          ]}
                        >
                          {cell.dayOfMonth}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.dot,
                          {
                            backgroundColor:
                              cell.workoutCount > 0 ? colors.accent.primary : 'transparent',
                          },
                        ]}
                      />
                      {showBadge ? (
                        <View
                          testID={testID ? `${testID}-badge-${cell.date}` : undefined}
                          style={[
                            styles.badge,
                            { backgroundColor: colors.accent.primary, borderRadius: radii.pill },
                          ]}
                        >
                          <Text
                            style={[
                              typography.footnote,
                              { color: colors.accent.onAccent, fontSize: 9, fontWeight: '700' },
                            ]}
                          >
                            ×{cell.workoutCount}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCellInner: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: DAY_CIRCLE_SIZE,
    height: DAY_CIRCLE_SIZE,
    borderRadius: DAY_CIRCLE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    marginTop: 2,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: 4,
    paddingHorizontal: 3,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: 'center',
  },
});
