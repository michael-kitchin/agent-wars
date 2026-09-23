import { getStrategicRes1HexCode } from '../../shared/hexLlmCodeAssignment';
import type { BuildUnitType, HexBuildQueueSnapshot } from '../../shared/ipcTypes';
import { resolutionPlaybackBlocksMapOrders } from '../../shared/mapOrderGestureGate';
import { estimateTurnsToCompleteQueuedProduction, sumQueuedProductionCost } from '../../shared/productionConfig';
import { TOOLTIP_OFFSET_PX, UNIT_SELECT_GLYPH } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import { hidePlanningChromeToasts } from '../openRouter/openRouterUiHelpers';
import { isHoverOrderPlanningActive } from '../rendering/canvasPreviewPolicy';
import { buildQueueTemplateFromSnapshot, toBuildQueueTemplateEntries } from './buildQueueMultiSelect';
import { renderMultiBuildQueueIntoMount } from './buildQueueMultiPopup';
import {
  appendKeepBuildingCheckbox,
  canArmKeepBuilding,
} from './buildQueueKeepBuilding';
import {
  escapeBuildPopupHtml,
  formatGroupedBuildNamingLineHtml,
  sanitizeBuildCountInputText,
} from './buildQueuePopupFormatting';

/**
 * Re-exports build-count sanitizer for existing `buildQueuePopup` import paths.
 *
 * Purpose: Preserves call sites that imported `sanitizeBuildCountInputText` from this module.
 * When to use: Prefer `./buildQueuePopupFormatting` for new code.
 * Expected outcome: Same function as the formatting-module export.
 * Exceptions: None.
 */
export { sanitizeBuildCountInputText };

/**
 * Defines the `isBuildQueueSelectInPopupFocused` function shape (export function isBuildQueueSelectInPopupFocused(): boolean).

 * Purpose: Supports maintainability by documenting why `isBuildQueueSelectInPopupFocused` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function isBuildQueueSelectInPopupFocused(): boolean {
  const popup = document.getElementById('build-popup');
  const active = document.activeElement;
  return !!popup && active instanceof HTMLSelectElement && popup.contains(active);
}

/**
 * Defines the `isBuildPopupOrEntryTarget` function shape (export function isBuildPopupOrEntryTarget(target: EventTarget | null): boolean).

 * Purpose: Supports maintainability by documenting why `isBuildPopupOrEntryTarget` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function isBuildPopupOrEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  const popup = document.getElementById('build-popup');
  const layer = document.getElementById('build-entry-layer');
  const tacticalLayer = document.getElementById('tactical-entry-layer');
  const tacticalHud = document.getElementById('tactical-battle-hud');
  return !!(
    popup?.contains(target) ||
    layer?.contains(target) ||
    tacticalLayer?.contains(target) ||
    tacticalHud?.contains(target)
  );
}

/**
 * Documents the `BuildQueuePopupDeps` interface as a named contract surface (interface BuildQueuePopupDeps).

 * Purpose: Supports maintainability by documenting why `BuildQueuePopupDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface BuildQueuePopupDeps {
    /**
   * Specifies the contract for the `shouldRenderRes4Hexes` member (shouldRenderRes4Hexes: () => boolean;).

   * Contract: Describes stable behavior for callers of `shouldRenderRes4Hexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
shouldRenderRes4Hexes: () => boolean;
    /**
   * Specifies the contract for the `hideStackCallout` member (hideStackCallout: () => void;).

   * Contract: Describes stable behavior for callers of `hideStackCallout` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hideStackCallout: () => void;
    /**
   * Specifies the contract for the `clearTerrainTooltipTimer` member (clearTerrainTooltipTimer: () => void;).

   * Contract: Describes stable behavior for callers of `clearTerrainTooltipTimer` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
clearTerrainTooltipTimer: () => void;
    /**
   * Specifies the contract for the `hideTerrainTooltipVisual` member (hideTerrainTooltipVisual: () => void;).

   * Contract: Describes stable behavior for callers of `hideTerrainTooltipVisual` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hideTerrainTooltipVisual: () => void;
    /**
   * Specifies the contract for the `requestRedraw` member (requestRedraw: () => void;).

   * Contract: Describes stable behavior for callers of `requestRedraw` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
requestRedraw: () => void;
    /**
   * Specifies the contract for the `scheduleTerrainTooltipRestoreAfterPopoverClose` member (scheduleTerrainTooltipRestoreAfterPopoverClose: () => void;).

   * Contract: Describes stable behavior for callers of `scheduleTerrainTooltipRestoreAfterPopoverClose` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
scheduleTerrainTooltipRestoreAfterPopoverClose: () => void;
    /**
   * Specifies the contract for the `refreshGameStateAfterBuildQueueChange` member (refreshGameStateAfterBuildQueueChange: () => Promise<void>;).

   * Contract: Describes stable behavior for callers of `refreshGameStateAfterBuildQueueChange` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
refreshGameStateAfterBuildQueueChange: () => Promise<void>;
    /**
   * Specifies the contract for the `showMapToast` member (showMapToast: (message: string, options?: { isError?: boolean }) => void;).

   * Contract: Describes stable behavior for callers of `showMapToast` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
showMapToast: (message: string, options?: { isError?: boolean }) => void;
}

/**
 * Defines the `createBuildQueuePopupHandler` function shape (export function createBuildQueuePopupHandler(deps: BuildQueuePopupDeps) { async function runBuildQueueMutation(args: { mutate: () => Promise<{ succes).

 * Purpose: Supports maintainability by documenting why `createBuildQueuePopupHandler` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function createBuildQueuePopupHandler(deps: BuildQueuePopupDeps) {
  /**
   * Serializes asynchronous build-entry selection changes so template seeding cannot race later joins.
   */
  let buildEntryInteractionChain: Promise<void> = Promise.resolve();
  /**
   * Invalidates an in-flight selection operation when another path closes the popup.
   */
  let popupLifecycleRevision = 0;

  /**
   * Runs one build-queue write and refreshes state when the server accepts it.
   *
   * Purpose: Shared failure toast and refresh for single-hex queue edits.
   * When to use: From popup controls that mutate a queue, including while playback may be running.
   * Expected outcome: False immediately, with no toast and no write, while resolution playback is running. Otherwise true after a successful mutate, or false after a toasted failure.
   * Exceptions: Transport errors are caught, logged, toasted, and returned as false.
   */
  async function runBuildQueueMutation(args: {
    mutate: () => Promise<{ success: boolean; reason?: string }>;
    failureMessage: string;
    refreshState: boolean;
  }): Promise<boolean> {
    if (resolutionPlaybackBlocksMapOrders(S.resolutionMoveAnimation)) return false;
    try {
      const result = await args.mutate();
      if (!result.success) {
        deps.showMapToast(result.reason ?? args.failureMessage, { isError: true });
        return false;
      }
      if (args.refreshState) await deps.refreshGameStateAfterBuildQueueChange();
      return true;
    } catch (err) {
      console.error('runBuildQueueMutation failed:', err);
      deps.showMapToast(args.failureMessage, { isError: true });
      return false;
    }
  }

  /**
   * Applies the current shared template to selected target hexes and reconciles renderer state.
   *
   * Purpose: Keeps multi-hex writes on the batch API while preserving hard-failure feedback.
   * When to use: Selection joins and every multi-mode template edit.
   * Expected outcome: False immediately, with no toast and no write, while resolution playback is running. Successful siblings refresh immediately; eligibility skips stay silent.
   * Exceptions: Transport and hard domain failures show one error toast and return `false`.
   */
  async function applyCurrentTemplateToHexes(h3Indexes: string[]): Promise<boolean> {
    if (resolutionPlaybackBlocksMapOrders(S.resolutionMoveAnimation)) return false;
    if (!window.gameApi?.applyBuildQueueTemplateToHexes) return false;
    try {
      const result = await window.gameApi.applyBuildQueueTemplateToHexes({
        h3Indexes,
        entries: toBuildQueueTemplateEntries(S.buildQueueTemplate),
      });
      if (result.applied.length > 0) await deps.refreshGameStateAfterBuildQueueChange();
      if (!result.success) {
        const failureReason = result.reason ?? result.failed[0]?.reason ?? 'Failed to synchronize build queues.';
        deps.showMapToast(failureReason, { isError: true });
        return false;
      }
      return true;
    } catch (err) {
      console.error('applyCurrentTemplateToHexes failed:', err);
      deps.showMapToast('Failed to synchronize build queues.', { isError: true });
      return false;
    }
  }

  /**
   * Restores a single-hex queue editor when playback should ignore the edit.
   *
   * Purpose: A select or count field changes before its handler runs, so returning without a write would leave the rejected value on screen.
   * When to use: At the start of a single-hex queue control handler, before calling `runBuildQueueMutation`.
   * Expected outcome: True during playback, after scheduling a re-render from the stored queue. False when the edit may proceed. No toast.
   * Exceptions: None.
   */
  function restoreSingleHexQueueIfPlaybackBlocks(mount: HTMLElement, h3Index: string): boolean {
    if (!resolutionPlaybackBlocksMapOrders(S.resolutionMoveAnimation)) return false;
    void renderBuildQueueIntoMount(mount, h3Index);
    return true;
  }

  async function renderBuildQueueIntoMount(mount: HTMLElement, h3Index: string): Promise<void> {
    if (S.selectedBuildHexH3s.length >= 2) {
      await renderMultiBuildQueueIntoMount({
        mount,
        h3Index,
        hideBuildPopup,
        applyTemplate: applyCurrentTemplateToHexes,
        setKeepBuilding: async (keepBuilding) => {
          if (!window.gameApi?.setHexesKeepBuilding) return false;
          return runBuildQueueMutation({
            mutate: () =>
              window.gameApi!.setHexesKeepBuilding({
                h3Indexes: [...S.selectedBuildHexH3s],
                keepBuilding,
              }),
            failureMessage: 'Failed to update Keep building.',
            refreshState: true,
          });
        },
      });
      return;
    }
    if (!window.gameApi?.getHexBuildQueue) return;
    const requestSeq = ++S.buildPopupRequestSeq;
    let snapshot: HexBuildQueueSnapshot | null = null;
    let namingLine: string | null = null;
    try {
      snapshot = await window.gameApi.getHexBuildQueue({ h3Index });
      if (window.gameApi.getHexNamingTooltipLine) {
        namingLine = await window.gameApi.getHexNamingTooltipLine({ h3Index, resolution: 1 });
      }
    } catch (err) {
      console.error('getHexBuildQueue failed:', err);
    }
    if (requestSeq !== S.buildPopupRequestSeq || !snapshot || S.buildPopupHexH3 !== h3Index) return;

    mount.innerHTML = '';
    const closeRow = document.createElement('div');
    closeRow.className = 'build-popup-close-row';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'unit-select build-close-btn';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => hideBuildPopup());
    closeRow.appendChild(closeBtn);
    mount.appendChild(closeRow);

    const section = document.createElement('div');
    section.className = 'build-queue-section';
    const trimmedNamingLine = namingLine?.trim() ?? '';
    const res1Code = getStrategicRes1HexCode(h3Index);
    const llmPrefixHtml = res1Code ? `<strong>(${escapeBuildPopupHtml(res1Code)})</strong> ` : '';
    if (trimmedNamingLine.length > 0) {
      const descriptionLine = document.createElement('div');
      descriptionLine.innerHTML = `${llmPrefixHtml}${formatGroupedBuildNamingLineHtml(trimmedNamingLine)}`;
      section.appendChild(descriptionLine);
      const descriptionSpacer = document.createElement('div');
      descriptionSpacer.style.height = '0.5em';
      section.appendChild(descriptionSpacer);
    } else if (llmPrefixHtml) {
      const codeLine = document.createElement('div');
      codeLine.innerHTML = llmPrefixHtml;
      section.appendChild(codeLine);
      const codeSpacer = document.createElement('div');
      codeSpacer.style.height = '0.5em';
      section.appendChild(codeSpacer);
    }
    const pointsLine = document.createElement('div');
    const productionCapacity = snapshot.urbanHexCount;
    const productionDetail =
      productionCapacity > 0
        ? `$${productionCapacity.toLocaleString()} / turn`
        : '(none)';
    pointsLine.innerHTML = `<strong>Production:</strong> ${productionDetail}`;
    section.appendChild(pointsLine);
    const queueSummaryLine = document.createElement('div');
    const queueTotalCost = sumQueuedProductionCost(snapshot.entries);
    if (snapshot.entries.length === 0) {
      queueSummaryLine.innerHTML = `<strong>Queue:</strong> (none)`;
    } else {
      const queueTurns = estimateTurnsToCompleteQueuedProduction(
        snapshot.entries,
        snapshot.storedPoints,
        productionCapacity
      );
      const queueTurnsDisplay = queueTurns === null ? '?' : queueTurns.toLocaleString();
      const turnLabel = queueTurns === 1 ? 'turn' : 'turns';
      queueSummaryLine.innerHTML = `<strong>Queue:</strong> $${queueTotalCost.toLocaleString()} / ${queueTurnsDisplay} ${turnLabel}`;
    }
    section.appendChild(queueSummaryLine);
    const productionSpacer = document.createElement('div');
    productionSpacer.style.height = '0.5em';
    section.appendChild(productionSpacer);

    if (!snapshot.controlledByRequester) {
      mount.appendChild(section);
      return;
    }
    if (!snapshot.buildSectionVisible) {
      const noUrban = document.createElement('div');
      noUrban.className = 'build-no-urban';
      noUrban.textContent = snapshot.noBuildReason ?? 'This hex cannot build units.';
      section.appendChild(noUrban);
      mount.appendChild(section);
      return;
    }

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
      if (!window.gameApi?.addHexBuildQueueEntry) return;
      const success = await runBuildQueueMutation({
        mutate: () => window.gameApi!.addHexBuildQueueEntry({ h3Index }),
        failureMessage: 'Failed to add build queue entry.',
        refreshState: true,
      });
      if (!success) return;
      const body = document.getElementById('build-popup-body');
      if (body) void renderBuildQueueIntoMount(body, h3Index);
    });
    head.appendChild(title);
    head.appendChild(buildBtn);
    section.appendChild(head);

    const list = document.createElement('div');
    list.className = 'build-queue-list';
    const options = snapshot.availableUnitTypes;
    for (const entry of snapshot.entries) {
      const row = document.createElement('div');
      row.className = 'build-queue-row';
      const typeSelect = document.createElement('select');
      for (const unitType of options) {
        const opt = document.createElement('option');
        opt.value = unitType;
        opt.textContent = unitType.charAt(0).toUpperCase() + unitType.slice(1);
        typeSelect.appendChild(opt);
      }
      typeSelect.value = entry.unitType;
      const countInput = document.createElement('input');
      countInput.type = 'text';
      countInput.className = 'build-count-input';
      countInput.maxLength = 2;
      countInput.inputMode = 'numeric';
      countInput.value = String(entry.count);
      const readCurrentCount = (): number => {
        const raw = sanitizeBuildCountInputText(countInput.value);
        if (countInput.value !== raw) countInput.value = raw;
        return parseInt(raw, 10);
      };
      typeSelect.addEventListener('change', async () => {
        if (restoreSingleHexQueueIfPlaybackBlocks(mount, h3Index)) return;
        if (!window.gameApi?.updateHexBuildQueueEntry) return;
        const success = await runBuildQueueMutation({
          mutate: () =>
            window.gameApi!.updateHexBuildQueueEntry({
              h3Index,
              entryId: entry.id,
              unitType: typeSelect.value as BuildUnitType,
              count: readCurrentCount(),
            }),
          failureMessage: 'Failed to update build queue entry.',
          refreshState: true,
        });
        if (!success) return;
        void renderBuildQueueIntoMount(mount, h3Index);
      });
      row.appendChild(typeSelect);

      countInput.addEventListener('keydown', (event) => {
        const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab'];
        if (allowed.includes(event.key)) return;
        if (/^\d$/.test(event.key)) return;
        event.preventDefault();
      });
      countInput.addEventListener('input', async () => {
        if (restoreSingleHexQueueIfPlaybackBlocks(mount, h3Index)) return;
        if (!window.gameApi?.updateHexBuildQueueEntry) return;
        const count = readCurrentCount();
        const success = await runBuildQueueMutation({
          mutate: () =>
            window.gameApi!.updateHexBuildQueueEntry({
              h3Index,
              entryId: entry.id,
              unitType: typeSelect.value as BuildUnitType,
              count,
            }),
          failureMessage: 'Failed to update build count.',
          refreshState: true,
        });
        if (!success) return;
        void renderBuildQueueIntoMount(mount, h3Index);
      });
      row.appendChild(countInput);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'unit-select';
      removeBtn.textContent = 'x';
      removeBtn.addEventListener('click', async () => {
        if (!window.gameApi?.removeHexBuildQueueEntry) return;
        const success = await runBuildQueueMutation({
          mutate: () => window.gameApi!.removeHexBuildQueueEntry({ h3Index, entryId: entry.id }),
          failureMessage: 'Failed to remove build queue entry.',
          refreshState: true,
        });
        if (!success) return;
        void renderBuildQueueIntoMount(mount, h3Index);
      });
      row.appendChild(removeBtn);
      list.appendChild(row);
    }
    section.appendChild(list);
    appendKeepBuildingCheckbox({
      section,
      checked: snapshot.keepBuilding,
      disabled: !canArmKeepBuilding(snapshot),
      onChange: async (keepBuilding) => {
        if (restoreSingleHexQueueIfPlaybackBlocks(mount, h3Index)) return;
        if (!window.gameApi?.setHexesKeepBuilding) return;
        const success = await runBuildQueueMutation({
          mutate: () =>
            window.gameApi!.setHexesKeepBuilding({
              h3Indexes: [h3Index],
              keepBuilding,
            }),
          failureMessage: 'Failed to update Keep building.',
          refreshState: true,
        });
        void renderBuildQueueIntoMount(mount, h3Index);
        if (!success) return;
      },
    });
    mount.appendChild(section);
  }

  /**
   * Resolves client coordinates for a build-entry button so the popup can re-anchor after selection changes.
   *
   * Purpose: Keeps deselect repositioning on the last remaining selected hex instead of the click that removed one.
   * When to use: Shift-deselect when the selection remains non-empty.
   * Expected outcome: Center of the matching `.build-entry-btn`, or the provided fallback when the button is missing.
   * Exceptions: None.
   */
  function clientPointForBuildEntryHex(
    h3Index: string,
    fallbackClientX: number,
    fallbackClientY: number
  ): { clientX: number; clientY: number } {
    const layer = document.getElementById('build-entry-layer');
    const button = layer?.querySelector<HTMLButtonElement>(
      `.build-entry-btn[data-h3-index="${CSS.escape(h3Index)}"]`
    );
    if (!button) return { clientX: fallbackClientX, clientY: fallbackClientY };
    const rect = button.getBoundingClientRect();
    return {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    };
  }

  /**
   * Applies the locked plain/Shift build-entry selection policy and keeps the popup synchronized.
   *
   * Purpose: Gives DOM-layer and canvas hit-test paths one implementation so their behavior cannot drift.
   * When to use: Every build-entry button activation.
   * Expected outcome: While resolution playback is running, returns without a toast and without changing the selected hex, the build selection, or the popup. Otherwise a plain click replaces, Shift toggles, and join writes follow last-clicked seeding rules.
   * Exceptions: Hard batch failures are reported but do not discard the user's selection.
   */
  async function processBuildEntryClick(
    h3Index: string,
    clientX: number,
    clientY: number,
    shiftKey: boolean
  ): Promise<void> {
    if (resolutionPlaybackBlocksMapOrders(S.resolutionMoveAnimation)) return;
    const lifecycleRevision = popupLifecycleRevision;
    if (isHoverOrderPlanningActive() || deps.shouldRenderRes4Hexes()) return;
    S.selectedHexIndex = h3Index;
    const popup = document.getElementById('build-popup');
    const popupOpen = !!popup && !popup.classList.contains('hidden');

    if (!shiftKey) {
      const togglesSinglePopup =
        S.selectedBuildHexH3s.length === 1 &&
        S.selectedBuildHexH3s[0] === h3Index &&
        popupOpen &&
        S.buildPopupHexH3 === h3Index;
      if (togglesSinglePopup) {
        hideBuildPopup();
        return;
      }
      S.selectedBuildHexH3s = [h3Index];
      S.buildQueueTemplate = [];
      showBuildPopup(h3Index, clientX, clientY);
      return;
    }

    const existingIndex = S.selectedBuildHexH3s.indexOf(h3Index);
    if (existingIndex >= 0) {
      // Filter preserves insertion order of the remaining selected hexes.
      S.selectedBuildHexH3s = S.selectedBuildHexH3s.filter((selected) => selected !== h3Index);
      if (S.selectedBuildHexH3s.length === 0) {
        hideBuildPopup();
        return;
      }
      if (S.selectedBuildHexH3s.length === 1) S.buildQueueTemplate = [];
      const remainingAnchor = S.selectedBuildHexH3s.at(-1)!;
      S.selectedHexIndex = remainingAnchor;
      const anchorPoint = clientPointForBuildEntryHex(remainingAnchor, clientX, clientY);
      showBuildPopup(remainingAnchor, anchorPoint.clientX, anchorPoint.clientY);
      return;
    }

    const priorCount = S.selectedBuildHexH3s.length;
    S.selectedBuildHexH3s = [...S.selectedBuildHexH3s, h3Index];
    if (priorCount === 0) {
      S.buildQueueTemplate = [];
      showBuildPopup(h3Index, clientX, clientY);
      return;
    }
    if (priorCount === 1) {
      const seedSnapshot = await window.gameApi?.getHexBuildQueue({ h3Index });
      if (lifecycleRevision !== popupLifecycleRevision) return;
      if (!seedSnapshot) {
        deps.showMapToast('Failed to load the build queue template.', { isError: true });
        S.selectedBuildHexH3s = S.selectedBuildHexH3s.filter((selected) => selected !== h3Index);
        deps.requestRedraw();
        return;
      }
      S.buildQueueTemplate = buildQueueTemplateFromSnapshot(seedSnapshot);
      await applyCurrentTemplateToHexes([...S.selectedBuildHexH3s]);
    } else {
      await applyCurrentTemplateToHexes([h3Index]);
    }
    if (lifecycleRevision !== popupLifecycleRevision) return;
    showBuildPopup(h3Index, clientX, clientY);
  }

  /**
   * Queues one build-entry activation behind earlier asynchronous join synchronization.
   *
   * Purpose: Prevents rapid Shift+clicks from seeding or applying templates out of selection order.
   * When to use: Public controller entry point for every build-entry activation.
   * Expected outcome: Clicks execute in user order; a popup close invalidates pending visual updates.
   * Exceptions: Unexpected errors are logged and reported without breaking later queued clicks.
   */
  function handleBuildEntryClick(
    h3Index: string,
    clientX: number,
    clientY: number,
    shiftKey: boolean
  ): Promise<void> {
    buildEntryInteractionChain = buildEntryInteractionChain
      .then(() => processBuildEntryClick(h3Index, clientX, clientY, shiftKey))
      .catch((err) => {
        console.error('handleBuildEntryClick failed:', err);
        deps.showMapToast('Failed to update build selection.', { isError: true });
      });
    return buildEntryInteractionChain;
  }

  function hideBuildPopup(): void {
    popupLifecycleRevision++;
    S.buildPopupHexH3 = null;
    S.buildPopupRequestSeq++;
    S.selectedBuildHexH3s = [];
    S.buildQueueTemplate = [];
    const el = document.getElementById('build-popup');
    const body = document.getElementById('build-popup-body');
    if (el) {
      el.classList.add('hidden');
      el.removeAttribute('data-open');
      el.removeAttribute('data-x');
      el.removeAttribute('data-y');
      el.setAttribute('aria-hidden', 'true');
    }
    if (body) body.innerHTML = '';
    deps.requestRedraw();
    deps.scheduleTerrainTooltipRestoreAfterPopoverClose();
  }

  /**
   * Opens the build-queue popup for a hex and clears overlapping map chrome toasts.
   *
   * Purpose: Presents production controls at the click point while dismissing
   * upper/lower-right toasts that would obscure planning UI.
   * When to use: After a successful build-entry click that is not blocked by hover
   * order planning or res4 tactical hex rendering.
   * Expected outcome: Popup is positioned and shown with queue content; planning
   * chrome toasts are hidden once (not suppressed for later show calls). Early
   * returns leave toast visibility unchanged.
   * Exceptions: None.
   */
  function showBuildPopup(h3Index: string, clientX: number, clientY: number): void {
    if (isHoverOrderPlanningActive()) return;
    if (deps.shouldRenderRes4Hexes()) return;
    deps.hideStackCallout();
    deps.clearTerrainTooltipTimer();
    deps.hideTerrainTooltipVisual();
    const el = document.getElementById('build-popup');
    const body = document.getElementById('build-popup-body');
    if (!el || !body) return;
    hidePlanningChromeToasts();
    S.buildPopupHexH3 = h3Index;
    el.setAttribute('data-open', 'true');
    el.setAttribute('data-x', String(clientX));
    el.setAttribute('data-y', String(clientY));
    el.style.left = `${clientX + TOOLTIP_OFFSET_PX}px`;
    el.style.top = `${clientY + TOOLTIP_OFFSET_PX}px`;
    el.classList.remove('hidden');
    el.setAttribute('aria-hidden', 'false');
    void renderBuildQueueIntoMount(body, h3Index);
    deps.requestRedraw();
  }

  function refreshBuildPopupIfOpen(): void {
    if (deps.shouldRenderRes4Hexes()) {
      hideBuildPopup();
      return;
    }
    const el = document.getElementById('build-popup');
    const body = document.getElementById('build-popup-body');
    if (!el || el.classList.contains('hidden') || !S.buildPopupHexH3 || !body) return;
    void renderBuildQueueIntoMount(body, S.buildPopupHexH3);
  }

  return { handleBuildEntryClick, hideBuildPopup, showBuildPopup, refreshBuildPopupIfOpen };
}
