/**
 * Save game and Load game on the menu and the new-game bar.
 *
 * Purpose: The three buttons share one availability check, and a load reloads the window so the screen matches the file.
 * When to use: Once at startup, and whenever the menu opens or the match controls are enabled or disabled.
 * Expected outcome: A disabled button does nothing. A saved file shows a toast. A loaded file reloads the page and the toast appears after that reload.
 * Exceptions: A `sessionStorage` failure is logged and the load still reloads. The toast is skipped when the name could not be stored.
 */

import {
  loadGameItemState,
  loadNeedsConfirm,
  saveGameItemState,
  type SaveLoadItemState,
  type SaveLoadUiState,
} from '../../shared/saveLoadAvailability';
import { showMapToast } from '../openRouter/openRouterUiHelpers';
import { rendererSharedState as S } from '../core/state';
import { newGameOverlayIsOpen } from './newGameDialogCollapse';
import { confirmLoadOverMatch } from './loadConfirmDialog';

/** `sessionStorage` key that carries a loaded file's name across the reload. */
const LOADED_SAVE_FILE_NAME_KEY = 'agentWarsLoadedSaveFileName';

const SAVE_BUTTON_ID = 'game-menu-save-btn';
const LOAD_BUTTON_IDS = ['game-menu-load-btn', 'topbar-load-btn'] as const;

/**
 * Reads the facts the availability rules need.
 *
 * Purpose: The buttons see the same match, Ready flag, and new-game screen the rest of the renderer uses.
 * When to use: Before enabling the buttons and before a click acts.
 * Expected outcome: A match counts as loaded when the snapshot has hexes. The new-game screen counts as open while it is compact.
 * Exceptions: None.
 */
export function readSaveLoadUiState(): SaveLoadUiState {
  const hexes = S.gameState?.hexes.length ?? 0;
  return {
    matchLoaded: hexes > 0,
    gameOver: S.gameState?.gameOver === true,
    readyInFlight: S.readyRequestInFlight,
    newGameScreenOpen: newGameOverlayIsOpen(),
  };
}

/**
 * Applies the current availability to Save game and both Load game buttons.
 *
 * Purpose: The menu and the new-game bar must not offer a save or load the rules refuse.
 * When to use: When the game menu opens, when match controls are enabled or disabled, and once when the buttons are wired.
 * Expected outcome: Each button's `disabled` flag and its tip host match the rules. A missing button is skipped.
 * Exceptions: None.
 */
export function syncSaveLoadItems(): void {
  const state = readSaveLoadUiState();
  applyItem(SAVE_BUTTON_ID, saveGameItemState(state));
  const load = loadGameItemState(state);
  for (const id of LOAD_BUTTON_IDS) applyItem(id, load);
}

/**
 * Wires Save game and both Load game buttons.
 *
 * Purpose: One startup path for the three controls.
 * When to use: Once from renderer `init`, next to `wireGameMenu`.
 * Expected outcome: The buttons match the current match, and a click saves or loads. The game menu closes itself.
 * Exceptions: None.
 */
export function wireSaveLoadMenu(): void {
  syncSaveLoadItems();
  document.getElementById(SAVE_BUTTON_ID)?.addEventListener('click', () => {
    void onSaveClick();
  });
  for (const id of LOAD_BUTTON_IDS) {
    document.getElementById(id)?.addEventListener('click', () => {
      void onLoadClick();
    });
  }
}

/**
 * Shows the loaded-file toast left behind by the reload.
 *
 * Purpose: The toast cannot be shown by the page that started the load, because that page is gone.
 * When to use: Once, at the end of renderer `init`.
 * Expected outcome: `Loaded ${fileName}.` when the previous page stored a name. The stored name is removed either way.
 * Exceptions: None. A `sessionStorage` failure is logged and no toast is shown.
 */
export function showLoadedSaveToastAfterReload(): void {
  let fileName: string | null = null;
  try {
    fileName = sessionStorage.getItem(LOADED_SAVE_FILE_NAME_KEY);
    if (fileName) sessionStorage.removeItem(LOADED_SAVE_FILE_NAME_KEY);
  } catch (err) {
    console.error('could not read the loaded save name', err);
    return;
  }
  if (fileName) showMapToast(`Loaded ${fileName}.`);
}

/**
 * Sets one button and the tip on its host.
 *
 * Purpose: A disabled button does not receive the pointer, so the host carries the reason.
 * When to use: From `syncSaveLoadItems`.
 * Expected outcome: The button is disabled or enabled, and the host's `data-control-tooltip` is the tip.
 * Exceptions: None. A missing button is skipped.
 */
function applyItem(id: string, item: SaveLoadItemState): void {
  const button = document.getElementById(id);
  if (!(button instanceof HTMLButtonElement)) return;
  button.disabled = item.disabled;
  button.parentElement?.setAttribute('data-control-tooltip', item.tooltip);
}

/**
 * Saves when the button is enabled.
 *
 * Purpose: The click recomputes the rules, because the match may have changed since the menu opened.
 * When to use: The Save game click.
 * Expected outcome: A toast for a saved file or a failure. A cancel shows nothing.
 * Exceptions: None. The main process returns failures instead of rejecting.
 */
async function onSaveClick(): Promise<void> {
  if (saveGameItemState(readSaveLoadUiState()).disabled) return;
  const result = await window.gameApi?.saveGame();
  if (!result || result.status === 'canceled') return;
  if (result.status === 'saved') showMapToast(`Saved ${result.fileName}.`);
  else showMapToast(result.message);
}

/**
 * Loads when the button is enabled, after confirming over a live match.
 *
 * Purpose: Both Load game buttons share this path.
 * When to use: A Load game click.
 * Expected outcome: A failure shows a toast. A loaded file stores its name and reloads the window. A cancel or a refused confirm does nothing.
 * Exceptions: None. A `sessionStorage` failure is logged and the reload still happens, without a toast after it.
 */
async function onLoadClick(): Promise<void> {
  const state = readSaveLoadUiState();
  if (loadGameItemState(state).disabled) return;
  if (loadNeedsConfirm(state)) {
    const confirmed = await confirmLoadOverMatch();
    if (!confirmed) return;
  }
  const result = await window.gameApi?.loadGame();
  if (!result || result.status === 'canceled') return;
  if (result.status === 'failed') {
    showMapToast(result.message);
    return;
  }
  try {
    sessionStorage.setItem(LOADED_SAVE_FILE_NAME_KEY, result.fileName);
  } catch (err) {
    console.error('could not store the loaded save name', err);
  }
  window.location.reload();
}