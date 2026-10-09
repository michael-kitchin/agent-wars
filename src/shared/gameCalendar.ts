/**
 * Turns a strategic turn number into the date the player and the model see.
 *
 * Purpose: Global matches count months. Regional matches count weeks, with real month lengths and leap years.
 * When to use: Weather lookup, the sidebar, prompts, and the unit formation line.
 * Expected outcome: Pure values. These functions do not log, because snapshot assembly calls them once per hex.
 * Exceptions: None.
 */

import { formatOrdinalLabel } from './unitDisplayNames';

/**
 * Which calendar a map uses.
 *
 * Purpose: Callers pass the kind instead of branching on the map id at every format site.
 * When to use: `gameCalendarKindForMap`, then `gameDateForTurn`.
 * Expected outcome: `'monthly'` advances one month per turn. `'weekly'` advances seven days.
 * Exceptions: None.
 */
export type GameCalendarKind = 'monthly' | 'weekly';

/**
 * One strategic turn's date.
 *
 * Purpose: Weather needs the month index. The sidebar and the tooltip need the formatted label.
 * When to use: The return value of `gameDateForTurn`.
 * Expected outcome: `monthIndex` is 0 for January through 11 for December. `day` is null on the monthly calendar.
 * Exceptions: None.
 */
export interface GameDate {
  /**
   * Game year, starting at 1.
   *
   * Contract: Advances on the anniversary of the start month, not on 1 January.
   * When to use: `formatGameDate`.
   * Expected outcome: A positive integer. Years 1, 5, 9, and so on are leap years.
   * Exceptions: None.
   */
  readonly year: number;
  /**
   * Calendar month, January at 0.
   *
   * Contract: Matches the climate pack, where January is also index 0.
   * When to use: Indexing a hex's twelve weather months.
   * Expected outcome: An integer from 0 through 11.
   * Exceptions: None.
   */
  readonly monthIndex: number;
  /**
   * Day of the month, or null when the calendar has no days.
   *
   * Contract: 1 through the length of `monthIndex` in `year`. Null for a monthly date.
   * When to use: The weekly label only.
   * Expected outcome: Null, or a day that month actually contains.
   * Exceptions: None.
   */
  readonly day: number | null;
}

/**
 * Full English month names, January first.
 *
 * Purpose: Parsing a start month and formatting a date share one list.
 * When to use: `parseStartMonth` and `formatGameDate`.
 * Expected outcome: Twelve names. Index 0 is January, which is start month 1.
 * Exceptions: None.
 */
export const GAME_MONTH_NAMES: readonly string[] = Object.freeze([
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]);

/**
 * Days in each month of a common year, January first.
 *
 * Purpose: Weekly dates need a real month length. February is replaced in a leap year.
 * When to use: `daysInGameMonth` only.
 * Expected outcome: Twelve lengths. Index 1 is 28.
 * Exceptions: None.
 */
const DAYS_IN_COMMON_YEAR: readonly number[] = Object.freeze([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);

/**
 * Parses a start month from the new-game control or a persisted config value.
 *
 * Purpose: Unknown or out-of-range input must not throw and must not shift the calendar.
 * When to use: When reading `start_month` or the start-month select.
 * Expected outcome: 1 for January through 12 for December. Names are matched case-insensitively. Digit strings are accepted. Anything else, including null, is 1.
 * Exceptions: None.
 */
export function parseStartMonth(raw: string | number | null | undefined): number {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= 12) return raw;
  const text = String(raw ?? '').trim();
  if (/^\d+$/.test(text)) {
    const numeric = Number(text);
    return numeric >= 1 && numeric <= 12 ? numeric : 1;
  }
  const index = GAME_MONTH_NAMES.findIndex((name) => name.toLowerCase() === text.toLowerCase());
  return index >= 0 ? index + 1 : 1;
}

/**
 * Chooses the calendar for a loaded map.
 *
 * Purpose: The global map counts months. Every regional map counts weeks.
 * When to use: Before `gameDateForTurn` when the caller has a map id.
 * Expected outcome: `'monthly'` for `'global'`. `'weekly'` for every other id, including an empty string.
 * Exceptions: None.
 */
export function gameCalendarKindForMap(gameMapId: string): GameCalendarKind {
  return gameMapId === 'global' ? 'monthly' : 'weekly';
}

/**
 * Reports whether a game year contains 29 February.
 *
 * Purpose: Leap day falls in Years 1, 5, 9, and every fourth year after Year 1.
 * When to use: `daysInGameMonth` for February.
 * Expected outcome: True when `(year - 1)` is divisible by 4.
 * Exceptions: None.
 */
export function isLeapGameYear(year: number): boolean {
  const normalized = Number.isFinite(year) ? Math.floor(year) : 1;
  return (normalized - 1) % 4 === 0;
}

/**
 * Returns how many days the given game month has.
 *
 * Purpose: Weekly advancement has to stop on the real last day, including 29 February in a leap year.
 * When to use: While walking a weekly date forward, and from tests of the leap rule.
 * Expected outcome: 28, 29, 30, or 31. An index below 0 is January. An index above 11 is December. Both of those months have 31 days. February stays index 1.
 * Exceptions: None.
 */
export function daysInGameMonth(year: number, monthIndex: number): number {
  const index = monthIndex === 1 ? 1 : Math.min(11, Math.max(0, monthIndex));
  if (index === 1 && isLeapGameYear(year)) return 29;
  return DAYS_IN_COMMON_YEAR[index] ?? 31;
}

/**
 * Normalizes a turn number to a positive integer.
 *
 * Purpose: A missing or corrupt turn must still produce the date of turn 1.
 * When to use: `gameDateForTurn` only.
 * Expected outcome: An integer of at least 1.
 * Exceptions: None.
 */
function normalizedTurn(turnNumber: number): number {
  return Number.isFinite(turnNumber) && turnNumber >= 1 ? Math.floor(turnNumber) : 1;
}

/**
 * Walks week by week from the 1st of the start month.
 *
 * Purpose: Regional turns are weeks, and the year changes only when the start month comes around again.
 * When to use: `gameDateForTurn` when the kind is `'weekly'`.
 * Expected outcome: The date after `turn - 1` additions of 7 days, using `daysInGameMonth`.
 * Exceptions: None.
 */
function weeklyDate(turn: number, startMonth: number): GameDate {
  let year = 1;
  let monthIndex = startMonth - 1;
  let day = 1;
  let monthsElapsed = 0;
  for (let step = 1; step < turn; step += 1) {
    day += 7;
    while (day > daysInGameMonth(year, monthIndex)) {
      day -= daysInGameMonth(year, monthIndex);
      monthsElapsed += 1;
      year = Math.floor(monthsElapsed / 12) + 1;
      monthIndex = (startMonth - 1 + monthsElapsed) % 12;
    }
  }
  return { year, monthIndex, day };
}

/**
 * Returns the date of one strategic turn.
 *
 * Purpose: Weather, the sidebar, prompts, and formation labels share one date.
 * When to use: Whenever a turn number and a start month need to become a month or a full date.
 * Expected outcome: A monthly date whose year is `floor((turn - 1) / 12) + 1`, or a weekly date from `weeklyDate`. A bad turn is turn 1. A bad start month is January.
 * Exceptions: None.
 */
export function gameDateForTurn(
  turnNumber: number,
  startMonth: string | number | null | undefined,
  kind: GameCalendarKind
): GameDate {
  const turn = normalizedTurn(turnNumber);
  const start = parseStartMonth(startMonth);
  if (kind === 'weekly') return weeklyDate(turn, start);
  return {
    year: Math.floor((turn - 1) / 12) + 1,
    monthIndex: (turn - 1 + start - 1) % 12,
    day: null,
  };
}

/**
 * Formats a date for the sidebar, a prompt, or a tooltip.
 *
 * Purpose: The two calendars share one wording.
 * When to use: After `gameDateForTurn`.
 * Expected outcome: `November, Year 3` when `day` is null. `November 22nd, Year 1` when `day` is set. The ordinal is English.
 * Exceptions: None.
 */
export function formatGameDate(date: GameDate): string {
  const monthName = GAME_MONTH_NAMES[date.monthIndex] ?? 'January';
  const yearLabel = `Year ${date.year}`;
  if (date.day == null) return `${monthName}, ${yearLabel}`;
  return `${monthName} ${formatOrdinalLabel(date.day, 'en-US')}, ${yearLabel}`;
}

/**
 * Formats the date of one strategic turn.
 *
 * Purpose: Callers that only need the label should not assemble the date themselves.
 * When to use: The snapshot label and the unit formation line.
 * Expected outcome: The same string as `formatGameDate(gameDateForTurn(...))`.
 * Exceptions: None.
 */
export function formatGameDateForTurn(
  turnNumber: number,
  startMonth: string | number | null | undefined,
  kind: GameCalendarKind
): string {
  return formatGameDate(gameDateForTurn(turnNumber, startMonth, kind));
}
