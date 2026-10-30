import { getStrategicHexCode } from '../../shared/hexLlmCodeAssignment';
import type { BuildQueueItemType, HexBuildQueueSnapshot } from '../../shared/ipcTypes';
import { formatBuildQueueItemLabel } from '../../shared/buildQueueItemLabels';
import { resolutionPlaybackBlocksMapOrders } from '../../shared/mapOrderGestureGate';
import { estimateTurnsToCompleteQueuedProduction, sumQueuedProductionCost } from '../../shared/productionConfig';
import { TOOLTIP_OFFSET_PX, UNIT_SELECT_GLYPH } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import { hidePlanningChromeToasts } from '../openRouter/openRouterUiHelpers';
import { isHoverOrderPlanningActive } from '../rendering/canvasPreviewPolicy';
import { buildQueueTemplateFromSnapshot, toBuildQueueTemplateEntries } from './buildQueueMultiSelect';
import {
  renderMultiBuildQueueIntoMount,
  type BuildQueueTemplateApplyResult,
} from './buildQueueMultiPopup';
import {
  appendKeepBuildingCheckbox,
  canArmKeepBuilding,
} from './buildQueueKeepBuilding';
import { createBuildPausedNote, escapeBuildPopupHtml, sanitizeBuildCountInputText } from './buildQueuePopupFormatting';
import { renderBuildOrHirePopupIntoMount, type BuildHirePopupDeps } from './buildHirePopup';
import { isHumanBuildEntryHexIndex } from './productionOverlayHelpers';
import {
  buildAddTooltipText,
  buildCountTooltipText,
  buildTypeTooltipText,
  keepBuildingTooltipText,
} from '../chrome/controlTooltipText';
import { placeOpenBuildPopup } from '../chrome/placeAnchoredPopup';
import { syncQueueItemSelectTooltip } from '../chrome/syncQueueItemSelectTooltip';
import { buildPopupCloseTooltipText, singleHexQueueRemoveTooltipText } from '../../shared/popupControlTooltipText';
import { formatProducedUnitTechLineHtml } from '../../shared/featureIconHtml';
import { formatHexNamingCaptionHtml, type HexNamingCaption } from '../../shared/hexNamingCaption';
import { baselineUrbanHexCountForStrategicHex } from '../rendererTacticalHydration';

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
 * Reports whether a pointer target is the build popup, a build marker, or a battle-entry marker.
 *
 * Purpose: A press on any of these must not close the open build popup; a press anywhere else does.
 * When to use: From the window's `pointerdown` handler while the build popup is open.
 * Expected outcome: True when `target` is inside `#build-popup`, `#build-entry-layer`, or `#tactical-entry-layer`.
 * Exceptions: None; a target that is not a DOM node returns false.
 */
export function isBuildPopupOrEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  const popup = document.getElementById('build-popup');
  const layer = document.getElementById('build-entry-layer');
  const tacticalLayer = document.getElementById('tactical-entry-layer');
  return !!(popup?.contains(target) || layer?.contains(target) || tacticalLayer?.contains(target));
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
   * Specifies the contract for the `shouldRenderTacticalHexes` member (shouldRenderTacticalHexes: () => boolean;).

   * Contract: Describes stable behavior for callers of `shouldRenderTacticalHexes` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
shouldRenderTacticalHexes: () => boolean;
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
   * Expected outcome: `{ ok: false, anyHexWritten: false }` immediately, with no toast and no write, while resolution playback is running or the batch API is missing. A successful apply, including a silent eligibility skip, returns `{ ok: true }`. A hard failure returns `{ ok: false, anyHexWritten }`, and `anyHexWritten` is true when `applied.length > 0`. Written hexes refresh before that failure result.
   * Exceptions: Transport and hard domain failures show one error toast. A transport failure reports that nothing was written.
   */
  async function applyCurrentTemplateToHexes(h3Indexes: string[]): Promise<BuildQueueTemplateApplyResult> {
    if (resolutionPlaybackBlocksMapOrders(S.resolutionMoveAnimation)) {
      return { ok: false, anyHexWritten: false };
    }
    if (!window.gameApi?.applyBuildQueueTemplateToHexes) {
      return { ok: false, anyHexWritten: false };
    }
    try {
      const result = await window.gameApi.applyBuildQueueTemplateToHexes({
        h3Indexes,
        entries: toBuildQueueTemplateEntries(S.buildQueueTemplate),
      });
      const anyHexWritten = result.applied.length > 0;
      if (anyHexWritten) await deps.refreshGameStateAfterBuildQueueChange();
      if (!result.success) {
        const failureReason = result.reason ?? result.failed[0]?.reason ?? 'Failed to synchronize build queues.';
        deps.showMapToast(failureReason, { isError: true });
        return { ok: false, anyHexWritten };
      }
      return { ok: true };
    } catch (err) {
      console.error('applyCurrentTemplateToHexes failed:', err);
      deps.showMapToast('Failed to synchronize build queues.', { isError: true });
      return { ok: false, anyHexWritten: false };
    }
  }

  /**
   * Puts a single-hex type select and count field back on the last rendered row.
   *
   * Purpose: The control changes before the server can reject it, and a refetch that returns no snapshot would leave that rejected value on screen.
   * When to use: After a type or count mutation returns failure, before re-rendering the mount.
   * Expected outcome: The select shows `entry.unitType`, its tip matches that type, and the count field shows `entry.count`. Assigning the values does not dispatch a change or input event.
   * Exceptions: None.
   */
  function restoreRejectedBuildQueueControls(
    typeSelect: HTMLSelectElement,
    countInput: HTMLInputElement,
    entry: { unitType: BuildQueueItemType; count: number }
  ): void {
    typeSelect.value = entry.unitType;
    syncQueueItemSelectTooltip(typeSelect, buildTypeTooltipText);
    countInput.value = String(entry.count);
  }

  /**
   * Reports whether a failed single-hex edit is still the value on screen.
   *
   * Purpose: A count field sends one request per keystroke, so an older failure must not wipe a newer attempt.
   * When to use: After a type or count mutation returns failure, before restoring the last rendered row.
   * Expected outcome: True when both controls still show the values submitted by this attempt. False when the player has changed either control since the request was sent.
   * Exceptions: None.
   */
  function rejectedBuildQueueEditStillShown(
    typeSelect: HTMLSelectElement,
    countInput: HTMLInputElement,
    submittedUnitType: BuildQueueItemType,
    submittedCountText: string
  ): boolean {
    return typeSelect.value === submittedUnitType && countInput.value === submittedCountText;
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
    let namingCaption: HexNamingCaption | null = null;
    try {
      snapshot = await window.gameApi.getHexBuildQueue({ h3Index });
      if (window.gameApi.getHexNamingTooltipLine) {
        namingCaption = await window.gameApi.getHexNamingTooltipLine({ h3Index, resolution: 1 });
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
    closeBtn.setAttribute('data-control-tooltip', buildPopupCloseTooltipText);
    closeBtn.addEventListener('click', () => hideBuildPopup());
    closeRow.appendChild(closeBtn);
    mount.appendChild(closeRow);

    const section = document.createElement('div');
    section.className = 'build-queue-section';
    const strategicCode = getStrategicHexCode(h3Index);
    const llmPrefixHtml = strategicCode ? `<strong>(${escapeBuildPopupHtml(strategicCode)})</strong> ` : '';
    if (namingCaption && namingCaption.text.trim().length > 0) {
      const descriptionLine = document.createElement('div');
      descriptionLine.innerHTML = `${llmPrefixHtml}${formatHexNamingCaptionHtml(namingCaption)}`;
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
    const techLineHtml = formatProducedUnitTechLineHtml({
      techBonusEnabled: S.gameState?.techBonusEnabled === true,
      baselineUrbanHexCount: baselineUrbanHexCountForStrategicHex(h3Index),
    });
    if (techLineHtml) {
      const techLine = document.createElement('div');
      techLine.innerHTML = techLineHtml;
      section.appendChild(techLine);
      const techSpacer = document.createElement('div');
      techSpacer.style.height = '0.5em';
      section.appendChild(techSpacer);
    }
    const pointsLine = document.createElement('div');
    const productionCapacity = snapshot.urbanHexCount;
    const productionDetail =
      productionCapacity > 0
        ? `$${productionCapacity.toLocaleString()} / turn`
        : '(none)';
    pointsLine.innerHTML = `<strong>Production:</strong> ${productionDetail}`;
    section.appendChild(pointsLine);
    const productionQueueSpacer = document.createElement('div');
    productionQueueSpacer.style.height = '0.5em';
    section.appendChild(productionQueueSpacer);
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
    if (snapshot.controlledByRequester && snapshot.buildPaused === true) {
      section.appendChild(createBuildPausedNote());
    }

    if (!snapshot.controlledByRequester) {
      mount.appendChild(section);
      placeOpenBuildPopup();
      return;
    }
    if (!snapshot.buildSectionVisible) {
      const noUrban = document.createElement('div');
      noUrban.className = 'build-no-urban';
      noUrban.textContent = snapshot.noBuildReason ?? 'This hex cannot build units.';
      section.appendChild(noUrban);
      mount.appendChild(section);
      placeOpenBuildPopup();
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
    buildBtn.setAttribute('data-control-tooltip', buildAddTooltipText);
    buildBtn.addEventListener('click', async () => {
      if (!window.gameApi?.addHexBuildQueueEntry) return;
      const success = await runBuildQueueMutation({
        mutate: () => window.gameApi!.addHexBuildQueueEntry({ h3Index }),
        failureMessage: 'Failed to add build queue entry.',
        refreshState: true,
      });
      if (!success) return;
      void renderBuildQueueIntoMount(mount, h3Index);
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
        opt.textContent = formatBuildQueueItemLabel(unitType);
        typeSelect.appendChild(opt);
      }
      typeSelect.value = entry.unitType;
      syncQueueItemSelectTooltip(typeSelect, buildTypeTooltipText);
      const countInput = document.createElement('input');
      countInput.setAttribute('data-control-tooltip', buildCountTooltipText);
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
      /**
       * Submits a type or count edit for this build-queue row.
       *
       * Purpose: The type-select and count-input listeners share one update, restore, and re-render path.
       * When to use: From those two listeners, with the failure string for that control.
       * Expected outcome: The row updates, or the previous controls return when the edit is still on screen and the server rejects it.
       * Exceptions: None. Mutation failures are reported through `runBuildQueueMutation`.
       */
      async function submitBuildQueueEntryEdit(failureMessage: string): Promise<void> {
        if (restoreSingleHexQueueIfPlaybackBlocks(mount, h3Index)) return;
        if (!window.gameApi?.updateHexBuildQueueEntry) return;
        const submittedUnitType = typeSelect.value as BuildQueueItemType;
        const submittedCount = readCurrentCount();
        const submittedCountText = countInput.value;
        const success = await runBuildQueueMutation({
          mutate: () =>
            window.gameApi!.updateHexBuildQueueEntry({
              h3Index,
              entryId: entry.id,
              unitType: submittedUnitType,
              count: submittedCount,
            }),
          failureMessage,
          refreshState: true,
        });
        if (!success) {
          if (
            rejectedBuildQueueEditStillShown(
              typeSelect,
              countInput,
              submittedUnitType,
              submittedCountText
            )
          ) {
            restoreRejectedBuildQueueControls(typeSelect, countInput, entry);
            await renderBuildQueueIntoMount(mount, h3Index);
          }
          return;
        }
        void renderBuildQueueIntoMount(mount, h3Index);
      }
      typeSelect.addEventListener('change', async () => {
        syncQueueItemSelectTooltip(typeSelect, buildTypeTooltipText);
        await submitBuildQueueEntryEdit('Failed to update build queue entry.');
      });
      row.appendChild(typeSelect);

      countInput.addEventListener('keydown', (event) => {
        const allowed = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Tab'];
        if (allowed.includes(event.key)) return;
        if (/^\d$/.test(event.key)) return;
        event.preventDefault();
      });
      countInput.addEventListener('input', async () => {
        await submitBuildQueueEntryEdit('Failed to update build count.');
      });
      row.appendChild(countInput);

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'unit-select';
      removeBtn.textContent = 'x';
      removeBtn.setAttribute('data-control-tooltip', singleHexQueueRemoveTooltipText);
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
      tooltipText: keepBuildingTooltipText,
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
    placeOpenBuildPopup();
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
   * Expected outcome: While resolution playback is running, returns without a toast and without changing the selected hex, the build selection, or the popup. Otherwise a plain click replaces and Shift toggles. The first extra hex is seeded from the hex that was already open; a later hex receives the current template.
   * Exceptions: Hard batch failures are reported but do not discard the user's selection.
   */
  async function processBuildEntryClick(
    h3Index: string,
    clientX: number,
    clientY: number,
    shiftKey: boolean
  ): Promise<void> {
    if (resolutionPlaybackBlocksMapOrders(S.resolutionMoveAnimation)) return;
    const multiSelect = shiftKey
      && isHumanBuildEntryHexIndex(S.gameState, h3Index)
      && S.selectedBuildHexH3s.every((hex) => isHumanBuildEntryHexIndex(S.gameState, hex));
    const lifecycleRevision = popupLifecycleRevision;
    if (isHoverOrderPlanningActive() || deps.shouldRenderTacticalHexes()) return;
    S.selectedHexIndex = h3Index;
    const popup = document.getElementById('build-popup');
    const popupOpen = !!popup && !popup.classList.contains('hidden');

    if (!multiSelect) {
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
    const seedHex = priorCount === 1 ? S.selectedBuildHexH3s[0] : undefined;
    S.selectedBuildHexH3s = [...S.selectedBuildHexH3s, h3Index];
    if (priorCount === 0) {
      S.buildQueueTemplate = [];
      showBuildPopup(h3Index, clientX, clientY);
      return;
    }
    if (priorCount === 1) {
      const seedSnapshot = seedHex
        ? await window.gameApi?.getHexBuildQueue({ h3Index: seedHex })
        : null;
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

  /**
   * Closes the build popup and drops its in-memory queue.
   *
   * Purpose: Tactical zoom and battle maps call this on redraw to keep the popup from covering the cells. A popup that is already closed must not touch the hex tooltip.
   * When to use: Build-entry dismissal, and the tactical branch of `syncBuildEntryButton`.
   * Expected outcome: An open popup hides, and the hex tooltip can return after that close. An already closed popup leaves the hex-tooltip dwell running.
   * Exceptions: None.
   */
  function hideBuildPopup(): void {
    const el = document.getElementById('build-popup');
    const wasOpen = !!el && !el.classList.contains('hidden');
    const hadBuildState =
      S.buildPopupHexH3 !== null || S.selectedBuildHexH3s.length > 0 || S.buildQueueTemplate.length > 0;
    if (!wasOpen && !hadBuildState) return;
    popupLifecycleRevision++;
    S.buildPopupHexH3 = null;
    S.buildPopupRequestSeq++;
    S.selectedBuildHexH3s = [];
    S.buildQueueTemplate = [];
    if (el) {
      el.classList.add('hidden');
      el.removeAttribute('data-open');
      el.removeAttribute('data-x');
      el.removeAttribute('data-y');
      el.setAttribute('aria-hidden', 'true');
    }
    const body = document.getElementById('build-popup-body');
    if (body) body.innerHTML = '';
    deps.requestRedraw();
    if (wasOpen) deps.scheduleTerrainTooltipRestoreAfterPopoverClose();
  }

  /**
   * Opens the build-queue popup for a hex and clears overlapping map chrome toasts.
   *
   * Purpose: Presents production controls at the click point while dismissing
   * upper/lower-right toasts that would obscure planning UI.
   * When to use: After a successful build-entry click that is not blocked by hover
   * order planning or tactical hex rendering.
   * Expected outcome: The popup opens at the click plus the offset, then each finished paint moves it inside the window. Planning chrome toasts are hidden once (not suppressed for later show calls). Early returns leave toast visibility unchanged.
   * Exceptions: None.
   */
  const popupDeps: BuildHirePopupDeps = {
    renderBuildPanel: renderBuildQueueIntoMount,
    hideBuildPopup,
    refreshGameStateAfterBuildQueueChange: deps.refreshGameStateAfterBuildQueueChange,
    showMapToast: deps.showMapToast,
  };

  function showBuildPopup(h3Index: string, clientX: number, clientY: number): void {
    if (isHoverOrderPlanningActive()) return;
    if (deps.shouldRenderTacticalHexes()) return;
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
    void renderBuildOrHirePopupIntoMount(body, h3Index, popupDeps);
    deps.requestRedraw();
  }

  function refreshBuildPopupIfOpen(): void {
    if (deps.shouldRenderTacticalHexes()) {
      hideBuildPopup();
      return;
    }
    const el = document.getElementById('build-popup');
    const body = document.getElementById('build-popup-body');
    if (!el || el.classList.contains('hidden') || !S.buildPopupHexH3 || !body) return;
    void renderBuildOrHirePopupIntoMount(body, S.buildPopupHexH3, popupDeps);
  }

  return { handleBuildEntryClick, hideBuildPopup, showBuildPopup, refreshBuildPopupIfOpen };
}
