/**
 * Select and Transport tabs on the stack callout.
 *
 * Purpose: Keeps unit selection and ship or air cargo apart, the way the build popup keeps Build and Hire apart.
 * When to use: `showStackCallout` after it rebuilds the unit rows, and `renderSealiftSection` once it knows whether the hex has cargo slots.
 * Expected outcome: With cargo slots, a tab bar and the wide width (`.stack-callout-wide`), showing the remembered tab. Without them, no tab bar, the plain width, and the unit rows.
 * Exceptions: None.
 */

import {
  nextStackCalloutTab,
  SELECT_TAB_LABEL,
  TRANSPORT_TAB_LABEL,
  type StackCalloutTab,
} from '../../shared/stackCalloutTabs';
import { stackSelectTabTooltipText, stackTransportTabTooltipText } from '../../shared/popupControlTooltipText';
import { placeOpenStackCallout } from '../chrome/placeAnchoredPopup';

/**
 * The hex and tab of the player's last tab choice.
 *
 * Purpose: Reopening or refreshing the callout on that hex keeps the tab. Another hex starts on Select.
 * When to use: Read and written only in this module.
 * Expected outcome: `h3Index` is null until a callout has shown tabs.
 * Exceptions: None.
 */
let remembered: { h3Index: string | null; tab: StackCalloutTab } = { h3Index: null, tab: 'select' };

/**
 * The callout parts that belong to the Select tab.
 *
 * Purpose: The All row and the unit list sit directly in the callout, so the tabs hide them by element.
 * When to use: Applying a tab.
 * Expected outcome: The action row, when present, and `#stack-callout-list`.
 * Exceptions: None.
 */
function selectParts(calloutEl: HTMLElement): HTMLElement[] {
  return [...calloutEl.querySelectorAll<HTMLElement>('.stack-callout-actions, #stack-callout-list')];
}

/**
 * Shows one tab's parts and hides the other's.
 *
 * Purpose: One place sets the tab state, the hidden parts, and the selected tab.
 * When to use: Mounting the tabs, a tab click, and a rebuild of the unit rows on the same hex.
 * Expected outcome: The tab buttons' `aria-selected` and the parts' `hidden` match `tab`.
 * Exceptions: None.
 */
function applyTab(calloutEl: HTMLElement, tab: StackCalloutTab): void {
  for (const part of selectParts(calloutEl)) part.hidden = tab !== 'select';
  calloutEl.querySelectorAll<HTMLElement>('.stack-sealift-section').forEach((section) => {
    section.hidden = tab !== 'transport';
  });
  calloutEl.querySelectorAll<HTMLButtonElement>('.stack-callout-tab-bar button').forEach((button) => {
    button.setAttribute('aria-selected', button.dataset.tab === tab ? 'true' : 'false');
  });
}

/**
 * Removes the tab bar and shows the unit rows.
 *
 * Purpose: A hex with no cargo slots opens the Select content alone, at the plain width.
 * When to use: When the Transport section is absent, or the tab bar belongs to another hex.
 * Expected outcome: No `.stack-callout-tab-bar`, no `.stack-callout-wide`, and the Select parts visible.
 * Exceptions: None.
 */
function removeTabs(calloutEl: HTMLElement): void {
  calloutEl.querySelectorAll('.stack-callout-tab-bar').forEach((bar) => bar.remove());
  calloutEl.classList.remove('stack-callout-wide');
  for (const part of selectParts(calloutEl)) part.hidden = false;
}

/**
 * One tab button.
 *
 * Purpose: Both tabs use the build popup's tab shape and carry their control tip.
 * When to use: Building the tab bar.
 * Expected outcome: A `role="tab"` button whose click shows its tab and places the callout again.
 * Exceptions: None.
 */
function tabButton(calloutEl: HTMLElement, tab: StackCalloutTab): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('role', 'tab');
  button.dataset.tab = tab;
  button.textContent = tab === 'select' ? SELECT_TAB_LABEL : TRANSPORT_TAB_LABEL;
  button.setAttribute('data-control-tooltip', tab === 'select' ? stackSelectTabTooltipText : stackTransportTabTooltipText);
  button.addEventListener('click', () => {
    remembered = { h3Index: calloutEl.getAttribute('data-h3-index'), tab };
    applyTab(calloutEl, tab);
    placeOpenStackCallout();
  });
  return button;
}

/**
 * Adds or removes the tabs after the Transport section is known.
 *
 * Purpose: Tabs appear only when the hex has ship or air unit cargo slots, as Build and Hire appear only when the hex can do both.
 * When to use: Every path through `renderSealiftSection` that adds or removes the section.
 * Expected outcome: With `hasTransport`, a tab bar at the top of the callout for its hex, the wide width, and the remembered tab for that hex shown. Without it, `removeTabs`.
 * Exceptions: None.
 */
export function syncStackCalloutTabs(calloutEl: HTMLElement, hasTransport: boolean): void {
  const h3Index = calloutEl.getAttribute('data-h3-index') ?? '';
  if (!hasTransport || h3Index === '') {
    removeTabs(calloutEl);
    return;
  }
  const tab = nextStackCalloutTab({ remembered, h3Index });
  remembered = { h3Index, tab };
  let bar = calloutEl.querySelector<HTMLElement>('.stack-callout-tab-bar');
  if (bar && bar.dataset.h3Index !== h3Index) {
    bar.remove();
    bar = null;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'stack-callout-tab-bar';
    bar.setAttribute('role', 'tablist');
    bar.dataset.h3Index = h3Index;
    bar.append(tabButton(calloutEl, 'select'), tabButton(calloutEl, 'transport'));
  }
  calloutEl.prepend(bar);
  calloutEl.classList.add('stack-callout-wide');
  applyTab(calloutEl, tab);
}

/**
 * Keeps the shown tab after the unit rows are rebuilt.
 *
 * Purpose: A selection or cargo change rebuilds the All row and the list while the Transport tab may be showing. They must not flash into view before the cargo slots reload.
 * When to use: End of `showStackCallout`, after the rows are built and before the callout is placed.
 * Expected outcome: The tab bar for the same hex stays and its tab is applied. A tab bar for another hex is removed, and the unit rows shown, until `syncStackCalloutTabs` decides again. The previous Transport section is left for `renderSealiftSection` to replace or remove.
 * Exceptions: None.
 */
export function keepStackCalloutTab(calloutEl: HTMLElement): void {
  const bar = calloutEl.querySelector<HTMLElement>('.stack-callout-tab-bar');
  const h3Index = calloutEl.getAttribute('data-h3-index');
  if (!bar) return;
  if (bar.dataset.h3Index !== h3Index || h3Index === null) {
    removeTabs(calloutEl);
    return;
  }
  applyTab(calloutEl, nextStackCalloutTab({ remembered, h3Index }));
}
