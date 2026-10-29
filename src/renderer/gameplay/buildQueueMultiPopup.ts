import { formatSelectedHexTechLineHtml } from '../../shared/featureIconHtml';
import { ALL_BUILD_QUEUE_ITEM_TYPES, type BuildQueueItemType, type HexBuildQueueSnapshot } from '../../shared/ipcTypes';
import { resolutionPlaybackBlocksMapOrders } from '../../shared/mapOrderGestureGate';
import { estimateTurnsToCompleteQueuedProduction, sumQueuedProductionCost } from '../../shared/productionConfig';
import { UNIT_SELECT_GLYPH } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import { baselineUrbanHexCountForStrategicHex } from '../rendererTacticalHydration';
import {
  appendKeepBuildingCheckbox,
  areAllKeepBuildingArmed,
  canArmKeepBuildingForAll,
} from './buildQueueKeepBuilding';
import {
  multiBuildAddTooltipText,
  multiBuildCountTooltipText,
  multiBuildTypeTooltipText,
  multiKeepBuildingTooltipText,
} from '../chrome/controlTooltipText';
import {
  buildQueueTemplateFromSnapshot,
  countEligibleBuildHexes,
  createBuildQueueTemplateRow,
  filterTemplateForBuildHex,
  formatBuildUnitTypeOptionLabel,
  formatSelectedBuildHexCodesHtml,
  templateEntriesForTurnEstimate,
  unionAvailableBuildUnitTypes,
  type BuildQueueTemplateRow,
} from './buildQueueMultiSelect';
import { sanitizeBuildCountInputText } from './buildQueuePopupFormatting';

/**
 * Result of writing the shared build-queue template to selected hexes.
 *
 * Purpose: Tells the editor whether the edited template can stay, or which saved queue to put back.
 * When to use: The return value of a multi-hex template apply.
 * Expected outcome: `{ ok: true }` after a successful apply, including a silent eligibility skip. `{ ok: false, anyHexWritten: false }` when nothing was written. `{ ok: false, anyHexWritten: true }` when at least one hex was written and the apply still failed.
 * Exceptions: None.
 */
export type BuildQueueTemplateApplyResult = { ok: true } | { ok: false; anyHexWritten: boolean };

/**
 * Dependencies that keep multi-popup rendering independent from popup lifecycle and mutation policy.
 */
export interface MultiBuildQueueRenderDeps {
  /**
   * Mount element owned by the existing build popup.
   *
   * Contract: Must remain attached for the duration of one render.
   * When to use: Supplying the body that receives multi-hex queue controls.
   * Expected outcome: Existing body content is replaced by current multi-selection content.
   * Exceptions: None.
   */
  mount: HTMLElement;
  /**
   * Current popup anchor hex used to reject stale async renders.
   *
   * Contract: Must match renderer `buildPopupHexH3` for content to publish.
   * When to use: Every multi-popup render request.
   * Expected outcome: Outdated anchor renders are discarded.
   * Exceptions: None.
   */
  h3Index: string;
  /**
   * Closes the popup and clears the selected build-hex set.
   *
   * Contract: Performs the complete popup lifecycle cleanup.
   * When to use: Multi-popup close control.
   * Expected outcome: Popup, template, selection, and button chrome are cleared.
   * Exceptions: None.
   */
  hideBuildPopup: () => void;
  /**
   * Applies the current renderer template to the requested selected hexes.
   *
   * Contract: Uses authoritative best-effort backend filtering and reports hard errors.
   * When to use: Every multi-row add, update, or remove.
   * Expected outcome: `{ ok: true }` when the edited template should stay. `{ ok: false, anyHexWritten: false }` when the pre-edit copy should return. `{ ok: false, anyHexWritten: true }` when the template should be reloaded from the first selected hex.
   * Exceptions: Playback and a missing batch API resolve `{ ok: false, anyHexWritten: false }` without a toast. Transport and hard domain failures toast inside the apply implementation.
   */
  applyTemplate: (h3Indexes: string[]) => Promise<BuildQueueTemplateApplyResult>;
  /**
   * Arms or clears Keep building on all currently selected build hexes.
   *
   * Contract: Best-effort backend write; returns false after handled failures.
   * When to use: Multi-hex Keep building checkbox changes.
   * Expected outcome: Standing orders updated for every selected hex that can apply.
   * Exceptions: Resolves false after transport or domain failures.
   */
  setKeepBuilding: (keepBuilding: boolean) => Promise<boolean>;
}

/**
 * Loads authoritative snapshots for selected build hexes in selection order.
 *
 * Purpose: Supplies eligibility, stored points, and rates for multi-popup rendering.
 * When to use: At the start of each asynchronous multi-popup render.
 * Expected outcome: Successfully loaded snapshots in input order.
 * Exceptions: Failed reads are logged and omitted.
 */
async function loadSelectedBuildSnapshots(h3Indexes: string[]): Promise<HexBuildQueueSnapshot[]> {
  if (!window.gameApi?.getHexBuildQueue) return [];
  const snapshots = await Promise.all(
    h3Indexes.map(async (h3Index) => {
      try {
        return await window.gameApi!.getHexBuildQueue({ h3Index });
      } catch (err) {
        console.error('getHexBuildQueue failed:', { h3Index, err });
        return null;
      }
    })
  );
  return snapshots.filter((snapshot): snapshot is HexBuildQueueSnapshot => snapshot !== null);
}

/**
 * Copies each template row so a later edit cannot change the saved rows.
 *
 * Purpose: The pre-edit template must stay intact when the live template is replaced.
 * When to use: Immediately before an add, type change, count change, or row remove assigns `buildQueueTemplate`.
 * Expected outcome: A new array of new row objects with the same keys, types, and counts.
 * Exceptions: None.
 */
function copyBuildQueueTemplate(template: BuildQueueTemplateRow[]): BuildQueueTemplateRow[] {
  return template.map((row) => ({ ...row }));
}

/**
 * Puts the shared template back after a failed multi-hex apply.
 *
 * Purpose: A rejected edit must not stay on screen. Nothing written leaves the pre-edit copy authoritative. Some written hexes leave the first selected hex's server queue authoritative.
 * When to use: After `applyTemplate` returns for an add, type change, count change, or row remove.
 * Expected outcome: Returns true when this edit still owns the template, after keeping a success or restoring a failure. Returns false when a newer assignment replaced `liveTemplate`, and leaves that newer template untouched. Failure with no writes restores `previousTemplate`. Failure with writes uses the first selected hex's snapshot, or `previousTemplate` when that load returns nothing. Does not toast.
 * Exceptions: A snapshot read failure is logged by `loadSelectedBuildSnapshots` and treated as a missing snapshot.
 */
async function restoreTemplateAfterFailedApply(
  applyResult: BuildQueueTemplateApplyResult,
  previousTemplate: BuildQueueTemplateRow[],
  liveTemplate: BuildQueueTemplateRow[]
): Promise<boolean> {
  if (S.buildQueueTemplate !== liveTemplate) return false;
  if (applyResult.ok) return true;
  if (!applyResult.anyHexWritten) {
    S.buildQueueTemplate = previousTemplate;
    return true;
  }
  const seedHex = S.selectedBuildHexH3s[0];
  const snapshots = seedHex ? await loadSelectedBuildSnapshots([seedHex]) : [];
  if (S.buildQueueTemplate !== liveTemplate) return false;
  const snapshot = snapshots[0];
  S.buildQueueTemplate = snapshot ? buildQueueTemplateFromSnapshot(snapshot) : previousTemplate;
  return true;
}

/**
 * Writes one edited template, then restores a queue the server still has when the apply fails.
 *
 * Purpose: Add, type, count, and remove must copy the template before replacing it and must not leave a rejected template on screen.
 * When to use: After the playback guard has allowed the edit and the next template has been built without mutating the current row objects.
 * Expected outcome: The next template is applied to every selected hex. On `{ ok: false, anyHexWritten: false }`, including a playback guard that wrote nothing, the copy returns and no extra toast is shown. On a partial write, the template reloads from the first selected hex. The editor renders only when this edit still owns the template afterward. A newer edit, close, or selection change that replaced the template is left alone.
 * Exceptions: Apply failures are toasted by `applyTemplate`. This function does not throw.
 */
async function commitEditedTemplate(
  deps: MultiBuildQueueRenderDeps,
  nextTemplate: BuildQueueTemplateRow[]
): Promise<void> {
  const previousTemplate = copyBuildQueueTemplate(S.buildQueueTemplate);
  S.buildQueueTemplate = nextTemplate;
  const applyResult = await deps.applyTemplate([...S.selectedBuildHexH3s]);
  const stillCurrent = await restoreTemplateAfterFailedApply(
    applyResult,
    previousTemplate,
    nextTemplate
  );
  if (!stillCurrent) return;
  void renderMultiBuildQueueIntoMount(deps);
}

/**
 * Formats aggregate queue cost and per-hex completion range for the current selection.
 *
 * Purpose: Keeps multi-queue summary math and grammar separate from DOM construction.
 * When to use: After loading all selected hex snapshots.
 * Expected outcome: Queue `$` is the displayed template total; turns remain min–max per-hex ETA.
 * Exceptions: Unknown completion estimates render as `?`.
 */
function formatMultiQueueSummary(snapshots: HexBuildQueueSnapshot[]): string {
  if (S.buildQueueTemplate.length === 0) return '<strong>Queue:</strong> (none)';
  const queueTotalCost = sumQueuedProductionCost(S.buildQueueTemplate);
  const turns = snapshots.map((snapshot) =>
    estimateTurnsToCompleteQueuedProduction(
      templateEntriesForTurnEstimate(filterTemplateForBuildHex(S.buildQueueTemplate, snapshot)),
      snapshot.storedPoints,
      snapshot.urbanHexCount
    )
  );
  const numericTurns = turns.filter((turn): turn is number => turn !== null);
  if (numericTurns.length !== turns.length) {
    return `<strong>Queue:</strong> $${queueTotalCost.toLocaleString()} / ? turns`;
  }
  const minimum = Math.min(...numericTurns);
  const maximum = Math.max(...numericTurns);
  const turnsDisplay = minimum === maximum ? String(minimum) : `${minimum}–${maximum}`;
  const turnLabel = minimum === 1 && maximum === 1 ? 'turn' : 'turns';
  return `<strong>Queue:</strong> $${queueTotalCost.toLocaleString()} / ${turnsDisplay} ${turnLabel}`;
}

/**
 * Returns whether a multi-hex queue edit must be ignored because resolution playback is running.
 *
 * Purpose: Template handlers write `buildQueueTemplate` before the server call, which is too late for the write guard to keep the editor unchanged.
 * When to use: At the start of an add, remove, type, count, or keep-building handler. Re-render when the control has already changed.
 * Expected outcome: True during playback. False when the edit may change the template and call the server. No toast.
 * Exceptions: None.
 */
function buildQueueEditBlockedByPlayback(): boolean {
  return resolutionPlaybackBlocksMapOrders(S.resolutionMoveAnimation);
}

/**
 * Renders the id-independent shared queue editor for two or more selected production hexes.
 *
 * Purpose: Presents summed production, template queue cost, ETA range, and union build types.
 * When to use: Build popup refresh while `selectedBuildHexH3s.length >= 2`.
 * Expected outcome: Template edits broadcast through the batch API without exposing per-hex row ids. Tech, when shown, sits under the hex codes and names each selected tier once. A failed snapshot load shows the error and no Tech line.
 * Exceptions: Stale async renders are discarded using request sequence and selection signature.
 */
export async function renderMultiBuildQueueIntoMount(deps: MultiBuildQueueRenderDeps): Promise<void> {
  const requestSeq = ++S.buildPopupRequestSeq;
  const selectedH3Indexes = [...S.selectedBuildHexH3s];
  const selectionSignature = selectedH3Indexes.join('|');
  const snapshots = await loadSelectedBuildSnapshots(selectedH3Indexes);
  if (
    requestSeq !== S.buildPopupRequestSeq ||
    S.buildPopupHexH3 !== deps.h3Index ||
    S.selectedBuildHexH3s.join('|') !== selectionSignature
  ) {
    return;
  }
  if (snapshots.length !== selectedH3Indexes.length) {
    console.error('renderMultiBuildQueueIntoMount: incomplete snapshot load', {
      selectedCount: selectedH3Indexes.length,
      loadedCount: snapshots.length,
    });
    deps.mount.innerHTML = '';
    const closeRow = document.createElement('div');
    closeRow.className = 'build-popup-close-row';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'unit-select build-close-btn';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', deps.hideBuildPopup);
    closeRow.appendChild(closeBtn);
    deps.mount.appendChild(closeRow);
    const errorLine = document.createElement('div');
    errorLine.className = 'build-no-urban';
    errorLine.textContent = 'Failed to load build queues for the selected hexes.';
    deps.mount.appendChild(errorLine);
    return;
  }

  deps.mount.innerHTML = '';
  const closeRow = document.createElement('div');
  closeRow.className = 'build-popup-close-row';
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'unit-select build-close-btn';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', deps.hideBuildPopup);
  closeRow.appendChild(closeBtn);
  deps.mount.appendChild(closeRow);

  const section = document.createElement('div');
  section.className = 'build-queue-section';
  const descriptionLine = document.createElement('div');
  descriptionLine.innerHTML = formatSelectedBuildHexCodesHtml(selectedH3Indexes);
  section.appendChild(descriptionLine);
  const descriptionSpacer = document.createElement('div');
  descriptionSpacer.style.height = '0.5em';
  section.appendChild(descriptionSpacer);

  const techLineHtml = formatSelectedHexTechLineHtml({
    techBonusEnabled: S.gameState?.techBonusEnabled === true,
    baselineUrbanHexCounts: selectedH3Indexes.map((h3Index) => baselineUrbanHexCountForStrategicHex(h3Index)),
  });
  if (techLineHtml) {
    const techLine = document.createElement('div');
    techLine.innerHTML = techLineHtml;
    section.appendChild(techLine);
    const techSpacer = document.createElement('div');
    techSpacer.style.height = '0.5em';
    section.appendChild(techSpacer);
  }

  const totalProduction = snapshots.reduce((sum, snapshot) => sum + snapshot.urbanHexCount, 0);
  const pointsLine = document.createElement('div');
  pointsLine.innerHTML = `<strong>Production:</strong> $${totalProduction.toLocaleString()} / turn`;
  section.appendChild(pointsLine);
  const productionQueueSpacer = document.createElement('div');
  productionQueueSpacer.style.height = '0.5em';
  section.appendChild(productionQueueSpacer);
  const queueSummaryLine = document.createElement('div');
  queueSummaryLine.innerHTML = formatMultiQueueSummary(snapshots);
  section.appendChild(queueSummaryLine);
  const productionSpacer = document.createElement('div');
  productionSpacer.style.height = '0.5em';
  section.appendChild(productionSpacer);

  const unionTypes = unionAvailableBuildUnitTypes(snapshots);
  const head = document.createElement('div');
  head.className = 'build-queue-head';
  const title = document.createElement('span');
  title.className = 'build-queue-title';
  title.textContent = 'Build Queue';
  const buildBtn = document.createElement('button');
  buildBtn.type = 'button';
  buildBtn.className = 'unit-select stack-unit-toggle';
  buildBtn.textContent = UNIT_SELECT_GLYPH;
  buildBtn.setAttribute('data-control-tooltip', multiBuildAddTooltipText);
  buildBtn.addEventListener('click', async () => {
    if (buildQueueEditBlockedByPlayback()) return;
    const defaultUnitType = unionTypes[0];
    if (!defaultUnitType) return;
    await commitEditedTemplate(deps, [
      ...S.buildQueueTemplate,
      createBuildQueueTemplateRow(defaultUnitType, 1),
    ]);
  });
  head.appendChild(title);
  head.appendChild(buildBtn);
  section.appendChild(head);

  const list = document.createElement('div');
  list.className = 'build-queue-list';
  S.buildQueueTemplate.forEach((entry) => {
    const rowKey = entry.rowKey;
    const row = document.createElement('div');
    row.className = 'build-queue-row';
    const typeSelect = document.createElement('select');
    typeSelect.setAttribute('data-control-tooltip', multiBuildTypeTooltipText);
    const rowTypes = ALL_BUILD_QUEUE_ITEM_TYPES.filter(
      (unitType) => unionTypes.includes(unitType) || unitType === entry.unitType
    );
    for (const unitType of rowTypes) {
      const eligibleCount = countEligibleBuildHexes(snapshots, unitType);
      const opt = document.createElement('option');
      opt.value = unitType;
      opt.textContent = formatBuildUnitTypeOptionLabel(unitType, eligibleCount, snapshots.length);
      typeSelect.appendChild(opt);
    }
    typeSelect.value = entry.unitType;
    row.appendChild(typeSelect);

    const countInput = document.createElement('input');
    countInput.setAttribute('data-control-tooltip', multiBuildCountTooltipText);
    countInput.type = 'text';
    countInput.className = 'build-count-input';
    countInput.maxLength = 2;
    countInput.inputMode = 'numeric';
    countInput.value = String(entry.count);
    const readCurrentCount = (): number => {
      const normalized = sanitizeBuildCountInputText(countInput.value);
      if (countInput.value !== normalized) countInput.value = normalized;
      return parseInt(normalized, 10);
    };
    countInput.addEventListener('keydown', (event) => {
      const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab'];
      if (allowed.includes(event.key) || /^\d$/.test(event.key)) return;
      event.preventDefault();
    });
    row.appendChild(countInput);

    typeSelect.addEventListener('change', async () => {
      if (buildQueueEditBlockedByPlayback()) {
        void renderMultiBuildQueueIntoMount(deps);
        return;
      }
      const entryIndex = S.buildQueueTemplate.findIndex((row) => row.rowKey === rowKey);
      if (entryIndex < 0) return;
      const updated = [...S.buildQueueTemplate];
      updated[entryIndex] = {
        rowKey,
        unitType: typeSelect.value as BuildQueueItemType,
        count: readCurrentCount(),
      };
      await commitEditedTemplate(deps, updated);
    });
    countInput.addEventListener('input', async () => {
      if (buildQueueEditBlockedByPlayback()) {
        void renderMultiBuildQueueIntoMount(deps);
        return;
      }
      const entryIndex = S.buildQueueTemplate.findIndex((row) => row.rowKey === rowKey);
      if (entryIndex < 0) return;
      const updated = [...S.buildQueueTemplate];
      updated[entryIndex] = {
        rowKey,
        unitType: typeSelect.value as BuildQueueItemType,
        count: readCurrentCount(),
      };
      await commitEditedTemplate(deps, updated);
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'unit-select';
    removeBtn.textContent = 'x';
    removeBtn.addEventListener('click', async () => {
      if (buildQueueEditBlockedByPlayback()) return;
      await commitEditedTemplate(
        deps,
        S.buildQueueTemplate.filter((row) => row.rowKey !== rowKey)
      );
    });
    row.appendChild(removeBtn);
    list.appendChild(row);
  });
  section.appendChild(list);
  appendKeepBuildingCheckbox({
    section,
    checked: areAllKeepBuildingArmed(snapshots),
    disabled: !canArmKeepBuildingForAll(snapshots),
    tooltipText: multiKeepBuildingTooltipText,
    onChange: async (keepBuilding) => {
      if (buildQueueEditBlockedByPlayback()) {
        void renderMultiBuildQueueIntoMount(deps);
        return;
      }
      await deps.setKeepBuilding(keepBuilding);
      void renderMultiBuildQueueIntoMount(deps);
    },
  });
  deps.mount.appendChild(section);
}
