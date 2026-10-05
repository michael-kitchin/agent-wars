/**
 * Keeps a fixed-position element aligned with the visible map area (`#canvas-container`).
 */

/**
 * Element id of the map area that excludes the right-hand sidebar.
 *
 * Purpose: Single source for the container lookup used to size map-centered frames.
 * When to use: Only inside this module when measuring the visible map.
 * Expected outcome: Matches the id in `index.html` and `shellChrome.css`.
 * Exceptions: None.
 */
const MAP_CONTAINER_ID = 'canvas-container';

/**
 * Copies the visible map's viewport rectangle onto a fixed-position frame.
 *
 * Purpose: Lets dialogs center on the map rather than on the whole window.
 * When to use: From `attachFrameToVisibleMap` on attach and on every resize notification.
 * Expected outcome: The frame's `left`, `top`, `width`, and `height` match the map container in px, or cover the
 *   window when the container is missing or has zero area.
 * Exceptions: None.
 */
function syncFrameToVisibleMap(frame: HTMLElement): void {
  const rect = document.getElementById(MAP_CONTAINER_ID)?.getBoundingClientRect();
  const hasArea = rect !== undefined && rect.width > 0 && rect.height > 0;
  frame.style.left = `${hasArea ? rect.left : 0}px`;
  frame.style.top = `${hasArea ? rect.top : 0}px`;
  frame.style.width = `${hasArea ? rect.width : window.innerWidth}px`;
  frame.style.height = `${hasArea ? rect.height : window.innerHeight}px`;
}

/**
 * Pins a fixed-position frame over the visible map area and keeps it there while the window resizes.
 *
 * Purpose: Centers modal panels on the map (not on the map plus the sidebar) without duplicating layout math.
 * When to use: After the frame is attached to the document; call the returned function when the frame is removed.
 * Expected outcome: The frame is sized immediately and re-sized on container and window resizes. The returned
 *   function stops all tracking and is safe to call more than once.
 * Exceptions: None. Falls back to covering the window when the map container is missing.
 */
export function attachFrameToVisibleMap(frame: HTMLElement): () => void {
  const sync = (): void => syncFrameToVisibleMap(frame);
  sync();
  const container = document.getElementById(MAP_CONTAINER_ID);
  const observer = container && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null;
  if (container) observer?.observe(container);
  window.addEventListener('resize', sync);
  let attached = true;
  return () => {
    if (!attached) return;
    attached = false;
    observer?.disconnect();
    window.removeEventListener('resize', sync);
  };
}
