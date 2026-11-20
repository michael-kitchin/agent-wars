/**
 * The drag grip that moves the replay panel.
 *
 * Purpose: The player can move the panel off whatever it covers. The grip moves the panel and never resizes it.
 * When to use: `wireReplayPanelDrag` once from `wireReplayPanel`. `keepReplayPanelInArea` after the panel's height or visibility changes.
 * Expected outcome: Dragging `#replay-panel-drag` shifts the panel by the pointer's movement, kept inside the map area it sits in. The shift lasts while replay is left and entered again, and is not saved.
 * Exceptions: None. Missing elements are skipped.
 */

import { clampPanelShift } from '../../shared/panelShiftClamp';

/**
 * How far the panel is shifted from its home at the map's bottom-left.
 *
 * Purpose: The shift is applied as a transform, so the panel's own layout and its height slide are untouched.
 * When to use: Read and written only in this module.
 * Expected outcome: Zero until the first drag.
 * Exceptions: None.
 */
const offset = { x: 0, y: 0 };

/**
 * Applies the shift to the panel.
 *
 * Purpose: One place writes the transform.
 * When to use: After `clampOffset`.
 * Expected outcome: The panel is translated by `offset`, or has no transform while the shift is zero.
 * Exceptions: None.
 */
function applyOffset(panel: HTMLElement): void {
  panel.style.transform = offset.x === 0 && offset.y === 0 ? '' : `translate(${offset.x}px, ${offset.y}px)`;
}

/**
 * Sets the shift to the wanted one, kept inside the area the panel sits in.
 *
 * Purpose: A drag, a smaller map area, or a taller panel must not leave the panel, and its grip, out of reach.
 * When to use: Each drag step, and from `keepReplayPanelInArea`.
 * Expected outcome: `offset` holds the wanted shift limited so the panel's box stays inside its offset parent. Nothing changes while the panel is hidden.
 * Exceptions: None.
 */
function clampOffset(panel: HTMLElement, wantedX: number, wantedY: number): void {
  const area = panel.offsetParent?.getBoundingClientRect();
  const box = panel.getBoundingClientRect();
  if (!area || box.width === 0) return;
  offset.x = clampPanelShift(wantedX, box.left - offset.x, box.width, area.left, area.right);
  offset.y = clampPanelShift(wantedY, box.top - offset.y, box.height, area.top, area.bottom);
}

/**
 * Pulls a moved panel back inside the map area.
 *
 * Purpose: The area shrinks when the window or the console changes, and the panel grows upward when it expands, so a panel left near an edge can end partly outside.
 * When to use: After the panel settles from a slide, when it is shown, and when the area resizes.
 * Expected outcome: The shift is limited to the area and applied. A panel that was never moved is left alone.
 * Exceptions: None.
 */
export function keepReplayPanelInArea(panel: HTMLElement): void {
  if (offset.x === 0 && offset.y === 0) return;
  clampOffset(panel, offset.x, offset.y);
  applyOffset(panel);
}

/**
 * Binds the grip's drag and watches the area's size.
 *
 * Purpose: See the file note.
 * When to use: From `wireReplayPanel`.
 * Expected outcome: A primary-button press on the grip captures the pointer, each move shifts the panel, and release, cancel, or a lost capture ends the drag. A resize of the area pulls the panel back inside it.
 * Exceptions: None. Does nothing when the grip is missing.
 */
export function wireReplayPanelDrag(panel: HTMLElement): void {
  const grip = document.getElementById('replay-panel-drag');
  if (!grip) return;
  let grab: { pointerX: number; pointerY: number; startX: number; startY: number } | null = null;
  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    grip.setPointerCapture(event.pointerId);
    grab = { pointerX: event.clientX, pointerY: event.clientY, startX: offset.x, startY: offset.y };
  });
  grip.addEventListener('pointermove', (event) => {
    if (!grab) return;
    clampOffset(panel, grab.startX + event.clientX - grab.pointerX, grab.startY + event.clientY - grab.pointerY);
    applyOffset(panel);
  });
  const endDrag = (): void => {
    grab = null;
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) grip.addEventListener(type, endDrag);
  const area = panel.parentElement;
  if (area) new ResizeObserver(() => keepReplayPanelInArea(panel)).observe(area);
}
