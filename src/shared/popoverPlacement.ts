/**
 * Where a popover sits relative to the control that opened it.
 *
 * Purpose: The commander popover stays in the window without the renderer doing the arithmetic.
 * When to use: `placeCommanderPopover`.
 * Expected outcome: Six pixels under the anchor, shifted or flipped only when the popover would leave the window.
 * Exceptions: None. This module does not import the logger.
 */

/**
 * The anchor edges placement needs.
 *
 * Purpose: A DOM rect has more fields than this calculation uses.
 * When to use: The clicked button's bounding rect.
 * Expected outcome: `top` and `bottom` are viewport coordinates. `left` is the anchor's left edge.
 * Exceptions: None.
 */
export interface PopoverAnchorBox {
  /**
   * Anchor top, in viewport pixels.
   *
   * Contract: The same origin as `bottom`.
   * When to use: Flipping the popover above the anchor.
   * Expected outcome: Smaller than `bottom`.
   * Exceptions: None.
   */
  readonly top: number;
  /**
   * Anchor bottom, in viewport pixels.
   *
   * Contract: The same origin as `top`.
   * When to use: The usual placement, six pixels below this edge.
   * Expected outcome: Greater than `top`.
   * Exceptions: None.
   */
  readonly bottom: number;
  /**
   * Anchor left, in viewport pixels.
   *
   * Contract: Not used for vertical placement.
   * When to use: The popover's left edge, before the window clamp.
   * Expected outcome: The popover starts here when it fits.
   * Exceptions: None.
   */
  readonly left: number;
}

/**
 * The popover's laid-out size.
 *
 * Purpose: Placement needs the size after the popover is in the document.
 * When to use: The popover element's bounding rect.
 * Expected outcome: Width and height in viewport pixels.
 * Exceptions: None.
 */
export interface PopoverSize {
  /**
   * Popover width in pixels.
   *
   * Contract: Positive.
   * When to use: The right-edge clamp.
   * Expected outcome: The popover's right edge is `left` plus this width.
   * Exceptions: None.
   */
  readonly width: number;
  /**
   * Popover height in pixels.
   *
   * Contract: Positive.
   * When to use: The bottom-edge flip.
   * Expected outcome: The popover's bottom edge is `top` plus this height.
   * Exceptions: None.
   */
  readonly height: number;
}

/**
 * Places a popover under an anchor, inside the viewport.
 *
 * Purpose: A control near the window edge must not hide the popover.
 * When to use: When the commander popover opens, scrolls, or changes height.
 * Expected outcome: `top` is the anchor bottom plus 6, or the anchor top minus the height and 6 when that would
 *   leave the window. `left` is the anchor left, shifted so an 8 px margin remains. A result above the window
 *   becomes 8.
 * Exceptions: None.
 */
export function placeBelowAnchor(
  anchor: PopoverAnchorBox,
  popover: PopoverSize,
  viewport: { readonly width: number; readonly height: number }
): { readonly top: number; readonly left: number } {
  const gap = 6;
  const margin = 8;
  const left = Math.max(margin, Math.min(anchor.left, viewport.width - popover.width - margin));
  let top = anchor.bottom + gap;
  if (top + popover.height > viewport.height - margin) top = anchor.top - popover.height - gap;
  if (top < margin) top = margin;
  return { top, left };
}
