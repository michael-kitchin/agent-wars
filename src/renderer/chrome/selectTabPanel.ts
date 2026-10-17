/**
 * One tab button and the panel it shows.
 *
 * Purpose: The console tabs, Tools and Model, and the new-game dialog share one switch.
 * When to use: Building the list passed to `selectTabPanel`.
 * Expected outcome: Both ids match elements already in the page.
 * Exceptions: None.
 */
export interface TabPanelBinding {
  /**
   * Id of the tab button.
   *
   * Contract: The element has `role="tab"`.
   * When to use: The button the player clicks.
   * Expected outcome: `aria-selected` becomes true only for the active tab.
   * Exceptions: None.
   */
  readonly tabId: string;
  /**
   * Id of the panel that tab shows.
   *
   * Contract: The element is a tab panel.
   * When to use: The panel shown when `tabId` is selected.
   * Expected outcome: The active panel loses `hidden` and gains `active`.
   * Exceptions: None.
   */
  readonly panelId: string;
}

/**
 * Shows one tab and hides the others.
 *
 * Purpose: Click handlers should not each repeat the selected and hidden attributes.
 * When to use: A tab click in the console rail, the new-game dialog, or the Tools and Model bar.
 * Expected outcome: The matching tab is selected and its panel is visible. A missing element is skipped.
 * Exceptions: None.
 */
export function selectTabPanel(activeTabId: string, tabs: readonly TabPanelBinding[]): void {
  for (const tab of tabs) {
    const selected = tab.tabId === activeTabId;
    const tabEl = document.getElementById(tab.tabId);
    const panelEl = document.getElementById(tab.panelId);
    tabEl?.setAttribute('aria-selected', selected ? 'true' : 'false');
    if (selected) {
      panelEl?.classList.add('active');
      panelEl?.removeAttribute('hidden');
    } else {
      panelEl?.classList.remove('active');
      panelEl?.setAttribute('hidden', '');
    }
  }
}
