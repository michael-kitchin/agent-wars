/**
 * Tab state for the opponent message dialog.
 *
 * Purpose: One dialog lists every AI opponent. A tab turns on when that opponent sends prose.
 * When to use: The message dialog, before it paints.
 * Expected outcome: Tabs stay in opponent-number order, labeled with the short side name. A later consult from the same seat replaces that tab's message and strategy.
 * Exceptions: None. This module does not import the logger.
 */

import type { CommanderAbsenceReason, CommanderConsultTheater, CommanderStatus } from './commanderStatus';
import { aiIndexForSeatId } from './seatIds';
import { shortSideName } from './seatRoster';

/**
 * One opponent's tab.
 *
 * Purpose: The dialog needs the label, whether the player can open it, and the prose it shows.
 * When to use: `CommanderMessageTabState.tabs`.
 * Expected outcome: Disabled until a non-empty message, a strategy, or an absence line arrives.
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
   * Contract: False until a non-empty message, a strategy, or an absence line is stored.
   * When to use: The button's disabled state.
   * Expected outcome: True after `applyCommanderMessage` keeps prose, or after `applyCommanderAbsence` stores a line.
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
  /**
   * Whether this appearance already consulted the seat and got no prose.
   *
   * Contract: True only after a finished consult with an empty message and strategy. False again when prose arrives.
   * When to use: Before an absence line. A silent consult must stay disabled.
   * Expected outcome: The absence pass skips this tab.
   * Exceptions: None.
   */
  readonly consultedWithoutProse: boolean;
  /**
   * Whether the current line is an explanation rather than a consult.
   *
   * Contract: True only after `applyCommanderAbsence`. False after real prose, and false while the tab is disabled.
   * When to use: A later explanation may replace this line. Real prose must not be replaced.
   * Expected outcome: The Message section is the explanation, and Strategy is empty.
   * Exceptions: None.
   */
  readonly fromAbsence: boolean;
}

/**
 * The dialog's tabs and which one is selected.
 *
 * Purpose: The screen paints this and does not sort it again.
 * When to use: After `initialCommanderMessageTabs` and each `applyCommanderMessage`.
 * Expected outcome: `selectedSeatId` is null until a message or strategy arrives. An absence line does not change it.
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
      consultedWithoutProse: false,
      fromAbsence: false,
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
    tabIndex === index
      ? { ...tab, enabled: true, message, strategy, consultedWithoutProse: false, fromAbsence: false }
      : tab
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

/**
 * Facts the message dialog uses to decide whether a tab gets an absence line.
 *
 * Purpose: Knockout, a missing model, a timeout, a silent consult, and a seat outside the battle outrank a stored skip.
 * When to use: `resolveCommanderTabAbsence`.
 * Expected outcome: One object per tab on each dialog appearance.
 * Exceptions: None.
 */
export interface CommanderTabAbsenceInput {
  /**
   * The turn the seat was knocked out, or null while it is still in the match.
   *
   * Contract: The roster's `outTurn`.
   * When to use: A non-null value selects `knocked_out` ahead of every other reason.
   * Expected outcome: The turn number, or null.
   * Exceptions: None.
   */
  readonly outTurn: number | null;
  /**
   * The pool status for this seat, or null when the snapshot has no row.
   *
   * Contract: A `CommanderStatus`, or null.
   * When to use: `out`, `no_model`, `timed_out`, and `planning` are decided here.
   * Expected outcome: The status at the moment of the read.
   * Exceptions: None.
   */
  readonly status: CommanderStatus | null;
  /**
   * The reason the pool stored for an unfinished consult.
   *
   * Contract: A `CommanderAbsenceReason`, or null.
   * When to use: Only after roster status, a timeout, a silent consult, and a seat outside this battle.
   * Expected outcome: The stored reason, or null.
   * Exceptions: None.
   */
  readonly storedReason: CommanderAbsenceReason | null;
  /**
   * Whether a tactical consult is open and this seat is not the opposing party.
   *
   * Contract: True while a battle snapshot is on screen, the battle names an opposing party, and this seat is not that party. Beat resolution counts, because that consult is still the battle.
   * When to use: After the status checks and before the stored reason.
   * Expected outcome: True selects `not_in_battle`.
   * Exceptions: None.
   */
  readonly tacticalOtherSeat: boolean;
  /**
   * Whether this appearance already received a finished consult with no prose.
   *
   * Contract: The tab's `consultedWithoutProse` flag.
   * When to use: After knockout, a missing model, and a timeout. A silent consult stays disabled.
   * Expected outcome: True yields no absence line.
   * Exceptions: None.
   */
  readonly consultedWithoutProse: boolean;
}

/**
 * Whether this seat was left out of the battle consult.
 *
 * Purpose: A strategic consult can finish while a battle is still open. Those commanders were asked, so the battle line must not replace their own skip.
 * When to use: Before `resolveCommanderTabAbsence`, for a seat other than the battle's opposing party.
 * Expected outcome: True only when the opposing party's latest consult is tactical. False when that consult is strategic, when this seat is the opposing party, and when the battle names no party.
 * Exceptions: None.
 */
export function seatOutsideTacticalConsult(
  seatId: string,
  opposingPartyId: string | null | undefined,
  opponentTheater: CommanderConsultTheater | null
): boolean {
  if (!opposingPartyId || seatId === opposingPartyId) return false;
  return opponentTheater === 'tactical';
}

/**
 * The absence reason for one tab, if this appearance should explain a skip.
 *
 * Purpose: A real consult, a seat that is still planning, and a silent reply must not be replaced by a stored skip.
 * When to use: After prose dispatches have been applied for this appearance.
 * Expected outcome: Null when the tab should stay disabled. Otherwise the reason to format.
 * Exceptions: None.
 */
export function resolveCommanderTabAbsence(input: CommanderTabAbsenceInput): CommanderAbsenceReason | null {
  if (input.outTurn !== null || input.status === 'out') return 'knocked_out';
  if (input.status === 'no_model') return 'no_model';
  if (input.status === 'timed_out') return 'timed_out';
  if (input.consultedWithoutProse) return null;
  if (input.status === 'planning') return null;
  if (input.tacticalOtherSeat) return 'not_in_battle';
  return input.storedReason;
}

/**
 * The one-line Message body for an absence reason.
 *
 * Purpose: The tab explains the skip in one sentence and does not invent a strategy.
 * When to use: After `resolveCommanderTabAbsence` returns a reason. Pass the knockout turn or the timeout turn. Other reasons ignore the turn.
 * Expected outcome: One sentence. The turn number is included only when it is a finite number greater than zero.
 * Exceptions: None.
 */
export function formatCommanderAbsenceMessage(reason: CommanderAbsenceReason, turnNumber: number | null): string {
  const turn = turnNumber !== null && Number.isFinite(turnNumber) && turnNumber > 0 ? turnNumber : null;
  switch (reason) {
    case 'knocked_out':
      return turn === null ? 'Knocked out.' : `Knocked out on turn ${turn}.`;
    case 'no_model':
      return 'No commander model is set.';
    case 'timed_out':
      return turn === null
        ? 'No reply in time, so its standing orders ran instead.'
        : `No reply in time on turn ${turn}, so its standing orders ran instead.`;
    case 'no_new_consult':
      return 'No new consult was required, so its standing orders still apply.';
    case 'not_in_battle':
      return 'Not in this battle.';
    case 'no_units_in_battle':
      return 'No units left in this battle.';
    case 'consult_failed':
      return 'The consult failed.';
  }
}

/**
 * Marks a finished consult that sent no prose.
 *
 * Purpose: A silent reply must not be described as a skip, and must not replace prose already shown.
 * When to use: A dispatch in this appearance whose message and strategy are both empty.
 * Expected outcome: A tab that already shows real prose is unchanged. An explanation is cleared and the tab is disabled. Selection changes only when that explanation was the selected tab.
 * Exceptions: None. An unknown seat id leaves the state unchanged.
 */
export function noteCommanderConsultWithoutProse(
  state: CommanderMessageTabState,
  seatId: string
): CommanderMessageTabState {
  const index = state.tabs.findIndex((tab) => tab.seatId === seatId);
  if (index < 0) return state;
  const current = state.tabs[index];
  if (!current || (current.enabled && !current.fromAbsence)) return state;
  if (current.consultedWithoutProse && !current.fromAbsence) return state;
  const tabs = state.tabs.map((tab, tabIndex) =>
    tabIndex === index
      ? {
          ...tab,
          consultedWithoutProse: true,
          enabled: false,
          message: current.fromAbsence ? null : tab.message,
          strategy: null,
          fromAbsence: false,
        }
      : tab
  );
  const selectedSeatId = state.selectedSeatId === seatId && current.fromAbsence ? null : state.selectedSeatId;
  return { tabs, selectedSeatId };
}

/**
 * Enables one tab with an absence line and leaves the selection alone.
 *
 * Purpose: The player can open the explanation without leaving the consult that actually replied.
 * When to use: After `resolveCommanderTabAbsence` returns a reason and the tab is not already showing prose.
 * Expected outcome: That tab is enabled, its message is the line, and its strategy is null. A later explanation replaces an earlier one. Real prose is left as it is. `selectedSeatId` is unchanged.
 * Exceptions: None. An unknown seat id or a blank line leaves the state unchanged.
 */
export function applyCommanderAbsence(
  state: CommanderMessageTabState,
  seatId: string,
  message: string
): CommanderMessageTabState {
  const line = proseOrNull(message);
  if (!line) return state;
  const index = state.tabs.findIndex((tab) => tab.seatId === seatId);
  if (index < 0) return state;
  const current = state.tabs[index];
  if (!current || (current.enabled && !current.fromAbsence)) return state;
  const tabs = state.tabs.map((tab, tabIndex) =>
    tabIndex === index
      ? { ...tab, enabled: true, message: line, strategy: null, fromAbsence: true, consultedWithoutProse: false }
      : tab
  );
  return { tabs, selectedSeatId: state.selectedSeatId };
}

/**
 * Clears silent-consult marks from the open dialog.
 *
 * Purpose: A mark from the previous batch must not hide a later skip while the dialog stays open.
 * When to use: At the start of an update that does not rebuild the tabs.
 * Expected outcome: `consultedWithoutProse` is false. Enabled lines and the selection stay as they are.
 * Exceptions: None.
 */
export function resetCommanderConsultMarks(state: CommanderMessageTabState): CommanderMessageTabState {
  if (!state.tabs.some((tab) => tab.consultedWithoutProse)) return state;
  return {
    tabs: state.tabs.map((tab) => (tab.consultedWithoutProse ? { ...tab, consultedWithoutProse: false } : tab)),
    selectedSeatId: state.selectedSeatId,
  };
}
