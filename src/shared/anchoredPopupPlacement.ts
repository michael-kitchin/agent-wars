/**
 * Where a click-anchored popup sits inside the window.
 *
 * Purpose: The build popup and the stack callout share one clamp, so neither renderer repeats the arithmetic.
 * When to use: After the popup has been measured.
 * Expected outcome: The preferred point is the anchor plus the offset. Each edge stops at the window. A popup larger than the window stays at 0 on that axis.
 * Exceptions: None. This module does not import the logger.
 */

/**
 * The numbers the clamp needs.
 *
 * Purpose: Placement does not read the DOM.
 * When to use: The caller's measured popup and the window size.
 * Expected outcome: All fields are CSS pixels in the same origin.
 * Exceptions: None.
 */
export interface AnchoredPopupPlacementArgs {
  /**
   * Click X, in viewport pixels.
   *
   * Contract: The stored anchor, not the popup's current left.
   * When to use: The preferred left is this plus `offsetPx`.
   * Expected outcome: A negative value still clamps to 0.
   * Exceptions: None.
   */
  readonly anchorX: number;
  /**
   * Click Y, in viewport pixels.
   *
   * Contract: The stored anchor, not the popup's current top.
   * When to use: The preferred top is this plus `offsetPx`.
   * Expected outcome: A negative value still clamps to 0.
   * Exceptions: None.
   */
  readonly anchorY: number;
  /**
   * Popup width in pixels.
   *
   * Contract: The laid-out width.
   * When to use: The right-edge clamp.
   * Expected outcome: Wider than the window forces `left` to 0.
   * Exceptions: None.
   */
  readonly popupWidth: number;
  /**
   * Popup height in pixels.
   *
   * Contract: The laid-out height.
   * When to use: The bottom-edge clamp.
   * Expected outcome: Taller than the window forces `top` to 0.
   * Exceptions: None.
   */
  readonly popupHeight: number;
  /**
   * Window width in pixels.
   *
   * Contract: The visible width, with no extra margin.
   * When to use: The right-edge clamp.
   * Expected outcome: The popup's right edge is not past this unless the popup is wider.
   * Exceptions: None.
   */
  readonly viewportWidth: number;
  /**
   * Window height in pixels.
   *
   * Contract: The visible height, with no extra margin.
   * When to use: The bottom-edge clamp.
   * Expected outcome: The popup's bottom edge is not past this unless the popup is taller.
   * Exceptions: None.
   */
  readonly viewportHeight: number;
  /**
   * Gap between the click and the preferred top-left.
   *
   * Contract: The same offset the popup used before clamping.
   * When to use: Added to both anchor axes before the clamp.
   * Expected outcome: A popup that fits stays at the anchor plus this gap.
   * Exceptions: None.
   */
  readonly offsetPx: number;
}

/**
 * The clamped top-left.
 *
 * Purpose: Callers assign these to `style.left` and `style.top`.
 * When to use: The return of `placeAnchoredPopup`.
 * Expected outcome: Both values are finite and at least 0.
 * Exceptions: None.
 */
export interface AnchoredPopupPosition {
  /**
   * Popup left, in viewport pixels.
   *
   * Contract: At least 0, and no farther right than the window allows.
   * When to use: `style.left`.
   * Expected outcome: The popup does not cross the right edge unless it is wider than the window.
   * Exceptions: None.
   */
  readonly left: number;
  /**
   * Popup top, in viewport pixels.
   *
   * Contract: At least 0, and no farther down than the window allows.
   * When to use: `style.top`.
   * Expected outcome: The popup does not cross the bottom edge unless it is taller than the window.
   * Exceptions: None.
   */
  readonly top: number;
}

/**
 * Clamps a click-anchored popup into the window.
 *
 * Purpose: A popup near the window edge shifts just far enough to stay visible.
 * When to use: After measuring the popup. Pass the original click, not the popup's current position.
 * Expected outcome: Preferred position is the anchor plus `offsetPx`. Each axis is clamped into `0 .. max(0, viewport - size)`. The same arguments always return the same point.
 * Exceptions: None.
 */
export function placeAnchoredPopup(args: AnchoredPopupPlacementArgs): AnchoredPopupPosition {
  const preferredLeft = args.anchorX + args.offsetPx;
  const preferredTop = args.anchorY + args.offsetPx;
  const maxLeft = Math.max(0, args.viewportWidth - args.popupWidth);
  const maxTop = Math.max(0, args.viewportHeight - args.popupHeight);
  return {
    left: Math.min(Math.max(0, preferredLeft), maxLeft),
    top: Math.min(Math.max(0, preferredTop), maxTop),
  };
}
