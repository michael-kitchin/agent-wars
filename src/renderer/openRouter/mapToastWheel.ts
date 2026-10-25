/**
 * Sends a wheel over the update toast to the main map when the toast cannot use it.
 *
 * Purpose: The toast covers the + and − buttons and takes the pointer, so a wheel on it would otherwise miss the map.
 *   This module does not import the logger. The decision runs on every wheel notch.
 * When to use: Once, while the map toast's other listeners are attached.
 * Expected outcome: A wheel zooms the map, toward the pointer, when `mapToastWheelReachesMap` says so. A wheel that the
 *   toast can still scroll stays on the toast.
 * Exceptions: None. A missing toast or map leaves the wheel unbound.
 */

import { mapToastWheelReachesMap } from '../../shared/mapToastWheel';

/**
 * Forwards a wheel from the update toast to the main map when the toast cannot scroll that way.
 *
 * Purpose: Keeps zoom working on the corner the toast covers, without taking the wheel away from a long report.
 * When to use: From `initOpenRouterUI`, beside the toast's dismiss listener.
 * Expected outcome: The listener is on `#map-toast`. It calls `preventDefault` and dispatches the same wheel on
 *   `#main-map` when the toast is not scrolling. Otherwise the toast scrolls.
 * Exceptions: None. Returns without a listener when either element is missing.
 */
export function bindMapToastWheel(): void {
  const toast = document.getElementById('map-toast');
  const map = document.getElementById('main-map');
  if (!(toast instanceof HTMLElement) || !(map instanceof HTMLElement)) return;
  toast.addEventListener('wheel', (event) => {
    if (!mapToastWheelReachesMap(toast.scrollTop, toast.scrollHeight, toast.clientHeight, event.deltaY)) return;
    event.preventDefault();
    map.dispatchEvent(new WheelEvent('wheel', {
      bubbles: true,
      cancelable: true,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaZ: event.deltaZ,
      deltaMode: event.deltaMode,
      clientX: event.clientX,
      clientY: event.clientY,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      altKey: event.altKey,
      metaKey: event.metaKey,
    }));
  }, { passive: false });
}
