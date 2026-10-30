/**
 * Shows Victory and Rules for a new match in a popover under the Game Options button.
 *
 * Purpose: Those controls stay in the document, so the existing readers and preview listeners keep their ids.
 * When to use: `wireNewGameOptionsPopover` once at startup. `toggleNewGameOptionsPopover` from the button.
 *   `closeNewGameOptionsPopover` when another popover opens, the choices collapse, the panel is dragged, or the
 *   overlay hides.
 * Expected outcome: The popover is hidden until the button opens it, and a second click, Escape, an outside press,
 *   or the close control hides it again.
 * Exceptions: None. A missing button or popover leaves the screen unchanged.
 */

import { placeBelowAnchor } from '../../shared/popoverPlacement';
import { closeCommanderPopover } from '../openRouter/commanderPopover';

/** Popover element while it is open. Null while it is hidden. */
let popover: HTMLElement | null = null;

/** Button the open popover is placed under. */
let anchor: HTMLButtonElement | null = null;

/** Removes the document listeners attached while the popover is open. */
let detachListeners: (() => void) | null = null;

/**
 * Reports whether Game Options is open.
 *
 * Purpose: A second click on the button closes it, and other screens can ask before they open.
 * When to use: `toggleNewGameOptionsPopover`, and any caller that must not stack another popover on top.
 * Expected outcome: True after a toggle that opened it, until `closeNewGameOptionsPopover`.
 * Exceptions: None.
 */
export function newGameOptionsPopoverIsOpen(): boolean {
  return popover != null && !popover.hidden;
}

/**
 * Hides Game Options and drops its document listeners.
 *
 * Purpose: Escape, an outside press, the close control, a collapsing panel, and a commander popover share one exit.
 * When to use: Those actions. A call while closed does nothing.
 * Expected outcome: The popover is hidden. The selects stay in the document.
 * Exceptions: None.
 */
export function closeNewGameOptionsPopover(): void {
  detachListeners?.();
  detachListeners = null;
  if (popover) popover.hidden = true;
  popover = null;
  anchor = null;
}

/**
 * Opens or closes Game Options from its button.
 *
 * Purpose: The button is the only control that shows Victory and Rules.
 * When to use: The button's click.
 * Expected outcome: An open popover closes. A closed one closes the commander popover, then opens under the button.
 * Exceptions: None. A missing popover element does nothing.
 */
export function toggleNewGameOptionsPopover(button: HTMLButtonElement): void {
  if (newGameOptionsPopoverIsOpen()) {
    closeNewGameOptionsPopover();
    return;
  }
  const root = document.getElementById('new-game-options-popover');
  if (!(root instanceof HTMLElement)) return;
  closeCommanderPopover();
  popover = root;
  anchor = button;
  root.hidden = false;
  placeNewGameOptionsPopover();
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') closeNewGameOptionsPopover();
  };
  const onPointer = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (popover?.contains(target) || anchor?.contains(target)) return;
    closeNewGameOptionsPopover();
  };
  const onMove = (): void => placeNewGameOptionsPopover();
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onPointer);
  document.addEventListener('scroll', onMove, true);
  window.addEventListener('resize', onMove);
  detachListeners = () => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', onPointer);
    document.removeEventListener('scroll', onMove, true);
    window.removeEventListener('resize', onMove);
  };
}

/**
 * Wires the Game Options button, its close control, and the panel grip.
 *
 * Purpose: One setup point, after the page markup exists.
 * When to use: Once from `registerNewGameButton`.
 * Expected outcome: The button toggles the popover. The close control and a press on the grip hide it.
 * Exceptions: None. A missing element is skipped.
 */
export function wireNewGameOptionsPopover(): void {
  const button = document.getElementById('new-game-options-btn');
  if (button instanceof HTMLButtonElement) {
    button.addEventListener('click', () => toggleNewGameOptionsPopover(button));
  }
  document.querySelector('#new-game-options-popover .commander-popover-close')?.addEventListener('click', () => {
    closeNewGameOptionsPopover();
  });
  document.getElementById('new-game-panel-grip')?.addEventListener('pointerdown', () => {
    closeNewGameOptionsPopover();
  });
}

/**
 * Puts the open popover under its button, inside the window.
 *
 * Purpose: A button near the bottom of the screen must not lose the popover off the window.
 * When to use: On open, on scroll, and on resize. The popover must already be visible, or its box is empty.
 * Expected outcome: The popover sits below the button, or above it when there is no room below.
 * Exceptions: None.
 */
function placeNewGameOptionsPopover(): void {
  if (!popover || popover.hidden || !anchor) return;
  const rect = anchor.getBoundingClientRect();
  const box = popover.getBoundingClientRect();
  const placed = placeBelowAnchor(
    { top: rect.top, bottom: rect.bottom, left: rect.left },
    { width: box.width, height: box.height },
    { width: window.innerWidth, height: window.innerHeight }
  );
  popover.style.top = `${placed.top}px`;
  popover.style.left = `${placed.left}px`;
}
