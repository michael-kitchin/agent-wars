/**
 * Tab state for the opponent message dialog.
 *
 * Purpose: One dialog lists every AI opponent. A tab turns on when that opponent sends prose.
 * When to use: The message dialog, before it paints.
 * Expected outcome: Tabs stay in opponent-number order, labeled with the short side name. A later consult from the same seat replaces that tab's message and strategy.
 * Exceptions: None. This module does not import the logger.
 */

import { aiIndexForSeatId } from './seatIds';
import { shortSideName } from './seatRoster';

/**
 * One opponent's tab.
 *
 * Purpose: The dialog needs the label, whether the player can open it, and the prose it shows.
 * When to use: `CommanderMessageTabState.tabs`.
 * Expected outcome: Disabled until a non-empty message or strategy arrives.
 * Exceptions: None.
 */
export interface CommanderMessageTab {
  /**
   * Seat id.
   *
   * Contract: An AI seat id from the roster.
   * When to use: Matching a dispatch to a tab.
   * Expected outcome: Stable for the life of the dialog.
   * Exceptions: None.
   */
  readonly seatId: string;
  /**
   * Short side name shown on the tab.
   *
   * Contract: `shortSideName` of the string passed in. The caller passes the trimmed home name, or the seat id when that name is blank.
   * When to use: The tab button.
   * Expected outcome: The name the player reads, such as `E. Europe`.
   * Exceptions: None.
   */
  readonly label: string;
  /**
   * Whether the player can open this tab.
   *
   * Contract: False until a non-empty message or strategy is stored.
   * When to use: The button's disabled state.
   * Expected outcome: True after `applyCommanderMessage` keeps prose for this seat.
   * Exceptions: None.
   */
  readonly enabled: boolean;
  /**
   * The seat's latest message.
   *
   * Contract: Trimmed text, or null.
   * When to use: The Message section.
   * Expected outcome: Replaced, not appended, by the next message.
   * Exceptions: None.
   */
  readonly message: string | null;
  /**
   * The seat's latest strategy.
   *
   * Contract: Trimmed text, or null when that consult sent none.
   * When to use: The Strategy section. Stored whether or not a human seat is playing.
   * Expected outcome: Null hides that section.
   * Exceptions: None.
   */
  readonly strategy: string | null;
}

/**
 * The dialog's tabs and which one is selected.
 *
 * Purpose: The screen paints this and does not sort it again.
 * When to use: After `initialCommanderMessageTabs` and each `applyCommanderMessage`.
 * Expected outcome: `selectedSeatId` is null until a message arrives.
 * Exceptions: None.
 */
export interface CommanderMessageTabState {
  /**
   * Tabs in opponent-number order.
   *
   * Contract: Sorted by `aiIndexForSeatId`, then seat id. A seat id with no opponent number sorts last. Apply does not reorder them.
   * When to use: The tab bar.
   * Expected outcome: One tab per AI seat passed in.
   * Exceptions: None.
   */
  readonly tabs: readonly CommanderMessageTab[];
  /**
   * The tab whose panel is showing.
   *
   * Contract: A seat id from `tabs`, or null when every tab is disabled.
   * When to use: `aria-selected` and the panel.
   * Expected outcome: The seat of the last consult that sent a message, a strategy, or both.
   * Exceptions: None.
   */
  readonly selectedSeatId: string | null;
}

/**
 * Orders two tabs by opponent number.
 *
 * Purpose: The flags show `aiIndexForSeatId`, and the row should read 1 through 4 from left to right.
 * When to use: `initialCommanderMessageTabs` only.
 * Expected outcome: The lower opponent number comes first. A missing number sorts after every numbered seat. Equal numbers break ties by seat id.
 * Exceptions: None.
 */
function compareCommanderMessageTabs(
  left: { readonly seatId: string },
  right: { readonly seatId: string }
): number {
  const leftIndex = aiIndexForSeatId(left.seatId) ?? Number.MAX_SAFE_INTEGER;
  const rightIndex = aiIndexForSeatId(right.seatId) ?? Number.MAX_SAFE_INTEGER;
  return leftIndex - rightIndex || left.seatId.localeCompare(right.seatId, 'en');
}

/**
 * Builds a disabled tab for every AI seat, in opponent-number order.
 *
 * Purpose: The dialog's first appearance shows every opponent, none of them open yet.
 * When to use: When the toast is hidden or no tab state exists.
 * Expected outcome: Every tab disabled, message and strategy null, and no selection. Each label is `shortSideName` of the name that was passed in.
 * Exceptions: None.
 */
export function initialCommanderMessageTabs(
  seats: readonly { readonly seatId: string; readonly label: string }[]
): CommanderMessageTabState {
  const tabs = seats
    .map((seat) => ({
      seatId: seat.seatId,
      label: shortSideName(seat.label),
      enabled: false,
      message: null,
      strategy: null,
    }))
    .sort(compareCommanderMessageTabs);
  return { tabs, selectedSeatId: null };
}

/**
 * Enables one tab, replaces its prose, and selects it.
 *
 * Purpose: A new dispatch must not append to the previous message.
 * When to use: Each kept dispatch, in arrival order.
 * Expected outcome: That tab is enabled and selected. Its message and strategy are replaced by this consult. A consult with no prose, and an unknown seat id, leave the state unchanged.
 * Exceptions: None.
 */
export function applyCommanderMessage(
  state: CommanderMessageTabState,
  arrival: {
    readonly seatId: string;
    readonly message: string | null;
    readonly strategy: string | null;
  }
): CommanderMessageTabState {
  const message = proseOrNull(arrival.message);
  const strategy = proseOrNull(arrival.strategy);
  if (!message && !strategy) return state;
  const index = state.tabs.findIndex((tab) => tab.seatId === arrival.seatId);
  if (index < 0) return state;
  const tabs = state.tabs.map((tab, tabIndex) =>
    tabIndex === index ? { ...tab, enabled: true, message, strategy } : tab
  );
  return { tabs, selectedSeatId: arrival.seatId };
}

/**
 * Whether a consult sent player-facing prose.
 *
 * Purpose: The message popup and Reports keep a consult that sent a message, a strategy, or both.
 * When to use: Before enabling a tab or filing a Reports entry. This function does not read observe mode.
 * Expected outcome: True when either trimmed value is non-empty.
 * Exceptions: None.
 */
export function commanderDispatchHasProse(
  message: string | null | undefined,
  strategy: string | null | undefined
): boolean {
  return proseOrNull(message ?? null) !== null || proseOrNull(strategy ?? null) !== null;
}

/**
 * Trims prose and treats a blank string as absent.
 *
 * Purpose: A whitespace message must not enable a tab.
 * When to use: `applyCommanderMessage` and `commanderDispatchHasProse`.
 * Expected outcome: Null when the text is null or only whitespace.
 * Exceptions: None.
 */
function proseOrNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}
