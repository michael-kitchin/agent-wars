import { cellToLatLng } from 'h3-js';
import type { AirStrikeTargetType } from '../../shared/ipcTypes';
import {
  buildHumanOrderGroupPreviewEnvelope,
  representativeMarchPreviewUnitIdsByOriginH3,
} from '../../shared/humanMarchPreviewGroupAssembly';
import { buildTacticalMarchHoverPreview } from '../../shared/tacticalMarchHoverPreview';
import {
  collectTacticalRangedSlowTerrainLabels,
  formatOrderPreviewImpactHtml,
  sortSlowTerrainLabels,
} from '../../shared/orderPreviewSlowTerrainTooltip';
import { unitHasTacticalRangedBaseline } from '../../shared/tacticalRanges';
import {
  formatPendingAirStrikeSidebarLabel,
  formatPendingRangedAttackSidebarLabel,
} from './orderLabelFormatting';
import { withTacticalHumanDraftPrefetchInvalidation } from '../openRouter/openRouterRuntime';
import { rendererSharedState as S } from '../core/state';
import type { HoverRoutePreviewState } from '../core/types';
import { resolveOrderBlockHexTooltipMessage, showOrderBlockHexTooltip } from '../map/orderBlockHexTooltip';
import { hideOrderSlowerHexTooltip, showOrderSlowerHexTooltip } from '../map/orderSlowerHexTooltip';

/**
 * Publishes `S.hoverRoutePreview` and synchronizes the transient “Blocked: …” hover hint for invalid march/ranged targets.
 *
 * Purpose: Keeps tactical and strategic preview paths aligned on when to show terrain vs range blocking copy (air: range only).
 * When to use: Only from `refreshHoverRoutePreview` after validation / preview envelopes are computed.
 * Expected outcome: Redraw requested; `#order-block-tooltip` / `#order-slower-tooltip` hidden when `preview` is null or neither hint applies.
 * Exceptions: None.
 */
function publishHoverRoutePreview(
  deps: TacticalOrderDeps,
  preview: HoverRoutePreviewState | null,
  rangedValidationReason: string | null,
  airStrikeValidationReason: string | null
): void {
  S.hoverRoutePreview = preview;
  if (!preview) {
    showOrderBlockHexTooltip(null);
    hideOrderSlowerHexTooltip();
    deps.requestRedraw();
    return;
  }
  const msg = resolveOrderBlockHexTooltipMessage(
    preview.hoveredH3Index,
    preview.data,
    preview.renderAsSupportTargeting === 'ranged',
    preview.renderAsSupportTargeting === 'air',
    preview.renderAsSupportTargeting === 'ranged' ? rangedValidationReason : null,
    preview.renderAsSupportTargeting === 'air' ? airStrikeValidationReason : null
  );
  let slowHtml: string | null = null;
  if (!msg && preview.renderAsSupportTargeting === 'ranged' && preview.data.validForAll && S.tacticalBattleSnapshot) {
    const ids = preview.data.previews.map((p) => p.unitId);
    const labels = sortSlowTerrainLabels(collectTacticalRangedSlowTerrainLabels(S.tacticalBattleSnapshot, ids));
    slowHtml = formatOrderPreviewImpactHtml({ slower: labels, roadRail: false });
  } else if (!msg && !preview.renderAsSupportTargeting && preview.data.validForAll) {
    const imp = preview.data.orderPreviewTerrainImpact ?? null;
    if (imp && (imp.slower.length > 0 || imp.roadRail)) {
      slowHtml = formatOrderPreviewImpactHtml({ slower: [...imp.slower], roadRail: imp.roadRail });
    }
  }
  if (msg) {
    hideOrderSlowerHexTooltip();
    showOrderBlockHexTooltip(msg);
  } else {
    showOrderBlockHexTooltip(null);
    showOrderSlowerHexTooltip(slowHtml);
  }
  deps.requestRedraw();
}

/**
 * Documents the `TacticalOrderDeps` interface as a named contract surface (interface TacticalOrderDeps).

 * Purpose: Supports maintainability by documenting why `TacticalOrderDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface TacticalOrderDeps {
    /**
   * Specifies the contract for the `clearSelection` member (clearSelection: () => void;).

   * Contract: Describes stable behavior for callers of `clearSelection` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
clearSelection: () => void;
    /**
   * Specifies the contract for the `requestRedraw` member (requestRedraw: () => void;).

   * Contract: Describes stable behavior for callers of `requestRedraw` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
requestRedraw: () => void;
    /**
   * Specifies the contract for the `redraw` member (redraw: () => void;).

   * Contract: Describes stable behavior for callers of `redraw` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
redraw: () => void;
    /**
   * Specifies the contract for the `updateSidebar` member (updateSidebar: () => void;).

   * Contract: Describes stable behavior for callers of `updateSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateSidebar: () => void;
    /**
   * Specifies the contract for the `updatePendingOrdersSidebar` member (updatePendingOrdersSidebar: () => void;).

   * Contract: Describes stable behavior for callers of `updatePendingOrdersSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updatePendingOrdersSidebar: () => void;
    /**
   * Specifies the contract for the `updateRangedSidebar` member (updateRangedSidebar: () => void;).

   * Contract: Describes stable behavior for callers of `updateRangedSidebar` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateRangedSidebar: () => void;
    /**
   * Specifies the contract for the `refreshStackCalloutIfOpen` member (refreshStackCalloutIfOpen: () => void;).

   * Contract: Describes stable behavior for callers of `refreshStackCalloutIfOpen` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
refreshStackCalloutIfOpen: () => void;
    /**
   * Specifies the contract for the `refreshHumanStandingOrders` member (refreshHumanStandingOrders: () => Promise<void>;).

   * Contract: Describes stable behavior for callers of `refreshHumanStandingOrders` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
refreshHumanStandingOrders: () => Promise<void>;
    /**
   * Specifies the contract for the `showMapToast` member (showMapToast: (message: string, options?: { isError?: boolean }) => void;).

   * Contract: Describes stable behavior for callers of `showMapToast` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
showMapToast: (message: string, options?: { isError?: boolean }) => void;
    /**
   * Specifies the contract for the `createSidebarOrderRow` member (createSidebarOrderRow: (args: { labelText: string; selected: boolean; onToggleSelect: (event: MouseEvent) => void; onCancel: () => void;).

   * Contract: Describes stable behavior for callers of `createSidebarOrderRow` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
createSidebarOrderRow: (args: {
    labelText: string;
    selected: boolean;
    onToggleSelect: (event: MouseEvent) => void;
    onCancel: () => void;
    compactBlueButtons?: boolean;
  }) => HTMLElement;
    /**
   * Specifies the contract for the `formatUnitArrowLabel` member (formatUnitArrowLabel: (unitId: string, targetLabel: string) => string;).

   * Contract: Describes stable behavior for callers of `formatUnitArrowLabel` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
formatUnitArrowLabel: (unitId: string, targetLabel: string) => string;
    /**
   * Specifies the contract for the `applySelectionFromSidebarUnitButton` member (applySelectionFromSidebarUnitButton: (unitId: string, event: MouseEvent) => void;).

   * Contract: Describes stable behavior for callers of `applySelectionFromSidebarUnitButton` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
applySelectionFromSidebarUnitButton: (unitId: string, event: MouseEvent) => void;
}

/**
 * Defines the `getRepresentativeSelectedUnitIdsByOrigin` function shape (export function getRepresentativeSelectedUnitIdsByOrigin(): string[]).

 * Purpose: Supports maintainability by documenting why `getRepresentativeSelectedUnitIdsByOrigin` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function getRepresentativeSelectedUnitIdsByOrigin(): string[] {
  if (!S.gameState) return [...S.selectedUnitIds];
  const tb = S.tacticalBattleSnapshot;
  if (tb) {
    const byId = new Map(tb.subUnits.map((u) => [u.id, u]));
    const seenOrigins = new Set<string>();
    const representatives: string[] = [];
    for (const unitId of S.selectedUnitIds) {
      const unit = byId.get(unitId);
      if (!unit || unit.player !== 'human') continue;
      if (seenOrigins.has(unit.h3Index)) continue;
      seenOrigins.add(unit.h3Index);
      representatives.push(unitId);
    }
    return representatives;
  }
  const byId = new Map(S.gameState.units.map((u) => [u.id, u]));
  const seenOrigins = new Set<string>();
  const representatives: string[] = [];
  for (const unitId of S.selectedUnitIds) {
    const unit = byId.get(unitId);
    if (!unit || unit.player !== 'human') continue;
    if (seenOrigins.has(unit.h3Index)) continue;
    seenOrigins.add(unit.h3Index);
    representatives.push(unitId);
  }
  return representatives;
}

/**
 * Defines the `replacePendingRangedAttacksForSelected` function shape (export function replacePendingRangedAttacksForSelected(selectedIds: string[], targetH3Index: string): void).

 * Purpose: Supports maintainability by documenting why `replacePendingRangedAttacksForSelected` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function replacePendingRangedAttacksForSelected(selectedIds: string[], targetH3Index: string): void {
  withTacticalHumanDraftPrefetchInvalidation(() => {
    S.pendingRangedAttacks = S.pendingRangedAttacks.filter((row) => !selectedIds.includes(row.unitId));
    for (const unitId of selectedIds) {
      S.pendingRangedAttacks.push({ unitId, targetH3Index });
    }
  });
}

/**
 * Defines the `replacePendingAirStrikesForSelected` function shape (export function replacePendingAirStrikesForSelected().

 * Purpose: Supports maintainability by documenting why `replacePendingAirStrikesForSelected` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function replacePendingAirStrikesForSelected(
  selectedIds: string[],
  targetH3Index: string,
  targetType: AirStrikeTargetType
): void {
  withTacticalHumanDraftPrefetchInvalidation(() => {
    S.pendingAirStrikes = S.pendingAirStrikes.filter((row) => !selectedIds.includes(row.unitId));
    for (const unitId of selectedIds) {
      S.pendingAirStrikes.push({ unitId, targetH3Index, targetType });
    }
  });
}

/**
 * Defines the `replacePendingFerryOrdersForSelected` function shape (export function replacePendingFerryOrdersForSelected(selectedIds: string[], destinationH3Index: string): void).

 * Purpose: Supports maintainability by documenting why `replacePendingFerryOrdersForSelected` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function replacePendingFerryOrdersForSelected(selectedIds: string[], destinationH3Index: string): void {
  withTacticalHumanDraftPrefetchInvalidation(() => {
    S.pendingFerryOrders = S.pendingFerryOrders.filter((row) => !selectedIds.includes(row.unitId));
    for (const unitId of selectedIds) {
      S.pendingFerryOrders.push({ unitId, destinationH3Index });
    }
  });
}

/**
 * Defines the `clearPendingTacticalOrders` function shape (export function clearPendingTacticalOrders(): void).

 * Purpose: Supports maintainability by documenting why `clearPendingTacticalOrders` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearPendingTacticalOrders(): void {
  withTacticalHumanDraftPrefetchInvalidation(() => {
    S.pendingRangedAttacks = [];
    S.rangedModeActive = false;
    S.pendingAirStrikes = [];
    S.airStrikeModeActive = false;
    S.pendingFerryOrders = [];
    S.pendingEmbarkOrders = [];
    S.tacticalPendingMarches = [];
  });
}

/**
 * Defines the `clearCommittedOrderDraftState` function shape (export function clearCommittedOrderDraftState(deps: TacticalOrderDeps): void).

 * Purpose: Supports maintainability by documenting why `clearCommittedOrderDraftState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function clearCommittedOrderDraftState(deps: TacticalOrderDeps): void {
  deps.clearSelection();
  S.selectedUnitIdsAtMouseDown = [];
  S.selectedHexIndex = null;
  S.hideCommittedOrderLinesAfterReady = false;
  S.hoverRoutePreview = null;
  showOrderBlockHexTooltip(null);
  hideOrderSlowerHexTooltip();
}

/**
 * Defines the `refreshHoverRoutePreview` function shape (export async function refreshHoverRoutePreview(deps: TacticalOrderDeps): Promise<void>).

 * Purpose: Supports maintainability by documenting why `refreshHoverRoutePreview` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export async function refreshHoverRoutePreview(deps: TacticalOrderDeps): Promise<void> {
  const unitIds = [...S.selectedUnitIds];
  const hoveredH3 = S.hoveredHexH3;
  const seq = ++S.hoverPreviewRequestSeq;
  if (S.tacticalBattleSnapshot) {
    if (unitIds.length === 0 || !hoveredH3) {
      publishHoverRoutePreview(deps, null, null, null);
      return;
    }
    const tb = S.tacticalBattleSnapshot;
    if (S.rangedModeActive && !S.airStrikeModeActive) {
      if (!window.gameApi?.validateGroupRangedTarget) {
        publishHoverRoutePreview(deps, null, null, null);
        return;
      }
      const validation = await window.gameApi.validateGroupRangedTarget({ unitIds, targetH3Index: hoveredH3 });
      if (seq !== S.hoverPreviewRequestSeq) return;
      if (S.hoveredHexH3 !== hoveredH3) return;
      const currentSelected = [...S.selectedUnitIds].sort().join('|');
      const requestedSelected = [...unitIds].sort().join('|');
      if (currentSelected !== requestedSelected) return;
      const valid = validation.success;
      const previewUnitIds = representativeMarchPreviewUnitIdsByOriginH3(
        unitIds.map((id) => ({
          unitId: id,
          originH3: tb.subUnits.find((s) => s.id === id)?.h3Index ?? '',
        }))
      );
      const previews = previewUnitIds.map((unitId) => {
        const sub = tb.subUnits.find((s) => s.id === unitId && s.player === 'human');
        if (!sub) {
          return {
            unitId,
            preview: {
              valid: false,
              showInvalidMarker: true,
              invalidReason: 'Unknown unit',
              segments: [],
            },
          };
        }
        const [lat1, lng1] = cellToLatLng(sub.h3Index);
        const [lat2, lng2] = cellToLatLng(hoveredH3);
        return {
          unitId,
          originH3Index: sub.h3Index,
          preview: {
            valid,
            showInvalidMarker: !valid,
            invalidReason: valid ? '' : (validation.reason ?? 'Invalid target'),
            segments: [{ turn: 1, hexes: [[lat1, lng1], [lat2, lng2]] as [number, number][] }],
            arrowLatLng: [lat2, lng2] as [number, number],
          },
        };
      });
      const data = buildHumanOrderGroupPreviewEnvelope({ previews, slowestMovementRange: 99 });
      publishHoverRoutePreview(
        deps,
        { hoveredH3Index: hoveredH3, data, renderAsSupportTargeting: 'ranged' },
        valid ? null : (validation.reason ?? null),
        null
      );
      return;
    }
    if (S.airStrikeModeActive) {
      if (!window.gameApi?.validateGroupAirStrikeTarget) {
        publishHoverRoutePreview(deps, null, null, null);
        return;
      }
      const validation = await window.gameApi.validateGroupAirStrikeTarget({
        unitIds,
        targetH3Index: hoveredH3,
        targetType: S.airStrikeTargetType,
      });
      if (seq !== S.hoverPreviewRequestSeq) return;
      if (S.hoveredHexH3 !== hoveredH3) return;
      const currentSelected = [...S.selectedUnitIds].sort().join('|');
      const requestedSelected = [...unitIds].sort().join('|');
      if (currentSelected !== requestedSelected) return;
      const valid = validation.success;
      const previewUnitIds = representativeMarchPreviewUnitIdsByOriginH3(
        unitIds.map((id) => ({
          unitId: id,
          originH3: tb.subUnits.find((s) => s.id === id)?.h3Index ?? '',
        }))
      );
      const previews = previewUnitIds.map((unitId) => {
        const sub = tb.subUnits.find((s) => s.id === unitId && s.player === 'human');
        if (!sub) {
          return {
            unitId,
            preview: {
              valid: false,
              showInvalidMarker: true,
              invalidReason: 'Unknown unit',
              segments: [],
            },
          };
        }
        const [lat1, lng1] = cellToLatLng(sub.h3Index);
        const [lat2, lng2] = cellToLatLng(hoveredH3);
        return {
          unitId,
          originH3Index: sub.h3Index,
          preview: {
            valid,
            showInvalidMarker: !valid,
            invalidReason: valid ? '' : (validation.reason ?? 'Invalid target'),
            segments: [{ turn: 1, hexes: [[lat1, lng1], [lat2, lng2]] as [number, number][] }],
            arrowLatLng: [lat2, lng2] as [number, number],
          },
        };
      });
      const data = buildHumanOrderGroupPreviewEnvelope({ previews, slowestMovementRange: 99 });
      publishHoverRoutePreview(
        deps,
        { hoveredH3Index: hoveredH3, data, renderAsSupportTargeting: 'air' },
        null,
        valid ? null : (validation.reason ?? null)
      );
      return;
    }
    const data = buildTacticalMarchHoverPreview(tb, unitIds, hoveredH3);
    if (seq !== S.hoverPreviewRequestSeq) return;
    if (S.hoveredHexH3 !== hoveredH3) return;
    const currentSelected = [...S.selectedUnitIds].sort().join('|');
    const requestedSelected = [...unitIds].sort().join('|');
    if (currentSelected !== requestedSelected) return;
    publishHoverRoutePreview(deps, { hoveredH3Index: hoveredH3, data }, null, null);
    return;
  }
  if (unitIds.length === 0 || !hoveredH3 || !S.gameState) {
    publishHoverRoutePreview(deps, null, null, null);
    return;
  }
  const gs = S.gameState;
  if (S.rangedModeActive && !S.airStrikeModeActive) {
    if (!window.gameApi?.validateGroupRangedTarget) {
      publishHoverRoutePreview(deps, null, null, null);
      return;
    }
    const validation = await window.gameApi.validateGroupRangedTarget({ unitIds, targetH3Index: hoveredH3 });
    if (seq !== S.hoverPreviewRequestSeq) return;
    if (S.hoveredHexH3 !== hoveredH3) return;
    const currentSelected = [...S.selectedUnitIds].sort().join('|');
    const requestedSelected = [...unitIds].sort().join('|');
    if (currentSelected !== requestedSelected) return;
    const valid = validation.success;
    const previewUnitIds = representativeMarchPreviewUnitIdsByOriginH3(
      unitIds.map((id) => ({
        unitId: id,
        originH3: gs.units.find((u) => u.id === id)?.h3Index ?? '',
      }))
    );
    const previews = previewUnitIds.map((unitId) => {
      const unit = gs.units.find((u) => u.id === unitId && u.player === 'human');
      if (!unit) {
        return {
          unitId,
          preview: {
            valid: false,
            showInvalidMarker: true,
            invalidReason: 'Unknown unit',
            segments: [],
          },
        };
      }
      const [lat1, lng1] = cellToLatLng(unit.h3Index);
      const [lat2, lng2] = cellToLatLng(hoveredH3);
      return {
        unitId,
        originH3Index: unit.h3Index,
        preview: {
          valid,
          showInvalidMarker: !valid,
          invalidReason: valid ? '' : (validation.reason ?? 'Invalid target'),
          segments: [{ turn: 1, hexes: [[lat1, lng1], [lat2, lng2]] as [number, number][] }],
          arrowLatLng: [lat2, lng2] as [number, number],
        },
      };
    });
    const data = buildHumanOrderGroupPreviewEnvelope({ previews, slowestMovementRange: 99 });
    publishHoverRoutePreview(
      deps,
      { hoveredH3Index: hoveredH3, data, renderAsSupportTargeting: 'ranged' },
      valid ? null : (validation.reason ?? null),
      null
    );
    return;
  }
  if (S.airStrikeModeActive) {
    if (!window.gameApi?.validateGroupAirStrikeTarget) {
      publishHoverRoutePreview(deps, null, null, null);
      return;
    }
    const validation = await window.gameApi.validateGroupAirStrikeTarget({
      unitIds,
      targetH3Index: hoveredH3,
      targetType: S.airStrikeTargetType,
    });
    if (seq !== S.hoverPreviewRequestSeq) return;
    if (S.hoveredHexH3 !== hoveredH3) return;
    const currentSelected = [...S.selectedUnitIds].sort().join('|');
    const requestedSelected = [...unitIds].sort().join('|');
    if (currentSelected !== requestedSelected) return;
    const valid = validation.success;
    const previewUnitIds = representativeMarchPreviewUnitIdsByOriginH3(
      unitIds.map((id) => ({
        unitId: id,
        originH3: gs.units.find((u) => u.id === id)?.h3Index ?? '',
      }))
    );
    const previews = previewUnitIds.map((unitId) => {
      const unit = gs.units.find((u) => u.id === unitId && u.player === 'human');
      if (!unit) {
        return {
          unitId,
          preview: {
            valid: false,
            showInvalidMarker: true,
            invalidReason: 'Unknown unit',
            segments: [],
          },
        };
      }
      const [lat1, lng1] = cellToLatLng(unit.h3Index);
      const [lat2, lng2] = cellToLatLng(hoveredH3);
      return {
        unitId,
        originH3Index: unit.h3Index,
        preview: {
          valid,
          showInvalidMarker: !valid,
          invalidReason: valid ? '' : (validation.reason ?? 'Invalid target'),
          segments: [{ turn: 1, hexes: [[lat1, lng1], [lat2, lng2]] as [number, number][] }],
          arrowLatLng: [lat2, lng2] as [number, number],
        },
      };
    });
    const data = buildHumanOrderGroupPreviewEnvelope({ previews, slowestMovementRange: 99 });
    publishHoverRoutePreview(
      deps,
      { hoveredH3Index: hoveredH3, data, renderAsSupportTargeting: 'air' },
      null,
      valid ? null : (validation.reason ?? null)
    );
    return;
  }
  if (!window.gameApi?.previewHumanMarchOrders) {
    publishHoverRoutePreview(deps, null, null, null);
    return;
  }
  const data = await window.gameApi.previewHumanMarchOrders({ unitIds, hoveredH3Index: hoveredH3 });
  if (seq !== S.hoverPreviewRequestSeq) return;
  if (S.hoveredHexH3 !== hoveredH3) return;
  const currentSelected = [...S.selectedUnitIds].sort().join('|');
  const requestedSelected = [...unitIds].sort().join('|');
  if (currentSelected !== requestedSelected) return;
  publishHoverRoutePreview(deps, { hoveredH3Index: hoveredH3, data }, null, null);
}

/**
 * Defines the `cancelOrderForUnit` function shape (export async function cancelOrderForUnit(unitId: string, deps: TacticalOrderDeps): Promise<void>).

 * Purpose: Supports maintainability by documenting why `cancelOrderForUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export async function cancelOrderForUnit(unitId: string, deps: TacticalOrderDeps): Promise<void> {
  if (!window.gameApi?.cancelHumanStandingOrder) return;
  const result = await window.gameApi.cancelHumanStandingOrder({ unitId });
  if (!result.success) {
    deps.showMapToast(result.reason ?? 'Failed to cancel order.', { isError: true });
  }
  await deps.refreshHumanStandingOrders();
  deps.updatePendingOrdersSidebar();
  deps.redraw();
}

/**
 * Defines the `cancelRangedForUnit` function shape (export function cancelRangedForUnit(unitId: string, deps: TacticalOrderDeps): void).

 * Purpose: Supports maintainability by documenting why `cancelRangedForUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function cancelRangedForUnit(unitId: string, deps: TacticalOrderDeps): void {
  withTacticalHumanDraftPrefetchInvalidation(() => {
    S.pendingRangedAttacks = S.pendingRangedAttacks.filter((r) => r.unitId !== unitId);
    if (S.tacticalBattleSnapshot) {
      S.pendingEmbarkOrders = S.pendingEmbarkOrders.filter((e) => e.unitId !== unitId);
    }
    S.rangedModeActive = false;
  });
  void refreshHoverRoutePreview(deps);
  deps.updateSidebar();
  deps.updatePendingOrdersSidebar();
  deps.updateRangedSidebar();
  deps.refreshStackCalloutIfOpen();
  deps.redraw();
}

/**
 * Defines the `cancelAirStrikeForUnit` function shape (export function cancelAirStrikeForUnit(unitId: string, deps: TacticalOrderDeps): void).

 * Purpose: Supports maintainability by documenting why `cancelAirStrikeForUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function cancelAirStrikeForUnit(unitId: string, deps: TacticalOrderDeps): void {
  withTacticalHumanDraftPrefetchInvalidation(() => {
    S.pendingAirStrikes = S.pendingAirStrikes.filter((r) => r.unitId !== unitId);
    if (S.tacticalBattleSnapshot) {
      S.pendingEmbarkOrders = S.pendingEmbarkOrders.filter((e) => e.unitId !== unitId);
    }
    S.airStrikeModeActive = false;
  });
  void refreshHoverRoutePreview(deps);
  deps.updateSidebar();
  deps.updatePendingOrdersSidebar();
  deps.updateRangedSidebar();
  deps.refreshStackCalloutIfOpen();
  deps.redraw();
}

/**
 * Defines the `cancelFerryForUnit` function shape (export function cancelFerryForUnit(unitId: string, deps: TacticalOrderDeps): void).

 * Purpose: Supports maintainability by documenting why `cancelFerryForUnit` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function cancelFerryForUnit(unitId: string, deps: TacticalOrderDeps): void {
  withTacticalHumanDraftPrefetchInvalidation(() => {
    S.pendingFerryOrders = S.pendingFerryOrders.filter((r) => r.unitId !== unitId);
    if (S.tacticalBattleSnapshot) {
      S.pendingEmbarkOrders = S.pendingEmbarkOrders.filter((e) => e.unitId !== unitId);
    }
  });
  void refreshHoverRoutePreview(deps);
  deps.updateSidebar();
  deps.updatePendingOrdersSidebar();
  deps.redraw();
}

/**
 * Defines the `updateRangedSidebar` function shape (export function updateRangedSidebar(deps: TacticalOrderDeps): void).

 * Purpose: Supports maintainability by documenting why `updateRangedSidebar` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function updateRangedSidebar(deps: TacticalOrderDeps): void {
  const listEl = document.getElementById('ranged-attacks-list');
  const strikeListEl = document.getElementById('air-strikes-list');
  const btnEl = document.getElementById('ranged-attack-btn') as HTMLButtonElement | null;
  const strikeTypeEl = document.getElementById('air-strike-target-type') as HTMLSelectElement | null;
  const strikeCancelEl = document.getElementById('air-strike-cancel-btn') as HTMLButtonElement | null;
  if (!listEl) return;

  const tacticalPositions = S.tacticalBattleSnapshot?.subUnits;
  listEl.innerHTML = '';
  if (S.pendingRangedAttacks.length === 0) {
    const span = document.createElement('span');
    span.textContent = 'None';
    span.style.color = '#666';
    listEl.appendChild(span);
  } else {
    for (const r of S.pendingRangedAttacks) {
      const row = deps.createSidebarOrderRow({
        labelText: deps.formatUnitArrowLabel(
          r.unitId,
          formatPendingRangedAttackSidebarLabel(S.gameState, r, tacticalPositions)
        ),
        selected: S.selectedUnitIds.includes(r.unitId),
        onToggleSelect: (event) => deps.applySelectionFromSidebarUnitButton(r.unitId, event),
        onCancel: () => cancelRangedForUnit(r.unitId, deps),
        compactBlueButtons: true,
      });
      listEl.appendChild(row);
    }
  }
  if (strikeListEl) {
    strikeListEl.innerHTML = '';
    if (S.pendingAirStrikes.length === 0) {
      const span = document.createElement('span');
      span.textContent = 'None';
      span.style.color = '#666';
      strikeListEl.appendChild(span);
    } else {
      for (const strike of S.pendingAirStrikes) {
        const row = deps.createSidebarOrderRow({
          labelText: deps.formatUnitArrowLabel(
            strike.unitId,
            formatPendingAirStrikeSidebarLabel(S.gameState, strike, tacticalPositions)
          ),
          selected: S.selectedUnitIds.includes(strike.unitId),
          onToggleSelect: (event) => deps.applySelectionFromSidebarUnitButton(strike.unitId, event),
          onCancel: () => cancelAirStrikeForUnit(strike.unitId, deps),
          compactBlueButtons: true,
        });
        strikeListEl.appendChild(row);
      }
    }
  }

  if (btnEl) {
    const tb = S.tacticalBattleSnapshot;
    const selectedUnits = tb
      ? S.selectedUnitIds
          .map((id) => tb.subUnits.find((u) => u.id === id))
          .filter((unit): unit is NonNullable<typeof unit> => !!unit)
      : S.selectedUnitIds
          .map((id) => S.gameState?.units.find((u) => u.id === id))
          .filter((unit): unit is NonNullable<typeof unit> => !!unit);
    const allAir = selectedUnits.length > 0 && selectedUnits.every((unit) => unit.unitType === 'air');
    const allHaveRanged =
      selectedUnits.length > 0 && selectedUnits.every((unit) => unitHasTacticalRangedBaseline(unit.unitType));
    if (allAir) {
      btnEl.textContent = 'Strike';
      btnEl.style.display = S.airStrikeModeActive ? 'none' : 'inline-block';
      if (strikeTypeEl) {
        strikeTypeEl.style.display = S.airStrikeModeActive ? 'inline-block' : 'none';
        strikeTypeEl.value = S.airStrikeTargetType;
      }
      if (strikeCancelEl) {
        strikeCancelEl.style.display = S.airStrikeModeActive ? 'inline-block' : 'none';
      }
    } else if (allHaveRanged) {
      btnEl.style.display = 'inline-block';
      btnEl.textContent = S.rangedModeActive ? 'Cancel' : 'Ranged';
      if (strikeTypeEl) strikeTypeEl.style.display = 'none';
      if (strikeCancelEl) strikeCancelEl.style.display = 'none';
    } else {
      btnEl.style.display = 'none';
      S.rangedModeActive = false;
      S.airStrikeModeActive = false;
      if (strikeTypeEl) strikeTypeEl.style.display = 'none';
      if (strikeCancelEl) strikeCancelEl.style.display = 'none';
    }
  }
}
