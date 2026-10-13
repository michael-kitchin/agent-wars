/**
 * Watches the map container's size, so the map and anything aligned to it follow every size change, not only
 * window resizes.
 */

/**
 * Element id of the map area: under the top bar and beside the console.
 *
 * Purpose: Single source for the container that the map fills and that map-centered frames measure.
 * When to use: Looking up or measuring the visible map area.
 * Expected outcome: Matches the id in `static/index.html`.
 * Exceptions: None.
 */
export const MAP_CONTAINER_ID = 'canvas-container';

/**
 * Calls `onResize` once per animation frame after the map container or the window changes size.
 *
 * Purpose: Collapsing the console, opening the new-game overlay, and window resizes all change the map's size.
 *   Leaflet, the canvas overlay, and map-centered frames keep their old size until they are told.
 * When to use: Once per consumer, with the function that brings it up to date.
 * Expected outcome: `onResize` runs on the next animation frame after a container resize or a window `resize`
 *   event (which also covers a device-pixel-ratio change), at most once per frame. Returns a function that stops
 *   watching; calling it again does nothing.
 * Exceptions: None. Without `ResizeObserver` only window resizes are watched.
 */
export function observeMapContainerResize(onResize: () => void): () => void {
  let frameId = 0;
  /**
   * Schedules one `onResize` call for the next animation frame.
   *
   * Purpose: Several size notifications in one frame lead to one resize.
   * When to use: As the window `resize` listener and the `ResizeObserver` callback.
   * Expected outcome: At most one pending frame at a time.
   * Exceptions: None.
   */
  const schedule = (): void => {
    if (frameId !== 0) return;
    frameId = window.requestAnimationFrame(() => {
      frameId = 0;
      onResize();
    });
  };
  window.addEventListener('resize', schedule);
  const container = document.getElementById(MAP_CONTAINER_ID);
  const observer = container && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null;
  if (container) observer?.observe(container);
  return () => {
    window.removeEventListener('resize', schedule);
    observer?.disconnect();
    if (frameId !== 0) window.cancelAnimationFrame(frameId);
    frameId = 0;
  };
}
