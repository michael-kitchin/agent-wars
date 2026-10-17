/**
 * Moving the new-game setup panel by its grip.
 *
 * Purpose: The panel floats over the map's top-left corner; the player can drag it aside to see the preview under it.
 *   It goes back to the corner each time the overlay opens.
 * When to use: `wireNewGameDialogMove` once at startup, `placeNewGameDialogAtInset` on each open, and
 *   `keepNewGameDialogOnMap` when the panel's height or the window changes.
 * Expected outcome: Inline `left` and `top` on `#game-over-overlay` once it has been moved, always inside `#app-body`
 *   with `MAP_CHROME_INSET` to spare; no inline position while it sits at the corner.
 * Exceptions: None; missing elements are skipped.
 */
import { floatingPanelOffset } from '../../shared/mapChromePlacement';
import { layoutMapChrome } from '../map/mapChromeLayout';

/**
 * Where a drag started: the pointer, and the panel's offset inside `#app-body`.
 *
 * Purpose: Each move places the panel by the pointer's distance from the start, so the panel never drifts.
 * When to use: Recorded on the grip's pointer down; read on each pointer move.
 * Expected outcome: CSS pixels.
 * Exceptions: None.
 */
interface DragStart {
  /**
   * The pointer's x when the drag started, in viewport pixels.
   *
   * Contract: Viewport CSS pixels from the pointer event.
   * When to use: Read while a drag moves the panel.
   * Expected outcome: The x recorded on pointer down.
   * Exceptions: None.
   */
  readonly x: number;
  /**
   * The pointer's y when the drag started, in viewport pixels.
   *
   * Contract: Viewport CSS pixels from the pointer event.
   * When to use: Read while a drag moves the panel.
   * Expected outcome: The y recorded on pointer down.
   * Exceptions: None.
   */
  readonly y: number;
  /**
   * The panel's left offset inside `#app-body` when the drag started.
   *
   * Contract: CSS pixels, the same unit `offsetLeft` uses.
   * When to use: Read while a drag moves the panel.
   * Expected outcome: The left recorded on pointer down.
   * Exceptions: None.
   */
  readonly left: number;
  /**
   * The panel's top offset inside `#app-body` when the drag started.
   *
   * Contract: CSS pixels, the same unit `offsetTop` uses.
   * When to use: Read while a drag moves the panel.
   * Expected outcome: The top recorded on pointer down.
   * Exceptions: None.
   */
  readonly top: number;
}

/**
 * The drag in progress, if any.
 *
 * Purpose: Pointer moves only move the panel between the grip's pointer down and pointer up.
 * When to use: Set on pointer down; cleared on pointer up, on pointer cancel, and when the overlay opens.
 * Expected outcome: Null while no drag is running.
 * Exceptions: None.
 */
let dragStart: DragStart | null = null;

/**
 * Finds the panel and the area it floats in.
 *
 * Purpose: Every function here needs both.
 * When to use: At the start of each function in this module.
 * Expected outcome: `#game-over-overlay` and `#app-body`, or null when either is missing.
 * Exceptions: None.
 */
function dialogAndArea(): { readonly panel: HTMLElement; readonly area: HTMLElement } | null {
  const panel = document.getElementById('game-over-overlay');
  const area = document.getElementById('app-body');
  if (!panel || !area) return null;
  return { panel, area };
}

/**
 * Places the panel at a wanted offset, held inside the area.
 *
 * Purpose: Dragging, a height change, and a window change all place the panel through the same rule.
 * When to use: From the drag and from `keepNewGameDialogOnMap`. Pass `panelHeight` when the panel is about to change
 *   height, so the clamp uses the height it is about to have.
 * Expected outcome: Inline `left` and `top` from `floatingPanelOffset`.
 * Exceptions: None.
 */
function applyOffset(panel: HTMLElement, area: HTMLElement, left: number, top: number, panelHeight = panel.offsetHeight): void {
  const place = floatingPanelOffset({
    left,
    top,
    panelWidth: panel.offsetWidth,
    panelHeight,
    mapWidth: area.clientWidth,
    mapHeight: area.clientHeight,
  });
  panel.style.left = `${place.left}px`;
  panel.style.top = `${place.top}px`;
}

/**
 * Puts the panel back at the map's top-left corner.
 *
 * Purpose: Every open starts at the corner, wherever the player left the panel last time.
 * When to use: Each time the overlay goes from hidden to shown, after its `hidden` class is removed.
 * Expected outcome: No drag is running, the panel has no inline position, so the stylesheet's 12 px inset applies, and
 *   the toast band is placed again around it.
 * Exceptions: None.
 */
export function placeNewGameDialogAtInset(): void {
  dragStart = null;
  const parts = dialogAndArea();
  if (!parts) return;
  parts.panel.style.removeProperty('left');
  parts.panel.style.removeProperty('top');
  layoutMapChrome();
}

/**
 * Pulls a moved panel back inside the map.
 *
 * Purpose: A panel dragged low can run off the map when it expands or when the window shrinks.
 * When to use: Before an expand slide, with the expanded height, and on every window resize.
 * Expected outcome: A panel at the corner, or a hidden one, is left alone. A moved panel keeps its offset when it fits,
 *   and otherwise moves just enough to keep the inset.
 * Exceptions: None.
 */
export function keepNewGameDialogOnMap(panelHeight?: number): void {
  const parts = dialogAndArea();
  if (!parts || parts.panel.style.left === '' || parts.panel.classList.contains('hidden')) return;
  applyOffset(parts.panel, parts.area, parts.panel.offsetLeft, parts.panel.offsetTop, panelHeight ?? parts.panel.offsetHeight);
}

/**
 * Ends a drag.
 *
 * Purpose: The toast band avoids the panel, so it is placed again once the panel stops moving.
 * When to use: On the grip's pointer up and pointer cancel.
 * Expected outcome: No drag is running and the toast band is placed again. Nothing happens when no drag was running.
 * Exceptions: None.
 */
function endDrag(): void {
  if (!dragStart) return;
  dragStart = null;
  layoutMapChrome();
}

/**
 * Wires the grip and the window resize.
 *
 * Purpose: The move feature's single setup point, in the same pattern as the selection panel's resize grip.
 * When to use: Once during renderer startup, after the page markup exists.
 * Expected outcome: A primary-button drag on `#new-game-panel-grip` moves the panel with the pointer, held inside the
 *   map. A window resize keeps a moved panel inside the map.
 * Exceptions: None; does nothing when the grip is missing.
 */
export function wireNewGameDialogMove(): void {
  const grip = document.getElementById('new-game-panel-grip');
  if (!grip) return;
  grip.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const parts = dialogAndArea();
    if (!parts) return;
    event.preventDefault();
    dragStart = { x: event.clientX, y: event.clientY, left: parts.panel.offsetLeft, top: parts.panel.offsetTop };
    grip.setPointerCapture(event.pointerId);
  });
  grip.addEventListener('pointermove', (event) => {
    const parts = dialogAndArea();
    if (!dragStart || !parts) return;
    applyOffset(parts.panel, parts.area, dragStart.left + event.clientX - dragStart.x, dragStart.top + event.clientY - dragStart.y);
  });
  grip.addEventListener('pointerup', endDrag);
  grip.addEventListener('pointercancel', endDrag);
  window.addEventListener('resize', () => keepNewGameDialogOnMap());
}
