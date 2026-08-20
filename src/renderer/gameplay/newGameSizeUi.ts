import { gameSizeCapPreviewRows, parseGameSize, type GameSize } from '../../shared/gameSize';

/**
 * DOM id of the new-game size `<select>`.
 *
 * Purpose: Shared between read/sync helpers and HTML so region option loading cannot target this control by accident.
 * When to use: Querying the Game size dropdown.
 * Expected outcome: Matches `id="new-game-size-select"` in `static/index.html`.
 * Exceptions: None.
 */
export const NEW_GAME_SIZE_SELECT_ID = 'new-game-size-select';

/**
 * Reads the Game size dropdown and coerces it to a `GameSize`.
 *
 * Purpose: Start-game IPC and cap preview share one parse path (`parseGameSize`).
 * When to use: `newGame` payload assembly and preview refresh.
 * Expected outcome: `'small'` when the select is missing or empty.
 * Exceptions: None.
 */
export function readSelectedGameSizeFromDocument(): GameSize {
  const select = document.getElementById(NEW_GAME_SIZE_SELECT_ID) as HTMLSelectElement | null;
  return parseGameSize(select?.value);
}

/**
 * Writes stack-style cap numbers for the currently selected size onto the preview badges.
 *
 * Purpose: The four tokens must match the dropdown without duplicating cap tables in HTML.
 * When to use: Init, select `change`, and whenever the new-game overlay is shown.
 * Expected outcome: Badge text equals `gameSizeCapPreviewRows` caps; missing nodes are skipped.
 * Exceptions: None.
 */
export function syncGameSizeCapPreview(): void {
  const rows = gameSizeCapPreviewRows(readSelectedGameSizeFromDocument());
  for (const row of rows) {
    const badge = document.getElementById(`new-game-size-cap-${row.unitType}`);
    if (badge) badge.textContent = String(row.cap);
  }
}

/**
 * Binds the size dropdown to the cap preview and paints the initial Small numbers.
 *
 * Purpose: Change events must update badges before Start is clicked.
 * When to use: Once from `registerNewGameButton`.
 * Expected outcome: `change` listener installed; badges match the current select value.
 * Exceptions: None; no-op if the select is absent.
 */
export function registerGameSizeSelect(): void {
  const select = document.getElementById(NEW_GAME_SIZE_SELECT_ID);
  select?.addEventListener('change', () => {
    syncGameSizeCapPreview();
  });
  syncGameSizeCapPreview();
}
