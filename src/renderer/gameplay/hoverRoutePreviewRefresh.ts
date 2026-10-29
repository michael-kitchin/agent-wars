import { isMissileUnitType } from '../../shared/missileRules';
import { representativeMarchPreviewUnitIdsByOriginH3 } from '../../shared/humanMarchPreviewGroupAssembly';
import { buildTacticalMarchHoverPreview } from '../../shared/tacticalMarchHoverPreview';
import {
  buildTacticalFerryHoverPreview,
  buildTacticalMixedAirNonAirHoverEnvelope,
} from '../../shared/tacticalFerryHoverPreview';
import {
  hexTooltipSuppressedForOrderPlanning,
  resolutionPlaybackBlocksMapOrders,
} from '../../shared/mapOrderGestureGate';
import { resolveOrderPreviewEffectsTooltipHtml } from '../../shared/orderPreviewEffectsTooltip';
import { rendererSharedState as S } from '../core/state';
import type { HoverRoutePreviewState } from '../core/types';
import { resolveOrderBlockHexTooltipMessage, showOrderBlockHexTooltip } from '../map/orderBlockHexTooltip';
import { hideOrderSlowerHexTooltip, scheduleOrderEffectsTooltip } from '../map/orderSlowerHexTooltip';
import { clearTerrainTooltipTimer, hideTerrainTooltipVisual } from '../map/terrainTooltipStrategicState';
import { buildOrderPreviewEffectsTooltipInput } from './orderPreviewEffectsContext';
import { getPreviewHumanMarchOrders, getValidateGroupAirStrikeTarget, getValidateGroupMissileLaunchTarget, getValidateGroupRangedTarget } from './gameApiHumanOrderPreview';
import { buildGroupedSupportTargetingLinePreview } from './hoverRoutePreviewGroupedTargeting';
import { hoverRoutePreviewAsyncContextStillValid } from './hoverRoutePreviewStale';
import type { RefreshHoverRoutePreviewOptions } from './hoverRoutePreviewTypes';
import type { TacticalOrderDeps } from './tacticalOrderDeps';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';

/**
 * Publishes `S.hoverRoutePreview` and synchronizes the transient “Blocked: …” hover hint for invalid march/ranged targets.
 *
 * Purpose: Keeps tactical and strategic preview paths aligned on when to show terrain vs range blocking copy (air: range only).
 * When to use: Only from `refreshHoverRoutePreview` after validation / preview envelopes are computed.
 * Expected outcome: Redraw requested. `#order-block-tooltip` waits one second for an illegal preview. `#order-slower-tooltip` waits one second for terrain or weather that changes a legal order. The hex tooltip stays hidden while that planning gesture is armed.
 * Exceptions: None.
 */
function publishHoverRoutePreview(
  deps: TacticalOrderDeps,
  preview: HoverRoutePreviewState | null,
  supportValidationReason: string | null,
  allowBlockingOrderTooltip: boolean
): void {
  S.hoverRoutePreview = preview;
  const planningHidesHexTooltip = hexTooltipSuppressedForOrderPlanning({
    shiftHeld: S.shiftKeyActive,
    hasSelection: S.selectedUnitIds.length > 0,
    playbackActive: resolutionPlaybackBlocksMapOrders(S.resolutionMoveAnimation),
  });
  if (planningHidesHexTooltip) {
    clearTerrainTooltipTimer();
    hideTerrainTooltipVisual();
  }
  if (!preview) {
    showOrderBlockHexTooltip(null);
    hideOrderSlowerHexTooltip();
    deps.dismissMapDetailPopoversForHoverPlanning?.();
    deps.requestRedraw();
    return;
  }
  const msg = resolveOrderBlockHexTooltipMessage(
    preview.hoveredH3Index,
    preview.data,
    preview.renderAsSupportTargeting
      ? { kind: preview.renderAsSupportTargeting, reason: supportValidationReason }
      : null
  );
  const effectsHtml = resolveOrderPreviewEffectsTooltipHtml(
    buildOrderPreviewEffectsTooltipInput({
      preview,
      hasBlockedMessage: Boolean(msg),
    })
  );
  if (msg) {
    hideOrderSlowerHexTooltip();
    if (allowBlockingOrderTooltip) {
      showOrderBlockHexTooltip(msg);
    } else {
      showOrderBlockHexTooltip(null);
    }
  } else {
    showOrderBlockHexTooltip(null);
    if (planningHidesHexTooltip) {
      scheduleOrderEffectsTooltip(effectsHtml);
    } else {
      hideOrderSlowerHexTooltip();
    }
  }
  deps.dismissMapDetailPopoversForHoverPlanning?.();
  deps.requestRedraw();
}

/**
 * Reports whether the hover request that started this preview is still the one on screen.
 *
 * Purpose: Tactical and strategic preview branches share one stale check so a late response cannot publish over a newer hover.
 * When to use: After every await in `refreshHoverRoutePreview`, before writing `S.hoverRoutePreview`.
 * Expected outcome: False when the sequence, hovered cell, or selected unit ids changed.
 * Exceptions: None.
 */
function hoverPreviewStillCurrent(seq: number, hoveredH3: string, unitIds: readonly string[]): boolean {
  return hoverRoutePreviewAsyncContextStillValid({
    seqAtStart: seq,
    hoveredH3,
    unitIdsAtStart: unitIds,
  });
}

/**
 * Publishes a ranged or air support-targeting hover preview.
 *
 * Purpose: The tactical and strategic ranged and air branches share the representative-origin lines and the reason slot.
 * When to use: After that branch's validator returns and the hover is still current.
 * Expected outcome: A support-targeting preview, with the blocking reason in the ranged slot or the air slot matching `supportKind`.
 * Exceptions: None.
 */
function publishGroupedSupportTargetingPreview(args: {
  deps: TacticalOrderDeps;
  hoveredH3: string;
  unitIds: readonly string[];
  validation: { success: boolean; reason?: string | null };
  supportKind: 'ranged' | 'air' | 'missile';
  originH3ForGrouping: (unitId: string) => string | undefined;
  originH3ForPreview: (unitId: string) => string | undefined;
  allowBlockingOrderTooltip: boolean;
}): void {
  const valid = args.validation.success;
  const reason = valid ? null : (args.validation.reason ?? null);
  const previewUnitIds = representativeMarchPreviewUnitIdsByOriginH3(
    args.unitIds.map((id) => ({
      unitId: id,
      originH3: args.originH3ForGrouping(id) ?? '',
    }))
  );
  const data = buildGroupedSupportTargetingLinePreview(
    previewUnitIds,
    args.hoveredH3,
    valid,
    args.validation.reason ?? null,
    args.originH3ForPreview
  );
  publishHoverRoutePreview(args.deps, { hoveredH3Index: args.hoveredH3, data, renderAsSupportTargeting: args.supportKind }, reason, args.allowBlockingOrderTooltip);
}

/**
 * Defines the `refreshHoverRoutePreview` function shape (export async function refreshHoverRoutePreview(deps: TacticalOrderDeps, options?: RefreshHoverRoutePreviewOptions): Promise<void>).
 *
 * Purpose: Supports maintainability by documenting why `refreshHoverRoutePreview` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export async function refreshHoverRoutePreview(
  deps: TacticalOrderDeps,
  options?: RefreshHoverRoutePreviewOptions
): Promise<void> {
  const allowBlockingOrderTooltip = options?.allowBlockingOrderTooltip === true;
  const unitIds = [...S.selectedUnitIds];
  const hoveredH3 = S.hoveredHexH3;
  const seq = ++S.hoverPreviewRequestSeq;
  if (S.tacticalBattleSnapshot) {
    if (unitIds.length === 0 || !hoveredH3) {
      publishHoverRoutePreview(deps, null, null, allowBlockingOrderTooltip);
      return;
    }
    const tb = S.tacticalBattleSnapshot;
    if (S.rangedModeActive && !S.airStrikeModeActive) {
      const validateRanged = getValidateGroupRangedTarget();
      if (!validateRanged) {
        publishHoverRoutePreview(deps, null, null, allowBlockingOrderTooltip);
        return;
      }
      const validation = await validateRanged({ unitIds, targetH3Index: hoveredH3 });
      if (!hoverPreviewStillCurrent(seq, hoveredH3, unitIds)) return;
      publishGroupedSupportTargetingPreview({
        deps,
        hoveredH3,
        unitIds,
        validation,
        supportKind: 'ranged',
        originH3ForGrouping: (unitId) => tb.subUnits.find((s) => s.id === unitId)?.h3Index,
        originH3ForPreview: (unitId) => tb.subUnits.find((s) => s.id === unitId && s.player === HUMAN_SEAT_ID)?.h3Index,
        allowBlockingOrderTooltip,
      });
      return;
    }
    if (S.airStrikeModeActive) {
      const validateAir = getValidateGroupAirStrikeTarget();
      if (!validateAir) {
        publishHoverRoutePreview(deps, null, null, allowBlockingOrderTooltip);
        return;
      }
      const validation = await validateAir({
        unitIds,
        targetH3Index: hoveredH3,
        targetType: S.airStrikeTargetType,
      });
      if (!hoverPreviewStillCurrent(seq, hoveredH3, unitIds)) return;
      publishGroupedSupportTargetingPreview({
        deps,
        hoveredH3,
        unitIds,
        validation,
        supportKind: 'air',
        originH3ForGrouping: (unitId) => tb.subUnits.find((s) => s.id === unitId)?.h3Index,
        originH3ForPreview: (unitId) => tb.subUnits.find((s) => s.id === unitId && s.player === HUMAN_SEAT_ID)?.h3Index,
        allowBlockingOrderTooltip,
      });
      return;
    }
    const selectedHumanTactical = unitIds
      .map((id) => tb.subUnits.find((s) => s.id === id && s.player === HUMAN_SEAT_ID))
      .filter((u): u is NonNullable<typeof u> => !!u);
    const tacticalHasAir = selectedHumanTactical.some((u) => u.unitType === 'air');
    const tacticalHasNonAir = selectedHumanTactical.some((u) => u.unitType !== 'air');
    if (tacticalHasAir && tacticalHasNonAir) {
      const data = buildTacticalMixedAirNonAirHoverEnvelope(unitIds);
      if (!hoverPreviewStillCurrent(seq, hoveredH3, unitIds)) return;
      publishHoverRoutePreview(deps, { hoveredH3Index: hoveredH3, data }, null, allowBlockingOrderTooltip);
      return;
    }
    const allAirTactical =
      selectedHumanTactical.length > 0 && selectedHumanTactical.every((u) => u.unitType === 'air');
    if (allAirTactical) {
      const validateFerry = window.gameApi?.validateGroupFerryTarget;
      if (!validateFerry) {
        publishHoverRoutePreview(deps, null, null, allowBlockingOrderTooltip);
        return;
      }
      const validation = await validateFerry({ unitIds, destinationH3Index: hoveredH3 });
      if (!hoverPreviewStillCurrent(seq, hoveredH3, unitIds)) return;
      const data = buildTacticalFerryHoverPreview(tb, unitIds, hoveredH3, validation);
      publishHoverRoutePreview(deps, { hoveredH3Index: hoveredH3, data }, null, allowBlockingOrderTooltip);
      return;
    }
    const data = buildTacticalMarchHoverPreview(tb, unitIds, hoveredH3);
    if (!hoverPreviewStillCurrent(seq, hoveredH3, unitIds)) return;
    publishHoverRoutePreview(deps, { hoveredH3Index: hoveredH3, data }, null, allowBlockingOrderTooltip);
    return;
  }
  if (unitIds.length === 0 || !hoveredH3 || !S.gameState) {
    publishHoverRoutePreview(deps, null, null, allowBlockingOrderTooltip);
    return;
  }
  const gs = S.gameState;
  if (S.rangedModeActive && !S.airStrikeModeActive) {
    const validateRanged = getValidateGroupRangedTarget();
    if (!validateRanged) {
      publishHoverRoutePreview(deps, null, null, allowBlockingOrderTooltip);
      return;
    }
    const validation = await validateRanged({ unitIds, targetH3Index: hoveredH3 });
    if (!hoverPreviewStillCurrent(seq, hoveredH3, unitIds)) return;
    publishGroupedSupportTargetingPreview({
      deps,
      hoveredH3,
      unitIds,
      validation,
      supportKind: 'ranged',
      originH3ForGrouping: (unitId) => gs.units.find((u) => u.id === unitId)?.h3Index,
      originH3ForPreview: (unitId) => gs.units.find((u) => u.id === unitId && u.player === HUMAN_SEAT_ID)?.h3Index,
      allowBlockingOrderTooltip,
    });
    return;
  }
  if (S.airStrikeModeActive) {
    const validateAir = getValidateGroupAirStrikeTarget();
    if (!validateAir) {
      publishHoverRoutePreview(deps, null, null, allowBlockingOrderTooltip);
      return;
    }
    const validation = await validateAir({
      unitIds,
      targetH3Index: hoveredH3,
      targetType: S.airStrikeTargetType,
    });
    if (!hoverPreviewStillCurrent(seq, hoveredH3, unitIds)) return;
    publishGroupedSupportTargetingPreview({
      deps,
      hoveredH3,
      unitIds,
      validation,
      supportKind: 'air',
      originH3ForGrouping: (unitId) => gs.units.find((u) => u.id === unitId)?.h3Index,
      originH3ForPreview: (unitId) => gs.units.find((u) => u.id === unitId && u.player === HUMAN_SEAT_ID)?.h3Index,
      allowBlockingOrderTooltip,
    });
    return;
  }
  if (S.missileLaunchModeActive) {
    const validateMissile = getValidateGroupMissileLaunchTarget();
    if (!validateMissile) {
      publishHoverRoutePreview(deps, null, null, allowBlockingOrderTooltip);
      return;
    }
    const validation = await validateMissile({ unitIds, targetH3Index: hoveredH3 });
    if (!hoverPreviewStillCurrent(seq, hoveredH3, unitIds)) return;
    publishGroupedSupportTargetingPreview({
      deps,
      hoveredH3,
      unitIds,
      validation,
      supportKind: 'missile',
      originH3ForGrouping: (unitId) => gs.units.find((u) => u.id === unitId)?.h3Index,
      originH3ForPreview: (unitId) => gs.units.find((u) => u.id === unitId && u.player === HUMAN_SEAT_ID)?.h3Index,
      allowBlockingOrderTooltip,
    });
    return;
  }
  if (unitIds.some((unitId) => isMissileUnitType(gs.units.find((unit) => unit.id === unitId)?.unitType ?? ''))) {
    publishHoverRoutePreview(deps, null, null, allowBlockingOrderTooltip);
    return;
  }
  const previewMarch = getPreviewHumanMarchOrders();
  if (!previewMarch) {
    publishHoverRoutePreview(deps, null, null, allowBlockingOrderTooltip);
    return;
  }
  const data = await previewMarch({ unitIds, hoveredH3Index: hoveredH3 });
  if (!hoverPreviewStillCurrent(seq, hoveredH3, unitIds)) return;
  publishHoverRoutePreview(deps, { hoveredH3Index: hoveredH3, data }, null, allowBlockingOrderTooltip);
}
