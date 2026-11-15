/**
 * Shared open, close, and place behavior for a popover anchored to a button.
 *
 * Purpose: The new-game options popover and the commander popover attach the same listeners and use the same placement.
 * When to use: When a popover opens under a button and should close on Escape or an outside press.
 * Expected outcome: Callers keep their own open and close functions and share this lifecycle.
 * Exceptions: None. This module does not create or remove the popover element.
 */

import { placeBelowAnchor } from '../../shared/popoverPlacement';

/**
 * The three actions a caller keeps for its own popover.
 *
 * Purpose: The shared listeners do not know which popover is open.
 * When to use: Pass one object to `attachAnchoredPopoverListeners`.
 * Expected outcome: The listeners call these and nothing else.
 * Exceptions: None.
 */
export interface AnchoredPopoverHooks {
  /**
   * Whether the press landed in the popover or on its anchor.
   *
   * Contract: True keeps the popover open.
   * When to use: The pointer listener, after the target is known to be a node.
   * Expected outcome: True when either element contains the target.
   * Exceptions: None.
   */
  readonly containsTarget: (target: Node) => boolean;
  /**
   * Closes the caller's popover.
   *
   * Contract: Safe to call when the popover is already closed.
   * When to use: Escape, and a press outside the popover and its anchor.
   * Expected outcome: The popover is closed and its listeners are detached.
   * Exceptions: None.
   */
  readonly close: () => void;
  /**
   * Moves the popover back under its anchor.
   *
   * Contract: A no-op when the popover is closed.
   * When to use: Scroll and resize while the popover is open.
   * Expected outcome: The popover stays inside the window.
   * Exceptions: None.
   */
  readonly reposition: () => void;
}

/**
 * Attaches the close and reposition listeners for one open popover.
 *
 * Purpose: Escape, an outside press, scroll, and resize are the same for every anchored popover.
 * When to use: Immediately after the popover is shown. Call the returned function exactly once when it closes.
 * Expected outcome: The four listeners are attached. The returned function removes them in the same order, including the capture flag on scroll.
 * Exceptions: None.
 */
export function attachAnchoredPopoverListeners(hooks: AnchoredPopoverHooks): () => void {
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') hooks.close();
  };
  const onPointer = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (hooks.containsTarget(target)) return;
    hooks.close();
  };
  const onMove = (): void => hooks.reposition();
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onPointer);
  document.addEventListener('scroll', onMove, true);
  window.addEventListener('resize', onMove);
  return () => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', onPointer);
    document.removeEventListener('scroll', onMove, true);
    window.removeEventListener('resize', onMove);
  };
}

/**
 * Places a visible popover under its anchor, or above it when there is no room below.
 *
 * Purpose: Both popovers use one placement after their own visibility guard.
 * When to use: After the popover is visible. A hidden popover has an empty box.
 * Expected outcome: `top` and `left` are set in pixels.
 * Exceptions: None.
 */
export function placePopoverBelowAnchor(popover: HTMLElement, anchor: HTMLElement): void {
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
