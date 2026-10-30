/**
 * Renders the Hire panel and sends its orders.
 *
 * Purpose: The panel is a child of the popup mount, whether or not a Build tab is beside it.
 * When to use: From the build-or-hire wrapper, and again after a hire button succeeds.
 * Expected outcome: Funds, the raise and rehire sections, and the orders already placed.
 * Exceptions: A failed read is logged and shown as an empty view. A rejected order is a toast.
 */

import { getStrategicHexCode } from '../../shared/hexLlmCodeAssignment';
import type { HexHireView, HireMutationResult } from '../../shared/ipc/mercenaryTypes';
import type { HireableUnitType } from '../../shared/mercenaryRules';
import { formatHexNamingCaptionHtml, type HexNamingCaption } from '../../shared/hexNamingCaption';
import { resolutionPlaybackBlocksMapOrders } from '../../shared/mapOrderGestureGate';
import {
  CREDITS_LINE_LABEL,
  HIRE_ARRIVAL_NOTE,
  HIRE_BUTTON_LABEL,
  HIRE_FEES_LINE_LABEL,
  HIRE_FUNDS_WARNING,
  HIRE_ORDER_UPDATE_FAILED,
  HIRE_VIEW_FAILED,
  PENDING_HIRE_SECTION_TITLE,
  RAISE_CAPACITY_LABEL,
  RAISE_SECTION_TITLE,
  REHIRE_SECTION_TITLE,
  UPKEEP_LINE_LABEL,
  formatHireOptionLabel,
  formatHireOrderLabel,
  formatRaiseCapacityValue,
} from '../../shared/mercenaryRules';
import { setUnitNameContent } from '../core/unitOriginFlags';
import { rendererSharedState as S } from '../core/state';
import {
  hireCountTooltipText,
  hireRemoveTooltipText,
  hireSubmitTooltipText,
  hireTypeTooltipText,
} from '../chrome/hireTooltipText';
import { placeOpenBuildPopup } from '../chrome/placeAnchoredPopup';
import { syncQueueItemSelectTooltip } from '../chrome/syncQueueItemSelectTooltip';
import type { BuildHirePopupDeps } from './buildHirePopup';
import { createBuildCountInput, createBuildPopupCloseRow, escapeBuildPopupHtml, sanitizeBuildCountInputText } from './buildQueuePopupFormatting';

/**
 * The hire view and the hex's naming caption.
 *
 * Purpose: One fetch fills the panel.
 * When to use: The return of `fetchHirePanelData`.
 * Expected outcome: Either part is null when that read failed.
 * Exceptions: None.
 */
export interface HirePanelData {
  /**
   * The hex hire view.
   *
   * Contract: Null when the hex is missing or the read failed.
   * When to use: Every section below the caption.
   * Expected outcome: The IPC result.
   * Exceptions: None.
   */
  readonly view: HexHireView | null;
  /**
   * The hex's naming caption.
   *
   * Contract: Null when naming is unavailable.
   * When to use: The line under the close button.
   * Expected outcome: The naming tooltip line.
   * Exceptions: None.
   */
  readonly caption: HexNamingCaption | null;
}

/**
 * Loads the hire view and the hex name.
 *
 * Purpose: The wrapper waits for both before choosing tabs.
 * When to use: Once per open, and again after a successful hire button.
 * Expected outcome: Null for whichever read failed. The failure is logged.
 * Exceptions: None. A rejected promise becomes a null part.
 */
export async function fetchHirePanelData(h3Index: string): Promise<HirePanelData> {
  let view: HexHireView | null = null;
  let caption: HexNamingCaption | null = null;
  try {
    view = (await window.gameApi?.getHexHireView({ h3Index })) ?? null;
  } catch (err) {
    console.error('getHexHireView failed:', err);
  }
  try {
    if (window.gameApi?.getHexNamingTooltipLine) {
      caption = await window.gameApi.getHexNamingTooltipLine({ h3Index, resolution: 1 });
    }
  } catch (err) {
    console.error('getHexNamingTooltipLine failed:', err);
  }
  return { view, caption };
}

/**
 * Fills one hire panel.
 *
 * Purpose: Opening the panel and a successful button share this paint.
 * When to use: With data from `fetchHirePanelData`. The panel element is the `div.hire-panel`.
 * Expected outcome: The sections in order. A null view stops after the failure sentence.
 * Exceptions: None.
 */
export function renderHirePanel(
  panel: HTMLElement,
  h3Index: string,
  data: HirePanelData,
  deps: BuildHirePopupDeps
): void {
  panel.innerHTML = '';
  panel.appendChild(createBuildPopupCloseRow(deps.hideBuildPopup));
  appendCaption(panel, h3Index, data.caption);
  const view = data.view;
  if (!view) {
    panel.appendChild(note(HIRE_VIEW_FAILED));
    if (!panel.hidden) placeOpenBuildPopup();
    return;
  }
  appendFunds(panel, view);
  if (!view.hireAvailable && view.unavailableReason) panel.appendChild(note(view.unavailableReason));
  if (view.raise) appendRaise(panel, h3Index, view, deps);
  else if (view.raiseBlockedReason) panel.appendChild(note(view.raiseBlockedReason));
  if (view.rehireUnits.length > 0) appendRehires(panel, h3Index, view, deps);
  if (view.pendingOrders.length > 0) appendOrders(panel, h3Index, view, deps);
  panel.appendChild(note(HIRE_ARRIVAL_NOTE));
  if (!panel.hidden) placeOpenBuildPopup();
}

/**
 * The hex code and naming caption.
 *
 * Purpose: The hire panel names the hex the same way the build panel does.
 * When to use: After the close row.
 * Expected outcome: The code, the caption, or both, with a spacer. Nothing when neither exists.
 * Exceptions: None.
 */
function appendCaption(panel: HTMLElement, h3Index: string, caption: HexNamingCaption | null): void {
  const strategicCode = getStrategicHexCode(h3Index);
  const prefix = strategicCode ? `<strong>(${escapeBuildPopupHtml(strategicCode)})</strong> ` : '';
  const text = caption && caption.text.trim().length > 0 ? `${prefix}${formatHexNamingCaptionHtml(caption)}` : prefix;
  if (!text) return;
  const line = document.createElement('div');
  line.innerHTML = text;
  const spacer = document.createElement('div');
  spacer.style.height = '0.5em';
  panel.append(line, spacer);
}

/**
 * Credits, upkeep, fees, and the short-credits warning.
 *
 * Purpose: The panel uses the same labels as the top bar.
 * When to use: When a view was loaded.
 * Expected outcome: Three lines, the fee line only when fees are above 0, and the warning when credits are short.
 * Exceptions: None.
 */
function appendFunds(panel: HTMLElement, view: HexHireView): void {
  const funds = view.funds;
  panel.appendChild(fundLine(CREDITS_LINE_LABEL, String(funds.credits)));
  panel.appendChild(fundLine(UPKEEP_LINE_LABEL, `${funds.upkeepPerTurn} / turn`));
  if (funds.pendingHireFees > 0) panel.appendChild(fundLine(HIRE_FEES_LINE_LABEL, String(funds.pendingHireFees)));
  if (funds.credits < funds.upkeepPerTurn + funds.pendingHireFees) panel.appendChild(note(HIRE_FUNDS_WARNING, 'hire-funds-warning'));
}

/**
 * One labeled fund line.
 *
 * Purpose: The label is a named constant, not a new literal.
 * When to use: Credits, upkeep, and fees.
 * Expected outcome: A line whose strong text is the label.
 * Exceptions: None.
 */
function fundLine(label: string, value: string): HTMLDivElement {
  const line = document.createElement('div');
  line.innerHTML = `<strong>${label}:</strong> ${escapeBuildPopupHtml(value)}`;
  return line;
}

/**
 * A sentence in the build popup's note class, or the funds warning class.
 *
 * Purpose: Blocked reasons, the arrival note, and the funds warning share one element.
 * When to use: Any sentence that is not a control.
 * Expected outcome: A div with the given class.
 * Exceptions: None.
 */
function note(text: string, className = 'build-no-urban'): HTMLDivElement {
  const line = document.createElement('div');
  line.className = className;
  line.textContent = text;
  return line;
}

/**
 * The raise section.
 *
 * Purpose: The player picks a type and a count, then stores the order.
 * When to use: When `view.raise` is set.
 * Expected outcome: A head, the capacity line, and one row of controls.
 * Exceptions: None.
 */
function appendRaise(panel: HTMLElement, h3Index: string, view: HexHireView, deps: BuildHirePopupDeps): void {
  const raise = view.raise;
  if (!raise) return;
  const section = document.createElement('div');
  section.className = 'build-queue-section';
  section.appendChild(head(RAISE_SECTION_TITLE));
  const capacity = document.createElement('div');
  capacity.innerHTML = `<strong>${RAISE_CAPACITY_LABEL}:</strong> ${escapeBuildPopupHtml(formatRaiseCapacityValue(raise.capacityLeft, raise.capacityPerTurn))}`;
  const row = document.createElement('div');
  row.className = 'build-queue-row';
  const typeSelect = document.createElement('select');
  typeSelect.className = 'unit-select';
  for (const option of raise.options) {
    const choice = document.createElement('option');
    choice.value = option.unitType;
    choice.textContent = formatHireOptionLabel(option);
    typeSelect.appendChild(choice);
  }
  syncQueueItemSelectTooltip(typeSelect, hireTypeTooltipText);
  typeSelect.addEventListener('change', () => {
    syncQueueItemSelectTooltip(typeSelect, hireTypeTooltipText);
  });
  const countInput = createBuildCountInput(hireCountTooltipText, '1');
  countInput.addEventListener('input', () => {
    const raw = sanitizeBuildCountInputText(countInput.value);
    if (countInput.value !== raw) countInput.value = raw;
  });
  const button = hireButton();
  button.addEventListener('click', () => {
    const count = parseInt(sanitizeBuildCountInputText(countInput.value), 10);
    void submitHire(panel, h3Index, deps, () => window.gameApi!.placeHireOrder({
      kind: 'raise',
      h3Index,
      unitType: typeSelect.value as HireableUnitType,
      count,
    }));
  });
  row.append(typeSelect, countInput, button);
  section.append(capacity, row);
  panel.appendChild(section);
}

/**
 * The Neutral units section.
 *
 * Purpose: Each visible candidate can be rehired.
 * When to use: When the view lists at least one.
 * Expected outcome: One row per unit, with its name, fee, and a Hire button.
 * Exceptions: None.
 */
function appendRehires(panel: HTMLElement, h3Index: string, view: HexHireView, deps: BuildHirePopupDeps): void {
  const section = document.createElement('div');
  section.className = 'build-queue-section';
  section.appendChild(head(REHIRE_SECTION_TITLE));
  for (const unit of view.rehireUnits) {
    const row = document.createElement('div');
    row.className = 'build-queue-row';
    const label = document.createElement('span');
    label.className = 'unit-label';
    setUnitNameContent(label, unit.unitId, unit.displayName);
    const fee = document.createElement('span');
    fee.textContent = String(unit.fee);
    const button = hireButton();
    button.addEventListener('click', () => {
      void submitHire(panel, h3Index, deps, () => window.gameApi!.placeHireOrder({ kind: 'rehire', unitId: unit.unitId }));
    });
    row.append(label, fee, button);
    section.appendChild(row);
  }
  panel.appendChild(section);
}

/**
 * Orders already placed on this hex.
 *
 * Purpose: The player can remove an order before Ready.
 * When to use: When the view lists at least one.
 * Expected outcome: One row per order.
 * Exceptions: None.
 */
function appendOrders(panel: HTMLElement, h3Index: string, view: HexHireView, deps: BuildHirePopupDeps): void {
  const section = document.createElement('div');
  section.className = 'build-queue-section';
  section.appendChild(head(PENDING_HIRE_SECTION_TITLE));
  for (const order of view.pendingOrders) {
    const row = document.createElement('div');
    row.className = 'build-queue-row';
    const label = document.createElement('span');
    label.textContent = formatHireOrderLabel(order);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'unit-select';
    button.textContent = 'x';
    button.setAttribute('data-control-tooltip', hireRemoveTooltipText);
    button.addEventListener('click', () => {
      void submitHire(panel, h3Index, deps, () => window.gameApi!.removeHireOrder({ orderId: order.orderId }));
    });
    row.append(label, button);
    section.appendChild(row);
  }
  panel.appendChild(section);
}

/**
 * A section title.
 *
 * Purpose: Raise, Neutral units, and orders use the build panel's heading classes.
 * When to use: The start of those sections.
 * Expected outcome: A head whose text is the title.
 * Exceptions: None.
 */
function head(title: string): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'build-queue-head';
  const text = document.createElement('span');
  text.className = 'build-queue-title';
  text.textContent = title;
  row.appendChild(text);
  return row;
}

/**
 * A Hire button.
 *
 * Purpose: Raise and rehire share the label and the tip.
 * When to use: Each row that places an order.
 * Expected outcome: A button labeled Hire.
 * Exceptions: None.
 */
function hireButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'unit-select';
  button.textContent = HIRE_BUTTON_LABEL;
  button.setAttribute('data-control-tooltip', hireSubmitTooltipText);
  return button;
}

/**
 * Places or removes one order, then repaints this panel.
 *
 * Purpose: A slow reply must not paint into a different hex or a closed popup.
 * When to use: Every Hire button and every remove button.
 * Expected outcome: A toast on failure. On success, a fresh panel in the same element.
 * Exceptions: None. A rejected IPC call becomes the failure toast.
 */
async function submitHire(
  panel: HTMLElement,
  h3Index: string,
  deps: BuildHirePopupDeps,
  mutate: () => Promise<HireMutationResult>
): Promise<void> {
  if (resolutionPlaybackBlocksMapOrders(S.resolutionMoveAnimation)) return;
  if (!window.gameApi?.placeHireOrder || !window.gameApi.removeHireOrder) return;
  let result: HireMutationResult;
  try {
    result = await mutate();
  } catch (err) {
    console.error('hire order failed:', err);
    if (S.buildPopupHexH3 !== h3Index || !panel.isConnected) return;
    deps.showMapToast(HIRE_ORDER_UPDATE_FAILED, { isError: true });
    return;
  }
  if (S.buildPopupHexH3 !== h3Index || !panel.isConnected) return;
  if (!result.success) {
    deps.showMapToast(result.reason ?? HIRE_ORDER_UPDATE_FAILED, { isError: true });
    return;
  }
  await deps.refreshGameStateAfterBuildQueueChange();
  if (S.buildPopupHexH3 !== h3Index || !panel.isConnected) return;
  const data = await fetchHirePanelData(h3Index);
  if (S.buildPopupHexH3 !== h3Index || !panel.isConnected) return;
  renderHirePanel(panel, h3Index, data, deps);
}
