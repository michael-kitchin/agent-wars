/**
 * The selection panel's resize grip at its top-right corner.
 *
 * The panel is anchored at the map's bottom-left, so dragging the grip right widens it and dragging it up makes it taller.
 */
import { clampSelectionPanelSize } from '../../shared/selectionPanelSize';
import { MAP_CONTAINER_ID } from '../map/mapContainerResize';

/**
 * Where a drag started: the pointer and the panel's size at that moment.
 *
 * Purpose: Each pointer move is measured from the start, so rounding never drifts.
 * When to use: Set on pointer down, cleared on pointer up or cancel.
 * Expected outcome: Null while no drag is in progress.
 * Exceptions: None.
 */
let dragStart: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null = null;

/**
 * Applies a size to the panel for the rest of the session.
 *
 * Purpose: A dragged size replaces the panel's fit-to-rows height.
 * When to use: On each pointer move during a drag.
 * Expected outcome: Inline width and height on `#selection-panel`. The height may then grow to the map height minus
 *   24 px instead of half the map. The size stays while the panel hides and shows again, until the app closes.
 * Exceptions: None.
 */
function applyPanelSize(panel: HTMLElement, width: number, height: number): void {
  panel.style.width = `${width}px`;
  panel.style.height = `${height}px`;
  panel.style.maxHeight = 'calc(100% - 24px)';
}

/**
 * Wires the grip: pointer down starts a drag, pointer moves resize the panel, and pointer up ends the drag.
 *
 * Purpose: Lets the player make the panel wider for long captions or taller for many units.
 * When to use: Once during renderer startup, after the page markup exists.
 * Expected outcome: Width stays from 320 to 640 px and height from 140 px to the map height minus 24 px
 *   (`clampSelectionPanelSize`). The size is not saved.
 * Exceptions: None; does nothing when the markup is missing.
 */
export function wireSelectionPanelResize(): void {
  const panel = document.getElementById('selection-panel');
  const grip = document.getElementById('selection-panel-grip');
  if (!panel || !grip) return;
  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const box = panel.getBoundingClientRect();
    dragStart = { x: event.clientX, y: event.clientY, width: box.width, height: box.height };
    grip.setPointerCapture(event.pointerId);
  });
  grip.addEventListener('pointermove', (event) => {
    if (!dragStart) return;
    const mapHeight = document.getElementById(MAP_CONTAINER_ID)?.clientHeight ?? 0;
    const size = clampSelectionPanelSize(
      { width: dragStart.width + (event.clientX - dragStart.x), height: dragStart.height - (event.clientY - dragStart.y) },
      mapHeight
    );
    applyPanelSize(panel, size.width, size.height);
  });
  const endDrag = (event: PointerEvent): void => {
    if (!dragStart) return;
    dragStart = null;
    if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);
  };
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);
}
