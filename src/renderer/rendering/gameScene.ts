import { combatDicePlaybackHoldEndMs } from '../../shared/combatDiceChips';
import {
  marchPlayedForUnit,
  type ResolutionCasualtyDrawInput,
} from '../../shared/resolutionCasualtyDraw';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { rendererSharedState as S } from '../core/state';
import { getExploredHexSet, getVisibleHexSet, isHexExploredByPlayer } from '../core/selection';
import { inferUnitTypeLabelFromId } from '../core/unitTypeLabel';
import { updateGameStateSidebar } from '../core/uiState';
import { isMapInspectionModeHeld } from '../gameplay/productionOverlayHelpers';
import { hideStackCallout } from '../map/stackCallout';
import { syncTacticalTransportVectorLeafletLayer } from '../map/tacticalTransportVectorLayer';
import {
  getStrategicDominantTerrainKind,
  infraGlyphsAllowedForStrategicHex,
  infraGlyphsAllowedForTacticalChild,
} from '../map/terrainTooltipStrategicState';
import { shouldHideStrategicMapUnitsForZoom } from '../map/terrainView';
import { invalidateLeafletMapSizes } from '../map/worldLeafletMap';
import { flushResolutionPlaybackCompleteNotifyCallbacks } from '../openRouter/resolutionPlaybackDeferral';
import { updateReadyButtonState } from '../openRouter/openRouterUiHelpers';
import { tacticalUpdateExitButtonVisibility } from '../tactical/tacticalUiOrchestration';
import {
  getCommittedOrderUnitsHiddenDuringPreview,
  shouldDrawCommittedOrderPaths,
  shouldDrawHoveredPathPreview,
} from './canvasPreviewPolicy';
import { drawInspectionStatusIcons } from './inspectionStatusIcons';
import {
  buildResolutionPlaybackMoves,
  drawRangedResolutionShotLines,
} from './orderDrawing';
import { drawPendingMarchesHoverAndSupportOrderStack } from './orderOverlayStages';
import {
  drawMovingUnits,
  drawResolutionMoveLines,
  drawStandingOrderLines,
  drawTacticalPendingMarchPlanLines,
} from './pathDrawing';
import { drawRangePerimeterOverlay, ensureRangePerimeterAnimation } from './rangePerimeterOverlay';
import { drawStrategicInspectionHexCodes } from './tacticalCityOverlays';
import { drawResolutionCombatAndCasualtyOverlays } from './resolutionCombatOverlays';
import {
  buildResolutionPlaybackState,
  resolutionAnimationElapsedMs,
  type ResolutionPlaybackPhase,
} from './resolutionPlayback';
import {
  drawScenarioHomeRegionOutlines,
  drawTerrainHexes as drawTerrainHexesFromModule,
} from './terrainRendering';
import { drawStaleEnemyIntel, drawUnits } from './unitDrawing';

/**
 * Entry-module callbacks the scene still calls by their original names.
 *
 * Contract: Each member is the renderer-entry function of the same name, installed before the first draw.
 * When to use: Pass the entry wrappers from renderer init.
 * Expected outcome: Scene draws observe the same overlays, hover preview, and sidebar updates as before the split.
 * Exceptions: None. Drawing before bind throws from the unset defaults.
 */
export interface GameSceneHost {
  /**
   * Opens the annihilation result when a tactical roster becomes terminal.
   *
   * Contract: Runs the entry wrapper that shares the exit session accessor.
   * When to use: The tactical branch of drawGameScene.
   * Expected outcome: At most one modal per terminal beat.
   * Exceptions: None.
   */
  maybeScheduleTacticalAnnihilationExit: () => void;
  /**
   * Draws tactical terrain hexes with the entry terrain deps.
   *
   * Contract: Runs the entry wrapper, including its deps object.
   * When to use: Both scene branches after strategic terrain.
   * Expected outcome: Tactical hexes follow the entry exploration and glyph rules.
   * Exceptions: None.
   */
  drawTacticalTerrainHexes: (ctx: CanvasRenderingContext2D) => void;
  /**
   * Draws strategic production labels.
   *
   * Contract: Runs the entry overlay body.
   * When to use: Both scene branches.
   * Expected outcome: Production labels match the entry rules.
   * Exceptions: None.
   */
  drawStrategicProductionOverlays: (ctx: CanvasRenderingContext2D) => void;
  /**
   * Draws the tactical city overlay pass.
   *
   * Contract: Runs the entry pass that supplies getExploredHexSet.
   * When to use: After production overlays in both scene branches.
   * Expected outcome: City marks follow the entry gate.
   * Exceptions: None.
   */
  drawTacticalCityOverlayPass: (ctx: CanvasRenderingContext2D) => void;
  /**
   * Reports whether a strategic hex should show infrastructure glyphs.
   *
   * Contract: Runs the entry wrapper and its terrain deps.
   * When to use: Inspection status icons in both scene branches.
   * Expected outcome: Glyph visibility matches the entry helper.
   * Exceptions: None.
   */
  hasVisibleStrategicInfrastructureGlyphs: (h3Index: string, tacticalOn: boolean, unitHexes: Set<string>) => boolean;
  /**
   * Draws infrastructure overlays with the entry terrain deps.
   *
   * Contract: Runs the entry wrapper.
   * When to use: After inspection icons in both scene branches.
   * Expected outcome: Infrastructure marks match the entry helper.
   * Exceptions: None.
   */
  drawTerrainInfrastructureOverlays: (ctx: CanvasRenderingContext2D) => void;
  /**
   * Draws the hover route preview when the policy allows it.
   *
   * Contract: Runs the entry wrapper that checks shouldDrawHoveredPathPreview first.
   * When to use: The pending-order stack in both scene branches.
   * Expected outcome: The preview is skipped or drawn exactly as the entry wrapper decides.
   * Exceptions: None.
   */
  drawHoverRoutePreview: (ctx: CanvasRenderingContext2D) => void;
  /**
   * Splits units between the static pass and the resolution animation pass.
   *
   * Contract: Runs the entry function, including tactical merge and contract anchors.
   * When to use: Both scene branches before unit markers.
   * Expected outcome: Movers are omitted from the static pass while movement is in progress.
   * Exceptions: None.
   */
  getUnitsForDrawWithMovingIds: (state: GameStateSnapshot) => {
    unitsToDraw: GameStateSnapshot['units'];
    movingIds: Set<string> | undefined;
  };
  /**
   * Draws the loading scene through the entry wrapper.
   *
   * Contract: Runs the entry wrapper and its playback deps.
   * When to use: resizeAndRedraw and redraw when game state is missing.
   * Expected outcome: The loading frame matches the entry helper.
   * Exceptions: None.
   */
  drawLoadingScene: (ctx: CanvasRenderingContext2D, width: number, height: number) => void;
  /**
   * Syncs build-entry marker buttons after a frame.
   *
   * Contract: Runs the entry body.
   * When to use: After each resize or redraw.
   * Expected outcome: Build markers match explored human urban hexes.
   * Exceptions: None.
   */
  syncBuildEntryButton: () => void;
  /**
   * Syncs tactical-entry marker buttons after a frame.
   *
   * Contract: Runs the entry body.
   * When to use: After each resize or redraw.
   * Expected outcome: Tactical entry markers match the current snapshot.
   * Exceptions: None.
   */
  syncTacticalEntryButtonOverlay: () => void;
}

/**
 * Schedules tactical annihilation UI through the renderer entry.
 *
 * Purpose: The tactical branch of drawGameScene calls this name directly.
 * When to use: Assigned by bindGameSceneHost before the first draw.
 * Expected outcome: The entry scheduler runs.
 * Exceptions: Throws if the host is not bound.
 */
let maybeScheduleTacticalAnnihilationExit: GameSceneHost['maybeScheduleTacticalAnnihilationExit'] = () => {
  throw new Error('game scene host is not bound');
};

/**
 * Draws tactical terrain through the renderer entry wrapper.
 *
 * Purpose: drawGameScene calls this name directly.
 * When to use: Assigned by bindGameSceneHost before the first draw.
 * Expected outcome: The entry wrapper runs.
 * Exceptions: Throws if the host is not bound.
 */
let drawTacticalTerrainHexes: GameSceneHost['drawTacticalTerrainHexes'] = () => {
  throw new Error('game scene host is not bound');
};

/**
 * Draws strategic production labels through the renderer entry.
 *
 * Purpose: drawGameScene calls this name directly.
 * When to use: Assigned by bindGameSceneHost before the first draw.
 * Expected outcome: The entry overlay runs.
 * Exceptions: Throws if the host is not bound.
 */
let drawStrategicProductionOverlays: GameSceneHost['drawStrategicProductionOverlays'] = () => {
  throw new Error('game scene host is not bound');
};

/**
 * Draws the tactical city pass through the renderer entry.
 *
 * Purpose: drawGameScene calls this name directly.
 * When to use: Assigned by bindGameSceneHost before the first draw.
 * Expected outcome: The entry pass runs.
 * Exceptions: Throws if the host is not bound.
 */
let drawTacticalCityOverlayPass: GameSceneHost['drawTacticalCityOverlayPass'] = () => {
  throw new Error('game scene host is not bound');
};

/**
 * Checks infrastructure glyph visibility through the renderer entry.
 *
 * Purpose: drawGameScene passes this name into inspection status icons.
 * When to use: Assigned by bindGameSceneHost before the first draw.
 * Expected outcome: The entry helper runs.
 * Exceptions: Throws if the host is not bound.
 */
let hasVisibleStrategicInfrastructureGlyphs: GameSceneHost['hasVisibleStrategicInfrastructureGlyphs'] = () => {
  throw new Error('game scene host is not bound');
};

/**
 * Draws infrastructure overlays through the renderer entry.
 *
 * Purpose: drawGameScene calls this name directly.
 * When to use: Assigned by bindGameSceneHost before the first draw.
 * Expected outcome: The entry wrapper runs.
 * Exceptions: Throws if the host is not bound.
 */
let drawTerrainInfrastructureOverlays: GameSceneHost['drawTerrainInfrastructureOverlays'] = () => {
  throw new Error('game scene host is not bound');
};

/**
 * Draws the hover route preview through the renderer entry wrapper.
 *
 * Purpose: drawGameScene passes this name into the pending-order stack.
 * When to use: Assigned by bindGameSceneHost before the first draw.
 * Expected outcome: The entry wrapper runs.
 * Exceptions: Throws if the host is not bound.
 */
let drawHoverRoutePreview: GameSceneHost['drawHoverRoutePreview'] = () => {
  throw new Error('game scene host is not bound');
};

/**
 * Splits static and moving units through the renderer entry.
 *
 * Purpose: drawGameScene calls this name directly.
 * When to use: Assigned by bindGameSceneHost before the first draw.
 * Expected outcome: The entry split runs.
 * Exceptions: Throws if the host is not bound.
 */
let getUnitsForDrawWithMovingIds: GameSceneHost['getUnitsForDrawWithMovingIds'] = () => {
  throw new Error('game scene host is not bound');
};

/**
 * Draws the loading frame through the renderer entry.
 *
 * Purpose: resizeAndRedraw and redraw call this name when state is missing.
 * When to use: Assigned by bindGameSceneHost before the first draw.
 * Expected outcome: The entry loading scene runs.
 * Exceptions: Throws if the host is not bound.
 */
let drawLoadingScene: GameSceneHost['drawLoadingScene'] = () => {
  throw new Error('game scene host is not bound');
};

/**
 * Syncs build-entry markers through the renderer entry.
 *
 * Purpose: resizeAndRedraw and redraw call this name after each frame.
 * When to use: Assigned by bindGameSceneHost before the first draw.
 * Expected outcome: The entry sync runs.
 * Exceptions: Throws if the host is not bound.
 */
let syncBuildEntryButton: GameSceneHost['syncBuildEntryButton'] = () => {
  throw new Error('game scene host is not bound');
};

/**
 * Syncs tactical-entry markers through the renderer entry.
 *
 * Purpose: resizeAndRedraw and redraw call this name after each frame.
 * When to use: Assigned by bindGameSceneHost before the first draw.
 * Expected outcome: The entry sync runs.
 * Exceptions: Throws if the host is not bound.
 */
let syncTacticalEntryButtonOverlay: GameSceneHost['syncTacticalEntryButtonOverlay'] = () => {
  throw new Error('game scene host is not bound');
};

/**
 * Installs entry-module callbacks used by the scene.
 *
 * Purpose: Avoids a cycle where the scene module and the renderer entry import each other.
 * When to use: At the start of renderer init, before map listeners are attached.
 * Expected outcome: Later draws reach the entry wrappers.
 * Exceptions: None.
 */
export function bindGameSceneHost(host: GameSceneHost): void {
  maybeScheduleTacticalAnnihilationExit = host.maybeScheduleTacticalAnnihilationExit;
  drawTacticalTerrainHexes = host.drawTacticalTerrainHexes;
  drawStrategicProductionOverlays = host.drawStrategicProductionOverlays;
  drawTacticalCityOverlayPass = host.drawTacticalCityOverlayPass;
  hasVisibleStrategicInfrastructureGlyphs = host.hasVisibleStrategicInfrastructureGlyphs;
  drawTerrainInfrastructureOverlays = host.drawTerrainInfrastructureOverlays;
  drawHoverRoutePreview = host.drawHoverRoutePreview;
  getUnitsForDrawWithMovingIds = host.getUnitsForDrawWithMovingIds;
  drawLoadingScene = host.drawLoadingScene;
  syncBuildEntryButton = host.syncBuildEntryButton;
  syncTacticalEntryButtonOverlay = host.syncTacticalEntryButtonOverlay;
}

/**
 * Defines the `drawTerrainHexes` function shape (function drawTerrainHexes(ctx: CanvasRenderingContext2D): void).

 * Purpose: Supports maintainability by documenting why `drawTerrainHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function drawTerrainHexes(ctx: CanvasRenderingContext2D): void {
  // Contract anchor retained after extraction:
  // if (tacticalActive) return;
  return drawTerrainHexesFromModule(ctx, {
    getExploredHexSet,
    getStrategicDominantTerrainKind,
    isMapInspectionModeHeld,
    infraGlyphsAllowedForStrategicHex,
    infraGlyphsAllowedForTacticalChild,
  });
}

/**
 * Defines the `requestRedraw` function shape (function requestRedraw(): void).

 * Purpose: Supports maintainability by documenting why `requestRedraw` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function requestRedraw(): void {
  if (S.resolutionMoveAnimation) return;
  if (S.redrawRafId !== null) return;

  S.redrawRafId = requestAnimationFrame(() => {
    S.redrawRafId = null;
    redraw();
  });
}

/**
 * Merges current tactical sub-unit rows with a pre-commit copy so a melee arrival can still resolve `player` and `unitType`.
 *
 * Purpose: Post-commit `tacticalBattleSnapshot.subUnits` omits casualties, so `buildResolutionPlaybackMoves` would
 *   otherwise drop a melee arrival. Air and ranged removals do not glide; the march filter removes them after lookup.
 * When to use: Tactical `drawGameScene` while `resolutionMoveAnimation` is active.
 * Expected outcome: Prefer live rows when an id exists; add missing ids from `pre` only.
 * Exceptions: None.
 */
function mergeTacticalSubUnitsForMarchPlayback(
  current: GameStateSnapshot['units'],
  pre: GameStateSnapshot['units'] | undefined
): GameStateSnapshot['units'] {
  if (!pre?.length) return current;
  const byId = new Map(current.map((u) => [u.id, u]));
  for (const u of pre) {
    if (!byId.has(u.id)) byId.set(u.id, u);
  }
  return [...byId.values()];
}

/**
 * Reads the three removal lists the casualty draw uses.
 *
 * Purpose: Both scene branches must hand the same lists to the march filter.
 * When to use: Once per frame in each `drawGameScene` branch.
 * Expected outcome: Missing lists are empty. A null animation yields three empty lists.
 * Exceptions: None.
 */
function casualtyDrawInputFromAnimation(
  anim: NonNullable<typeof S.resolutionMoveAnimation> | null
): ResolutionCasualtyDrawInput {
  return {
    airRemovedUnits: anim?.airStrikeRemovedUnits ?? [],
    rangedRemovedUnits: anim?.rangedRemovedUnits ?? [],
    meleeRemovedUnits: anim?.meleeRemovedUnits ?? [],
  };
}

/**
 * Builds playback marches and drops any march a removal says should not glide.
 *
 * Purpose: Air and ranged victims stay put. A melee victim walks only when the removal hex is the march destination.
 * When to use: Before march lines, moving icons, and the movement id set in both scene branches.
 * Expected outcome: The returned marches are the ones `marchPlayedForUnit` accepts.
 * Exceptions: None.
 */
function playbackMarchesAfterRemovals(
  moves: NonNullable<typeof S.resolutionMoveAnimation>['moves'],
  units: GameStateSnapshot['units'],
  input: ResolutionCasualtyDrawInput
) {
  return buildResolutionPlaybackMoves(moves, units).filter((move) => marchPlayedForUnit(move, input));
}

/**
 * Paints one map frame: terrain, orders, units, and resolution playback.
 *
 * Purpose: Keeps tactical and strategic draw order in one function so resize and redraw stay thin.
 * When to use: From resizeAndRedraw and redraw after the canvas transform is set.
 * Expected outcome: The tactical branch returns before strategic-only overlays. Both branches start range-perimeter animation.
 * Exceptions: None.
 */
function drawGameScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  state: GameStateSnapshot
): void {
  syncTacticalTransportVectorLeafletLayer();
  ctx.clearRect(0, 0, width, height);
  if (S.tacticalBattleSnapshot) {
    maybeScheduleTacticalAnnihilationExit();
    drawTerrainHexes(ctx);
    drawTacticalTerrainHexes(ctx);
    drawStrategicProductionOverlays(ctx);
    drawTacticalCityOverlayPass(ctx);
    drawStrategicInspectionHexCodes(ctx, { getExploredHexSet });
    drawInspectionStatusIcons(ctx, {
      isHexExploredByPlayer,
      hasInfraSymbols: (h3Index, unitHexes) => hasVisibleStrategicInfrastructureGlyphs(h3Index, false, unitHexes),
      requestRedraw,
    });
    drawTerrainInfrastructureOverlays(ctx);
    drawRangePerimeterOverlay(ctx);
    const tb = S.tacticalBattleSnapshot;
    const hexList = state.hexes.map((h) => h.h3Index);
    drawPendingMarchesHoverAndSupportOrderStack({
      ctx,
      width,
      height,
      state,
      hexList,
      drawTacticalPendingMarchesFirst: () => drawTacticalPendingMarchPlanLines(ctx, tb, S.tacticalPendingMarches),
      shouldDrawMarchHoverPreview: shouldDrawHoveredPathPreview(),
      resolutionAnimationBlocksMarchHoverPreview: !!S.resolutionMoveAnimation,
      drawMarchHoverPreview: drawHoverRoutePreview,
    });
    const tacticalUnits = tb.subUnits.map((u) => ({
      id: u.id,
      player: u.player,
      unitType: u.unitType,
      h3Index: u.h3Index,
    })) as GameStateSnapshot['units'];
    const anim = S.resolutionMoveAnimation;
    const tacticalUnitsForMarchPlayback = anim
      ? mergeTacticalSubUnitsForMarchPlayback(tacticalUnits, anim.tacticalMarchPlaybackUnits)
      : tacticalUnits;
    let moveProgress = 1;
    let airStrikeOutboundProgress = 1;
    let airStrikeReturnProgress = 1;
    let playbackPhase: ResolutionPlaybackPhase | null = null;
    const tacticalCasualtyInput = casualtyDrawInputFromAnimation(anim);
    const regularPlaybackMoves = playbackMarchesAfterRemovals(
      anim?.moves ?? [],
      tacticalUnitsForMarchPlayback,
      tacticalCasualtyInput
    );
    const airStrikeOutboundPlaybackMoves = anim?.airStrikeOutboundMoves ?? [];
    const airStrikeReturnPlaybackMoves = anim?.airStrikeReturnMoves ?? [];
    const stateForTacticalAnim =
      anim && tacticalUnitsForMarchPlayback.length > 0
        ? { ...state, units: tacticalUnitsForMarchPlayback }
        : state;
    let elapsedAnim = 0;
    if (anim) {
      elapsedAnim = resolutionAnimationElapsedMs(anim);
      const { phase } = buildResolutionPlaybackState(anim, elapsedAnim);
      playbackPhase = phase;
      moveProgress = phase.moveProgress;
      airStrikeOutboundProgress = phase.airStrikeOutboundProgress;
      airStrikeReturnProgress = phase.airStrikeReturnProgress;
    }
    const { unitsToDraw, movingIds } = anim
      ? getUnitsForDrawWithMovingIds(stateForTacticalAnim)
      : { unitsToDraw: tacticalUnits, movingIds: undefined };
    let effectiveMovingIds = movingIds;
    if (anim && playbackPhase?.inMovement && moveProgress < 1) {
      if (regularPlaybackMoves.length > 0) {
        effectiveMovingIds = new Set(regularPlaybackMoves.map((m) => m.unitId));
      } else if ((anim.moves?.length ?? 0) > 0) {
        effectiveMovingIds = undefined;
      }
    }
    if (anim && playbackPhase) {
      if (playbackPhase.inAirStrikeOutbound) {
        drawResolutionMoveLines(ctx, width, height, airStrikeOutboundPlaybackMoves, hexList, 1, { includeArrowForHuman: true });
      }
      if (playbackPhase.inAirStrikeReturn) {
        drawResolutionMoveLines(ctx, width, height, airStrikeReturnPlaybackMoves, hexList, 1, { includeArrowForHuman: true });
      }
      if (elapsedAnim >= playbackPhase.movementStart) {
        drawResolutionMoveLines(ctx, width, height, regularPlaybackMoves, hexList, 1);
      }
    }
    if (anim && hexList && playbackPhase?.inRangedLightning && (anim.rangedResolutionShotLines?.length ?? 0) > 0) {
      drawRangedResolutionShotLines(ctx, anim.rangedResolutionShotLines!, hexList, null);
    }
    if (unitsToDraw.length) drawUnits(ctx, unitsToDraw, effectiveMovingIds);
    if (anim && hexList) {
      if (playbackPhase?.inAirStrikeOutbound && airStrikeOutboundProgress < 1) {
        drawMovingUnits(ctx, width, height, airStrikeOutboundPlaybackMoves, hexList, airStrikeOutboundProgress);
      } else if (playbackPhase?.inAirStrikeReturn && airStrikeReturnProgress < 1) {
        drawMovingUnits(ctx, width, height, airStrikeReturnPlaybackMoves, hexList, airStrikeReturnProgress);
      } else if (moveProgress < 1) {
        drawMovingUnits(ctx, width, height, regularPlaybackMoves, hexList, moveProgress);
      }
    }
    if (anim && hexList) {
      drawResolutionCombatAndCasualtyOverlays(
        ctx,
        width,
        height,
        anim,
        hexList,
        resolutionAnimationElapsedMs(anim)
      );
    }
    ensureRangePerimeterAnimation(redraw);
    return;
  }
  drawTerrainHexes(ctx);
  drawTacticalTerrainHexes(ctx);
  drawScenarioHomeRegionOutlines(ctx);
  const hexList = state.hexes.map((h) => h.h3Index);
  let moveProgress = 1;
  let airStrikeOutboundProgress = 1;
  let airStrikeReturnProgress = 1;
  let playbackPhase: ResolutionPlaybackPhase | null = null;
  const anim = S.resolutionMoveAnimation;
  const strategicCasualtyInput = casualtyDrawInputFromAnimation(anim);
  const meleeMarchUnits = (anim?.meleeRemovedUnits ?? []).map((unit) => ({
    id: unit.id,
    player: unit.player,
    unitType: unit.unitType,
    h3Index: unit.h3Index,
  }));
  const regularPlaybackMoves = playbackMarchesAfterRemovals(
    anim?.moves ?? [],
    [...state.units, ...meleeMarchUnits],
    strategicCasualtyInput
  );
  const airStrikeOutboundPlaybackMoves = anim?.airStrikeOutboundMoves ?? [];
  const airStrikeReturnPlaybackMoves = anim?.airStrikeReturnMoves ?? [];
  let elapsedStrategic = 0;
  if (anim) {
    elapsedStrategic = resolutionAnimationElapsedMs(anim);
    const { phase } = buildResolutionPlaybackState(anim, elapsedStrategic);
    playbackPhase = phase;
    moveProgress = phase.moveProgress;
    airStrikeOutboundProgress = phase.airStrikeOutboundProgress;
    airStrikeReturnProgress = phase.airStrikeReturnProgress;
  }
  const { unitsToDraw, movingIds } = getUnitsForDrawWithMovingIds(state);
  let effectiveMovingIdsStrategic = movingIds;
  if (anim && playbackPhase?.inMovement && moveProgress < 1) {
    if (regularPlaybackMoves.length > 0) {
      effectiveMovingIdsStrategic = new Set(regularPlaybackMoves.map((m) => m.unitId));
    } else if ((anim.moves?.length ?? 0) > 0) {
      effectiveMovingIdsStrategic = undefined;
    }
  }
  if (anim && playbackPhase) {
    if (playbackPhase.inAirStrikeOutbound) {
      drawResolutionMoveLines(ctx, width, height, airStrikeOutboundPlaybackMoves, hexList, 1, { includeArrowForHuman: true });
    }
    if (playbackPhase.inAirStrikeReturn) {
      drawResolutionMoveLines(ctx, width, height, airStrikeReturnPlaybackMoves, hexList, 1, { includeArrowForHuman: true });
    }
    if (elapsedStrategic >= playbackPhase.movementStart) {
      drawResolutionMoveLines(ctx, width, height, regularPlaybackMoves, hexList, 1);
    }
  }
  const shouldDrawCommittedPaths = shouldDrawCommittedOrderPaths();
  const shouldDrawPathPreview = shouldDrawHoveredPathPreview();
  const hiddenCommittedUnitIdsWhilePreviewing = getCommittedOrderUnitsHiddenDuringPreview(shouldDrawPathPreview);
  if (shouldDrawCommittedPaths && !S.hideCommittedOrderLinesAfterReady && S.humanStandingOrders.length > 0 && state.units.length) {
    drawStandingOrderLines(ctx, S.humanStandingOrders, state.units, hiddenCommittedUnitIdsWhilePreviewing);
  }
  drawPendingMarchesHoverAndSupportOrderStack({
    ctx,
    width,
    height,
    state,
    hexList,
    shouldDrawMarchHoverPreview: shouldDrawPathPreview,
    resolutionAnimationBlocksMarchHoverPreview: !!anim,
    drawMarchHoverPreview: drawHoverRoutePreview,
  });
  drawStrategicProductionOverlays(ctx);
  drawTacticalCityOverlayPass(ctx);
  drawStrategicInspectionHexCodes(ctx, { getExploredHexSet });
  drawInspectionStatusIcons(ctx, {
    isHexExploredByPlayer,
    hasInfraSymbols: (h3Index, unitHexes) => hasVisibleStrategicInfrastructureGlyphs(h3Index, false, unitHexes),
    requestRedraw,
  });
  drawTerrainInfrastructureOverlays(ctx);
  drawRangePerimeterOverlay(ctx);
  drawStaleEnemyIntel(ctx, state, inferUnitTypeLabelFromId);
  const hideStrategicUnits = shouldHideStrategicMapUnitsForZoom();
  if (anim && hexList && playbackPhase?.inRangedLightning && (anim.rangedResolutionShotLines?.length ?? 0) > 0) {
    drawRangedResolutionShotLines(
      ctx,
      anim.rangedResolutionShotLines!,
      hexList,
      getVisibleHexSet(state)
    );
  }
  if (!hideStrategicUnits) {
    if (unitsToDraw.length) {
      drawUnits(ctx, unitsToDraw, effectiveMovingIdsStrategic);
    }
  }
  if (anim && hexList && !hideStrategicUnits) {
    if (playbackPhase?.inAirStrikeOutbound && airStrikeOutboundProgress < 1) {
      drawMovingUnits(ctx, width, height, airStrikeOutboundPlaybackMoves, hexList, airStrikeOutboundProgress);
    } else if (playbackPhase?.inAirStrikeReturn && airStrikeReturnProgress < 1) {
      drawMovingUnits(ctx, width, height, airStrikeReturnPlaybackMoves, hexList, airStrikeReturnProgress);
    } else if (moveProgress < 1) {
      drawMovingUnits(ctx, width, height, regularPlaybackMoves, hexList, moveProgress);
    }
  }
  if (anim && hexList) {
    drawResolutionCombatAndCasualtyOverlays(ctx, width, height, anim, hexList, elapsedStrategic);
  }
  ensureRangePerimeterAnimation(redraw);
}

/**
 * Defines the `resizeAndRedraw` function shape (function resizeAndRedraw(): void).

 * Purpose: Supports maintainability by documenting why `resizeAndRedraw` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function resizeAndRedraw(): void {
  const container = document.getElementById('canvas-container');
  const canvas = document.getElementById('map-overlay') as HTMLCanvasElement | null;
  if (!container || !canvas) return;
  invalidateLeafletMapSizes();

  const dpr = window.devicePixelRatio ?? 1;
  const rect = container.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));

  S.canvasMetrics = { w, h, dpr };

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  if (!S.gameState) {
    drawLoadingScene(ctx, w, h);
    syncBuildEntryButton();
    syncTacticalEntryButtonOverlay();
    tacticalUpdateExitButtonVisibility();
    updateReadyButtonState();
    return;
  }
  drawGameScene(ctx, w, h, S.gameState);
  syncBuildEntryButton();
  syncTacticalEntryButtonOverlay();
  tacticalUpdateExitButtonVisibility();
  updateReadyButtonState();
  if (shouldHideStrategicMapUnitsForZoom()) {
    hideStackCallout();
  }
}

/**
 * Defines the `redraw` function shape (function redraw(): void).

 * Purpose: Supports maintainability by documenting why `redraw` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function redraw(): void {
  const container = document.getElementById('canvas-container');
  const canvas = document.getElementById('map-overlay') as HTMLCanvasElement | null;
  if (!container || !canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const metrics = S.canvasMetrics;
  if (!metrics) return;
  const { w, h, dpr } = metrics;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  if (!S.gameState) {
    drawLoadingScene(ctx, w, h);
    syncBuildEntryButton();
    syncTacticalEntryButtonOverlay();
    tacticalUpdateExitButtonVisibility();
    updateReadyButtonState();
    return;
  }
  drawGameScene(ctx, w, h, S.gameState);
  syncBuildEntryButton();
  syncTacticalEntryButtonOverlay();
  tacticalUpdateExitButtonVisibility();
  updateReadyButtonState();
  if (shouldHideStrategicMapUnitsForZoom()) {
    hideStackCallout();
  }
}

/**
 * Advances one frame of resolution playback and clears it when the combat stages and dice chips are finished.
 *
 * Purpose: Advances beat playback one frame and, when the beat ends, restores the sidebar phase line before the last redraw.
 * When to use: From `requestAnimationFrame` while `S.resolutionMoveAnimation` is set.
 * Expected outcome: Redraws each frame. Combat stages end at `phase.totalMs`. Playback keeps going until stretched dice chips fade, which can be later. Then it clears the animation, refreshes the phase line from the cleared playback flag, and redraws so Exit Battle can enable again.
 * Exceptions: None.
 */
function tickResolutionMoveAnimation(): void {
  if (!S.resolutionMoveAnimation) return;
  const anim = S.resolutionMoveAnimation;
  const elapsed = resolutionAnimationElapsedMs(anim);
  const { phase } = buildResolutionPlaybackState(anim, elapsed);
  const playbackEndMs = Math.max(phase.totalMs, combatDicePlaybackHoldEndMs(phase, anim));
  redraw();
  if (elapsed < playbackEndMs) {
    S.resolutionMoveAnimationFrameId = requestAnimationFrame(tickResolutionMoveAnimation);
  } else {
    S.resolutionMoveAnimation = null;
    S.resolutionMoveAnimationFrameId = null;
    updateGameStateSidebar(S.gameState);
    flushResolutionPlaybackCompleteNotifyCallbacks();
    // Re-enable committed path rendering at the end of resolution playback.
    S.hideCommittedOrderLinesAfterReady = false;
    redraw();
  }
}

/**
 * Re-exports the scene functions declared above.
 *
 * Purpose: Leaves each declaration as `function` so readers that match a leading `function` name still find it, while other modules import the same names.
 * When to use: Import these names from this module.
 * Expected outcome: Callers receive the scene functions declared in this file.
 * Exceptions: None.
 */
export {
  drawTerrainHexes,
  requestRedraw,
  mergeTacticalSubUnitsForMarchPlayback,
  drawGameScene,
  resizeAndRedraw,
  redraw,
  tickResolutionMoveAnimation,
};
