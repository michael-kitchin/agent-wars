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
  applyCommanderMessage,
  commanderDispatchHasProse,
  initialCommanderMessageTabs,
  type CommanderMessageTabState,
} from '../../shared/commanderMessageTabs';
import type { CommanderDispatch } from '../../shared/commanderStatus';
import { AI_SEAT_KIND } from '../../shared/seatRoster';
import { rendererSharedState as S } from '../core/state';
import { appendMapToastSectionHeader, setAiStrategyToastHiddenListener, showFilledAiStrategyToast } from './openRouterUiHelpers';

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
 * Expected outcome: The selected panel is that dispatch's Message, then Strategy, when the consult sent them. An empty batch does not show.
 * Exceptions: None.
 */
export function showCommanderMessageTabs(dispatches: readonly CommanderDispatch[]): void {
  if (strategyToastHidden() || tabState === null) {
    const seats = (S.gameState?.seats ?? [])
      .filter((seat) => seat.kind === AI_SEAT_KIND)
      .map((seat) => ({ seatId: seat.seatId, label: seat.homeRegion.trim() || seat.seatId }));
    tabState = initialCommanderMessageTabs(seats);
  }
  for (const dispatch of dispatches) {
    if (!commanderDispatchHasProse(dispatch.message, dispatch.strategy)) continue;
    tabState = applyCommanderMessage(tabState, {
      seatId: dispatch.seatId,
      message: dispatch.message,
      strategy: dispatch.strategy,
    });
  }
  if (!tabState.tabs.some((tab) => tab.enabled)) return;
  showFilledAiStrategyToast(renderCommanderMessageTabs, false);
}

/**
 * Paints the tab bar and the selected panel.
 *
 * Purpose: A tab click uses this alone so the 24 second timer does not restart.
 * When to use: `showFilledAiStrategyToast`, and a click on an enabled tab.
 * Expected outcome: A tablist and, when a tab is selected, one tabpanel. Disabled tabs stay disabled.
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
    button.textContent = tab.label;
    button.disabled = !tab.enabled;
    button.setAttribute('aria-selected', tab.seatId === state.selectedSeatId ? 'true' : 'false');
    button.addEventListener('click', () => {
      if (!tab.enabled || !tabState) return;
      tabState = { ...tabState, selectedSeatId: tab.seatId };
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
