import { HEX_DETAILS_TOOLTIP_DELAY_MS, TOOLTIP_OFFSET_PX } from './constants';
import { paintTerrainSwatches } from '../rendering/terrainVisualStyles';

/**
 * Attribute selector for elements that carry unit origin tooltip text (unit flag images).
 *
 * Purpose: Lets one set of document-level listeners serve every unit flag, wherever it is rendered.
 * When to use: Internal to this module; flags get the attribute through `createUnitOriginFlagImage`.
 * Expected outcome: Matches `data-unit-origin-tooltip` elements.
 * Exceptions: None.
 */
const UNIT_ORIGIN_TOOLTIP_SELECTOR = '[data-unit-origin-tooltip]';

/**
 * Whether the delegated listeners are already installed.
 *
 * Purpose: Keeps repeated installs from stacking duplicate listeners.
 * When to use: Checked and set by `installUnitOriginTooltip` only.
 * Expected outcome: `true` after the first install.
 * Exceptions: None.
 */
let installed = false;

/**
 * The flag currently under the pointer, if any.
 *
 * Purpose: Tracks which flag a pending or visible tooltip belongs to.
 * When to use: Internal to the hover listeners.
 * Expected outcome: `null` when no flag is hovered or after any hide.
 * Exceptions: None.
 */
let activeAnchor: HTMLElement | null = null;

/**
 * Pending show timer for the dwell delay.
 *
 * Purpose: Shows the tooltip only after the same dwell as hex tooltips, and lets hides cancel it.
 * When to use: Internal to the hover listeners.
 * Expected outcome: `null` when no show is pending.
 * Exceptions: None.
 */
let showTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Last pointer position in client coordinates.
 *
 * Purpose: Places the tooltip near the pointer when the dwell timer fires.
 * When to use: Updated on every pointer event the listeners see.
 * Expected outcome: The most recent pointer position.
 * Exceptions: None.
 */
const lastPointer = { x: 0, y: 0 };

/**
 * Frame callback that drops the tooltip when its flag is gone or hidden.
 *
 * Purpose: Label rebuilds and hidden toasts remove or conceal a flag without a pointer event.
 * When to use: Started by `beginHover`; cancelled by `hideUnitOriginTooltip`.
 * Expected outcome: `null` when no flag is hovered.
 * Exceptions: None.
 */
let anchorWatch: number | null = null;

/**
 * Reports whether a flag is still on screen.
 *
 * Purpose: `isConnected` stays true for a flag inside a `display: none` toast or callout.
 * When to use: Before showing the tooltip and while a hover is active.
 * Expected outcome: `true` only when the flag is in the document and has a layout box.
 * Exceptions: None.
 */
function anchorStillVisible(anchor: HTMLElement): boolean {
  return anchor.isConnected && anchor.getClientRects().length > 0;
}

/**
 * Stops watching the hovered flag.
 *
 * Purpose: A hide must not leave a frame callback that would show the tooltip again.
 * When to use: From `hideUnitOriginTooltip`.
 * Expected outcome: No frame callback is pending.
 * Exceptions: None.
 */
function stopAnchorWatch(): void {
  if (anchorWatch === null) return;
  cancelAnimationFrame(anchorWatch);
  anchorWatch = null;
}

/**
 * Hides the tooltip on the next frame if the hovered flag is gone or hidden, and keeps checking while it is not.
 *
 * Purpose: Covers label rebuilds and surfaces that hide without moving the pointer.
 * When to use: After a hover starts, and again each frame until the hover ends.
 * Expected outcome: The tooltip hides once the flag has no layout box; otherwise another check is scheduled.
 * Exceptions: None.
 */
function watchAnchor(): void {
  stopAnchorWatch();
  anchorWatch = requestAnimationFrame(() => {
    anchorWatch = null;
    if (!activeAnchor) return;
    if (!anchorStillVisible(activeAnchor)) {
      hideUnitOriginTooltip();
      return;
    }
    watchAnchor();
  });
}

/**
 * Returns the unit origin tooltip element when it exists in the page.
 *
 * Purpose: Shared lookup for the show, move, and hide paths.
 * When to use: Internal to this module.
 * Expected outcome: `#unit-origin-tooltip`, or `null` if the markup is missing.
 * Exceptions: None.
 */
function getTooltipEl(): HTMLElement | null {
  return document.getElementById('unit-origin-tooltip');
}

/**
 * Finds the unit flag an event target belongs to.
 *
 * Purpose: Event delegation; pointer events can target the flag or, in principle, a descendant.
 * When to use: In the pointer listeners.
 * Expected outcome: The nearest element carrying origin tooltip text, else `null`.
 * Exceptions: None.
 */
function findAnchor(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(UNIT_ORIGIN_TOOLTIP_SELECTOR) : null;
}

/**
 * Moves the tooltip element next to the last pointer position.
 *
 * Purpose: Shared positioning for the initial show and pointer moves.
 * When to use: When the tooltip is about to show or is visible.
 * Expected outcome: The element's `left` and `top` are the pointer position plus the standard offset.
 * Exceptions: None.
 */
function positionTooltip(el: HTMLElement): void {
  el.style.left = `${lastPointer.x + TOOLTIP_OFFSET_PX}px`;
  el.style.top = `${lastPointer.y + TOOLTIP_OFFSET_PX}px`;
}

/**
 * Hides the tooltip, cancels any pending show, and forgets the hovered flag.
 *
 * Purpose: The single hide path for pointer leave, clicks, scrolling, window blur, and removed flags.
 * When to use: Whenever the tooltip must not stay visible or appear later.
 * Expected outcome: The element is hidden and marked `aria-hidden`; no show is pending.
 * Exceptions: None.
 */
function hideUnitOriginTooltip(): void {
  stopAnchorWatch();
  if (showTimer !== null) {
    clearTimeout(showTimer);
    showTimer = null;
  }
  activeAnchor = null;
  const el = getTooltipEl();
  if (!el) return;
  el.classList.add('hidden');
  el.setAttribute('aria-hidden', 'true');
  el.textContent = '';
  el.innerHTML = '';
}

/**
 * Shows the tooltip for the hovered flag, reading its text at show time.
 *
 * Purpose: Labels can re-render while the pointer dwells, so the text is read when the tooltip appears.
 * When to use: When the dwell timer fires.
 * Expected outcome: The tooltip shows the flag's current text near the pointer; it hides instead when the flag
 *   has left the page or has no text.
 * Exceptions: None.
 */
function showForActiveAnchor(): void {
  showTimer = null;
  const anchor = activeAnchor;
  const text = anchor && anchorStillVisible(anchor) ? anchor.dataset.unitOriginTooltip : undefined;
  const el = getTooltipEl();
  if (!text || !el) {
    hideUnitOriginTooltip();
    return;
  }
  el.innerHTML = text;
  paintTerrainSwatches(el);
  positionTooltip(el);
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
  el.setAttribute('role', 'tooltip');
}

/**
 * Starts the dwell for a newly hovered flag.
 *
 * Purpose: Matches the hex tooltip delay before showing origin details.
 * When to use: When the pointer enters a flag other than the active one.
 * Expected outcome: Any previous tooltip is hidden and a show is scheduled for `anchor`.
 * Exceptions: None.
 */
function beginHover(anchor: HTMLElement): void {
  hideUnitOriginTooltip();
  activeAnchor = anchor;
  showTimer = setTimeout(showForActiveAnchor, HEX_DETAILS_TOOLTIP_DELAY_MS);
  watchAnchor();
}

/**
 * Records the pointer position from a pointer event.
 *
 * Purpose: Keeps `lastPointer` current for positioning.
 * When to use: At the start of each pointer listener.
 * Expected outcome: `lastPointer` holds the event's client coordinates.
 * Exceptions: None.
 */
function trackPointer(event: PointerEvent): void {
  lastPointer.x = event.clientX;
  lastPointer.y = event.clientY;
}

/**
 * Installs the delegated hover tooltip for unit country flags.
 *
 * Purpose: Flags appear in labels that are rebuilt often (stack callout, sidebar, toasts), so one set of
 *   document-level listeners serves all of them instead of per-element listeners.
 * When to use: Once during renderer startup; later calls do nothing.
 * Expected outcome: Hovering a unit flag shows its origin text after the hex tooltip delay. Leaving the flag,
 *   pressing a pointer, scrolling, blurring the window, or the flag leaving the page or being hidden hides it.
 * Exceptions: None.
 */
export function installUnitOriginTooltip(): void {
  if (installed) return;
  installed = true;

  document.addEventListener('pointerover', (event) => {
    trackPointer(event);
    const anchor = findAnchor(event.target);
    if (anchor && anchor !== activeAnchor) beginHover(anchor);
  });

  document.addEventListener('pointerout', (event) => {
    if (!activeAnchor || findAnchor(event.target) !== activeAnchor) return;
    const next = event.relatedTarget;
    if (next instanceof Node && activeAnchor.contains(next)) return;
    hideUnitOriginTooltip();
  });

  document.addEventListener('pointermove', (event) => {
    trackPointer(event);
    if (!activeAnchor) return;
    if (!anchorStillVisible(activeAnchor)) {
      hideUnitOriginTooltip();
      return;
    }
    const el = getTooltipEl();
    if (el && !el.classList.contains('hidden')) positionTooltip(el);
  });

  document.addEventListener('pointerdown', hideUnitOriginTooltip);
  window.addEventListener('scroll', hideUnitOriginTooltip, true);
  window.addEventListener('blur', hideUnitOriginTooltip);
}
