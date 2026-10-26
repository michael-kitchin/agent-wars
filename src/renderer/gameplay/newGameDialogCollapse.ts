/**
 * The new-game setup panel's two states: expanded, the header bar over the choices and Start, and compact, the header
 * bar alone with Start in place of the message. The expand control at the bar's left edge switches them, and the panel
 * slides between them from its top edge, so the choices open downward under the bar.
 *
 * Purpose: Lets the player see more of the preview map without closing the screen, and start the match from the bar
 *   while the choices are hidden.
 * When to use: `expandNewGameDialog` whenever the overlay opens; `toggleNewGameDialogCollapsed` from the expand control.
 * Expected outcome: `data-state` on `#game-over-overlay` is `compact`, `expanding`, `expanded`, or `collapsing`. The
 *   styles hide the body, the footer, and the message only while compact, and turn the chevron up while expanded or
 *   collapsing. `#new-game-btn` is in the header only while compact. While expanding, expanded, or collapsing it is in
 *   the footer, so a collapse slide keeps the message and the button on screen until the panel settles. Moving the button
 *   keeps the listener, label, tip, and enabled state already set on it.
 * Exceptions: None; missing elements are skipped.
 */
import { startPanelHeightSlide } from '../chrome/panelSlideHelpers';
import { keepNewGameDialogOnMap } from './newGameDialogMove';

/**
 * Accessible name and tip while the choices are showing.
 *
 * Purpose: Says that the next click hides the choices, and why the player would.
 * When to use: When the expand control is synced while expanded.
 * Expected outcome: `aria-label` is the short name and `data-control-tooltip` is the longer tip.
 * Exceptions: None.
 */
const EXPANDED_LABEL = 'Hide the new game choices';
const EXPANDED_TOOLTIP = 'Hide the new game choices to see more of the map.';

/**
 * Accessible name and tip while the choices are hidden.
 *
 * Purpose: Says that the next click shows the choices again.
 * When to use: When the expand control is synced while compact.
 * Expected outcome: `aria-label` and `data-control-tooltip` both say to show the choices.
 * Exceptions: None.
 */
const COLLAPSED_LABEL = 'Show the new game choices';
const COLLAPSED_TOOLTIP = 'Show the new game choices.';

/**
 * Whether the player last chose the expanded state.
 *
 * Purpose: The state a slide ends in, and the state the expand control describes.
 * When to use: Read and written only in this module.
 * Expected outcome: True whenever the overlay has just opened.
 * Exceptions: None.
 */
let expanded = true;

/**
 * The slide in progress, if any.
 *
 * Purpose: A click during a slide starts the next slide from where this one is.
 * When to use: Set when a slide starts; cleared when it ends or is cancelled.
 * Expected outcome: Null while the panel is settled.
 * Exceptions: None.
 */
let slide: Animation | null = null;

/**
 * Reports whether the new-game overlay is on screen.
 *
 * Purpose: Map clicks and the unit cursor must stay off for the whole time that overlay is up, expanded or compact.
 * When to use: From map gesture handlers and the map cursor update.
 * Expected outcome: True when `#game-over-overlay` is present and does not have `hidden`. Compact does not count as closed.
 * Exceptions: None.
 */
export function newGameOverlayIsOpen(): boolean {
  const overlay = document.getElementById('game-over-overlay');
  return overlay != null && !overlay.classList.contains('hidden');
}

/**
 * Finds the panel, its header bar, and the expand control.
 *
 * Purpose: Both exported actions need all three.
 * When to use: At the start of `expandNewGameDialog` and `toggleNewGameDialogCollapsed`.
 * Expected outcome: The three elements, or null when any is missing.
 * Exceptions: None.
 */
function dialogParts(): { readonly panel: HTMLElement; readonly header: HTMLElement; readonly button: HTMLButtonElement } | null {
  const panel = document.getElementById('game-over-overlay');
  const header = document.getElementById('new-game-panel-header');
  const button = document.getElementById('new-game-dialog-collapse');
  if (!panel || !header || !(button instanceof HTMLButtonElement)) return null;
  return { panel, header, button };
}

/**
 * Sets the expand control's state, name, and tip from the player's choice.
 *
 * Purpose: Assistive technology and the tip must say what the next click does as soon as it is clicked.
 * When to use: After the choice changes.
 * Expected outcome: `aria-expanded`, `aria-label`, and the tip match `expanded`.
 * Exceptions: None.
 */
function syncCollapseControl(button: HTMLButtonElement): void {
  button.setAttribute('aria-expanded', String(expanded));
  button.setAttribute('aria-label', expanded ? EXPANDED_LABEL : COLLAPSED_LABEL);
  button.setAttribute('data-control-tooltip', expanded ? EXPANDED_TOOLTIP : COLLAPSED_TOOLTIP);
}

/**
 * The panel's slide states.
 *
 * Purpose: One value for both `data-state` and where Start sits.
 * When to use: `setPanelState`.
 * Expected outcome: `compact` is the settled state with the choices hidden. The other three show the choices,
 *   including during a slide.
 * Exceptions: None.
 */
type NewGamePanelState = 'compact' | 'expanding' | 'expanded' | 'collapsing';

/**
 * Puts Start in the header or the footer for this state.
 *
 * Purpose: One button, so its click listener, label, tip, and enabled state stay with it. The header shows it only
 *   once the choices are hidden. During a collapse it stays in the footer until the panel settles.
 * When to use: From `setPanelState`, before `data-state` changes, in the same turn.
 * Expected outcome: Compact inserts `#new-game-btn` before the close control, or at the end of the header when that
 *   control is absent. Every other state appends it to `#new-game-panel-footer`. Does nothing when the button is
 *   already in that parent, or when the button or the destination is missing.
 * Exceptions: None.
 */
function placeStartButton(state: NewGamePanelState): void {
  const button = document.getElementById('new-game-btn');
  const parent = document.getElementById(state === 'compact' ? 'new-game-panel-header' : 'new-game-panel-footer');
  if (!(button instanceof HTMLButtonElement) || !parent || button.parentElement === parent) return;
  if (state === 'compact') {
    const close = document.getElementById('new-game-dialog-close');
    parent.insertBefore(button, close && close.parentElement === parent ? close : null);
    return;
  }
  parent.appendChild(button);
}

/**
 * Records the panel's state and puts Start where that state shows it.
 *
 * Purpose: The only writer of `data-state`, so the button cannot be left in the wrong bar.
 * When to use: From `settle` and from both branches of `toggleNewGameDialogCollapsed`. Callers that measure the
 *   panel's height do it after this returns.
 * Expected outcome: The button is moved, then `data-state` is set, both before this returns. A scroll to the top that
 *   was requested while the choices were hidden is applied once the body is on screen.
 * Exceptions: None. A missing button or destination still sets `data-state`.
 */
function setPanelState(panel: HTMLElement, state: NewGamePanelState): void {
  placeStartButton(state);
  panel.dataset.state = state;
  applyPendingNewGameScroll();
}

/**
 * Ends the panel in the state the player chose, with no slide running.
 *
 * Purpose: One place that leaves the panel settled, after a slide or without one.
 * When to use: When a slide finishes, when no slide is needed, and when the overlay opens.
 * Expected outcome: `data-state` is `expanded` or `compact`.
 * Exceptions: None.
 */
function settle(panel: HTMLElement): void {
  slide?.cancel();
  slide = null;
  setPanelState(panel, expanded ? 'expanded' : 'compact');
}

/**
 * Slides the panel's height from `from` to `to`, then settles it.
 *
 * Purpose: The panel's top edge stays put, so a changing height opens or closes the choices under the bar.
 * When to use: From `toggleNewGameDialogCollapsed`, after `data-state` shows the content and the target height is known.
 * Expected outcome: The panel settles at once when `startPanelHeightSlide` declines to slide. A slide that a later click
 *   replaced does not settle the panel.
 * Exceptions: None.
 */
function slideTo(panel: HTMLElement, from: number, to: number): void {
  slide = startPanelHeightSlide(panel, from, to, (finished) => {
    if (slide === finished) settle(panel);
  });
  if (!slide) settle(panel);
}

/**
 * Shows the new-game choices at once, with no slide.
 *
 * Purpose: Opening the overlay always starts expanded, including after the player had collapsed it.
 * When to use: Only when the overlay goes from hidden to shown, and before pointer input is disabled for that open.
 * Expected outcome: The panel is expanded, Start is in the footer, and the expand control says it hides the choices.
 *   The camera does not move.
 * Exceptions: None. Missing elements leave the panel unchanged.
 */
export function expandNewGameDialog(): void {
  const parts = dialogParts();
  if (!parts) return;
  expanded = true;
  syncCollapseControl(parts.button);
  settle(parts.panel);
}

/**
 * Switches the panel between expanded and compact.
 *
 * Purpose: The expand control's single action.
 * When to use: On a click on `#new-game-dialog-collapse`, which also covers Enter and Space.
 * Expected outcome: The choice flips at once. Expanding puts Start in the footer, shows the choices, and grows the
 *   panel to its content, held inside the map. Collapsing drops focus from the choices and shrinks the panel to the
 *   header bar; Start moves into that bar, and the message hides, when the panel settles. A click during a slide
 *   starts from the panel's current height. The map keeps the pointer either way.
 * Exceptions: None. Missing elements leave the panel unchanged.
 */
export function toggleNewGameDialogCollapsed(): void {
  const parts = dialogParts();
  if (!parts) return;
  const { panel, header, button } = parts;
  const from = panel.getBoundingClientRect().height;
  slide?.cancel();
  slide = null;
  expanded = !expanded;
  syncCollapseControl(button);
  if (expanded) {
    setPanelState(panel, 'expanding');
    const to = panel.getBoundingClientRect().height;
    keepNewGameDialogOnMap(to);
    slideTo(panel, from, to);
    return;
  }
  const active = document.activeElement;
  if (active instanceof HTMLElement && panel.contains(active) && !header.contains(active)) active.blur();
  setPanelState(panel, 'collapsing');
  const borders = panel.offsetHeight - panel.clientHeight;
  slideTo(panel, from, header.offsetHeight + borders);
}

/**
 * Whether a scroll to the top is waiting for the choice list to be on screen.
 *
 * Purpose: Setting `scrollTop` does nothing while the body is `display: none`, and the old position returns when the
 *   choices are shown. That hides Result after a match ends with the choices hidden.
 * When to use: Set by `scrollNewGameDialogToTop` and cleared by `applyPendingNewGameScroll`.
 * Expected outcome: True only until the body is on screen and has been moved to the top.
 * Exceptions: None.
 */
let scrollToTopWhenShown = false;

/**
 * Moves the choice list to the top once it is on screen.
 *
 * Purpose: One place applies a scroll that was requested while the overlay or the choices were hidden.
 * When to use: From `scrollNewGameDialogToTop`, and from `setPanelState` after the body can be shown.
 * Expected outcome: `#game-over-dialog` is at scroll position 0 and the wait is cleared. A hidden body keeps the wait.
 *   A missing body leaves the wait unchanged.
 * Exceptions: None.
 */
function applyPendingNewGameScroll(): void {
  if (!scrollToTopWhenShown) return;
  const body = document.getElementById('game-over-dialog');
  if (!(body instanceof HTMLElement) || body.getClientRects().length === 0) return;
  body.scrollTop = 0;
  scrollToTopWhenShown = false;
}

/**
 * Scrolls the setup choices back to the top of the panel.
 *
 * Purpose: The body keeps its scroll position while the overlay is hidden, which hides Result when the match ends.
 * When to use: When the overlay opens, and when a match ends while the overlay is already open.
 * Expected outcome: `#game-over-dialog` is at scroll position 0 when it is on screen. When it is hidden, the scroll is
 *   applied the next time the choices are shown. A missing body is ignored. Showing or hiding the choices does not call this.
 * Exceptions: None.
 */
export function scrollNewGameDialogToTop(): void {
  const body = document.getElementById('game-over-dialog');
  if (!(body instanceof HTMLElement)) return;
  scrollToTopWhenShown = true;
  applyPendingNewGameScroll();
}

/**
 * Lets the main map take drag and wheel while the new-game overlay is open.
 *
 * Purpose: The setup panel floats over the map's corner, and the rest of the map stays live, so the player can pan and
 *   zoom the preview with the panel expanded or compact. Disabling the match controls writes `pointer-events: none`
 *   onto the map on every refresh, so this runs after that call.
 * When to use: After that disable or enable call.
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
