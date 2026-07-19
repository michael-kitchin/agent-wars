import { ALL_BUILD_UNIT_TYPES, type BuildUnitType, type HexBuildQueueSnapshot } from '../../shared/ipcTypes';
import { estimateTurnsToCompleteQueuedProduction, sumQueuedProductionCost } from '../../shared/productionConfig';
import { UNIT_SELECT_GLYPH } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import {
  appendKeepBuildingCheckbox,
  areAllKeepBuildingArmed,
  canArmKeepBuildingForAll,
} from './buildQueueKeepBuilding';
import {
  countEligibleBuildHexes,
  createBuildQueueTemplateRow,
  filterTemplateForBuildHex,
  formatBuildUnitTypeOptionLabel,
  formatSelectedBuildHexCodesHtml,
  templateEntriesForTurnEstimate,
  unionAvailableBuildUnitTypes,
} from './buildQueueMultiSelect';

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
   * Expected outcome: Eligible queues match the shared template.
   * Exceptions: Resolves false after handled transport or domain failures.
   */
  applyTemplate: (h3Indexes: string[]) => Promise<boolean>;
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
 * Normalizes a build count input to the existing one-to-99 contract.
 *
 * Purpose: Keeps multi-row input behavior aligned with the single-hex editor.
 * When to use: Before persisting a changed multi-template count.
 * Expected outcome: Decimal string from one through 99.
 * Exceptions: None.
 */
function sanitizeCount(raw: string): string {
  const digitsOnly = raw.replaceAll(/\D/g, '').slice(0, 2);
  if (digitsOnly.length === 0) return '1';
  const parsed = parseInt(digitsOnly, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return '1';
  return String(Math.min(99, parsed));
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
 * Renders the id-independent shared queue editor for two or more selected production hexes.
 *
 * Purpose: Presents summed production, template queue cost, ETA range, and union build types.
 * When to use: Build popup refresh while `selectedBuildHexH3s.length >= 2`.
 * Expected outcome: Template edits broadcast through the batch API without exposing per-hex row ids.
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

  const totalProduction = snapshots.reduce((sum, snapshot) => sum + snapshot.urbanHexCount, 0);
  const pointsLine = document.createElement('div');
  pointsLine.innerHTML = `<strong>Production:</strong> $${totalProduction.toLocaleString()} / turn`;
  section.appendChild(pointsLine);
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
  buildBtn.addEventListener('click', async () => {
    const defaultUnitType = unionTypes[0];
    if (!defaultUnitType) return;
    S.buildQueueTemplate = [...S.buildQueueTemplate, createBuildQueueTemplateRow(defaultUnitType, 1)];
    await deps.applyTemplate([...S.selectedBuildHexH3s]);
    void renderMultiBuildQueueIntoMount(deps);
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
    const rowTypes = ALL_BUILD_UNIT_TYPES.filter(
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
    countInput.type = 'text';
    countInput.className = 'build-count-input';
    countInput.maxLength = 2;
    countInput.inputMode = 'numeric';
    countInput.value = String(entry.count);
    const readCurrentCount = (): number => {
      const normalized = sanitizeCount(countInput.value);
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
      const entryIndex = S.buildQueueTemplate.findIndex((row) => row.rowKey === rowKey);
      if (entryIndex < 0) return;
      const updated = [...S.buildQueueTemplate];
      updated[entryIndex] = {
        rowKey,
        unitType: typeSelect.value as BuildUnitType,
        count: readCurrentCount(),
      };
      S.buildQueueTemplate = updated;
      await deps.applyTemplate([...S.selectedBuildHexH3s]);
      void renderMultiBuildQueueIntoMount(deps);
    });
    countInput.addEventListener('input', async () => {
      const entryIndex = S.buildQueueTemplate.findIndex((row) => row.rowKey === rowKey);
      if (entryIndex < 0) return;
      const updated = [...S.buildQueueTemplate];
      updated[entryIndex] = {
        rowKey,
        unitType: typeSelect.value as BuildUnitType,
        count: readCurrentCount(),
      };
      S.buildQueueTemplate = updated;
      await deps.applyTemplate([...S.selectedBuildHexH3s]);
      void renderMultiBuildQueueIntoMount(deps);
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'unit-select';
    removeBtn.textContent = 'x';
    removeBtn.addEventListener('click', async () => {
      S.buildQueueTemplate = S.buildQueueTemplate.filter((row) => row.rowKey !== rowKey);
      await deps.applyTemplate([...S.selectedBuildHexH3s]);
      void renderMultiBuildQueueIntoMount(deps);
    });
    row.appendChild(removeBtn);
    list.appendChild(row);
  });
  section.appendChild(list);
  appendKeepBuildingCheckbox({
    section,
    checked: areAllKeepBuildingArmed(snapshots),
    disabled: !canArmKeepBuildingForAll(snapshots),
    onChange: async (keepBuilding) => {
      await deps.setKeepBuilding(keepBuilding);
      void renderMultiBuildQueueIntoMount(deps);
    },
  });
  deps.mount.appendChild(section);
}
