import { HEX_DETAILS_TOOLTIP_DELAY_MS, TOOLTIP_OFFSET_PX } from '../core/constants';
import { clearTerrainTooltipTimer, hideTerrainTooltipVisual } from '../map/terrainTooltipRes1State';

/**
 * Attribute that carries one control's tip sentence.
 *
 * Purpose: Call sites set this and the shared listener reads it. The sentence stays with the control.
 * When to use: On the element that should receive the pointer, including a wrapper around a disabled control.
 * Expected outcome: A non-empty value shows after the hex-details dwell. An empty value shows nothing.
 * Exceptions: None.
 */
const controlTooltipAttr = 'data-control-tooltip';

/**
 * Id of the single gameplay-styled tip element.
 *
 * Purpose: One element is reused so controls do not each create a tooltip node.
 * When to use: Lookup inside this module only.
 * Expected outcome: Matches `#control-tooltip` in the page.
 * Exceptions: None.
 */
const controlTooltipElementId = 'control-tooltip';

/**
 * State for the one shared tip.
 *
 * Purpose: Keeps a single dwell, host, and dropdown suppression so moving inside a control does not restart the wait.
 * When to use: Inside this module only.
 * Expected outcome: `currentHost` is the control under the pointer or keyboard focus. `pointerInside` is true while the pointer is on that host. `placeFromPointer` chooses pointer coordinates instead of the control's corner. `suppressedHost` blocks a new show until the pointer leaves. `lastClientX` and `lastClientY` are the last pointer position.
 * Exceptions: None.
 */
let installed = false;
let delayTimer: ReturnType<typeof setTimeout> | null = null;
let currentHost: HTMLElement | null = null;
let pointerInside = false;
let placeFromPointer = false;
let suppressedHost: HTMLElement | null = null;
let lastClientX = 0;
let lastClientY = 0;

/**
 * Returns the shared tip element when the page includes it.
 *
 * Purpose: Every show and hide path uses one lookup.
 * When to use: Inside this module only.
 * Expected outcome: The element, or null when the markup is missing.
 * Exceptions: None.
 */
function tipElement(): HTMLElement | null {
  return document.getElementById(controlTooltipElementId);
}

/**
 * Cancels a pending dwell without hiding a tip that is already visible.
 *
 * Purpose: A new host, a hide, and list suppression must not leave the old wait running.
 * When to use: Before scheduling again, and whenever the tip must not appear.
 * Expected outcome: No dwell timer remains.
 * Exceptions: None.
 */
function clearDelayTimer(): void {
  if (delayTimer !== null) {
    clearTimeout(delayTimer);
    delayTimer = null;
  }
}

/**
 * Hides the tip and clears its text.
 *
 * Purpose: One hide path for leave, blur, and suppression.
 * When to use: Whenever the tip must not be visible.
 * Expected outcome: The element has `hidden` and `aria-hidden=true` when it exists.
 * Exceptions: A missing tip element is ignored.
 */
function hideTip(): void {
  clearDelayTimer();
  const el = tipElement();
  if (!el) return;
  el.classList.add('hidden');
  el.setAttribute('aria-hidden', 'true');
  el.textContent = '';
}

/**
 * True when a blocked or slower order tip is already on screen.
 *
 * Purpose: Those tips explain the order under the pointer. A control tip must not cover them.
 * When to use: Immediately before showing a control tip.
 * Expected outcome: True when either order tip lacks the `hidden` class.
 * Exceptions: None.
 */
function orderTipVisible(): boolean {
  for (const id of ['order-block-tooltip', 'order-slower-tooltip']) {
    const el = document.getElementById(id);
    if (el && !el.classList.contains('hidden')) return true;
  }
  return false;
}

/**
 * Resolves the element whose tip sentence applies to this event target.
 *
 * Purpose: The pointer may be on the control, its label, or a wrapper that owns the sentence.
 * When to use: From every document listener in this module.
 * Expected outcome: The nearest attributed element, the control named by a label's `for`, or the attributed control inside a label. Null when none of those exist.
 * Exceptions: None.
 */
function hostFromTarget(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const closest = target.closest(`[${controlTooltipAttr}]`);
  if (closest instanceof HTMLElement) return closest;
  if (target instanceof HTMLLabelElement && target.htmlFor) {
    const linked = document.getElementById(target.htmlFor);
    if (linked instanceof HTMLElement && linked.hasAttribute(controlTooltipAttr)) return linked;
  }
  const label = target.closest('label');
  const descendant = label?.querySelector(`[${controlTooltipAttr}]`);
  return descendant instanceof HTMLElement ? descendant : null;
}

/**
 * Returns the trimmed sentence on a host.
 *
 * Purpose: Empty and whitespace-only sentences must not open a blank tip.
 * When to use: Before scheduling or showing.
 * Expected outcome: The sentence, or an empty string.
 * Exceptions: None.
 */
function hostText(host: HTMLElement): string {
  return (host.getAttribute(controlTooltipAttr) ?? '').trim();
}

/**
 * True when this keyboard event opens a native dropdown list.
 *
 * Purpose: The floating tip must not cover the options.
 * When to use: `keydown` while the event target is a select that owns a control tip.
 * Expected outcome: True for Space, Enter, Alt+ArrowDown, and ArrowUp or ArrowDown.
 * Exceptions: None.
 */
function keyOpensNativeList(ev: KeyboardEvent): boolean {
  if (ev.key === ' ' || ev.key === 'Spacebar' || ev.key === 'Enter') return true;
  if (ev.key === 'ArrowDown' && ev.altKey) return true;
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') return true;
  return false;
}

/**
 * Returns the select that this event would open, when that select has a control tip.
 *
 * Purpose: List suppression applies only to dropdowns that use this tip.
 * When to use: Pointer, key, and change listeners.
 * Expected outcome: The select, or null.
 * Exceptions: None.
 */
function selectForTip(target: EventTarget | null): HTMLSelectElement | null {
  if (!(target instanceof Element)) return null;
  const select = target instanceof HTMLSelectElement ? target : target.closest('select');
  if (!(select instanceof HTMLSelectElement)) return null;
  return hostFromTarget(select) ? select : null;
}

/**
 * Shows the sentence near the pointer, or beside the control when focus arrived without the pointer.
 *
 * Purpose: Matches the hex-tooltip offset and chrome.
 * When to use: After the dwell, when the host is still current and no order tip is showing.
 * Expected outcome: The tip is visible. The hex tooltip is cleared so it does not sit underneath.
 * Exceptions: A missing tip element returns without throwing. An order tip that is already visible is left in place.
 */
function showTip(host: HTMLElement, text: string): void {
  const el = tipElement();
  if (!el) return;
  clearTerrainTooltipTimer();
  hideTerrainTooltipVisual();
  let x = lastClientX;
  let y = lastClientY;
  if (!placeFromPointer) {
    const rect = host.getBoundingClientRect();
    x = rect.left;
    y = rect.top;
  }
  el.textContent = text;
  el.style.left = `${x + TOOLTIP_OFFSET_PX}px`;
  el.style.top = `${y + TOOLTIP_OFFSET_PX}px`;
  el.classList.remove('hidden');
  el.setAttribute('aria-hidden', 'false');
  el.setAttribute('role', 'tooltip');
}

/**
 * Waits the hex-details dwell, then shows the host's sentence.
 *
 * Purpose: Control tips use the same pause as hex details. Moving inside the host does not start this again.
 * When to use: When the pointer or keyboard focus enters a host that is not suppressed.
 * Expected outcome: The tip appears after the dwell if the host is still current. It stays hidden when an order tip is visible or the sentence is empty.
 * Exceptions: None.
 */
function scheduleShow(host: HTMLElement): void {
  clearDelayTimer();
  if (suppressedHost === host) return;
  const text = hostText(host);
  if (!text) {
    hideTip();
    return;
  }
  delayTimer = setTimeout(() => {
    delayTimer = null;
    if (currentHost !== host || suppressedHost === host || !hostIsAvailable(host)) return;
    if (orderTipVisible()) return;
    const next = hostText(host);
    if (!next) {
      hideTip();
      return;
    }
    showTip(host, next);
  }, HEX_DETAILS_TOOLTIP_DELAY_MS);
}

/**
 * Hides the tip until the pointer leaves this host.
 *
 * Purpose: An open dropdown list, and the moment a choice is made, must not sit under the tip.
 * When to use: Pointer down, list-opening keys, and change on a tipped select.
 * Expected outcome: The tip is hidden and the dwell will not start again until the pointer leaves.
 * Exceptions: None.
 */
function suppressHost(host: HTMLElement): void {
  suppressedHost = host;
  hideTip();
}

/**
 * Adopts a host and starts one dwell.
 *
 * Purpose: Entering a different control replaces the previous wait. Re-entering the same control does not.
 * When to use: Pointer enter and keyboard focus.
 * Expected outcome: One current host. A pointer enter places the tip at the pointer. Keyboard focus places it on the control unless the pointer is already inside.
 * Exceptions: None.
 */
function adoptHost(host: HTMLElement, fromPointer: boolean, clientX: number, clientY: number): void {
  if (fromPointer && host === currentHost) {
    pointerInside = true;
    placeFromPointer = true;
    lastClientX = clientX;
    lastClientY = clientY;
    moveVisibleTip(lastClientX, lastClientY);
    return;
  }
  if (!fromPointer && host === currentHost) return;
  if (currentHost !== host) {
    hideTip();
    suppressedHost = null;
  }
  currentHost = host;
  if (fromPointer) {
    pointerInside = true;
    placeFromPointer = true;
    lastClientX = clientX;
    lastClientY = clientY;
  } else {
    pointerInside = pointerIsOn(host);
    placeFromPointer = pointerInside;
  }
  if (suppressedHost === host) return;
  scheduleShow(host);
}

/**
 * Drops the host when the pointer or focus has actually left it.
 *
 * Purpose: The tip must not remain after the player moves on.
 * When to use: Pointer leave and focus leave.
 * Expected outcome: The tip is hidden and suppression for that host ends.
 * Exceptions: None.
 */
function releaseHost(host: HTMLElement): void {
  if (suppressedHost === host) suppressedHost = null;
  if (currentHost !== host) return;
  pointerInside = false;
  currentHost = null;
  hideTip();
}

/**
 * True when the event's related target is still inside the host.
 *
 * Purpose: Moving between a control and its label must not hide the tip.
 * When to use: Pointer leave and focus leave.
 * Expected outcome: True when the related target is the host, inside it, or another part of the same control such as its label.
 * Exceptions: None.
 */
function relatedStaysInside(host: HTMLElement, related: EventTarget | null): boolean {
  if (!(related instanceof Element)) return false;
  const next = hostFromTarget(related);
  if (next === host) return true;
  if (next) return false;
  return related === host || host.contains(related);
}

/**
 * True when the pointer is over this host or something inside it.
 *
 * Purpose: Keyboard focus must not reuse the pointer position from a different control.
 * When to use: When focus enters a host, and when a move may have left the current host.
 * Expected outcome: True while this host matches `:hover`.
 * Exceptions: None.
 */
function pointerIsOn(host: HTMLElement): boolean {
  return host.matches(':hover');
}

/**
 * True when keyboard focus is still on this host and the focused control is showing.
 *
 * Purpose: Moving the pointer elsewhere must not dismiss a tip that belongs to the focused control.
 * When to use: On pointer move when the event target is a different control.
 * Expected outcome: True when the active element resolves to this host and is not inside a hidden region.
 * Exceptions: None.
 */
function focusIsOn(host: HTMLElement): boolean {
  const active = document.activeElement;
  if (!(active instanceof Element) || active.closest('.hidden')) return false;
  return active === host || host.contains(active) || hostFromTarget(active) === host;
}

/**
 * True when the host is still in the page and not inside a hidden region.
 *
 * Purpose: A tip must not stay up after its control is removed or hidden, including under a later dialog.
 * When to use: Before showing, and when the pointer moves.
 * Expected outcome: False when the host is disconnected, not rendered, or its controls have no box. A disabled control that still occupies space stays available.
 * Exceptions: None.
 */
function hostIsAvailable(host: HTMLElement): boolean {
  if (!host.isConnected || host.getClientRects().length === 0) return false;
  const controls = host.matches('button, input, select, textarea')
    ? [host]
    : Array.from(host.querySelectorAll('button, input, select, textarea'));
  if (controls.length === 0) return true;
  return controls.some((control) => control.getClientRects().length > 0);
}

/**
 * Hides the tip when its control is no longer on screen.
 *
 * Purpose: A tip must not stay up after its control is hidden, including over a dialog that replaced that control.
 * When to use: After a control is shown, hidden, or removed.
 * Expected outcome: The tip hides when the current control has no area. A visible control is left alone.
 * Exceptions: None.
 */
export function dismissStaleControlTooltip(): void {
  if (currentHost && !hostIsAvailable(currentHost)) releaseHost(currentHost);
}

/**
 * Moves a visible tip to the pointer.
 *
 * Purpose: Moving inside a control follows the pointer without starting the dwell again.
 * When to use: Pointer move and pointer enter on the current host.
 * Expected outcome: A visible tip is repositioned. A hidden tip is left hidden.
 * Exceptions: None.
 */
function moveVisibleTip(clientX: number, clientY: number): void {
  const el = tipElement();
  if (!el || el.classList.contains('hidden')) return;
  el.style.left = `${clientX + TOOLTIP_OFFSET_PX}px`;
  el.style.top = `${clientY + TOOLTIP_OFFSET_PX}px`;
}

/**
 * Installs the document listeners for control tips.
 *
 * Purpose: One installer covers every current and future control that sets `data-control-tooltip`.
 * When to use: Once, at renderer startup, after the tip element exists.
 * Expected outcome: Hover and focus on an attributed control show its sentence after one second. A second call does nothing.
 * Exceptions: A missing tip element causes later shows to do nothing.
 */
export function installControlTooltip(): void {
  if (installed) return;
  installed = true;

  document.addEventListener(
    'pointerover',
    (ev) => {
      const host = hostFromTarget(ev.target);
      if (!host) return;
      adoptHost(host, true, ev.clientX, ev.clientY);
    },
    true
  );

  document.addEventListener(
    'pointerout',
    (ev) => {
      const host = hostFromTarget(ev.target);
      if (!host || relatedStaysInside(host, ev.relatedTarget)) return;
      releaseHost(host);
    },
    true
  );

  document.addEventListener(
    'pointermove',
    (ev) => {
      const host = hostFromTarget(ev.target);
      if (orderTipVisible()) {
        if (currentHost) releaseHost(currentHost);
        return;
      }
      if (currentHost && !hostIsAvailable(currentHost)) releaseHost(currentHost);
      if (host && host !== currentHost) {
        adoptHost(host, true, ev.clientX, ev.clientY);
        return;
      }
      if (currentHost && host !== currentHost && !pointerIsOn(currentHost) && !focusIsOn(currentHost)) {
        releaseHost(currentHost);
      }
      if (!host || host !== currentHost) return;
      lastClientX = ev.clientX;
      lastClientY = ev.clientY;
      placeFromPointer = true;
      pointerInside = true;
      moveVisibleTip(lastClientX, lastClientY);
    },
    true
  );

  document.addEventListener(
    'pointerdown',
    (ev) => {
      const select = selectForTip(ev.target);
      if (!select) return;
      const host = hostFromTarget(select);
      if (host) suppressHost(host);
    },
    true
  );

  document.addEventListener(
    'keydown',
    (ev) => {
      if (!keyOpensNativeList(ev)) return;
      const select = selectForTip(ev.target);
      if (!select) return;
      const host = hostFromTarget(select);
      if (host) suppressHost(host);
    },
    true
  );

  document.addEventListener(
    'change',
    (ev) => {
      const select = selectForTip(ev.target);
      if (!select) return;
      const host = hostFromTarget(select);
      if (host) suppressHost(host);
    },
    true
  );

  document.addEventListener(
    'focusin',
    (ev) => {
      const host = hostFromTarget(ev.target);
      if (!host) return;
      adoptHost(host, false, lastClientX, lastClientY);
    },
    true
  );

  document.addEventListener(
    'focusout',
    (ev) => {
      const host = hostFromTarget(ev.target);
      if (!host || relatedStaysInside(host, ev.relatedTarget)) return;
      if (pointerInside && currentHost === host) return;
      releaseHost(host);
    },
    true
  );
}
