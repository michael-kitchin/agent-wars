/**
 * Keeps a fixed-position element aligned with the visible map area (`#canvas-container`).
 */
import { MAP_CONTAINER_ID, observeMapContainerResize } from './mapContainerResize';

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
 * Pins a fixed-position frame over the visible map area and keeps it there while the map's size changes.
 *
 * Purpose: Centers modal panels on the map (not on the map plus the console) without duplicating layout math.
 * When to use: After the frame is attached to the document; call the returned function when the frame is removed.
 * Expected outcome: The frame is sized immediately, then again on the next animation frame after the map container
 *   or the window resizes. The returned function stops all tracking and is safe to call more than once.
 * Exceptions: None. Falls back to covering the window when the map container is missing.
 */
export function attachFrameToVisibleMap(frame: HTMLElement): () => void {
  syncFrameToVisibleMap(frame);
  return observeMapContainerResize(() => syncFrameToVisibleMap(frame));
}
