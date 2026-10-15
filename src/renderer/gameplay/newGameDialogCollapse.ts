import { UNIT_DESELECT_GLYPH, UNIT_SELECT_GLYPH } from '../core/constants';

/**
 * Class on `#game-over-overlay` while only the hide-choices button is showing.
 *
 * Purpose: Hides the choices and widens the map without treating the overlay as closed.
 * When to use: Add it when the player hides the choices. Remove it when they are shown, including every time the overlay
 *   opens.
 * Expected outcome: The panel leaves the row beside the map, so the map widens to the window's left edge. Only the
 *   hide-choices button stays, in the same spot, and only it takes the pointer.
 * Exceptions: None.
 */
const COLLAPSED_CLASS = 'game-over-dialog-collapsed';

/**
 * Accessible name and tip while the choices are showing.
 *
 * Purpose: The dash means the player can hide the choices. The tip says the map widens.
 * When to use: When applying the expanded hide-choices button.
 * Expected outcome: `aria-label` is the short name and `data-control-tooltip` is the longer tip.
 * Exceptions: None.
 */
const EXPANDED_LABEL = 'Hide the new game choices';
const EXPANDED_TOOLTIP = 'Hide the new game choices and widen the map.';

/**
 * Accessible name and tip while the choices are hidden.
 *
 * Purpose: The plus means the player can show the choices again.
 * When to use: When applying the collapsed hide-choices button.
 * Expected outcome: `aria-label` and `data-control-tooltip` both say to show the choices.
 * Exceptions: None.
 */
const COLLAPSED_LABEL = 'Show the new game choices';
const COLLAPSED_TOOLTIP = 'Show the new game choices.';

/**
 * Reports whether the new-game overlay is on screen.
 *
 * Purpose: Map clicks and the unit cursor must stay off for the whole time that overlay is up, with its choices showing or hidden.
 * When to use: From map gesture handlers and the map cursor update.
 * Expected outcome: True when `#game-over-overlay` is present and does not have `hidden`. The collapse class does not count as closed.
 * Exceptions: None.
 */
export function newGameOverlayIsOpen(): boolean {
  const overlay = document.getElementById('game-over-overlay');
  return overlay != null && !overlay.classList.contains('hidden');
}

/**
 * Copies the visible randomize square onto the hide-choices button.
 *
 * Purpose: That square matches the dropdown beside it, so a fixed rem size would not.
 * When to use: After the choices are visible. A hidden tab's button has no height, so the other tab's button is used.
 * Expected outcome: Sets `--new-game-collapse-size` from the button's border box. A height of 0 leaves the previous size.
 * Exceptions: None.
 */
function measureCollapseSquare(overlay: HTMLElement): void {
  if (overlay.classList.contains(COLLAPSED_CLASS)) return;
  const globalButton = document.getElementById('new-game-human-region-randomize');
  const regionalButton = document.getElementById('new-game-region-randomize');
  const source = globalButton != null && globalButton.offsetHeight > 0 ? globalButton : regionalButton;
  if (source == null || source.offsetHeight <= 0) return;
  overlay.style.setProperty('--new-game-collapse-size', `${source.offsetHeight}px`);
}

/**
 * Shows the new-game choices and the dash on the hide-choices button.
 *
 * Purpose: Expanded is the state every open starts in, and the state the hide-choices button returns to.
 * When to use: When the overlay opens, and when the player shows the choices again.
 * Expected outcome: The collapse class is gone, the button reads as hide, and the square matches a visible randomize button.
 * Exceptions: None.
 */
function applyExpandedChrome(overlay: HTMLElement, button: HTMLButtonElement): void {
  overlay.classList.remove(COLLAPSED_CLASS);
  button.textContent = UNIT_DESELECT_GLYPH;
  button.setAttribute('aria-expanded', 'true');
  button.setAttribute('aria-label', EXPANDED_LABEL);
  button.setAttribute('data-control-tooltip', EXPANDED_TOOLTIP);
  measureCollapseSquare(overlay);
}

/**
 * Hides the new-game choices and shows the plus on the hide-choices button.
 *
 * Purpose: The player can see more of the preview map, across the whole window.
 * When to use: When the player clicks the hide-choices button while the choices are showing.
 * Expected outcome: Focus leaves a control inside the panel, the panel's header message, body, and footer are hidden,
 *   and the map widens.
 * Exceptions: None.
 */
function applyCollapsedChrome(overlay: HTMLElement, button: HTMLButtonElement): void {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active !== button && overlay.contains(active)) active.blur();
  overlay.classList.add(COLLAPSED_CLASS);
  button.textContent = UNIT_SELECT_GLYPH;
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', COLLAPSED_LABEL);
  button.setAttribute('data-control-tooltip', COLLAPSED_TOOLTIP);
}

/**
 * Shows the new-game choices.
 *
 * Purpose: Opening the overlay always starts with the choices visible, including after the player had hidden them.
 * When to use: Only when the overlay goes from hidden to shown, and before pointer input is disabled for that open.
 * Expected outcome: The choices are showing and the hide-choices button shows a dash. The camera does not move.
 * Exceptions: None. Missing elements leave the dialog unchanged.
 */
export function expandNewGameDialog(): void {
  const overlay = document.getElementById('game-over-overlay');
  const button = document.getElementById('new-game-dialog-collapse');
  if (!(overlay instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) return;
  applyExpandedChrome(overlay, button);
}

/**
 * Switches the new-game choices between shown and hidden.
 *
 * Purpose: The hide-choices button is the only control that hides or shows them.
 * When to use: From the hide-choices button's click.
 * Expected outcome: The other state is applied. The map keeps the pointer either way, so drag and the wheel still move the preview.
 * Exceptions: None. Missing elements leave the dialog unchanged.
 */
export function toggleNewGameDialogCollapsed(): void {
  const overlay = document.getElementById('game-over-overlay');
  const button = document.getElementById('new-game-dialog-collapse');
  if (!(overlay instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) return;
  if (overlay.classList.contains(COLLAPSED_CLASS)) applyExpandedChrome(overlay, button);
  else applyCollapsedChrome(overlay, button);
  syncNewGameDialogMapPointer();
}

/**
 * Lets the main map take drag and wheel while the new-game overlay is open.
 *
 * Purpose: The setup panel sits beside the map, not over it, so the player can pan and zoom the preview with the
 *   choices showing or hidden. Disabling the match controls writes `pointer-events: none` onto the map on every
 *   refresh, so this runs after that call.
 * When to use: After that disable or enable call, and after the hide-choices button toggles.
 * Expected outcome: An open overlay sets the map to `auto`. A closed overlay leaves the map as the enable or disable
 *   call wrote it, so the annihilation dialog keeps the map off. Map gestures still do not select or order while the
 *   overlay is open; the gesture handlers check `newGameOverlayIsOpen`.
 * Exceptions: None.
 */
export function syncNewGameDialogMapPointer(): void {
  const overlay = document.getElementById('game-over-overlay');
  const map = document.getElementById('main-map');
  if (!(overlay instanceof HTMLElement) || !(map instanceof HTMLElement)) return;
  if (overlay.classList.contains('hidden')) return;
  map.style.pointerEvents = 'auto';
}
