/**
 * The opponent message dialog: one tab per AI seat.
 *
 * Purpose: Later opponents update their own tab instead of replacing the dialog.
 * When to use: A draining pool read that has kept dispatches.
 * Expected outcome: Tabs start disabled. A dispatch enables and selects its tab. The panel shows Messages, one line per message that commander sent, then Strategy.
 * Exceptions: None. A missing toast is skipped.
 */

import { buildAiStrategyToastSections } from '../../shared/aiStrategyToastContent';
import { dispatchMessagesInSideOrder, SIDE_MESSAGE_ARROW } from '../../shared/sideMessageView';
import { sideDisplayName, type SideDisplaySeat } from '../../shared/sideNicknames';
import {
  applyCommanderAbsence,
  applyCommanderMessage,
  commanderDispatchHasProse,
  formatCommanderAbsenceMessage,
  initialCommanderMessageTabs,
  noteCommanderConsultWithoutProse,
  resetCommanderConsultMarks,
  resolveCommanderTabAbsence,
  seatOutsideTacticalConsult,
  type CommanderMessageTabState,
} from '../../shared/commanderMessageTabs';
import type { CommanderDispatch, CommanderStatusRow } from '../../shared/commanderStatus';
import { AI_SEAT_KIND } from '../../shared/seatRoster';
import { rendererSharedState as S } from '../core/state';
import { replayActive } from '../replay/replayState';
import { createMessagePartyFlag } from '../chrome/sideNumberFlag';
import { createSideNumberFlag } from '../chrome/toastInlineMarks';
import { setSideCodeText } from '../chrome/sideCodeTextHelpers';
import { appendMapToastSectionHeader, restartAiStrategyToastTimer, setAiStrategyToastHiddenListener, showFilledAiStrategyToast } from './openRouterUiHelpers';

/**
 * Tabs for the dialog that is open, or null after it hides.
 *
 * Purpose: A later dispatch in the same appearance must not rebuild every tab as disabled.
 * When to use: `showCommanderMessageTabs` and `renderCommanderMessageTabs`.
 * Expected outcome: Null until the first dispatch of an appearance. Cleared when the toast hides.
 * Exceptions: None.
 */
let tabState: CommanderMessageTabState | null = null;

/**
 * Drops the tabs when the toast hides.
 *
 * Purpose: The next appearance starts with every tab disabled.
 * When to use: Once, from `initOpenRouterUI`, before a hide can run.
 * Expected outcome: `hideAiStrategyToast` clears this module's state.
 * Exceptions: None.
 */
export function bindCommanderMessageTabs(): void {
  setAiStrategyToastHiddenListener(() => {
    tabState = null;
  });
}

/**
 * Applies drained dispatches and shows the dialog when one tab is enabled.
 *
 * Purpose: The pool's screen callback. This function does not file Reports.
 * When to use: `readCommanderPoolAndApply` when messages should show, and replay with `fromReplay` to show a past turn's dialog. During replay a call without `fromReplay` returns at once, so a commander that finishes in the background cannot open its dialog over a past turn. Its messages are still filed in the Reports tab by the pool client.
 * Expected outcome: The selected panel is that dispatch's Messages, then Strategy, when the consult sent them. A skip enables its tab with one line and does not change the selection. An appearance with no prose does not open the dialog.
 * Exceptions: None.
 */
export function showCommanderMessageTabs(
  dispatches: readonly CommanderDispatch[],
  statuses: readonly CommanderStatusRow[] = [],
  options?: { readonly fromReplay?: boolean }
): void {
  if (replayActive() && options?.fromReplay !== true) return;
  const opening = strategyToastHidden() || tabState === null;
  if (opening && !dispatches.some((dispatch) => commanderDispatchHasProse(dispatch))) return;
  if (opening) {
    const seats = (S.gameState?.seats ?? [])
      .filter((seat) => seat.kind === AI_SEAT_KIND)
      .map((seat) => ({ seatId: seat.seatId, label: sideDisplayName(seat) }));
    tabState = initialCommanderMessageTabs(seats);
  } else if (tabState) {
    tabState = resetCommanderConsultMarks(tabState);
  }
  if (!tabState) return;
  for (const dispatch of dispatches) {
    tabState = commanderDispatchHasProse(dispatch)
      ? applyCommanderMessage(tabState, {
          seatId: dispatch.seatId,
          strategy: dispatch.strategy,
          messages: dispatch.messages,
        })
      : noteCommanderConsultWithoutProse(tabState, dispatch.seatId);
  }
  tabState = applyOpenTabAbsences(tabState, statuses);
  if (!tabState.tabs.some((tab) => tab.enabled)) return;
  showFilledAiStrategyToast(renderCommanderMessageTabs, false);
}

/**
 * Enables tabs that this appearance did not consult.
 *
 * Purpose: A knocked-out or skipped seat gets one line without replacing a consult that sent prose.
 * When to use: After the dispatches for this appearance have been applied.
 * Expected outcome: Each unresolved tab that has a reason is enabled. Selection is unchanged.
 * Exceptions: None.
 */
function applyOpenTabAbsences(
  state: CommanderMessageTabState,
  statuses: readonly CommanderStatusRow[]
): CommanderMessageTabState {
  let next = state;
  for (const tab of state.tabs) {
    const seat = (S.gameState?.seats ?? []).find((row) => row.seatId === tab.seatId);
    const status = statuses.find((row) => row.seatId === tab.seatId);
    const reason = resolveCommanderTabAbsence({
      outTurn: seat?.outTurn ?? null,
      status: status?.status ?? null,
      storedReason: status?.absenceReason ?? null,
      tacticalOtherSeat: seatIsOutsideThisBattle(tab.seatId, statuses),
      consultedWithoutProse: tab.consultedWithoutProse,
    });
    if (!reason) continue;
    const turnNumber =
      reason === 'knocked_out' ? (seat?.outTurn ?? null) : reason === 'timed_out' ? (status?.timedOutTurn ?? null) : null;
    next = applyCommanderAbsence(next, tab.seatId, formatCommanderAbsenceMessage(reason, turnNumber));
  }
  return next;
}

/**
 * Whether this seat is not the party being consulted in the open battle.
 *
 * Purpose: The other commanders were not asked for a battle plan.
 * When to use: While the opposing party's latest consult is the battle consult.
 * Expected outcome: True for every other seat. False when that consult is strategic, including when a battle is still open.
 * Exceptions: None.
 */
function seatIsOutsideThisBattle(seatId: string, statuses: readonly CommanderStatusRow[]): boolean {
  const opposingPartyId = S.tacticalBattleSnapshot?.opposingPartyId;
  const opponent = opposingPartyId ? statuses.find((row) => row.seatId === opposingPartyId) : undefined;
  return seatOutsideTacticalConsult(seatId, opposingPartyId, opponent?.theater ?? null);
}

/**
 * Paints the tab bar and the selected panel.
 *
 * Purpose: A tab click repaints the panel and restarts the 24 second timer.
 * When to use: `showFilledAiStrategyToast`, and a click on an enabled tab.
 * Expected outcome: A tablist and, when a tab is selected, one tabpanel. Each tab starts with that opponent's number flag. Disabled tabs stay disabled. Each message line starts with the arrow, then that side's flag and name. The first line is `1em` under Messages, and the lines sit against each other. The last line's bottom margin is the gap above Strategy. Side codes in message lines and in Strategy text show as display names, and a changed text carries its original as a tooltip.
 * Exceptions: None. A missing host is skipped.
 */
export function renderCommanderMessageTabs(target?: HTMLElement): void {
  const host = target ?? document.getElementById('ai-strategy-toast-text');
  if (!(host instanceof HTMLElement) || !tabState) return;
  const state = tabState;
  host.replaceChildren();
  const list = document.createElement('div');
  list.className = 'ai-strategy-tab-bar';
  list.setAttribute('role', 'tablist');
  for (const tab of state.tabs) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'tab');
    const flag = createSideNumberFlag(tab.seatId, S.gameState?.seats ?? []);
    if (flag) button.appendChild(flag);
    button.appendChild(document.createTextNode(tab.label));
    button.title = tab.label;
    button.disabled = !tab.enabled;
    button.setAttribute('aria-selected', tab.seatId === state.selectedSeatId ? 'true' : 'false');
    button.addEventListener('click', () => {
      if (!tab.enabled || !tabState) return;
      tabState = { ...tabState, selectedSeatId: tab.seatId };
      restartAiStrategyToastTimer();
      renderCommanderMessageTabs();
    });
    list.append(button);
  }
  host.append(list);
  const selected = state.tabs.find((tab) => tab.seatId === state.selectedSeatId);
  if (!selected?.enabled) return;
  const sections = buildAiStrategyToastSections({ messages: selected.messages, strategy: selected.strategy });
  const absence = selected.fromAbsence ? selected.message : null;
  if (sections.length === 0 && !absence) return;
  const panel = document.createElement('div');
  panel.setAttribute('role', 'tabpanel');
  const seats = S.gameState?.seats ?? [];
  for (const section of sections) {
    appendMapToastSectionHeader(panel, section.title);
    if (section.bullets && section.bullets.length > 0) {
      for (const bullet of dispatchMessagesInSideOrder(section.bullets, (seatId) => seatOrder(seats, seatId))) {
        const item = document.createElement('div');
        item.className = 'commander-message-line';
        const label = seatName(seats, bullet.toSeatId);
        item.appendChild(document.createTextNode(`${SIDE_MESSAGE_ARROW} `));
        const flag = createMessagePartyFlag(bullet.toSeatId, seats);
        if (flag) item.appendChild(flag);
        const words = document.createElement('span');
        setSideCodeText(words, { prefix: `${label}: `, rawText: bullet.text, seats, rawTooltip: true });
        item.appendChild(words);
        panel.appendChild(item);
      }
    } else {
      const span = document.createElement('span');
      span.className = 'commander-message-body';
      setSideCodeText(span, { prefix: '', rawText: section.body, seats, rawTooltip: true });
      panel.append(span);
    }
  }
  if (absence) {
    const span = document.createElement('span');
    span.style.display = 'block';
    span.textContent = absence;
    panel.append(span);
  }
  host.append(panel);
}

/**
 * The roster order of one recipient.
 *
 * Purpose: Message lines follow `seatOrder`.
 * When to use: `dispatchMessagesInSideOrder`.
 * Expected outcome: That seat's `seatOrder`. A missing seat sorts after every known seat.
 * Exceptions: None.
 */
function seatOrder(seats: readonly { readonly seatId: string; readonly seatOrder?: number }[], seatId: string): number {
  return seats.find((seat) => seat.seatId === seatId)?.seatOrder ?? Number.MAX_SAFE_INTEGER;
}

/**
 * The name shown for one seat.
 *
 * Purpose: A line names the recipient the way the rest of the match does.
 * When to use: Each message line's name.
 * Expected outcome: `sideDisplayName` for a roster seat, or the seat id when the seat is missing.
 * Exceptions: None.
 */
function seatName(seats: readonly (SideDisplaySeat & { readonly seatId: string })[], seatId: string): string {
  const seat = seats.find((row) => row.seatId === seatId);
  return seat ? sideDisplayName(seat) : seatId;
}

/**
 * Whether the message dialog is not on screen.
 *
 * Purpose: A hidden dialog's next dispatch builds the tabs again.
 * When to use: `showCommanderMessageTabs`.
 * Expected outcome: True when the element is missing or has `hidden`.
 * Exceptions: None.
 */
function strategyToastHidden(): boolean {
  const toast = document.getElementById('ai-strategy-toast');
  return !(toast instanceof HTMLElement) || toast.classList.contains('hidden');
}
