/**
 * The chat panel's resize grip at its top-left corner, shown in both of the panel's states.
 *
 * The panel is anchored at the map's bottom-right, so dragging the grip left widens it and dragging it up makes it taller.
 * A dragged width applies to both states. A dragged height applies only while the panel is expanded, so a drag on the compact panel changes its width alone.
 * This is the selection panel's grip (`selectionPanelResize.ts`) mirrored to the opposite corner, except that the selection panel's grip shows only while it is expanded.
 */
import { clampChatPanelSize } from '../../shared/chatPanelSize';
import { MAP_CONTAINER_ID } from '../map/mapContainerResize';

/**
 * Where a drag started: the pointer and the panel's size at that moment.
 *
 * Purpose: Each pointer move is measured from the start, so rounding never drifts.
 * When to use: Set on pointer down, cleared on pointer up or cancel.
 * Expected outcome: Null while no drag is in progress.
 * Exceptions: None.
 */
let dragStart: {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly compact: boolean;
} | null = null;

/**
 * The width the player last dragged the panel to, in CSS pixels.
 *
 * Purpose: `layoutMapChrome` sets the panel's default width on every layout, and a dragged width must win over it.
 * When to use: Set by drags; read through `chatPanelDraggedWidth`.
 * Expected outcome: Null until the first drag, then kept until the app closes.
 * Exceptions: None.
 */
let draggedWidth: number | null = null;

/**
 * The height the player last dragged the expanded panel to, in CSS pixels.
 *
 * Purpose: The compact panel is the bar's height, so the dragged height is kept apart from the panel's style while it is compact, and given back when it expands.
 * When to use: Set by drags; read by `applyDraggedChatHeight`.
 * Expected outcome: Null until the first drag, then kept until the app closes.
 * Exceptions: None.
 */
let draggedHeight: number | null = null;

/**
 * Gives the width the player dragged the panel to, if there is one.
 *
 * Purpose: `layoutMapChrome` uses this in place of the message dialog's band width.
 * When to use: Each time the chat panel's box is placed.
 * Expected outcome: A width in CSS pixels, or null before the first drag.
 * Exceptions: None.
 */
export function chatPanelDraggedWidth(): number | null {
  return draggedWidth;
}

/**
 * Gives the panel the height the player dragged it to, if there is one.
 *
 * Purpose: A dragged height replaces the expanded panel's fit-to-rows height and the half-the-map limit on the history.
 * When to use: During a drag, when the panel expands, and when an expanded slide settles.
 * Expected outcome: Inline height on `#chat-panel`, a max height of the map minus 24 px, and `data-dragged-height="true"`, which lets the history fill the panel (`static/chatChrome.css`). Nothing changes before the first drag.
 * Exceptions: None.
 */
export function applyDraggedChatHeight(panel: HTMLElement): void {
  if (draggedHeight === null) return;
  panel.style.height = `${draggedHeight}px`;
  panel.style.maxHeight = 'calc(100% - 24px)';
  panel.dataset.draggedHeight = 'true';
}

/**
 * Takes the dragged height off the panel, and keeps it for the next expand.
 *
 * Purpose: The compact panel is exactly its entry bar.
 * When to use: When the panel starts to collapse, and when it settles compact.
 * Expected outcome: No inline height, max height, or `data-dragged-height` on `#chat-panel`; the dragged width stays.
 * Exceptions: None.
 */
export function clearChatPanelHeight(panel: HTMLElement): void {
  panel.style.height = '';
  panel.style.maxHeight = '';
  delete panel.dataset.draggedHeight;
}

/**
 * Applies a dragged size to the panel for the rest of the session.
 *
 * Purpose: A dragged size replaces the panel's default width and fit-to-rows height.
 * When to use: On each pointer move during a drag. Pass a null height for a drag on the compact panel.
 * Expected outcome: Inline width, which both states use, and, for a non-null height, the dragged height. A null height leaves the height from an earlier drag as it was. The size stays while the panel hides, shows again, collapses, and expands, until the app closes.
 * Exceptions: None.
 */
function applyPanelSize(panel: HTMLElement, width: number, height: number | null): void {
  draggedWidth = width;
  panel.style.width = `${width}px`;
  if (height === null) return;
  draggedHeight = height;
  applyDraggedChatHeight(panel);
}

/**
 * Wires the grip: pointer down starts a drag, pointer moves resize the panel, and pointer up ends the drag.
 *
 * Purpose: Lets the player make the panel wider for long messages or taller for a long history.
 * When to use: Once during renderer startup, after the page markup exists.
 * Expected outcome: Width stays from 280 to 640 px and height from 140 px to the map height minus 24 px (`clampChatPanelSize`). A drag on the compact panel changes the width only. The size is not saved.
 * Exceptions: None; does nothing when the markup is missing.
 */
export function wireChatPanelResize(): void {
  const panel = document.getElementById('chat-panel');
  const grip = document.getElementById('chat-panel-grip');
  if (!panel || !grip) return;
  grip.addEventListener('pointerdown', (event) => {
    // A press during the expand or collapse slide does nothing.
    const state = panel.dataset.state;
    if (event.button !== 0 || (state !== 'expanded' && state !== 'compact')) return;
    event.preventDefault();
    const box = panel.getBoundingClientRect();
    dragStart = { x: event.clientX, y: event.clientY, width: box.width, height: box.height, compact: state === 'compact' };
    grip.setPointerCapture(event.pointerId);
  });
  grip.addEventListener('pointermove', (event) => {
    if (!dragStart) return;
    const mapHeight = document.getElementById(MAP_CONTAINER_ID)?.clientHeight ?? 0;
    const size = clampChatPanelSize(
      { width: dragStart.width - (event.clientX - dragStart.x), height: dragStart.height - (event.clientY - dragStart.y) },
      mapHeight
    );
    applyPanelSize(panel, size.width, dragStart.compact ? null : size.height);
  });
  const endDrag = (event: PointerEvent): void => {
    if (!dragStart) return;
    dragStart = null;
    if (grip.hasPointerCapture(event.pointerId)) grip.releasePointerCapture(event.pointerId);
  };
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);
  // Capture is lost without a pointer up when the panel hides mid-drag; the drag must not resume on the next hover.
  grip.addEventListener('lostpointercapture', endDrag);
}
