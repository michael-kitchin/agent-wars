/**
 * Chooses a Build panel, a Hire panel, or both, for one hex.
 *
 * Purpose: A city the human can build and hire shows tabs. A hire-only hex shows Hire. Several selected hexes stay build-only.
 * When to use: `showBuildPopup` and `refreshBuildPopupIfOpen`. The Add button still renders the Build panel into its own mount.
 * Expected outcome: The mount shows the panel that matches the hex. A stale reply does not paint.
 * Exceptions: None. A failed hire read shows the failure sentence.
 */

import { BUILD_TAB_LABEL, HIRE_TAB_LABEL, HIRE_VIEW_FAILED } from '../../shared/mercenaryRules';
import { buildPopupCloseTooltipText, buildTabTooltipText, hireTabTooltipText } from '../../shared/popupControlTooltipText';
import { placeOpenBuildPopup } from '../chrome/placeAnchoredPopup';
import { rendererSharedState as S } from '../core/state';
import { isHumanBuildEntryHexIndex } from './productionOverlayHelpers';
import { fetchHirePanelData, renderHirePanel } from './hirePanel';

/**
 * What the hire wrapper needs from the build popup.
 *
 * Purpose: The wrapper does not import the build popup, so the two modules do not call each other in a cycle.
 * When to use: Built once inside the build-popup controller.
 * Expected outcome: The Build panel renderer, close, refresh, and toast.
 * Exceptions: None.
 */
export interface BuildHirePopupDeps {
  /**
   * Renders today's Build panel into a mount.
   *
   * Contract: The same function the Add button uses.
   * When to use: A build-only popup and the Build tab.
   * Expected outcome: The mount shows the build queue.
   * Exceptions: None.
   */
  readonly renderBuildPanel: (mount: HTMLElement, h3Index: string) => Promise<void>;
  /**
   * Closes the popup.
   *
   * Contract: The build popup's close.
   * When to use: The hire panel's close button.
   * Expected outcome: The popup is hidden.
   * Exceptions: None.
   */
  readonly hideBuildPopup: () => void;
  /**
   * Reloads the match after an order changes.
   *
   * Contract: The same refresh a build-queue edit uses.
   * When to use: After a hire order is stored or removed.
   * Expected outcome: The top bar and markers match the database.
   * Exceptions: Rejects when the snapshot read fails.
   */
  readonly refreshGameStateAfterBuildQueueChange: () => Promise<void>;
  /**
   * Shows a map toast.
   *
   * Contract: `isError` marks a rejection.
   * When to use: When a hire order is rejected.
   * Expected outcome: The sentence is visible.
   * Exceptions: None.
   */
  readonly showMapToast: (message: string, options?: { isError?: boolean }) => void;
}

/** Hex whose tab choice is remembered, so a different hex opens on Build. */
let tabHex: string | null = null;

/** Tab last chosen for `tabHex`. */
let tabChoice: 'build' | 'hire' = 'build';

/** Replies from an older open are ignored. */
let hireRequestSeq = 0;

/**
 * Fills the popup mount with Build, Hire, or both.
 *
 * Purpose: One entry for opening and refreshing the popup.
 * When to use: In place of rendering the build queue straight into the popup body.
 * Expected outcome: See the module comment. A multi-hex selection never shows Hire.
 * Exceptions: None.
 */
export async function renderBuildOrHirePopupIntoMount(
  mount: HTMLElement,
  h3Index: string,
  deps: BuildHirePopupDeps
): Promise<void> {
  const popup = document.getElementById('build-popup');
  if (S.selectedBuildHexH3s.length >= 2) {
    popup?.classList.remove('build-popup-wide');
    await deps.renderBuildPanel(mount, h3Index);
    return;
  }
  const requestSeq = ++hireRequestSeq;
  const data = await fetchHirePanelData(h3Index);
  if (S.buildPopupHexH3 !== h3Index || requestSeq !== hireRequestSeq) return;
  if (isHumanBuildEntryHexIndex(S.gameState, h3Index) && (data.view == null || data.view.hireAvailable === false)) {
    popup?.classList.remove('build-popup-wide');
    await deps.renderBuildPanel(mount, h3Index);
    return;
  }
  if (!isHumanBuildEntryHexIndex(S.gameState, h3Index)) {
    mount.innerHTML = '';
    popup?.classList.add('build-popup-wide');
    const panel = document.createElement('div');
    panel.className = 'hire-panel';
    mount.appendChild(panel);
    if (data.view == null) {
      renderHireFailure(panel, deps);
      placeOpenBuildPopup();
      return;
    }
    renderHirePanel(panel, h3Index, data, deps);
    return;
  }
  if (tabHex !== h3Index) {
    tabHex = h3Index;
    tabChoice = 'build';
  }
  mount.innerHTML = '';
  popup?.classList.add('build-popup-wide');
  const tabBar = document.createElement('div');
  tabBar.className = 'build-popup-tab-bar';
  tabBar.setAttribute('role', 'tablist');
  const buildTab = tabButton(BUILD_TAB_LABEL);
  const hireTab = tabButton(HIRE_TAB_LABEL);
  tabBar.append(buildTab, hireTab);
  const buildPanel = document.createElement('div');
  buildPanel.setAttribute('role', 'tabpanel');
  const hirePanel = document.createElement('div');
  hirePanel.className = 'hire-panel';
  hirePanel.setAttribute('role', 'tabpanel');
  mount.append(tabBar, buildPanel, hirePanel);
  const show = (choice: 'build' | 'hire'): void => {
    tabChoice = choice;
    tabHex = h3Index;
    buildTab.setAttribute('aria-selected', choice === 'build' ? 'true' : 'false');
    hireTab.setAttribute('aria-selected', choice === 'hire' ? 'true' : 'false');
    buildPanel.hidden = choice !== 'build';
    hirePanel.hidden = choice !== 'hire';
  };
  buildTab.addEventListener('click', () => {
    show('build');
    placeOpenBuildPopup();
  });
  hireTab.addEventListener('click', () => {
    show('hire');
    placeOpenBuildPopup();
  });
  show(tabChoice);
  renderHirePanel(hirePanel, h3Index, data, deps);
  await deps.renderBuildPanel(buildPanel, h3Index);
}

/**
 * A tab button.
 *
 * Purpose: Build and Hire use the same button shape.
 * When to use: The tab bar.
 * Expected outcome: A tab whose accessible name is the label, with the Build or Hire control tip.
 * Exceptions: None.
 */
function tabButton(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('role', 'tab');
  button.textContent = label;
  if (label === BUILD_TAB_LABEL) button.setAttribute('data-control-tooltip', buildTabTooltipText);
  else if (label === HIRE_TAB_LABEL) button.setAttribute('data-control-tooltip', hireTabTooltipText);
  return button;
}

/**
 * The failure row when a hire-only hex has no view.
 *
 * Purpose: The player can close the popup and see why it is empty.
 * When to use: A null hire view on a hex that is not a build hex.
 * Expected outcome: A close button, with its close tip, and `HIRE_VIEW_FAILED`.
 * Exceptions: None.
 */
function renderHireFailure(panel: HTMLElement, deps: BuildHirePopupDeps): void {
  const closeRow = document.createElement('div');
  closeRow.className = 'build-popup-close-row';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'unit-select build-close-btn';
  closeBtn.textContent = '×';
  closeBtn.setAttribute('data-control-tooltip', buildPopupCloseTooltipText);
  closeBtn.addEventListener('click', () => deps.hideBuildPopup());
  closeRow.appendChild(closeBtn);
  const note = document.createElement('div');
  note.className = 'build-no-urban';
  note.textContent = HIRE_VIEW_FAILED;
  panel.append(closeRow, note);
}
