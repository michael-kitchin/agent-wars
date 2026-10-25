/**
 * The opponent message dialog: one tab per AI seat.
 *
 * Purpose: Later opponents update their own tab instead of replacing the dialog.
 * When to use: A draining pool read that has kept dispatches.
 * Expected outcome: Tabs start disabled. A dispatch enables and selects its tab. The panel shows Message, then Strategy, when that consult sent them.
 * Exceptions: None. A missing toast is skipped.
 */

import { buildAiStrategyToastSections } from '../../shared/aiStrategyToastContent';
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
import { createSideNumberFlag } from '../chrome/toastInlineMarks';
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
 * When to use: `readCommanderPoolAndApply` when messages should show.
 * Expected outcome: The selected panel is that dispatch's Message, then Strategy, when the consult sent them. A skip enables its tab with one line and does not change the selection. An appearance with no prose does not open the dialog.
 * Exceptions: None.
 */
export function showCommanderMessageTabs(
  dispatches: readonly CommanderDispatch[],
  statuses: readonly CommanderStatusRow[] = []
): void {
  const opening = strategyToastHidden() || tabState === null;
  if (opening && !dispatches.some((dispatch) => commanderDispatchHasProse(dispatch.message, dispatch.strategy))) return;
  if (opening) {
    const seats = (S.gameState?.seats ?? [])
      .filter((seat) => seat.kind === AI_SEAT_KIND)
      .map((seat) => ({ seatId: seat.seatId, label: seat.homeRegion.trim() || seat.seatId }));
    tabState = initialCommanderMessageTabs(seats);
  } else if (tabState) {
    tabState = resetCommanderConsultMarks(tabState);
  }
  if (!tabState) return;
  for (const dispatch of dispatches) {
    tabState = commanderDispatchHasProse(dispatch.message, dispatch.strategy)
      ? applyCommanderMessage(tabState, {
          seatId: dispatch.seatId,
          message: dispatch.message,
          strategy: dispatch.strategy,
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
 * Expected outcome: A tablist and, when a tab is selected, one tabpanel. Each tab starts with that opponent's number flag. Disabled tabs stay disabled.
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
  const sections = buildAiStrategyToastSections({ message: selected.message, strategy: selected.strategy });
  if (sections.length === 0) return;
  const panel = document.createElement('div');
  panel.setAttribute('role', 'tabpanel');
  sections.forEach((section, index) => {
    if (index > 0) panel.appendChild(document.createElement('br'));
    appendMapToastSectionHeader(panel, section.title);
    const span = document.createElement('span');
    span.style.display = 'block';
    span.textContent = section.body;
    panel.append(span);
  });
  host.append(panel);
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
