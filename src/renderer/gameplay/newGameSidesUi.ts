import type { NewGameCommanderInput, NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import { formatCommanderSummary } from '../../shared/commanderSummary';
import { modelNameFromOptionLabel } from '../../shared/commanderPlanningStatus';
import {
  addRowBlockedReason,
  addSideRow,
  buildSeatsPayload,
  homeOptionsForRow,
  initialSidesState,
  randomizeRowHome,
  removeSideRow,
  rowLabel,
  setEveryAiCommander,
  setObserveOnly,
  setRowCommander,
  setRowHome,
  sidesCaption,
  startBlockedReason,
  type HomeOption,
  type NewGameSidesState,
} from '../../shared/newGameSides';
import { MIN_SEATS } from '../../shared/seatIds';
import { AI_SEAT_KIND } from '../../shared/seatRoster';
import { DEFAULT_TURN_LIMIT, TURN_LIMIT_OPTIONS } from '../../shared/victoryRules';
import { newGameButtonTooltipText } from '../chrome/controlTooltipText';
import { cachedScenarioHomeRegionNames } from './newGameRegionUi';
import { regionalHomeOptions, selectedNewGameTab, setNewGameHomesChangedListener } from './newGameMapUi';
import { refreshNewGameMapPreview, setPreviewHomeKeyReader } from './newGameMapPreviewUi';
import {
  closeCommanderPopover,
  commanderPopoverIsOpen,
  openCommanderPopover,
  reanchorCommanderPopover,
} from '../openRouter/commanderPopover';

/**
 * The rows the screen is editing.
 *
 * Purpose: Start and the preview read the same object the controls just wrote.
 * When to use: After `bindNewGameSides`.
 * Expected outcome: Null until the first refresh.
 * Exceptions: None.
 */
let sidesState: NewGameSidesState | null = null;

/**
 * How many side rows the player asked for.
 *
 * Purpose: A smaller map clamps the rows that are shown. Coming back to a larger map restores this count.
 * When to use: `refreshNewGameSides`, and after add or remove.
 * Expected outcome: Starts at two. Add and remove change it. A map change does not.
 * Exceptions: None.
 */
let requestedRows = MIN_SEATS;

/**
 * The side row whose commander popover is open.
 *
 * Purpose: Rebuilding the rows has to put the popover back on that row.
 * When to use: The commander button and `renderNewGameSides`.
 * Expected outcome: Null while the popover is closed.
 * Exceptions: None.
 */
let openCommanderRow: number | null = null;

/**
 * Homes for the tab that is showing.
 *
 * Purpose: Global names and regional groups are loaded elsewhere.
 * When to use: Every refresh and every row edit.
 * Expected outcome: Regional groups while that tab is selected. Otherwise the cached UN subregions.
 * Exceptions: None.
 */
function homesForTab(): readonly HomeOption[] {
  if (selectedNewGameTab() === 'regional') return regionalHomeOptions();
  return cachedScenarioHomeRegionNames().map((name) => ({ key: name, label: name }));
}

/**
 * The commander new AI rows start with.
 *
 * Purpose: A new side follows the app-wide model and effort, with Balanced doctrine.
 * When to use: Creating or resetting rows.
 * Expected outcome: A null model when none is selected.
 * Exceptions: None.
 */
function defaultCommander(): NewGameCommanderInput {
  const modelSelect = document.getElementById('openrouter-model') as HTMLSelectElement | null;
  const effortSelect = document.getElementById('openrouter-reasoning-effort') as HTMLSelectElement | null;
  const modelId = modelSelect?.value?.trim() ? modelSelect.value : null;
  const effortHidden = effortSelect == null || effortSelect.hidden || effortSelect.parentElement?.hidden === true;
  const reasoningEffort = !effortHidden && effortSelect?.value ? effortSelect.value : null;
  return { modelId, reasoningEffort, doctrineChoice: 'balanced' };
}

/**
 * The words on a row's commander button until the commander popover exists.
 *
 * Purpose: The button names the model, or says there is none.
 * When to use: Rendering an AI row.
 * Expected outcome: "No model", or the model name without its provider suffix.
 * Exceptions: None.
 */
function commanderButtonLabel(commander: NewGameCommanderInput | null): string {
  const modelSelect = document.getElementById('openrouter-model') as HTMLSelectElement | null;
  const option = commander?.modelId
    ? [...(modelSelect?.options ?? [])].find((entry) => entry.value === commander.modelId)
    : undefined;
  const modelLabel = commander?.modelId ? modelNameFromOptionLabel(option?.textContent ?? commander.modelId) : null;
  return formatCommanderSummary({
    modelLabel,
    reasoningEffort: commander?.reasoningEffort ?? null,
    doctrineChoice: commander?.doctrineChoice ?? 'balanced',
  });
}

/**
 * Rebuilds the rows from the tab and the current count.
 *
 * Purpose: A new map must not keep homes from the previous one.
 * When to use: After the overlay's lists load, and when the tab or region changes.
 * Expected outcome: `reset` starts from two rows and draws a free home for each. Otherwise the count is kept and homes are drawn again.
 * Exceptions: None.
 */
export function refreshNewGameSides(options?: { readonly reset?: boolean }): void {
  closeCommanderPopover();
  if (options?.reset) requestedRows = MIN_SEATS;
  const homes = homesForTab();
  const mapKind = selectedNewGameTab();
  const commander = defaultCommander();
  let next = initialSidesState({ mapKind, homes, defaultCommander: commander, rowCount: requestedRows });
  if (!options?.reset && sidesState?.observeOnly) next = setObserveOnly(next, true, commander);
  for (let index = 0; index < next.rows.length; index += 1) {
    next = randomizeRowHome(next, index, homes, Math.random);
  }
  sidesState = next;
  renderNewGameSides();
}

/**
 * Wires Observe, the add button, and map changes.
 *
 * Purpose: The rows are rebuilt from the model, not from leftover dropdowns.
 * When to use: Once, while the renderer is starting.
 * Expected outcome: Later home-list changes call `refreshNewGameSides`. The victory list is filled once.
 * Exceptions: None.
 */
export function bindNewGameSides(): void {
  fillVictoryControls();
  setPreviewHomeKeyReader(previewHomeKeys);
  document.getElementById('new-game-observe-only')?.addEventListener('change', () => {
    if (!sidesState) return;
    const box = document.getElementById('new-game-observe-only') as HTMLInputElement | null;
    closeCommanderPopover();
    sidesState = setObserveOnly(sidesState, box?.checked === true, defaultCommander());
    renderNewGameSides();
    void refreshNewGameMapPreview();
  });
  document.getElementById('new-game-add-side-btn')?.addEventListener('click', () => {
    if (!sidesState) return;
    closeCommanderPopover();
    sidesState = addSideRow(sidesState, homesForTab(), defaultCommander());
    requestedRows = sidesState.rows.length;
    renderNewGameSides();
    void refreshNewGameMapPreview();
  });
  setNewGameHomesChangedListener(() => {
    refreshNewGameSides();
    void refreshNewGameMapPreview();
  });
}

/**
 * The seats and turn limit Start should send.
 *
 * Purpose: The click handler stays free of row markup.
 * When to use: The Start click.
 * Expected outcome: `blocked` is set when the rows cannot start. Otherwise `seats` follows the rows and `turnLimit` is the global select.
 * Exceptions: None.
 */
export function readNewGameSeatsStart(): {
  readonly seats: readonly NewGameSeatInput[];
  readonly turnLimit: number;
  readonly blocked: string | null;
} {
  const blocked = startBlockedReason(sidesState);
  const turnLimit = readTurnLimit();
  return {
    seats: sidesState && !blocked ? buildSeatsPayload(sidesState) : [],
    turnLimit,
    blocked,
  };
}

/**
 * Home keys in row order, for the map preview.
 *
 * Purpose: The preview outlines each row's home in seat order.
 * When to use: Building the preview request.
 * Expected outcome: One key per row. An empty string when a row has no home.
 * Exceptions: None.
 */
export function previewHomeKeys(): readonly string[] {
  return (sidesState?.rows ?? []).map((row) => row.homeKey ?? '');
}

/**
 * Fills the victory rule and the turn-limit list.
 *
 * Purpose: The rule follows the tab. The limit is only offered on the global map.
 * When to use: Once from `bindNewGameSides`.
 * Expected outcome: One victory option. Turn-limit options are 20, 30, 40, and 50, with 30 selected.
 * Exceptions: None.
 */
function fillVictoryControls(): void {
  const victory = document.getElementById('new-game-victory-select') as HTMLSelectElement | null;
  if (victory && victory.options.length === 0) {
    const option = document.createElement('option');
    option.value = 'rule';
    option.textContent = 'Last side standing';
    victory.appendChild(option);
  }
  const limit = document.getElementById('new-game-turn-limit-select') as HTMLSelectElement | null;
  if (limit && limit.options.length === 0) {
    for (const turns of TURN_LIMIT_OPTIONS) {
      const option = document.createElement('option');
      option.value = String(turns);
      option.textContent = `${turns} turns`;
      if (turns === DEFAULT_TURN_LIMIT) option.selected = true;
      limit.appendChild(option);
    }
  }
}

/**
 * The selected global turn limit.
 *
 * Purpose: Start sends the number the player picked.
 * When to use: `readNewGameSeatsStart`.
 * Expected outcome: 30 when the control is missing or the value is not a listed limit.
 * Exceptions: None.
 */
function readTurnLimit(): number {
  const limit = document.getElementById('new-game-turn-limit-select') as HTMLSelectElement | null;
  const parsed = Number(limit?.value);
  return (TURN_LIMIT_OPTIONS as readonly number[]).includes(parsed) ? parsed : DEFAULT_TURN_LIMIT;
}

/**
 * Paints the Sides and Victory sections from `sidesState`.
 *
 * Purpose: The DOM is a view of the model.
 * When to use: After every edit.
 * Expected outcome: One row per side, the caption, the add button's hint, and the victory wording for the tab.
 * Exceptions: None.
 */
function renderNewGameSides(): void {
  const homes = homesForTab();
  const caption = document.getElementById('new-game-sides-caption');
  if (caption && sidesState) caption.textContent = sidesCaption(sidesState, homes);
  const observe = document.getElementById('new-game-observe-only') as HTMLInputElement | null;
  if (observe && sidesState) observe.checked = sidesState.observeOnly;
  const host = document.getElementById('new-game-side-rows');
  if (host && sidesState) {
    host.replaceChildren();
    sidesState.rows.forEach((_, index) => host.appendChild(renderRow(sidesState!, homes, index)));
    if (openCommanderRow != null) {
      const button = host.querySelector(`[data-commander-row="${openCommanderRow}"]`);
      if (button instanceof HTMLElement) reanchorCommanderPopover(button);
      else closeCommanderPopover();
    }
  }
  const blocked = sidesState ? addRowBlockedReason(sidesState, homes) : 'No free side on this map';
  const add = document.getElementById('new-game-add-side-btn') as HTMLButtonElement | null;
  const addHost = document.querySelector('.new-game-add-side-host');
  if (add && sidesState) {
    add.disabled = blocked != null;
    add.textContent = '';
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('class', 'chrome-icon');
    icon.setAttribute('viewBox', '0 0 16 16');
    icon.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M8 3v10M3 8h10');
    icon.appendChild(path);
    add.append(icon, document.createTextNode(sidesState.observeOnly ? 'Add another side' : 'Add another opponent'));
  }
  if (addHost) addHost.setAttribute('data-control-tooltip', blocked ?? 'Add a side on the next free home.');
  const startBlocked = startBlockedReason(sidesState);
  const start = document.getElementById('new-game-btn') as HTMLButtonElement | null;
  if (start) {
    start.disabled = startBlocked != null;
    start.setAttribute(
      'data-control-tooltip',
      startBlocked ?? newGameButtonTooltipText(start.textContent !== 'New game')
    );
  }
  const global = selectedNewGameTab() === 'global';
  const victory = document.getElementById('new-game-victory-select') as HTMLSelectElement | null;
  if (victory && victory.options[0]) {
    victory.options[0].textContent = global ? 'Most city hexes at turn limit' : 'Last side standing';
  }
  const limitRow = document.getElementById('new-game-turn-limit-row');
  if (limitRow) limitRow.hidden = !global;
}

/**
 * One side row.
 *
 * Purpose: The human row has no remove button and no commander. Observe rows have both.
 * When to use: `renderNewGameSides`.
 * Expected outcome: A label, a home select, a randomize button, and the extra controls that row is allowed.
 * Exceptions: None.
 */
function openRowCommander(index: number, button: HTMLButtonElement): void {
  if (!sidesState) return;
  if (openCommanderRow === index && commanderPopoverIsOpen()) {
    closeCommanderPopover();
    return;
  }
  const row = sidesState.rows[index];
  if (!row || row.kind !== AI_SEAT_KIND) return;
  const label = rowLabel(sidesState, index);
  const observeOnly = sidesState.observeOnly;
  openCommanderPopover({
    anchor: button,
    title: `${label} commander`,
    commander: row.commander ?? defaultCommander(),
    applyAllLabel: observeOnly ? 'Use for every side' : 'Use for every opponent',
    onChange: (commander) => {
      if (!sidesState) return;
      sidesState = setRowCommander(sidesState, index, commander);
      renderNewGameSides();
    },
    onApplyAll: (commander) => {
      if (!sidesState) return;
      sidesState = setEveryAiCommander(sidesState, commander);
      renderNewGameSides();
    },
    onClose: () => {
      if (openCommanderRow === index) openCommanderRow = null;
    },
  });
  openCommanderRow = index;
}

function renderRow(state: NewGameSidesState, homes: readonly HomeOption[], index: number): HTMLElement {
  const row = state.rows[index]!;
  const label = rowLabel(state, index);
  const wrap = document.createElement('div');
  wrap.className = 'new-game-side-row';
  const name = document.createElement('span');
  name.className = 'new-game-side-label';
  name.textContent = label;
  const select = document.createElement('select');
  select.setAttribute('aria-label', `${label} home`);
  for (const option of homeOptionsForRow(state, index, homes)) {
    const entry = document.createElement('option');
    entry.value = option.key;
    entry.textContent = option.takenBy ? `${option.label} · ${option.takenBy}` : option.label;
    entry.disabled = option.disabled;
    if (option.key === row.homeKey) entry.selected = true;
    select.appendChild(entry);
  }
  select.addEventListener('change', () => {
    if (!sidesState) return;
    sidesState = setRowHome(sidesState, index, select.value);
    renderNewGameSides();
    void refreshNewGameMapPreview();
  });
  const randomize = document.createElement('button');
  randomize.type = 'button';
  randomize.className = 'compact-blue-btn compact-square-btn new-game-randomize';
  randomize.textContent = '↻';
  randomize.setAttribute('aria-label', `Randomize ${label} home`);
  randomize.addEventListener('click', () => {
    if (!sidesState) return;
    sidesState = randomizeRowHome(sidesState, index, homesForTab(), Math.random);
    renderNewGameSides();
    void refreshNewGameMapPreview();
  });
  wrap.append(name, select, randomize);
  const showRemove = state.observeOnly || row.kind === AI_SEAT_KIND;
  if (showRemove) {
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'compact-blue-btn compact-square-btn new-game-side-remove';
    remove.textContent = '×';
    remove.disabled = state.rows.length <= 2;
    remove.setAttribute('aria-label', `Remove ${label}`);
    remove.addEventListener('click', () => {
      if (!sidesState) return;
      closeCommanderPopover();
      sidesState = removeSideRow(sidesState, index);
      requestedRows = sidesState.rows.length;
      renderNewGameSides();
      void refreshNewGameMapPreview();
    });
    wrap.appendChild(remove);
  }
  if (row.kind === AI_SEAT_KIND) {
    const commander = document.createElement('button');
    commander.type = 'button';
    commander.className = 'new-game-side-commander';
    commander.textContent = commanderButtonLabel(row.commander);
    commander.dataset.commanderRow = String(index);
    commander.setAttribute('aria-label', `${label} commander`);
    commander.setAttribute('data-control-tooltip', 'Change this side\'s model, reasoning, and doctrine.');
    commander.addEventListener('click', () => openRowCommander(index, commander));
    wrap.appendChild(commander);
  }
  return wrap;
}
