/**
 * The selection panel's resize grip at its top-right corner, shown only while the panel is expanded.
 *
 * The panel is anchored at the map's bottom-left, so dragging the grip right widens it and dragging it up makes it taller.
 * A dragged width applies to both of the panel's states; a dragged height applies only while it is expanded.
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
 * The height the player last dragged the expanded panel to, in CSS pixels.
 *
 * Purpose: The compact panel is the bar's height, so the dragged height must be kept apart from the panel's style while
 *   it is compact, and given back when it expands.
 * When to use: Set by drags; read by `applyDraggedPanelHeight`.
 * Expected outcome: Null until the first drag, then kept until the app closes.
 * Exceptions: None.
 */
let draggedHeight: number | null = null;

/**
 * Gives the panel the height the player dragged it to, if there is one.
 *
 * Purpose: A dragged height replaces the expanded panel's fit-to-rows height.
 * When to use: During a drag, and when the panel expands.
 * Expected outcome: Inline height on `#selection-panel`, which may then grow to the map height minus 24 px instead of
 *   half the map. Nothing changes before the first drag.
 * Exceptions: None.
 */
export function applyDraggedPanelHeight(panel: HTMLElement): void {
  if (draggedHeight === null) return;
  panel.style.height = `${draggedHeight}px`;
  panel.style.maxHeight = 'calc(100% - 24px)';
}

/**
 * Takes the dragged height off the panel, and keeps it for the next expand.
 *
 * Purpose: The compact panel is exactly its summary bar.
 * When to use: When the panel starts to collapse, and when it settles compact.
 * Expected outcome: No inline height or max height on `#selection-panel`; the dragged width stays.
 * Exceptions: None.
 */
export function clearPanelHeight(panel: HTMLElement): void {
  panel.style.height = '';
  panel.style.maxHeight = '';
}

/**
 * Applies a dragged size to the panel for the rest of the session.
 *
 * Purpose: A dragged size replaces the panel's default width and fit-to-rows height.
 * When to use: On each pointer move during a drag.
 * Expected outcome: Inline width, which both states use, and the dragged height. The size stays while the panel hides,
 *   shows again, collapses, and expands, until the app closes.
 * Exceptions: None.
 */
function applyPanelSize(panel: HTMLElement, width: number, height: number): void {
  panel.style.width = `${width}px`;
  draggedHeight = height;
  applyDraggedPanelHeight(panel);
}

/**
 * Wires the grip: pointer down starts a drag, pointer moves resize the panel, and pointer up ends the drag.
 *
 * Purpose: Lets the player make the panel wider for long captions or taller for many units.
 * When to use: Once during renderer startup, after the page markup exists.
 * Expected outcome: Width stays from 400 to 640 px and height from 140 px to the map height minus 24 px
 *   (`clampSelectionPanelSize`). The size is not saved.
 * Exceptions: None; does nothing when the markup is missing.
 */
export function wireSelectionPanelResize(): void {
  const panel = document.getElementById('selection-panel');
  const grip = document.getElementById('selection-panel-grip');
  if (!panel || !grip) return;
  grip.addEventListener('pointerdown', (event) => {
    // The grip only shows while the panel is expanded; a press during a slide does nothing.
    if (event.button !== 0 || panel.dataset.state !== 'expanded') return;
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
