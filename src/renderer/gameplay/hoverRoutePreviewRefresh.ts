import { representativeMarchPreviewUnitIdsByOriginH3 } from '../../shared/humanMarchPreviewGroupAssembly';
import { buildTacticalMarchHoverPreview } from '../../shared/tacticalMarchHoverPreview';
import {
  buildTacticalFerryHoverPreview,
  buildTacticalMixedAirNonAirHoverEnvelope,
} from '../../shared/tacticalFerryHoverPreview';
import {
  collectTacticalRangedSlowTerrainLabels,
  formatOrderPreviewImpactHtml,
  sortSlowTerrainLabels,
} from '../../shared/orderPreviewSlowTerrainTooltip';
import { rendererSharedState as S } from '../core/state';
import type { HoverRoutePreviewState } from '../core/types';
import { resolveOrderBlockHexTooltipMessage, showOrderBlockHexTooltip } from '../map/orderBlockHexTooltip';
import { hideOrderSlowerHexTooltip, showOrderSlowerHexTooltip } from '../map/orderSlowerHexTooltip';
import { getPreviewHumanMarchOrders, getValidateGroupAirStrikeTarget, getValidateGroupRangedTarget } from './gameApiHumanOrderPreview';
import { buildGroupedSupportTargetingLinePreview } from './hoverRoutePreviewGroupedTargeting';
import { hoverRoutePreviewAsyncContextStillValid } from './hoverRoutePreviewStale';
import type { RefreshHoverRoutePreviewOptions } from './hoverRoutePreviewTypes';
import type { TacticalOrderDeps } from './tacticalOrderDeps';

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
  airStrikeValidationReason: string | null,
  allowBlockingOrderTooltip: boolean
): void {
  S.hoverRoutePreview = preview;
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
    if (allowBlockingOrderTooltip) {
      showOrderBlockHexTooltip(msg);
    } else {
      showOrderBlockHexTooltip(null);
    }
  } else {
    showOrderBlockHexTooltip(null);
    showOrderSlowerHexTooltip(slowHtml);
  }
  deps.dismissMapDetailPopoversForHoverPlanning?.();
  deps.requestRedraw();
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
      publishHoverRoutePreview(deps, null, null, null, allowBlockingOrderTooltip);
      return;
    }
    const tb = S.tacticalBattleSnapshot;
    if (S.rangedModeActive && !S.airStrikeModeActive) {
      const validateRanged = getValidateGroupRangedTarget();
      if (!validateRanged) {
        publishHoverRoutePreview(deps, null, null, null, allowBlockingOrderTooltip);
        return;
      }
      const validation = await validateRanged({ unitIds, targetH3Index: hoveredH3 });
      if (
        !hoverRoutePreviewAsyncContextStillValid({
          seqAtStart: seq,
          hoveredH3,
          unitIdsAtStart: unitIds,
        })
      ) {
        return;
      }
      const valid = validation.success;
      const previewUnitIds = representativeMarchPreviewUnitIdsByOriginH3(
        unitIds.map((id) => ({
          unitId: id,
          originH3: tb.subUnits.find((s) => s.id === id)?.h3Index ?? '',
        }))
      );
      const data = buildGroupedSupportTargetingLinePreview(
        previewUnitIds,
        hoveredH3,
        valid,
        validation.reason ?? null,
        (unitId) => tb.subUnits.find((s) => s.id === unitId && s.player === 'human')?.h3Index
      );
      publishHoverRoutePreview(
        deps,
        { hoveredH3Index: hoveredH3, data, renderAsSupportTargeting: 'ranged' },
        valid ? null : (validation.reason ?? null),
        null,
        allowBlockingOrderTooltip
      );
      return;
    }
    if (S.airStrikeModeActive) {
      const validateAir = getValidateGroupAirStrikeTarget();
      if (!validateAir) {
        publishHoverRoutePreview(deps, null, null, null, allowBlockingOrderTooltip);
        return;
      }
      const validation = await validateAir({
        unitIds,
        targetH3Index: hoveredH3,
        targetType: S.airStrikeTargetType,
      });
      if (
        !hoverRoutePreviewAsyncContextStillValid({
          seqAtStart: seq,
          hoveredH3,
          unitIdsAtStart: unitIds,
        })
      ) {
        return;
      }
      const valid = validation.success;
      const previewUnitIds = representativeMarchPreviewUnitIdsByOriginH3(
        unitIds.map((id) => ({
          unitId: id,
          originH3: tb.subUnits.find((s) => s.id === id)?.h3Index ?? '',
        }))
      );
      const data = buildGroupedSupportTargetingLinePreview(
        previewUnitIds,
        hoveredH3,
        valid,
        validation.reason ?? null,
        (unitId) => tb.subUnits.find((s) => s.id === unitId && s.player === 'human')?.h3Index
      );
      publishHoverRoutePreview(
        deps,
        { hoveredH3Index: hoveredH3, data, renderAsSupportTargeting: 'air' },
        null,
        valid ? null : (validation.reason ?? null),
        allowBlockingOrderTooltip
      );
      return;
    }
    const selectedHumanTactical = unitIds
      .map((id) => tb.subUnits.find((s) => s.id === id && s.player === 'human'))
      .filter((u): u is NonNullable<typeof u> => !!u);
    const tacticalHasAir = selectedHumanTactical.some((u) => u.unitType === 'air');
    const tacticalHasNonAir = selectedHumanTactical.some((u) => u.unitType !== 'air');
    if (tacticalHasAir && tacticalHasNonAir) {
      const data = buildTacticalMixedAirNonAirHoverEnvelope(unitIds);
      if (
        !hoverRoutePreviewAsyncContextStillValid({
          seqAtStart: seq,
          hoveredH3,
          unitIdsAtStart: unitIds,
        })
      ) {
        return;
      }
      publishHoverRoutePreview(deps, { hoveredH3Index: hoveredH3, data }, null, null, allowBlockingOrderTooltip);
      return;
    }
    const allAirTactical =
      selectedHumanTactical.length > 0 && selectedHumanTactical.every((u) => u.unitType === 'air');
    if (allAirTactical) {
      const validateFerry = window.gameApi?.validateGroupFerryTarget;
      if (!validateFerry) {
        publishHoverRoutePreview(deps, null, null, null, allowBlockingOrderTooltip);
        return;
      }
      const validation = await validateFerry({ unitIds, destinationH3Index: hoveredH3 });
      if (
        !hoverRoutePreviewAsyncContextStillValid({
          seqAtStart: seq,
          hoveredH3,
          unitIdsAtStart: unitIds,
        })
      ) {
        return;
      }
      const data = buildTacticalFerryHoverPreview(tb, unitIds, hoveredH3, validation);
      publishHoverRoutePreview(deps, { hoveredH3Index: hoveredH3, data }, null, null, allowBlockingOrderTooltip);
      return;
    }
    const data = buildTacticalMarchHoverPreview(tb, unitIds, hoveredH3);
    if (
      !hoverRoutePreviewAsyncContextStillValid({
        seqAtStart: seq,
        hoveredH3,
        unitIdsAtStart: unitIds,
      })
    ) {
      return;
    }
    publishHoverRoutePreview(deps, { hoveredH3Index: hoveredH3, data }, null, null, allowBlockingOrderTooltip);
    return;
  }
  if (unitIds.length === 0 || !hoveredH3 || !S.gameState) {
    publishHoverRoutePreview(deps, null, null, null, allowBlockingOrderTooltip);
    return;
  }
  const gs = S.gameState;
  if (S.rangedModeActive && !S.airStrikeModeActive) {
    const validateRanged = getValidateGroupRangedTarget();
    if (!validateRanged) {
      publishHoverRoutePreview(deps, null, null, null, allowBlockingOrderTooltip);
      return;
    }
    const validation = await validateRanged({ unitIds, targetH3Index: hoveredH3 });
    if (
      !hoverRoutePreviewAsyncContextStillValid({
        seqAtStart: seq,
        hoveredH3,
        unitIdsAtStart: unitIds,
      })
    ) {
      return;
    }
    const valid = validation.success;
    const previewUnitIds = representativeMarchPreviewUnitIdsByOriginH3(
      unitIds.map((id) => ({
        unitId: id,
        originH3: gs.units.find((u) => u.id === id)?.h3Index ?? '',
      }))
    );
    const data = buildGroupedSupportTargetingLinePreview(
      previewUnitIds,
      hoveredH3,
      valid,
      validation.reason ?? null,
      (unitId) => gs.units.find((u) => u.id === unitId && u.player === 'human')?.h3Index
    );
    publishHoverRoutePreview(
      deps,
      { hoveredH3Index: hoveredH3, data, renderAsSupportTargeting: 'ranged' },
      valid ? null : (validation.reason ?? null),
      null,
      allowBlockingOrderTooltip
    );
    return;
  }
  if (S.airStrikeModeActive) {
    const validateAir = getValidateGroupAirStrikeTarget();
    if (!validateAir) {
      publishHoverRoutePreview(deps, null, null, null, allowBlockingOrderTooltip);
      return;
    }
    const validation = await validateAir({
      unitIds,
      targetH3Index: hoveredH3,
      targetType: S.airStrikeTargetType,
    });
    if (
      !hoverRoutePreviewAsyncContextStillValid({
        seqAtStart: seq,
        hoveredH3,
        unitIdsAtStart: unitIds,
      })
    ) {
      return;
    }
    const valid = validation.success;
    const previewUnitIds = representativeMarchPreviewUnitIdsByOriginH3(
      unitIds.map((id) => ({
        unitId: id,
        originH3: gs.units.find((u) => u.id === id)?.h3Index ?? '',
      }))
    );
    const data = buildGroupedSupportTargetingLinePreview(
      previewUnitIds,
      hoveredH3,
      valid,
      validation.reason ?? null,
      (unitId) => gs.units.find((u) => u.id === unitId && u.player === 'human')?.h3Index
    );
    publishHoverRoutePreview(
      deps,
      { hoveredH3Index: hoveredH3, data, renderAsSupportTargeting: 'air' },
      null,
      valid ? null : (validation.reason ?? null),
      allowBlockingOrderTooltip
    );
    return;
  }
  const previewMarch = getPreviewHumanMarchOrders();
  if (!previewMarch) {
    publishHoverRoutePreview(deps, null, null, null, allowBlockingOrderTooltip);
    return;
  }
  const data = await previewMarch({ unitIds, hoveredH3Index: hoveredH3 });
  if (
    !hoverRoutePreviewAsyncContextStillValid({
      seqAtStart: seq,
      hoveredH3,
      unitIdsAtStart: unitIds,
    })
  ) {
    return;
  }
  publishHoverRoutePreview(deps, { hoveredH3Index: hoveredH3, data }, null, null, allowBlockingOrderTooltip);
}
