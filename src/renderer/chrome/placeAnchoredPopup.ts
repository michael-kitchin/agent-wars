/**
 * Moves an open click-anchored popup so it stays inside the window.
 *
 * Purpose: The build popup and the stack callout share the measurement and the attribute read.
 * When to use: After the popup is visible and its new content is in the DOM.
 * Expected outcome: `left` and `top` match `placeAnchoredPopup`. A hidden popup, or a popup with no anchor, is left where it is.
 * Exceptions: None. This module does not import the logger.
 */

import { placeAnchoredPopup } from '../../shared/anchoredPopupPlacement';
import { TOOLTIP_OFFSET_PX } from '../core/constants';

/**
 * Writes the clamped position of a visible popup.
 *
 * Purpose: Measurement has to happen while the popup is shown, because a hidden element has no size.
 * When to use: When the caller already has the original click.
 * Expected outcome: `style.left` and `style.top` are set. No other style or class changes. A popup with class `hidden` is not written.
 * Exceptions: None.
 */
export function placeAnchoredPopupElement(popup: HTMLElement, anchorX: number, anchorY: number): void {
  if (popup.classList.contains('hidden')) return;
  const rect = popup.getBoundingClientRect();
  const placed = placeAnchoredPopup({
    anchorX,
    anchorY,
    popupWidth: rect.width,
    popupHeight: rect.height,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    offsetPx: TOOLTIP_OFFSET_PX,
  });
  popup.style.left = `${placed.left}px`;
  popup.style.top = `${placed.top}px`;
}

/**
 * Places a popup from the click stored on it.
 *
 * Purpose: Later paints must use the original click, not the popup's current left and top.
 * When to use: After a visible popup's content has changed.
 * Expected outcome: The popup moves to the clamped point. A missing, blank, or non-finite `data-x` or `data-y` leaves it unmoved. `Number` of a missing attribute is 0, so that case returns before the conversion is used as an anchor.
 * Exceptions: None.
 */
export function placeOpenPopupFromDataAttributes(popup: HTMLElement): void {
  const xAttr = popup.getAttribute('data-x');
  const yAttr = popup.getAttribute('data-y');
  if (xAttr === null || yAttr === null || xAttr.trim() === '' || yAttr.trim() === '') return;
  const anchorX = Number(xAttr);
  const anchorY = Number(yAttr);
  if (!Number.isFinite(anchorX) || !Number.isFinite(anchorY)) return;
  placeAnchoredPopupElement(popup, anchorX, anchorY);
}

/**
 * Places the open build or hire popup.
 *
 * Purpose: Every build and hire paint looks up the same element.
 * When to use: After that popup's DOM has changed and it is visible.
 * Expected outcome: `#build-popup` is placed from its stored click. A missing element does nothing.
 * Exceptions: None.
 */
export function placeOpenBuildPopup(): void {
  const popup = document.getElementById('build-popup');
  if (!(popup instanceof HTMLElement)) return;
  placeOpenPopupFromDataAttributes(popup);
}

/**
 * Places the open stack callout.
 *
 * Purpose: The unit list and its sealift section share one lookup.
 * When to use: After the callout is visible, and after sealift content is added or removed.
 * Expected outcome: `#stack-callout` is placed from its stored click. A missing element does nothing.
 * Exceptions: None.
 */
export function placeOpenStackCallout(): void {
  const popup = document.getElementById('stack-callout');
  if (!(popup instanceof HTMLElement)) return;
  placeOpenPopupFromDataAttributes(popup);
}
