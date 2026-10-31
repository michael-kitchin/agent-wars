/**
 * Renders the Hire panel and sends its orders.
 *
 * Purpose: The panel is a child of the popup mount, whether or not a Build tab is beside it.
 * When to use: From the build-or-hire wrapper, and again after a hire button succeeds.
 * Expected outcome: The hex caption, the tech line, the labeled amounts, the raise controls, the rehire rows, and the orders already placed.
 * Exceptions: A failed read is logged and shown as an empty view. A rejected order is a toast.
 */

import { formatProducedUnitTechLineHtml } from '../../shared/featureIconHtml';
import { getStrategicHexCode } from '../../shared/hexLlmCodeAssignment';
import type { HexHireView, HireMutationResult } from '../../shared/ipc/mercenaryTypes';
import {
  HIRE_BUTTON_LABEL,
  HIRE_COUNT_MAX,
  HIRE_COUNT_MIN,
  HIRE_ORDER_UPDATE_FAILED,
  HIRE_VIEW_FAILED,
  PENDING_HIRE_SECTION_TITLE,
  RAISE_CAPACITY_LABEL,
  RAISE_REASON_CAPACITY_USED,
  RAISE_REASON_OCCUPIED,
  REHIRE_SECTION_TITLE,
  formatHireOptionLabel,
  formatHireOrderLabel,
  formatRaiseCapacityValue,
  hireShortageLabel,
  type HireableUnitType,
} from '../../shared/mercenaryRules';
import { formatHexNamingCaptionHtml, type HexNamingCaption } from '../../shared/hexNamingCaption';
import { resolutionPlaybackBlocksMapOrders } from '../../shared/mapOrderGestureGate';
import { baselineUrbanHexCountForStrategicHex } from '../rendererTacticalHydration';
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
 * Expected outcome: The sections in order. A shortage sentence and the Hire Queue heading each have a 0.5em gap. A null view stops after the failure sentence.
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
  appendTechLine(panel, h3Index);
  const view = data.view;
  if (!view) {
    panel.appendChild(note(HIRE_VIEW_FAILED));
    if (!panel.hidden) placeOpenBuildPopup();
    return;
  }
  appendFunds(panel, view);
  if (view.raiseShortage) appendShortage(panel, view.raiseShortage);
  const unavailable = view.hireAvailable ? null : visibleBlockedReason(view.unavailableReason);
  if (unavailable) panel.appendChild(note(unavailable));
  if (view.raise) appendRaise(panel, h3Index, view, deps);
  else if (!view.raiseShortage) {
    const raiseBlocked = visibleBlockedReason(view.raiseBlockedReason);
    if (raiseBlocked && raiseBlocked !== unavailable) panel.appendChild(note(raiseBlocked));
  }
  if (view.rehireUnits.length > 0) appendRehires(panel, h3Index, view, deps);
  if (view.pendingOrders.length > 0) appendOrders(panel, h3Index, view, deps);
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
  panel.append(line, spacer());
}

/**
 * The same tech line the build panel shows.
 *
 * Purpose: Hiring on a city uses that city's production tier.
 * When to use: After the caption, before the labeled amounts.
 * Expected outcome: A Tech line and a spacer when the match has a tech bonus and the hex can produce. Nothing otherwise.
 * Exceptions: None.
 */
function appendTechLine(panel: HTMLElement, h3Index: string): void {
  const techLineHtml = formatProducedUnitTechLineHtml({
    techBonusEnabled: S.gameState?.techBonusEnabled === true,
    baselineUrbanHexCount: baselineUrbanHexCountForStrategicHex(h3Index),
  });
  if (!techLineHtml) return;
  const techLine = document.createElement('div');
  techLine.innerHTML = techLineHtml;
  panel.append(techLine, spacer());
}

/**
 * Remaining raise capacity.
 *
 * Purpose: The labeled amount uses the same gap the build panel uses between its lines.
 * When to use: When a view was loaded.
 * Expected outcome: Production (Hire) when raising is available, followed by a spacer. Nothing when the raise select is hidden.
 * Exceptions: None.
 */
function appendFunds(panel: HTMLElement, view: HexHireView): void {
  const raise = view.raise;
  if (!raise) return;
  appendLabeledAmount(panel, RAISE_CAPACITY_LABEL, formatRaiseCapacityValue(raise.capacityLeft));
}

/**
 * One labeled amount and the spacer under it.
 *
 * Purpose: Production (Hire) uses the build panel's gap.
 * When to use: From `appendFunds`.
 * Expected outcome: A strong label, the value, and a 0.5em spacer.
 * Exceptions: None.
 */
function appendLabeledAmount(panel: HTMLElement, label: string, value: string): void {
  panel.append(fundLine(label, value), spacer());
}

/**
 * The empty gap the build panel puts between its information lines.
 *
 * Purpose: Hire information uses the same 0.5em gap.
 * When to use: After a caption, a tech line, a labeled amount, a shortage sentence, or a hire-queue row.
 * Expected outcome: A div whose height is 0.5em.
 * Exceptions: None.
 */
function spacer(): HTMLDivElement {
  const gap = document.createElement('div');
  gap.style.height = '0.5em';
  return gap;
}

/**
 * Whether the panel already ends with the hire gap.
 *
 * Purpose: A shortage line already leaves that gap, and the queue must not add a second one.
 * When to use: Before the Hire Queue heading.
 * Expected outcome: True when the last element is an empty 0.5em spacer.
 * Exceptions: None.
 */
function endsWithSpacer(panel: HTMLElement): boolean {
  const last = panel.lastElementChild;
  return last instanceof HTMLElement && last.style.height === '0.5em' && last.childNodes.length === 0;
}

/**
 * One labeled fund line.
 *
 * Purpose: The label is a named constant, not a new literal.
 * When to use: Production (Hire).
 * Expected outcome: A line whose strong text is the label.
 * Exceptions: None.
 */
function fundLine(label: string, value: string): HTMLDivElement {
  const line = document.createElement('div');
  line.innerHTML = `<strong>${label}:</strong> ${escapeBuildPopupHtml(value)}`;
  return line;
}

/**
 * A blocked sentence the Hire tab still shows.
 *
 * Purpose: The capacity-used sentence is replaced by the shortage label, and the occupied sentence is not a Hire-tab label.
 * When to use: Before appending `unavailableReason` or `raiseBlockedReason`.
 * Expected outcome: The sentence, or null when it is missing, the capacity-used sentence, or the occupied sentence.
 * Exceptions: None.
 */
function visibleBlockedReason(text: string | null): string | null {
  if (!text || text === RAISE_REASON_CAPACITY_USED || text === RAISE_REASON_OCCUPIED) return null;
  return text;
}

/**
 * A sentence in the build popup's note class, or the funds warning class.
 *
 * Purpose: Blocked reasons and the funds warning share one element.
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
 * Shows one shortage sentence, or nothing when the selected raise fits.
 *
 * Purpose: The Hire tab names the shortage without a second server read.
 * When to use: On the panel when the raise row is hidden, or on the host above the controls when a Hire click rejects the typed count.
 * Expected outcome: A warning div and a 0.5em spacer, or no change when `sentence` is null.
 * Exceptions: None.
 */
function appendShortage(panel: HTMLElement, sentence: string | null): void {
  if (!sentence) return;
  panel.append(note(sentence, 'hire-funds-warning'), spacer());
}

/**
 * The count the Hire button would submit.
 *
 * Purpose: The Hire click uses the same count the order will store.
 * When to use: When the player clicks Hire on the raise row.
 * Expected outcome: An integer from 1 to 99, or null when the field is not one.
 * Exceptions: None.
 */
function selectedHireCount(countText: string): number | null {
  const raw = sanitizeBuildCountInputText(countText);
  const count = parseInt(raw, 10);
  if (!Number.isInteger(count) || count < HIRE_COUNT_MIN || count > HIRE_COUNT_MAX) return null;
  return count;
}

/**
 * The raise section.
 *
 * Purpose: The player picks a type and a count, then stores the order when that count fits.
 * When to use: When `view.raise` is set.
 * Expected outcome: One row of controls, with no section heading. A count that does not fit paints the shortage sentence above the row and does not place the order. Changing the type or the count clears that sentence.
 * Exceptions: None.
 */
function appendRaise(panel: HTMLElement, h3Index: string, view: HexHireView, deps: BuildHirePopupDeps): void {
  const raise = view.raise;
  if (!raise) return;
  const shortage = document.createElement('div');
  const section = document.createElement('div');
  section.className = 'build-queue-section';
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
  const countInput = createBuildCountInput(hireCountTooltipText, '1');
  syncQueueItemSelectTooltip(typeSelect, hireTypeTooltipText);
  typeSelect.addEventListener('change', () => {
    syncQueueItemSelectTooltip(typeSelect, hireTypeTooltipText);
    shortage.replaceChildren();
  });
  countInput.addEventListener('input', () => {
    const raw = sanitizeBuildCountInputText(countInput.value);
    if (countInput.value !== raw) countInput.value = raw;
    shortage.replaceChildren();
  });
  const button = hireButton();
  button.addEventListener('click', () => {
    const count = selectedHireCount(countInput.value);
    const option = raise.options.find((row) => row.unitType === typeSelect.value);
    if (count == null || !option) return;
    const label = hireShortageLabel(view.funds.credits, option.fee * count, option.unitCost * count, raise.capacityLeft);
    if (label) {
      shortage.replaceChildren();
      appendShortage(shortage, label);
      return;
    }
    void submitHire(panel, h3Index, deps, () => window.gameApi!.placeHireOrder({
      kind: 'raise',
      h3Index,
      unitType: typeSelect.value as HireableUnitType,
      count,
    }));
  });
  row.append(typeSelect, countInput, button);
  section.appendChild(row);
  panel.append(shortage, section);
}

/**
 * The Neutral units section.
 *
 * Purpose: Each visible candidate can be rehired.
 * When to use: When the view lists at least one.
 * Expected outcome: One row per unit. The label is the origin flag and `formatHireOrderLabel` for a rehire, the same phrase and flag the Hire Queue uses for that unit. A Hire button follows.
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
    setUnitNameContent(label, unit.unitId, formatHireOrderLabel({
      kind: 'rehire',
      unitType: unit.unitType,
      count: 1,
      displayName: unit.displayName,
      fee: unit.fee,
    }));
    const button = hireButton();
    button.addEventListener('click', () => {
      void submitHire(panel, h3Index, deps, () => window.gameApi!.placeHireOrder({ kind: 'rehire', unitId: unit.unitId }));
    });
    row.append(label, button);
    section.appendChild(row);
  }
  panel.appendChild(section);
}

/**
 * Orders already placed on this hex.
 *
 * Purpose: The player can remove an order before Ready.
 * When to use: When the view lists at least one.
 * Expected outcome: One 0.5em gap above the heading, then one row per order, then a 0.5em gap after each row. The gap above is skipped when the panel already ends with one. A rehire row starts with that unit's origin flag. A raise row is text only.
 * Exceptions: None.
 */
function appendOrders(panel: HTMLElement, h3Index: string, view: HexHireView, deps: BuildHirePopupDeps): void {
  if (!endsWithSpacer(panel)) panel.appendChild(spacer());
  const section = document.createElement('div');
  section.className = 'build-queue-section hire-orders';
  section.appendChild(head(PENDING_HIRE_SECTION_TITLE));
  for (const order of view.pendingOrders) {
    const row = document.createElement('div');
    row.className = 'build-queue-row';
    const label = document.createElement('span');
    const text = formatHireOrderLabel(order);
    if (order.kind === 'rehire' && order.unitId) {
      label.className = 'unit-label';
      setUnitNameContent(label, order.unitId, text);
    } else {
      label.textContent = text;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'unit-select';
    button.textContent = 'x';
    button.setAttribute('data-control-tooltip', hireRemoveTooltipText);
    button.addEventListener('click', () => {
      void submitHire(panel, h3Index, deps, () => window.gameApi!.removeHireOrder({ orderId: order.orderId }));
    });
    row.append(label, button);
    section.append(row, spacer());
  }
  panel.appendChild(section);
}

/**
 * A section title.
 *
 * Purpose: Neutral units and orders use the build panel's heading classes.
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
