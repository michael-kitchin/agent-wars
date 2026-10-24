import { UNIT_DESELECT_GLYPH } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import { setUnitNameContent } from '../core/unitOriginFlags';
import { mergePendingTacticalEmbarkOrdersIntoSealiftState } from '../tactical/tacticalEmbarkSealiftMerge';
import { sealiftDebarkTooltipText, sealiftSelectTooltipText } from '../chrome/controlTooltipText';
import { showMapToast } from '../openRouter/openRouterUiHelpers';
import type { GameStateSnapshot, SealiftStackState } from '../../shared/ipcTypes';
import {
  formatTargetingValidationReason,
  formatUnitDisplayName,
  refreshGameStateAfterSealiftChange,
  refreshHoverRoutePreview,
  refreshHumanStandingOrders,
  requestRedraw,
  updatePendingOrdersSidebar,
} from './stackCalloutHost';
import { setStackPopupNonSelectableUnitIds } from './stackCalloutSelectionToggles';

/**
 * Monotonic generation for in-flight stack sealift renders.
 *
 * Purpose: Overlapping `renderSealiftSection` awaits would otherwise append a second `.stack-sealift-section`.
 * When to use: Increment at the start of each sealift render and when hiding the stack popup; ignore stale awaits.
 * Expected outcome: Only the latest render appends sealift rows.
 * Exceptions: None.
 */
let sealiftSectionRenderGeneration = 0;

/**
 * Drops every in-flight sealift render so a closed popup cannot gain a late section.
 *
 * Purpose: Hiding the stack popup must invalidate awaits that have not appended yet.
 * When to use: `hideStackCallout`.
 * Expected outcome: `sealiftSectionRenderGeneration` advances. A render that captured an older generation returns without appending.
 * Exceptions: None.
 */
export function invalidateSealiftSectionRenders(): void {
  sealiftSectionRenderGeneration += 1;
}
/**
 * Removes every sealift assignment block from the stack popup.
 *
 * Purpose: Overlapping async renders can leave more than one `.stack-sealift-section`; a single `querySelector` would keep extras.
 * When to use: When a finished replacement is ready to append, when this hex has no sealift UI, or when the loaded state says the section should hide.
 * Expected outcome: No `.stack-sealift-section` remains under `calloutEl`.
 * Exceptions: None.
 */
export function removeSealiftSection(calloutEl: HTMLElement): void {
  calloutEl.querySelectorAll('.stack-sealift-section').forEach((el) => el.remove());
}

/**
 * The label shown for a land unit in a sealift slot list.
 *
 * Purpose: The slot list uses the same display name as the stack rows.
 * When to use: Each land option in a sealift select.
 * Expected outcome: The entry display name for `unitId`. `unitType` is unused.
 * Exceptions: Throws when the stack host is not bound.
 */
export function buildSealiftUnitLabel(unitId: string, unitType: string): string {
  void unitType;
  return formatUnitDisplayName(unitId);
}

/**
 * Fills the stack popup sealift controls for the current hex after loading stack state.
 *
 * Purpose: Cargo slot UI is async; a generation token drops stale awaits so each fleet is listed once.
 * When to use: End of `showStackCallout` and after a fleet list or debark button changes an assignment.
 * Expected outcome: At most one sealift section for the latest stack hex. The previous section stays until the replacement is appended, so the unit list does not blank while embarked selection toggles hide. Hidden or superseded renders do not append.
 * Exceptions: Logs to the console if sealift IPC throws.
 */
export async function renderSealiftSection(units: GameStateSnapshot['units'], calloutEl: HTMLElement): Promise<void> {
  const generation = ++sealiftSectionRenderGeneration;
  const h3Index = units[0]?.h3Index;
  if (!h3Index) {
    removeSealiftSection(calloutEl);
    return;
  }
  const api = window.gameApi;
  if (!api) {
    removeSealiftSection(calloutEl);
    return;
  }
  const tacticalSealiftMode = !!S.tacticalBattleSnapshot?.tacticalChildH3Indexes.includes(h3Index);
  /**
   * Purpose: A slot change must leave the unit list mounted and must not cancel a sealift render for a different hex.
   * When to use: After a fleet-list or debark IPC settles.
   * Expected outcome: The open popup's fleet section refreshes when its hex still matches.
   * Exceptions: None.
   */
  const refreshSameHexSealiftSection = (): void => {
    if (calloutEl.classList.contains('hidden') || calloutEl.getAttribute('data-h3-index') !== h3Index) return;
    void renderSealiftSection(units, calloutEl);
  };
  try {
    let state: SealiftStackState;
    if (tacticalSealiftMode) {
      state = (await api.getTacticalSealiftStackState!({ h3Index })) as SealiftStackState;
      state = mergePendingTacticalEmbarkOrdersIntoSealiftState(state, S.pendingEmbarkOrders);
    } else {
      state = (await api.getSealiftStackState!({ h3Index })) as SealiftStackState;
    }
    if (generation !== sealiftSectionRenderGeneration) return;
    if (calloutEl.classList.contains('hidden')) return;
    if (calloutEl.getAttribute('data-h3-index') !== h3Index) return;
    if (!state.showSealiftSection) {
      removeSealiftSection(calloutEl);
      return;
    }
    const nonSelectableEmbarkedIds = state.navalRows
      .flatMap((row) => [row.slot1UnitId, row.slot2UnitId])
      .filter((unitId): unitId is string => typeof unitId === 'string' && unitId.length > 0);
    setStackPopupNonSelectableUnitIds(calloutEl, nonSelectableEmbarkedIds);
    if (generation !== sealiftSectionRenderGeneration) return;

    const section = document.createElement('div');
    section.className = 'stack-sealift-section';

    for (const row of state.navalRows) {
      const rowEl = document.createElement('div');
      rowEl.className = 'stack-sealift-row';
      const left = document.createElement('span');
      left.className = 'stack-sealift-naval';
      setUnitNameContent(left, row.navalUnitId, formatUnitDisplayName(row.navalUnitId));
      rowEl.appendChild(left);

      const right = document.createElement('div');
      right.className = 'stack-sealift-slots';

      const addSlotControl = (
        slotIndex: 1 | 2,
        selectedUnitId: string | null,
        slotDisabled: boolean,
        debarkEnabled: boolean
      ) => {
        const slotRow = document.createElement('div');
        slotRow.className = 'stack-sealift-slot-row';
        const select = document.createElement('select');
        select.className = 'stack-sealift-select';
        select.disabled = slotDisabled;
        const noneOption = document.createElement('option');
        noneOption.value = '';
        noneOption.textContent = '(none)';
        select.appendChild(noneOption);
        for (const option of state.landOptions) {
          const opt = document.createElement('option');
          opt.value = option.unitId;
          opt.textContent = buildSealiftUnitLabel(option.unitId, option.unitType);
          select.appendChild(opt);
        }
        select.value = selectedUnitId ?? '';
        select.dataset.prevLand = selectedUnitId ?? '';
        const selectHost = document.createElement('span');
        selectHost.className = 'control-tooltip-host';
        selectHost.setAttribute('data-control-tooltip', sealiftSelectTooltipText);
        selectHost.appendChild(select);
        select.addEventListener('change', async () => {
          const selected = select.value.trim();
          if (tacticalSealiftMode) {
            const prev = select.dataset.prevLand ?? '';
            const result = await api.updateTacticalSealiftSlot!({
              h3Index,
              navalUnitId: row.navalUnitId,
              slotIndex,
              landUnitId: selected.length > 0 ? selected : null,
            });
            if (!result.success) {
              select.value = select.dataset.prevLand ?? '';
              showMapToast(formatTargetingValidationReason(result.reason, 'Failed to update sealift assignment.'));
            } else {
              if (prev) {
                S.tacticalPendingMarches = S.tacticalPendingMarches.filter((m) => m.subUnitId !== prev);
              }
              if (selected.length > 0) {
                S.tacticalPendingMarches = S.tacticalPendingMarches.filter((m) => m.subUnitId !== selected);
              }
              if (result.tacticalBattle) {
                S.tacticalBattleSnapshot = result.tacticalBattle;
              }
              const navalIds = new Set((result.state?.navalRows ?? []).map((r) => r.navalUnitId));
              S.pendingEmbarkOrders = S.pendingEmbarkOrders.filter((e) => !navalIds.has(e.navalUnitId));
              select.dataset.prevLand = selected;
              if (selected.length > 0) {
                await refreshHumanStandingOrders();
              }
              updatePendingOrdersSidebar();
            }
            refreshSameHexSealiftSection();
            requestRedraw();
            return;
          }
          const result = await api.updateSealiftSlot({
            h3Index,
            navalUnitId: row.navalUnitId,
            slotIndex,
            landUnitId: selected.length > 0 ? selected : null,
          });
          if (!result.success) {
            select.value = select.dataset.prevLand ?? '';
            showMapToast(formatTargetingValidationReason(result.reason, 'Failed to update sealift assignment.'));
          } else {
            // Embark/debark changes `embarkedOnNavalUnitId` in main; refresh so selection/march use current flags.
            await refreshGameStateAfterSealiftChange({ refreshStandingOrders: selected.length > 0 });
            if (selected.length > 0) {
              await refreshHoverRoutePreview();
            }
          }
          refreshSameHexSealiftSection();
          requestRedraw();
        });
        slotRow.appendChild(selectHost);

        const debarkBtn = document.createElement('button');
        debarkBtn.type = 'button';
        debarkBtn.className = 'unit-select stack-unit-toggle';
        debarkBtn.textContent = UNIT_DESELECT_GLYPH;
        debarkBtn.setAttribute('data-control-tooltip', sealiftDebarkTooltipText);
        debarkBtn.disabled = !debarkEnabled;
        debarkBtn.style.visibility = debarkEnabled ? 'visible' : 'hidden';
        debarkBtn.addEventListener('click', async () => {
            if (tacticalSealiftMode) {
              const prev = selectedUnitId ?? '';
              if (prev) {
                const result = await api.updateTacticalSealiftSlot!({
                  h3Index,
                  navalUnitId: row.navalUnitId,
                  slotIndex,
                  landUnitId: null,
                });
                if (!result.success) {
                  showMapToast(formatTargetingValidationReason(result.reason, 'Failed to debark unit.'));
                } else {
                  if (result.tacticalBattle) {
                    S.tacticalBattleSnapshot = result.tacticalBattle;
                  }
                  const navalIds = new Set((result.state?.navalRows ?? []).map((r) => r.navalUnitId));
                  S.tacticalPendingMarches = S.tacticalPendingMarches.filter((m) => m.subUnitId !== prev);
                  S.pendingEmbarkOrders = S.pendingEmbarkOrders.filter((e) => !navalIds.has(e.navalUnitId));
                  updatePendingOrdersSidebar();
                }
              }
              refreshSameHexSealiftSection();
              requestRedraw();
              return;
            }
            const result = await api.updateSealiftSlot({
              h3Index,
              navalUnitId: row.navalUnitId,
              slotIndex,
              landUnitId: null,
            });
            if (!result.success) {
              showMapToast(formatTargetingValidationReason(result.reason, 'Failed to debark unit.'));
            } else {
              await refreshGameStateAfterSealiftChange();
            }
            refreshSameHexSealiftSection();
            requestRedraw();
        });
        slotRow.appendChild(debarkBtn);
        right.appendChild(slotRow);
      };

      addSlotControl(1, row.slot1UnitId, row.controlsDisabled, row.debarkSlot1Enabled);
      addSlotControl(2, row.slot2UnitId, row.controlsDisabled || row.slot2Disabled, row.debarkSlot2Enabled);
      rowEl.appendChild(right);
      section.appendChild(rowEl);
    }
    if (generation !== sealiftSectionRenderGeneration) return;
    removeSealiftSection(calloutEl);
    calloutEl.appendChild(section);
  } catch (err) {
    console.error('sealift stack section failed:', err);
  }
}
