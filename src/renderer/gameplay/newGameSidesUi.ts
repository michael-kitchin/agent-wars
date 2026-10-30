import type { NewGameCommanderInput, NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import type { CommanderKeyMemoryView } from '../../shared/commanderSetupCopy';
import {
  commanderApiKey,
  copyButtonState,
  prefillFirstAiApiKey,
  previousAiRowIndex,
} from '../../shared/commanderSetupCopy';
import { formatCommanderButtonLabel } from '../../shared/commanderSummary';
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
  setObserveOnly,
  setRowCommander,
  setRowHome,
  sidesCaption,
  startBlockedReason,
  sidesHaveAnyModel,
  type HomeOption,
  type NewGameSidesState,
} from '../../shared/newGameSides';
import { MIN_SEATS } from '../../shared/seatIds';
import { AI_SEAT_KIND } from '../../shared/seatRoster';
import { closeNewGameOptionsPopover } from './newGameOptionsPopover';
import { bindNewGameVictory, readNewGameVictory, renderNewGameVictory, resetNewGameVictory } from './newGameVictoryUi';
import { newGameButtonTooltipText, newGameCommanderTooltipText } from '../chrome/controlTooltipText';
import { cachedScenarioHomeRegionNames } from './newGameRegionUi';
import { regionalHomeOptions, selectedNewGameTab, setNewGameHomesChangedListener } from './newGameMapUi';
import { refreshNewGameMapPreview, setPreviewHomeKeyReader } from './newGameMapPreviewUi';
import {
  closeCommanderPopover,
  commanderPopoverIsOpen,
  openCommanderPopover,
  reanchorCommanderPopover,
  replaceOpenCommanderDraft,
} from '../openRouter/commanderPopover';

/**
 * The remembered match used to fill the first AI key and the copy button.
 *
 * Purpose: The overlay reads this once per open, then row edits leave it alone.
 * When to use: `loadCommanderKeyMemory`, refresh, and the copy button.
 * Expected outcome: Empty until a read succeeds. A failed read keeps the previous value.
 * Exceptions: None.
 */
let rememberedCommanders: CommanderKeyMemoryView = { hasPreviousMatch: false, prefillApiKey: '', previousMatch: [] };

/**
 * Reads the remembered commanders before the new-game rows are rebuilt.
 *
 * Purpose: Opponent 1's key comes from the last match, or from the legacy key when no match has been snapshotted.
 * When to use: Both openers, before `refreshNewGameSides({ reset: true })`.
 * Expected outcome: The cache holds the IPC result. A rejected read leaves the cache as it was.
 * Exceptions: None. A rejected IPC is logged.
 */
export async function loadCommanderKeyMemory(): Promise<void> {
  try {
    const memory = await window.gameApi?.openRouter?.getCommanderKeyMemory();
    if (memory) rememberedCommanders = memory;
  } catch (err) {
    console.error('getCommanderKeyMemory failed', err);
  }
}

/**
 * Whether any AI row on this screen has a model.
 *
 * Purpose: Start asks only when every opponent would use standing orders.
 * When to use: The Start click, before the confirm dialog.
 * Expected outcome: False when no AI `modelId` is set. Keys do not matter.
 * Exceptions: None.
 */
export function newGameHasAnyModel(): boolean {
  return sidesHaveAnyModel(sidesState);
}

/**
 * Whether some AI row has both a key and a model.
 *
 * Purpose: Auto-start looks at the rows on this screen, not at the Start button.
 * When to use: `readStartMatchAiInput`.
 * Expected outcome: True when at least one AI row has a non-empty key and a model id.
 * Exceptions: None.
 */
export function newGameHasRunnableCommander(): boolean {
  return (sidesState?.rows ?? []).some(
    (row) => row.kind === AI_SEAT_KIND && commanderApiKey(row.commander) !== '' && Boolean(row.commander?.modelId?.trim())
  );
}

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
  return { modelId, reasoningEffort, doctrineChoice: 'balanced', apiKey: '' };
}

/**
 * The words on a row's commander button until the commander popover exists.
 *
 * Purpose: The button invites a model choice, or names the model that is set.
 * When to use: Rendering an AI row.
 * Expected outcome: "Select Model." when no model is set. Otherwise the model name, the effort when one is set, and the doctrine.
 * Exceptions: None.
 */
function commanderButtonLabel(commander: NewGameCommanderInput | null): string {
  const modelSelect = document.getElementById('openrouter-model') as HTMLSelectElement | null;
  const option = commander?.modelId
    ? [...(modelSelect?.options ?? [])].find((entry) => entry.value === commander.modelId)
    : undefined;
  const modelLabel = commander?.modelId ? modelNameFromOptionLabel(option?.textContent ?? commander.modelId) : null;
  return formatCommanderButtonLabel({
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
  if (options?.reset) {
    requestedRows = MIN_SEATS;
    resetNewGameVictory();
  }
  const homes = homesForTab();
  const mapKind = selectedNewGameTab();
  const commander = defaultCommander();
  let next = initialSidesState({ mapKind, homes, defaultCommander: commander, rowCount: requestedRows });
  if (!options?.reset && sidesState?.observeOnly) next = setObserveOnly(next, true, commander);
  for (let index = 0; index < next.rows.length; index += 1) {
    next = randomizeRowHome(next, index, homes, Math.random);
  }
  sidesState = prefillFirstAiApiKey(next, rememberedCommanders.prefillApiKey);
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
  bindNewGameVictory();
  setPreviewHomeKeyReader(previewHomeKeys);
  document.getElementById('new-game-observe-only')?.addEventListener('change', () => {
    if (!sidesState) return;
    const box = document.getElementById('new-game-observe-only') as HTMLInputElement | null;
    closeCommanderPopover();
    sidesState = prefillFirstAiApiKey(
      setObserveOnly(sidesState, box?.checked === true, defaultCommander()),
      rememberedCommanders.prefillApiKey
    );
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
 * Expected outcome: `blocked` is set when the rows cannot start. Otherwise `seats` follows the rows, and the rule and limit come from the Victory section.
 * Exceptions: None.
 */
export function readNewGameSeatsStart(): {
  readonly seats: readonly NewGameSeatInput[];
  readonly turnLimit: number;
  readonly victoryRule: ReturnType<typeof readNewGameVictory>['victoryRule'];
  readonly blocked: string | null;
} {
  const blocked = startBlockedReason(sidesState);
  const victory = readNewGameVictory();
  return {
    seats: sidesState && !blocked ? buildSeatsPayload(sidesState) : [],
    turnLimit: victory.turnLimit,
    victoryRule: victory.victoryRule,
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
 * Paints the Sides and Victory sections from `sidesState`.
 *
 * Purpose: The DOM is a view of the model.
 * When to use: After every edit.
 * Expected outcome: One row per side, the caption, the add button's hint, and the turn-limit control for the current rule.
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
  renderNewGameVictory();
}

/**
 * Copies a commander onto one AI row.
 *
 * Purpose: The copy button pulls the last game or the previous opponent, including the key.
 * When to use: The popover's copy click.
 * Expected outcome: The row and the open fields show that commander. A missing source does nothing.
 * Exceptions: None.
 */
function copyCommanderFrom(index: number, source: 'previous-match' | 'previous-opponent'): void {
  if (!sidesState) return;
  const copied = source === 'previous-match' ? commanderFromLastGame() : commanderFromPreviousRow(index);
  if (!copied) return;
  sidesState = setRowCommander(sidesState, index, copied);
  replaceOpenCommanderDraft(copied);
  renderNewGameSides();
}

/**
 * The first remembered commander, as a new-game row would store it.
 *
 * Purpose: Copy from last game uses the snapshot, not the drawn doctrine.
 * When to use: `copyCommanderFrom` for the first AI row.
 * Expected outcome: Null when the snapshot has no first entry.
 * Exceptions: None.
 */
function commanderFromLastGame(): NewGameCommanderInput | null {
  const previous = rememberedCommanders.previousMatch[0];
  if (!previous) return null;
  return {
    modelId: previous.modelId,
    reasoningEffort: previous.reasoningEffort,
    doctrineChoice: previous.doctrineChoice,
    apiKey: previous.apiKey,
  };
}

/**
 * A shallow copy of the AI row just above this one.
 *
 * Purpose: Opponent 3 copies opponent 2, including that row's current key.
 * When to use: `copyCommanderFrom` for a later AI row.
 * Expected outcome: Null when there is no earlier AI row or it has no commander.
 * Exceptions: None.
 */
function commanderFromPreviousRow(index: number): NewGameCommanderInput | null {
  if (!sidesState) return null;
  const previousIndex = previousAiRowIndex(sidesState, index);
  if (previousIndex === null) return null;
  const previous = sidesState.rows[previousIndex]?.commander;
  return previous ? { ...previous } : null;
}

/**
 * Opens the commander popover for one new-game row.
 *
 * Purpose: That row's key, model, reasoning, and doctrine are edited here, and the copy button pulls another commander.
 * When to use: The commander button's click.
 * Expected outcome: A second click on the same open row closes the popover. A human row does not open.
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
  closeNewGameOptionsPopover();
  const label = rowLabel(sidesState, index);
  const buttonState = copyButtonState(sidesState, index, rememberedCommanders.hasPreviousMatch);
  openCommanderPopover({
    anchor: button,
    title: `${label} commander`,
    commander: row.commander ?? defaultCommander(),
    copyButton: buttonState
      ? {
          label: buttonState.label,
          disabled: buttonState.disabled,
          onCopy: () => copyCommanderFrom(index, buttonState.source),
        }
      : null,
    onChange: (commander) => {
      if (!sidesState) return;
      sidesState = setRowCommander(sidesState, index, commander);
      renderNewGameSides();
    },
    onClose: () => {
      if (openCommanderRow === index) openCommanderRow = null;
    },
  });
  openCommanderRow = index;
}

/**
 * One side row.
 *
 * Purpose: The human row has no remove button and no commander. Observe rows have both.
 * When to use: `renderNewGameSides`.
 * Expected outcome: A label, a home select, a randomize button, and the extra controls that row is allowed.
 * Exceptions: None.
 */
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
    commander.setAttribute('data-control-tooltip', newGameCommanderTooltipText);
    commander.addEventListener('click', () => openRowCommander(index, commander));
    wrap.appendChild(commander);
  }
  return wrap;
}
