import { UNIT_DESELECT_GLYPH, UNIT_SELECT_GLYPH } from '../core/constants';

/**
 * Class on `#game-over-overlay` while only the corner button is showing.
 *
 * Purpose: Hides the form and lets drag and wheel reach the preview without treating the overlay as closed.
 * When to use: Add it when the player hides the form. Remove it when the form is shown, including every time the overlay opens.
 * Expected outcome: The form is not displayed, and the overlay no longer takes the pointer except for the corner button.
 * Exceptions: None.
 */
const COLLAPSED_CLASS = 'game-over-dialog-collapsed';

/**
 * Accessible name and tip while the form is showing.
 *
 * Purpose: The dash means the player can hide the form. The tip says the map stays up.
 * When to use: When applying the expanded corner button.
 * Expected outcome: `aria-label` is the short name and `data-control-tooltip` is the longer tip.
 * Exceptions: None.
 */
const EXPANDED_LABEL = 'Hide the new game choices';
const EXPANDED_TOOLTIP = 'Hide the new game choices. The map stays up.';

/**
 * Accessible name and tip while the form is hidden.
 *
 * Purpose: The plus means the player can show the form again.
 * When to use: When applying the collapsed corner button.
 * Expected outcome: `aria-label` and `data-control-tooltip` both say to show the choices.
 * Exceptions: None.
 */
const COLLAPSED_LABEL = 'Show the new game choices';
const COLLAPSED_TOOLTIP = 'Show the new game choices.';

/**
 * Reports whether the new-game overlay is on screen.
 *
 * Purpose: Map clicks and the unit cursor must stay off for the whole time that overlay is up, including while its form is hidden.
 * When to use: From map gesture handlers and the map cursor update.
 * Expected outcome: True when `#game-over-overlay` is present and does not have `hidden`. The collapse class does not count as closed.
 * Exceptions: None.
 */
export function newGameOverlayIsOpen(): boolean {
  const overlay = document.getElementById('game-over-overlay');
  return overlay != null && !overlay.classList.contains('hidden');
}

/**
 * Copies the visible randomize square onto the corner button.
 *
 * Purpose: That square matches the dropdown beside it, so a fixed rem size would not.
 * When to use: After the form is visible. A hidden tab's button has no height, so the other tab's button is used.
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
 * Shows the new-game form and the dash on the corner button.
 *
 * Purpose: Expanded is the state every open starts in, and the state the corner button returns to.
 * When to use: When the overlay opens, and when the player shows the form again.
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
 * Hides the new-game form and shows the plus on the corner button.
 *
 * Purpose: The player can see the preview map without the form covering that corner.
 * When to use: When the player clicks the corner button while the form is showing.
 * Expected outcome: Focus leaves a dropdown inside the form, the form is hidden, and the overlay scrolls back to the button.
 * Exceptions: None.
 */
function applyCollapsedChrome(overlay: HTMLElement, button: HTMLButtonElement): void {
  const active = document.activeElement;
  const dialog = document.getElementById('game-over-dialog');
  if (active instanceof HTMLElement && dialog?.contains(active)) active.blur();
  overlay.classList.add(COLLAPSED_CLASS);
  button.textContent = UNIT_SELECT_GLYPH;
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-label', COLLAPSED_LABEL);
  button.setAttribute('data-control-tooltip', COLLAPSED_TOOLTIP);
  overlay.scrollTop = 0;
  overlay.scrollLeft = 0;
}

/**
 * Shows the new-game form.
 *
 * Purpose: Opening the overlay always starts with the form visible, including after the player had hidden it.
 * When to use: Only when the overlay goes from hidden to shown, and before pointer input is disabled for that open.
 * Expected outcome: The form is showing and the corner button shows a dash. The camera does not move.
 * Exceptions: None. Missing elements leave the dialog unchanged.
 */
export function expandNewGameDialog(): void {
  const overlay = document.getElementById('game-over-overlay');
  const button = document.getElementById('new-game-dialog-collapse');
  if (!(overlay instanceof HTMLElement) || !(button instanceof HTMLButtonElement)) return;
  applyExpandedChrome(overlay, button);
}

/**
 * Switches the new-game form between shown and hidden.
 *
 * Purpose: The corner button is the only control that hides or shows that form.
 * When to use: From the corner button's click.
 * Expected outcome: The other state is applied, then the main map's pointer follows that state.
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
 * Lets the main map take drag and wheel only while the new-game form is hidden.
 *
 * Purpose: Disabling the match controls writes `pointer-events: none` onto the map on every refresh. The expand click does not go through that disable call.
 * When to use: After that disable or enable call, and after the corner button toggles.
 * Expected outcome: An open collapsed dialog sets the map to `auto`. An open expanded dialog sets it to `none`. A closed dialog is left as the enable or disable call wrote it, so a leftover collapse class cannot turn the map on for another dialog.
 * Exceptions: None.
 */
export function syncNewGameDialogMapPointer(): void {
  const overlay = document.getElementById('game-over-overlay');
  const map = document.getElementById('main-map');
  if (!(overlay instanceof HTMLElement) || !(map instanceof HTMLElement)) return;
  if (overlay.classList.contains('hidden')) return;
  map.style.pointerEvents = overlay.classList.contains(COLLAPSED_CLASS) ? 'auto' : 'none';
}
