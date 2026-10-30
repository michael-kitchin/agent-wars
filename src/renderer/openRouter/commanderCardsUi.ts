/**
 * The commander cards on the Commanders tab.
 *
 * Purpose: Each AI seat shows its status, cost, and commander, and can be edited.
 * When to use: When the roster or the pool changes.
 * Expected outcome: One card per AI seat, in seat order. A knocked-out card is dimmed.
 * Exceptions: A rejected save is logged and leaves the card as it was.
 */

import { commanderCardPresentation } from '../../shared/commanderCardState';
import { formatCommanderButtonLabel } from '../../shared/commanderSummary';
import type { CommanderStatus } from '../../shared/commanderStatus';
import type { NewGameCommanderInput } from '../../shared/ipc/ordersTypes';
import { isAiSeatId, type AiSeatId } from '../../shared/seatIds';
import { paletteForOwner } from '../../shared/seatPalette';
import { AI_SEAT_KIND, sortSeatsByOrder, type SeatSnapshot } from '../../shared/seatRoster';
import { rendererSharedState as S } from '../core/state';
import { commanderPoolStatuses, subscribeCommanderPool } from './commanderPoolClient';
import { commanderPopoverIsOpen, openCommanderPopover, reanchorCommanderPopover } from './commanderPopover';
import { syncOpenRouterRunToggle } from './openRouterRunToggle';

/**
 * The activity-log seat filter. Empty means every commander.
 *
 * Purpose: The select and the log lines share one value.
 * When to use: `setCommanderLogSeatFilter` and `markCommanderLogLine`.
 * Expected outcome: A seat id, or empty.
 * Exceptions: None.
 */
let logSeatFilter = '';

/**
 * Shows or hides one log line for the current filter.
 *
 * Purpose: Lines written before the filter changed, and new lines, follow the same rule.
 * When to use: After a line is appended, and when the filter changes.
 * Expected outcome: A line is hidden when a seat is selected and the line is not that seat's.
 * Exceptions: None.
 */
export function markCommanderLogLine(line: HTMLElement): void {
  const owner = line.dataset.seatId ?? '';
  line.hidden = logSeatFilter !== '' && owner !== logSeatFilter;
}

/**
 * Remembers the activity-log filter and applies it.
 *
 * Purpose: The select on the Commanders tab chooses one seat or all of them.
 * When to use: The filter's change event.
 * Expected outcome: Existing lines hide or show. Later lines use the same filter.
 * Exceptions: None.
 */
export function setCommanderLogSeatFilter(seatId: string): void {
  logSeatFilter = seatId;
  const log = document.getElementById('openrouter-log');
  if (!log) return;
  for (const child of log.children) {
    if (child instanceof HTMLElement) markCommanderLogLine(child);
  }
}

/**
 * Paints one card per AI seat.
 *
 * Purpose: The tab lists commanders instead of one shared model.
 * When to use: After a snapshot, a pool read, or a commander save.
 * Expected outcome: The list matches the roster. An open popover stays anchored to its button.
 * Exceptions: None.
 */
export function renderCommanderCards(): void {
  const host = document.getElementById('commander-cards');
  if (!host) return;
  const seats = sortSeatsByOrder((S.gameState?.seats ?? []).filter((seat) => seat.kind === AI_SEAT_KIND));
  syncLogFilter(seats);
  const openSeat = host.querySelector<HTMLElement>('.commander-card-summary[aria-expanded="true"]')?.dataset.seatId ?? null;
  host.replaceChildren();
  for (const seat of seats) host.append(cardElement(seat));
  const nextAnchor = openSeat ? host.querySelector<HTMLElement>(`[data-seat-id="${openSeat}"]`) : null;
  if (nextAnchor && commanderPopoverIsOpen()) {
    nextAnchor.setAttribute('aria-expanded', 'true');
    reanchorCommanderPopover(nextAnchor);
  }
}

/**
 * Fills the activity-log filter with the AI seats.
 *
 * Purpose: The names stay current when a match starts.
 * When to use: Each card render.
 * Expected outcome: "All commanders", then each AI seat's full name. The current choice is kept.
 * Exceptions: None.
 */
function syncLogFilter(seats: readonly SeatSnapshot[]): void {
  const select = document.getElementById('commander-log-filter');
  if (!(select instanceof HTMLSelectElement)) return;
  if (!select.dataset.bound) {
    select.dataset.bound = 'true';
    select.addEventListener('change', () => setCommanderLogSeatFilter(select.value));
  }
  const current = select.value;
  select.replaceChildren(option('All commanders', ''));
  for (const seat of seats) select.append(option(seat.homeRegion, seat.seatId));
  if ([...select.options].some((row) => row.value === current)) select.value = current;
}

/**
 * One option for the filter.
 *
 * Purpose: The filter is rebuilt from the roster.
 * When to use: `syncLogFilter`.
 * Expected outcome: A labeled option.
 * Exceptions: None.
 */
function option(label: string, value: string): HTMLOptionElement {
  const row = document.createElement('option');
  row.value = value;
  row.textContent = label;
  return row;
}

/**
 * One commander card.
 *
 * Purpose: The dot, name, status, cost, and summary stay together.
 * When to use: Each AI seat.
 * Expected outcome: The summary button opens the commander popover, except when the seat is out.
 * Exceptions: None.
 */
function cardElement(seat: SeatSnapshot): HTMLElement {
  const status = statusOf(seat);
  const presentation = commanderCardPresentation({
    status,
    planningElapsedMs: commanderPoolStatuses().find((row) => row.seatId === seat.seatId)?.planningElapsedMs ?? 0,
    timedOutTurn: commanderPoolStatuses().find((row) => row.seatId === seat.seatId)?.timedOutTurn ?? null,
    outTurn: seat.outTurn,
  });
  const card = document.createElement('article');
  card.className = presentation.dimmed ? 'commander-card is-out' : 'commander-card';
  const dot = document.createElement('span');
  dot.className = 'commander-card-dot';
  dot.style.background = paletteForOwner(seat.seatId, S.gameState?.seats ?? [])?.map ?? '#115E59';
  const name = document.createElement('span');
  name.className = 'commander-card-name';
  name.textContent = seat.homeRegion;
  const chip = document.createElement('span');
  chip.className = 'commander-card-chip';
  chip.textContent = presentation.chip;
  const cost = document.createElement('span');
  cost.className = 'commander-card-cost';
  cost.textContent = formatCost(seat.costUsd);
  const summary = document.createElement('button');
  summary.type = 'button';
  summary.className = 'commander-card-summary';
  summary.dataset.seatId = seat.seatId;
  summary.textContent = summaryText(seat);
  summary.disabled = presentation.summaryDisabled;
  summary.addEventListener('click', () => void openSeatCommander(seat, summary));
  card.append(dot, name, chip, cost, summary);
  if (presentation.detail) {
    const detail = document.createElement('p');
    detail.className = 'commander-card-detail';
    detail.textContent = presentation.detail;
    card.append(detail);
  }
  return card;
}

/**
 * The pool status, or a status read from the seat when the pool has no row.
 *
 * Purpose: A knocked-out seat and a seat with no model still get a chip before the first poll.
 * When to use: `cardElement`.
 * Expected outcome: `out` when the seat is out, otherwise the pool status, or `no_model` when no model is set.
 * Exceptions: None.
 */
function statusOf(seat: SeatSnapshot): CommanderStatus {
  if (seat.outTurn !== null) return 'out';
  return commanderPoolStatuses().find((row) => row.seatId === seat.seatId)?.status ?? (seat.commander?.modelId ? 'ready' : 'no_model');
}

/**
 * The summary button's sentence.
 *
 * Purpose: The button shows the same label the new-game rows use.
 * When to use: `cardElement`.
 * Expected outcome: "Select Model" when the seat has no model. Otherwise the model, the effort, and the doctrine.
 * Exceptions: None.
 */
function summaryText(seat: SeatSnapshot): string {
  const commander = seat.commander;
  return formatCommanderButtonLabel({
    modelLabel: modelLabel(commander?.modelId ?? null),
    reasoningEffort: commander?.reasoningEffort ?? null,
    doctrineChoice: commander?.doctrineChoice ?? 'balanced',
    revealedDoctrine: commander?.doctrine ?? null,
  });
}

/**
 * The model list's label for an id.
 *
 * Purpose: The summary shows the name the player picked, not the raw id, when the list has it.
 * When to use: `summaryText`.
 * Expected outcome: The option text, or the id, or null when no model is set.
 * Exceptions: None.
 */
function modelLabel(modelId: string | null): string | null {
  if (!modelId) return null;
  const select = document.getElementById('openrouter-model');
  if (!(select instanceof HTMLSelectElement)) return modelId;
  const optionRow = [...select.options].find((row) => row.value === modelId);
  return optionRow?.textContent?.trim() || modelId;
}

/**
 * Opens the commander popover for one seat.
 *
 * Purpose: Changes are saved on that seat. The key is loaded before the popover can save.
 * When to use: The summary button.
 * Expected outcome: The popover opens under the button after the key fetch settles. A knocked-out seat is not opened. A failed fetch leaves the key field empty and does not send an empty key.
 * Exceptions: None. A rejected save is logged by `saveCommander`. A rejected key fetch is logged here.
 */
async function openSeatCommander(seat: SeatSnapshot, anchor: HTMLElement): Promise<void> {
  if (!seat.commander || !isAiSeatId(seat.seatId) || seat.outTurn !== null) return;
  const seatId = seat.seatId;
  let includeKey = false;
  let apiKey = '';
  try {
    const loaded = await window.gameApi?.openRouter?.getSeatApiKey(seatId);
    if (typeof loaded === 'string') {
      apiKey = loaded;
      includeKey = true;
    }
  } catch (err) {
    console.error('getSeatApiKey failed', seatId, err);
  }
  if (!anchor.isConnected) return;
  const commander: NewGameCommanderInput = {
    modelId: seat.commander.modelId,
    reasoningEffort: seat.commander.reasoningEffort,
    doctrineChoice: seat.commander.doctrineChoice,
    ...(includeKey ? { apiKey } : {}),
  };
  openCommanderPopover({
    anchor,
    title: `${seat.homeRegion} commander`,
    commander,
    copyButton: null,
    onChange: (next) => {
      if (!includeKey && (next.apiKey ?? '') === '') {
        void saveCommander(seatId, {
          modelId: next.modelId,
          reasoningEffort: next.reasoningEffort,
          doctrineChoice: next.doctrineChoice,
        });
        return;
      }
      includeKey = true;
      void saveCommander(seatId, next);
    },
  });
  anchor.setAttribute('aria-expanded', 'true');
}

/**
 * Saves one seat and shows the returned commander.
 *
 * Purpose: The card follows the seat the main process stored.
 * When to use: The popover's change.
 * Expected outcome: That seat in the snapshot is replaced and the cards render again.
 * Exceptions: A rejected IPC is logged and does not throw.
 */
async function saveCommander(seatId: AiSeatId, commander: NewGameCommanderInput): Promise<void> {
  try {
    const updated = await window.gameApi?.setSeatCommander(seatId, commander);
    if (!updated || !S.gameState?.seats) return;
    S.gameState = { ...S.gameState, seats: S.gameState.seats.map((seat) => (seat.seatId === updated.seatId ? updated : seat)) };
    renderCommanderCards();
    void syncOpenRouterRunToggle();
  } catch (err) {
    console.error('setSeatCommander failed', seatId, err);
  }
}

/**
 * Formats a seat's cost as dollars.
 *
 * Purpose: The card and the footer use the same currency format.
 * When to use: A card's cost.
 * Expected outcome: For example "$0.00".
 * Exceptions: None.
 */
function formatCost(dollars: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(dollars);
}

subscribeCommanderPool(() => {
  renderCommanderCards();
});
