/**
 * Verifies renderer draw-path consolidation remains intact.
 * Run with: node dist/main/rendererConsolidation.test.js
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { assertMatches, getFunctionSource } from './testSupport/rendererSourceAssertions';

/**
 * Defines the `testRedrawAndResizeDelegateToSharedScene` function shape (function testRedrawAndResizeDelegateToSharedScene(): void).

 * Purpose: Supports maintainability by documenting why `testRedrawAndResizeDelegateToSharedScene` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testRedrawAndResizeDelegateToSharedScene(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'gameScene.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');

  const resizeFn = getFunctionSource(source, 'resizeAndRedraw');
  const redrawFn = getFunctionSource(source, 'redraw');

  const frameFn = getFunctionSource(source, 'paintMapFrame');
  assert.ok(resizeFn.includes('paintMapFrame(ctx, w, h);'), 'resizeAndRedraw should delegate to paintMapFrame');
  assert.ok(redrawFn.includes('paintMapFrame(ctx, w, h);'), 'redraw should delegate to paintMapFrame');
  assert.ok(
    frameFn.includes('drawGameScene(ctx, w, h, S.gameState);'),
    'paintMapFrame should delegate to drawGameScene'
  );

  assert.ok(!resizeFn.includes('drawTerrainHexes('), 'resizeAndRedraw should not duplicate scene rendering steps');
  assert.ok(!redrawFn.includes('drawTerrainHexes('), 'redraw should not duplicate scene rendering steps');
}

/**
 * Static regression tests for tactical strategic zoom hiding unit markers while preserving stale-intel tracking.
 *
 * Purpose: Guards tactical detail zoom from drawing or hit-testing strategic units, stacks, and stale intel markers on the strategic map.
 * When to use: CI guard when refactoring `drawGameScene`, `drawStaleEnemyIntel`, stack callout, or map interactions.
 * Expected outcome: Stale intel tracking always runs; marker draw and unit icons are gated behind `shouldHideStrategicMapUnitsForTacticalZoom`.
 * Exceptions: None.
 */
function testZoomHidesStrategicMapUnits(): void {
  const gameScenePath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'gameScene.ts');
  const terrainViewPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'terrainView.ts');
  const mainMapInteractionsPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'mainMapInteractions.ts');
  const drawInteractionPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'drawInteraction.ts');
  const rendererSource = fs.readFileSync(gameScenePath, 'utf8');
  const terrainViewSource = fs.readFileSync(terrainViewPath, 'utf8');
  const unitDrawingSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'unitDrawing.ts'),
    'utf8'
  );
  const mainMapInteractionsSource = fs.readFileSync(mainMapInteractionsPath, 'utf8');
  const drawInteractionSource = fs.readFileSync(drawInteractionPath, 'utf8');
  const stackCalloutSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src', 'renderer', 'map', 'stackCallout.ts'),
    'utf8'
  );
  const drawSceneFn = getFunctionSource(rendererSource, 'drawGameScene');
  const showStackCalloutFn = getFunctionSource(stackCalloutSource, 'showStackCallout');
  const refreshStackCalloutFn = getFunctionSource(stackCalloutSource, 'refreshStackCalloutIfOpen');
  const redrawFn = getFunctionSource(rendererSource, 'redraw');
  const resizeAndRedrawFn = getFunctionSource(rendererSource, 'resizeAndRedraw');
  const drawStaleIntelFn = getFunctionSource(unitDrawingSource, 'drawStaleEnemyIntel');

  const tacticalIdx = drawSceneFn.indexOf('if (S.tacticalBattleSnapshot)');
  assert.ok(tacticalIdx >= 0, 'drawGameScene should branch on tactical snapshot');
  const tacticalReturnIdx = drawSceneFn.indexOf('return;', tacticalIdx);
  assert.ok(tacticalReturnIdx > tacticalIdx, 'tactical branch should return before strategic-only overlays');
  const strategicSlice = drawSceneFn.slice(tacticalReturnIdx);

  assert.ok(
    terrainViewSource.includes('export function shouldHideStrategicMapUnitsForZoom(): boolean') &&
      terrainViewSource.includes('return shouldRenderTacticalHexes() && !S.tacticalBattleSnapshot;'),
    'terrainView should expose shouldHideStrategicMapUnitsForZoom combining res4 and non-tactical checks'
  );
  assert.ok(
    strategicSlice.includes('drawStaleEnemyIntel(ctx, state, inferUnitTypeLabelFromId);'),
    'strategic drawGameScene should always invoke drawStaleEnemyIntel for tracking'
  );
  assert.ok(
    strategicSlice.includes('const hideStrategicUnits = shouldHideStrategicMapUnitsForZoom();') &&
      strategicSlice.includes('if (!hideStrategicUnits) {') &&
      strategicSlice.includes('drawUnits(ctx, unitsToDraw, effectiveMovingIdsStrategic);') &&
      strategicSlice.includes('if (anim && hexList && !hideStrategicUnits)'),
    'strategic drawGameScene should gate drawUnits and drawMovingUnits on res4 strategic zoom hide helper'
  );
  assert.ok(
    drawStaleIntelFn.includes('if (shouldHideStrategicMapUnitsForZoom()) return;'),
    'drawStaleEnemyIntel should suppress marker draw but keep tracking when res4 strategic zoom hides units'
  );
  assert.ok(
    showStackCalloutFn.includes('if (shouldHideStrategicMapUnitsForZoom()) {') &&
      showStackCalloutFn.includes('hideStackCallout();'),
    'showStackCallout should dismiss and not open during res4 strategic zoom'
  );
  assert.ok(
    refreshStackCalloutFn.includes('if (shouldHideStrategicMapUnitsForZoom()) {') &&
      refreshStackCalloutFn.includes('hideStackCallout();'),
    'refreshStackCalloutIfOpen should dismiss callout during res4 strategic zoom'
  );
  const frameFn = getFunctionSource(rendererSource, 'paintMapFrame');
  assert.ok(
    frameFn.includes('if (shouldHideStrategicMapUnitsForZoom()) {') &&
      frameFn.includes('hideStackCallout();'),
    'paintMapFrame should dismiss open stack callout when res4 strategic zoom hides units'
  );
  assert.ok(
    redrawFn.includes('paintMapFrame(ctx, w, h);') && resizeAndRedrawFn.includes('paintMapFrame(ctx, w, h);'),
    'redraw and resizeAndRedraw should share the frame that dismisses the stack callout'
  );
  assert.ok(
    mainMapInteractionsSource.includes('function pointerHitsDrawnUnitIcon(') &&
      mainMapInteractionsSource.includes('if (shouldHideStrategicMapUnitsForZoom()) return false;'),
    'mainMapInteractions should zero out unit/stack icon hit-testing when res4 strategic zoom hides units'
  );
  assert.ok(
    drawInteractionSource.includes('!shouldHideStrategicMapUnitsForZoom()') &&
      drawInteractionSource.includes('containerPixelHitsDrawnUnitIcon(px, py, hit, drawnAtHit.length)'),
    'updateMapInteractionCursor should skip unit-icon pointer cursor when res4 strategic zoom hides units'
  );
}

/**
 * Defines the `testCommittedPathsRemainVisibleDuringResolutionAnimation` function shape (function testCommittedPathsRemainVisibleDuringResolutionAnimation(): void).

 * Purpose: Supports maintainability by documenting why `testCommittedPathsRemainVisibleDuringResolutionAnimation` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testCommittedPathsRemainVisibleDuringResolutionAnimation(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const gameScenePath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'gameScene.ts');
  const policyPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'canvasPreviewPolicy.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const gameSceneSource = fs.readFileSync(gameScenePath, 'utf8');
  const policySource = fs.readFileSync(policyPath, 'utf8');
  const drawSceneFn = getFunctionSource(gameSceneSource, 'drawGameScene');
  const shouldDrawCommittedOrderPathsFn = getFunctionSource(policySource, 'shouldDrawCommittedOrderPaths');
  const shouldDrawHoveredPathPreviewFn = getFunctionSource(policySource, 'shouldDrawHoveredPathPreview');
  const hiddenDuringPreviewFn = getFunctionSource(policySource, 'getCommittedOrderUnitsHiddenDuringPreview');

  assert.ok(
    drawSceneFn.includes('const shouldDrawCommittedPaths = shouldDrawCommittedOrderPaths();'),
    'drawGameScene should use shared committed-path visibility policy helper'
  );
  assert.ok(
    shouldDrawCommittedOrderPathsFn.includes('return !S.shiftKeyActive;'),
    'shouldDrawCommittedOrderPaths should hide committed paths while Shift is held for stack selection'
  );
  assert.ok(
    drawSceneFn.includes(
      'if (shouldDrawCommittedPaths && !S.hideCommittedOrderLinesAfterReady && S.humanStandingOrders.length > 0 && state.units.length)'
    ),
    'drawGameScene should keep committed paths visible once planned when Shift is not held'
  );
  assert.ok(
    drawSceneFn.includes('const shouldDrawPathPreview = shouldDrawHoveredPathPreview();'),
    'drawGameScene should use shared hover-preview visibility policy helper'
  );
  assert.ok(
    shouldDrawHoveredPathPreviewFn.includes('return !S.shiftKeyActive && S.selectedUnitIds.length > 0;'),
    'shouldDrawHoveredPathPreview should gate hover path preview by Shift and active selection'
  );
  assert.ok(
    drawSceneFn.includes('drawPendingMarchesHoverAndSupportOrderStack({') &&
      drawSceneFn.includes('shouldDrawMarchHoverPreview: shouldDrawPathPreview,') &&
      drawSceneFn.includes('resolutionAnimationBlocksMarchHoverPreview: !!anim,') &&
      drawSceneFn.includes('drawMarchHoverPreview: drawHoverRoutePreview,'),
    'drawGameScene strategic branch should delegate pending stack with path preview gate'
  );
  assert.ok(
    drawSceneFn.includes('shouldDrawMarchHoverPreview: shouldDrawHoveredPathPreview(),') &&
      drawSceneFn.includes('resolutionAnimationBlocksMarchHoverPreview: !!S.resolutionMoveAnimation,'),
    'drawGameScene tactical branch should delegate pending stack with hover policy gating'
  );
  assert.ok(
    drawSceneFn.includes(
      'const hiddenCommittedUnitIdsWhilePreviewing = getCommittedOrderUnitsHiddenDuringPreview(shouldDrawPathPreview);'
    ),
    'drawGameScene should use helper to compute committed-path exclusions while previewing'
  );
  assert.ok(
    hiddenDuringPreviewFn.includes('if (!shouldDrawPathPreview || !S.hoverRoutePreview) return null;') &&
      hiddenDuringPreviewFn.includes('return new Set(S.selectedUnitIds);'),
    'getCommittedOrderUnitsHiddenDuringPreview should hide committed paths for units being replanned while preview is visible'
  );
  assert.ok(
    drawSceneFn.includes(
      'drawStandingOrderLines(ctx, S.humanStandingOrders, state.units, hiddenCommittedUnitIdsWhilePreviewing);'
    ),
    'drawGameScene should pass preview exclusion set into committed-path rendering'
  );
  assert.ok(
    !drawSceneFn.includes('if (!anim && !hideCommittedOrderLinesAfterReady'),
    'drawGameScene should not suppress committed paths while animation is active'
  );
  assert.ok(
    !source.includes('S.hideCommittedOrderLinesAfterReady = true;') &&
      !gameSceneSource.includes('S.hideCommittedOrderLinesAfterReady = true;'),
    'renderer should not force-hide committed paths after ready'
  );
}

/**
 * Defines the `testProductionLabelContractsForExploredVsUnexploredHexes` function shape (function testProductionLabelContractsForExploredVsUnexploredHexes(): void).

 * Purpose: Supports maintainability by documenting why `testProductionLabelContractsForExploredVsUnexploredHexes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testProductionLabelContractsForExploredVsUnexploredHexes(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const productionOverlayHelpersPath = path.resolve(process.cwd(), 'src', 'renderer', 'gameplay', 'productionOverlayHelpers.ts');
  const terrainTooltipStatePath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'terrainTooltipStrategicState.ts');
  const policyPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'canvasPreviewPolicy.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const productionOverlayHelpersSource = fs.readFileSync(productionOverlayHelpersPath, 'utf8');
  const policySource = fs.readFileSync(policyPath, 'utf8');
  const terrainTooltipSource = fs.readFileSync(terrainTooltipStatePath, 'utf8');
  const drawProductionFn = getFunctionSource(source, 'drawStrategicProductionOverlays');
  const syncBuildEntryFn = getFunctionSource(source, 'syncBuildEntryButton');
  const getUrbanProductionCapacityForHexFn = getFunctionSource(productionOverlayHelpersSource, 'getUrbanProductionCapacityForHex');
  const canonicalUrbanCapacityFn = getFunctionSource(terrainTooltipSource, 'getUrbanProductionCapacityForHex');
  const isStrategicHexHumanUrbanProductionFn = getFunctionSource(productionOverlayHelpersSource, 'isStrategicHexHumanUrbanProduction');
  const drawHoverPreviewFn = getFunctionSource(source, 'drawHoverRoutePreview');
  const shouldDrawHoveredPathPreviewFn = getFunctionSource(policySource, 'shouldDrawHoveredPathPreview');

  assert.ok(
    drawProductionFn.includes('if (shouldRenderTacticalHexes()) return'),
    'drawStrategicProductionOverlays should draw no production labels when res4 hexes are shown'
  );
  assert.ok(
    drawProductionFn.includes('const overlayContext = buildProductionOverlayContext(S.gameState);'),
    'drawStrategicProductionOverlays should build a shared overlay context once per draw'
  );
  assertMatches(
    drawProductionFn,
    /if\s*\(!explored\s*&&\s*!overlayContext\.mapInspectionHeld\)\s*continue;/,
    'drawStrategicProductionOverlays should only show unexplored production labels while T is held'
  );
  assert.ok(
    drawProductionFn.includes('!overlayContext.mapInspectionHeld') &&
      drawProductionFn.includes('isStrategicHexHumanUrbanProduction(S.gameState, hx)'),
    'drawStrategicProductionOverlays should include shared human-urban production eligibility checks'
  );
  assert.ok(
    drawProductionFn.includes(
      'const canShowLabelWithoutInspection = isStrategicHexHumanUrbanProduction(S.gameState, hx) || controlledByHuman;'
    ),
    'drawStrategicProductionOverlays should keep $0 labels visible on explored human-controlled non-urban hexes'
  );
  assert.ok(
    drawProductionFn.includes('const hasClickableBuildEntryForHex =') &&
      drawProductionFn.includes('isStrategicHexHumanUrbanProduction(S.gameState, hx)'),
    'drawStrategicProductionOverlays should keep build-entry clickability restricted to human urban-production hexes'
  );
  assertMatches(
    drawProductionFn,
    /:\s*`\$\$\{Math\.max\(0,\s*capacityPerTurn\)\.toLocaleString\(\)\}`;/,
    'drawStrategicProductionOverlays should show unexplored labels in $N format'
  );
  assert.ok(
    drawProductionFn.includes('const hasClickableBuildEntryForHex =') &&
      drawProductionFn.includes('explored &&') &&
      drawProductionFn.includes('isStrategicHexHumanUrbanProduction(S.gameState, hx)') &&
      drawProductionFn.includes('if (hasClickableBuildEntryForHex) {'),
    'drawStrategicProductionOverlays should hide non-clickable label when clickable build entry exists'
  );
  assert.ok(
    drawProductionFn.includes('const capacityPerTurn = getUrbanProductionCapacityForHex(hx.h3Index);'),
    'drawStrategicProductionOverlays should derive production capacity from shared canonical urban-res4 count helper'
  );
  assert.ok(
    drawProductionFn.includes('overlayContext.revealAllControllerQueues'),
    'drawStrategicProductionOverlays should branch queue visibility by overlay context'
  );

  assert.ok(
    syncBuildEntryFn.includes('if (tacticalOn) {') && syncBuildEntryFn.includes('hideBuildPopup()'),
    'syncBuildEntryButton should suppress build UI and close build popup on res4 zoom'
  );
  assert.ok(
    syncBuildEntryFn.includes('if (areResolutionDiceChipsShowing(S.resolutionMoveAnimation)) {'),
    'syncBuildEntryButton should hide build markers while resolution dice chips are showing'
  );
  assert.ok(
    syncBuildEntryFn.includes('if (!explored) continue;'),
    'syncBuildEntryButton should only render clickable buttons for explored hexes'
  );
  assert.ok(
    syncBuildEntryFn.includes('isStrategicHexHumanUrbanProduction(S.gameState, hx)'),
    'syncBuildEntryButton should use shared human-urban production eligibility'
  );
  assert.ok(
    !syncBuildEntryFn.includes("if (hx.terrain === 'water') continue;") &&
      !drawProductionFn.includes("if (hx.terrain === 'water') continue;"),
    'renderer production labels and build-entry buttons should not hard-exclude controlled water hexes'
  );
  assert.ok(
    isStrategicHexHumanUrbanProductionFn.includes('getUrbanProductionCapacityForHex(hx.h3Index) > 0'),
    'isStrategicHexHumanUrbanProduction should use canonical urban-res4 count for build eligibility'
  );
  assert.ok(
    getUrbanProductionCapacityForHexFn.includes('getUrbanProductionCapacityForHexFromTooltipState'),
    'productionOverlayHelpers should delegate urban capacity to the shared terrain tooltip / res1 cache module'
  );
  assert.ok(
    canonicalUrbanCapacityFn.includes('countUrbanTacticalHexesInStrategicHex(h3Index)'),
    'shared getUrbanProductionCapacityForHex should compute from live urban res4-child count'
  );
  assert.ok(
    drawHoverPreviewFn.includes('if (!shouldDrawHoveredPathPreview()) return;') &&
      shouldDrawHoveredPathPreviewFn.includes('return !S.shiftKeyActive && S.selectedUnitIds.length > 0;'),
    'drawHoverRoutePreview should use shared policy to suppress path-plan preview while Shift is held and when nothing is selected'
  );
}

/**
 * Defines the `testInfrastructureGlyphSetsComeFromTacticalOverrides` function shape (function testInfrastructureGlyphSetsComeFromTacticalOverrides(): void).

 * Purpose: Supports maintainability by documenting why `testInfrastructureGlyphSetsComeFromTacticalOverrides` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testInfrastructureGlyphSetsComeFromTacticalOverrides(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const entrySource = fs.readFileSync(
    path.resolve(process.cwd(), 'src', 'renderer', 'entryCallbacks.ts'),
    'utf8'
  );
  const drawInfraFn = getFunctionSource(source, 'drawTerrainInfrastructureOverlays');
  const hasVisibleStrategicInfraFn = getFunctionSource(source, 'hasVisibleStrategicInfrastructureGlyphs');

  assert.ok(
    entrySource.includes('const nextState = deriveInfrastructureOverlayState(rows);') &&
      entrySource.includes('terrainInfraTacticalAirport = nextState.terrainInfraTacticalAirport;') &&
      entrySource.includes('terrainInfraTacticalSeaport = nextState.terrainInfraTacticalSeaport;'),
    'applyTacticalTerrainOverrides should use centralized derivation for res4 airport/seaport glyph sets'
  );
  assert.ok(
    entrySource.includes('terrainInfraStrategicAirport = nextState.terrainInfraStrategicAirport;') &&
      entrySource.includes('terrainInfraStrategicSeaport = nextState.terrainInfraStrategicSeaport;'),
    'applyTacticalTerrainOverrides should use centralized derivation for res1 airport/seaport glyph sets'
  );
  assert.ok(
    !source.includes('.getTerrainInfrastructureHints()') &&
      !entrySource.includes('.getTerrainInfrastructureHints()'),
    'renderer init should not overwrite live glyph sets with major-only terrain hint snapshots'
  );
  assert.ok(
    !drawInfraFn.includes('if (unitHexes.has(hx.h3Index)) continue;') &&
      !drawInfraFn.includes('if (unitHexes.has(parent.h3Index)) continue;'),
    'drawTerrainInfrastructureOverlays should not suppress airport/seaport glyphs on hexes that contain units'
  );
  assert.ok(
    !hasVisibleStrategicInfraFn.includes('!unitHexes.has(h3Index)'),
    'hasVisibleStrategicInfrastructureGlyphs should remain true for explored infra hexes even when units are present'
  );
}

/**
 * Defines the `testAirFerryDoubleClickContracts` function shape (function testAirFerryDoubleClickContracts(): void).

 * Purpose: Supports maintainability by documenting why `testAirFerryDoubleClickContracts` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testAirFerryDoubleClickContracts(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const orderDrawingPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'orderDrawing.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const gameSceneSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'gameScene.ts'),
    'utf8'
  );
  const orderDrawingSource = fs.readFileSync(orderDrawingPath, 'utf8');
  const initFn = getFunctionSource(source, 'init');
  const pendingOrdersFn = getFunctionSource(source, 'updatePendingOrdersSidebar');
  const orderLabelFormattingPath = path.resolve(process.cwd(), 'src', 'renderer', 'gameplay', 'orderLabelFormatting.ts');
  const orderLabelFormattingSource = fs.readFileSync(orderLabelFormattingPath, 'utf8');
  const formatPendingFerryOrderSidebarLabelFn = getFunctionSource(
    orderLabelFormattingSource,
    'formatPendingFerryOrderSidebarLabel'
  );

  assert.ok(
    initFn.includes('const hasAirSelection = selectedAtMouseDown.some((unit) => unit.unitType === \'air\');') &&
      initFn.includes('const hasNonAirSelection = selectedAtMouseDown.some((unit) => unit.unitType !== \'air\');') &&
      initFn.includes('Cannot issue grouped movement for mixed air and non-air units.'),
    'double-click movement should reject mixed air and non-air selections with a toast'
  );
  assert.ok(
    initFn.includes('window.gameApi?.validateGroupFerryTarget') &&
      initFn.includes('replacePendingFerryOrdersForSelected(selectedIds, destinationH3);'),
    'double-click movement should validate grouped ferry destinations through main-process API and queue ferry orders for air selections'
  );
  assert.ok(
    source.includes('ferryOrders: S.pendingFerryOrders,'),
    'ready submit payload should include pending ferry orders'
  );
  assert.ok(
    pendingOrdersFn.includes('formatPendingFerryOrderSidebarLabel(S.gameState, ferry)'),
    'pending ferry sidebar rows should display via the ferry label formatter for Nh parity'
  );
  assert.ok(
    formatPendingFerryOrderSidebarLabelFn.includes("order.destinationH3Index, battle, 'Ferry')") &&
      !formatPendingFerryOrderSidebarLabelFn.includes('${order.destinationH3Index}'),
    'ferry sidebar labels should name the destination code through the shared order line, never the raw H3 index'
  );
  const overlayStagesPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'orderOverlayStages.ts');
  const overlayStagesSource = fs.readFileSync(overlayStagesPath, 'utf8');
  assert.ok(
    gameSceneSource.includes("from './orderOverlayStages'") &&
      gameSceneSource.includes('drawPendingMarchesHoverAndSupportOrderStack({') &&
      overlayStagesSource.includes('drawPendingSupportOrderOverlays(') &&
      overlayStagesSource.includes(
        'drawPendingFerryLines(ctx, S.pendingFerryOrders, unitsForOrderLines, hexList);'
      ) &&
      orderDrawingSource.includes('function drawPendingFerryLines(') &&
      orderDrawingSource.includes('drawHumanMarchStyleRouteSegments'),
    'pending ferry planning should render march-style map lines via shared overlay stage'
  );
}

/**
 * Defines the `testAirStrikeAndAirGlyphContracts` function shape (function testAirStrikeAndAirGlyphContracts(): void).

 * Purpose: Supports maintainability by documenting why `testAirStrikeAndAirGlyphContracts` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testAirStrikeAndAirGlyphContracts(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const readyAnnouncementsPath = path.resolve(
    process.cwd(),
    'src',
    'renderer',
    'gameplay',
    'readyResolutionAnnouncements.ts'
  );
  const tacticalOrdersPath = path.resolve(process.cwd(), 'src', 'renderer', 'gameplay', 'tacticalOrders.ts');
  const sidebarSupportPath = path.resolve(process.cwd(), 'src', 'renderer', 'gameplay', 'sidebarSupport.ts');
  const rendererConstantsPath = path.resolve(process.cwd(), 'src', 'renderer', 'core', 'constants.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const readyAnnouncementsSource = fs.readFileSync(readyAnnouncementsPath, 'utf8');
  const tacticalOrdersSource = fs.readFileSync(tacticalOrdersPath, 'utf8');
  const sidebarSupportSource = fs.readFileSync(sidebarSupportPath, 'utf8');
  const rendererConstantsSource = fs.readFileSync(rendererConstantsPath, 'utf8');
  const unitTypeLabelSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src', 'renderer', 'core', 'unitTypeLabel.ts'),
    'utf8'
  );
  const gameSceneSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'gameScene.ts'),
    'utf8'
  );
  const resolutionPlaybackSource = fs.readFileSync(
    path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'resolutionPlayback.ts'),
    'utf8'
  );
  const wiredEntrySource = fs.readFileSync(
    path.resolve(process.cwd(), 'src', 'renderer', 'wiredEntryCallbacks.ts'),
    'utf8'
  );
  const inferUnitTypeLabelFromIdFn = getFunctionSource(unitTypeLabelSource, 'inferUnitTypeLabelFromId');
  assert.ok(inferUnitTypeLabelFromIdFn.length > 0, 'inferUnitTypeLabelFromId must remain declared in unitTypeLabel.ts');

  assert.ok(
    rendererConstantsSource.includes("air: 'S'") && wiredEntrySource.includes("from './core/constants'"),
    'air unit type label should render as S'
  );
  assert.ok(
    readyAnnouncementsSource.includes("from './turnUpdateSummary'") &&
      readyAnnouncementsSource.includes('buildConsolidatedTurnUpdateToastMessage({') &&
      readyAnnouncementsSource.includes('buildPopupTurnLossSummary({'),
    'ready update toast should use consolidated turn update summary helpers'
  );
  assert.ok(
    tacticalOrdersSource.includes("btnEl.setAttribute('aria-pressed', String(S.airStrikeModeActive));") &&
      tacticalOrdersSource.includes("btnEl.setAttribute('aria-pressed', String(S.rangedModeActive));"),
    'the reticle should stay shown and read as pressed while strike or ranged planning mode is active'
  );
  assert.ok(
    tacticalOrdersSource.includes("from './orderLabelFormatting'") &&
      tacticalOrdersSource.includes(
        'formatPendingRangedAttackSidebarLabel(S.gameState, r, battle)'
      ) &&
      tacticalOrdersSource.includes(
        'formatPendingAirStrikeSidebarLabel(S.gameState, strike, battle)'
      ) &&
      sidebarSupportSource.includes("from './orderLabelFormatting'") &&
      sidebarSupportSource.includes('formatPendingFerryOrderSidebarLabel(S.gameState, ferry)') &&
      sidebarSupportSource.includes(
        'formatPendingFerryOrderSidebarLabel(S.gameState, ferry, battle)'
      ) &&
      !getFunctionSource(sidebarSupportSource, 'updatePendingOrdersSidebar').includes('pendingEmbarkOrders'),
    'planned order list labels should use shared order label formatting helpers'
  );
  assert.ok(
    source.includes('function formatTargetingValidationReason(') &&
      source.includes("formatTargetingValidationReason(validation.reason, 'Selected air units cannot strike that target.')") &&
      source.includes("formatTargetingValidationReason(validation.reason, 'Selected units cannot fire at that target.')"),
    'grouped strike and ranged targeting toasts should format unit IDs as display names'
  );
  assert.ok(
    source.includes('airStrikeOutboundMoves: airStrikeOutboundMoves.length > 0 ? airStrikeOutboundMoves : undefined') &&
      source.includes('airStrikeReturnMoves: airStrikeReturnMoves.length > 0 ? airStrikeReturnMoves : undefined') &&
      gameSceneSource.includes('inAirStrikeOutbound') &&
      gameSceneSource.includes('inAirStrikeReturn'),
    'resolution playback should include outbound/return air-strike movement phases'
  );
  assert.ok(
    source.includes('const knownHumanAirStrikeTargetHexes = new Set(') &&
      source.includes(".filter((move) => move.player === 'human')") &&
      source.includes('.filter((h3) => !knownHumanAirStrikeTargetHexes.has(h3))'),
    'unknown battle announcements should not include known human air-strike target hexes'
  );
  assert.ok(
    wiredEntrySource.includes('phase.inAirStrikeLightning || phase.inAirStrikeCasualty') &&
      wiredEntrySource.includes('h3Index: move.toH3Index') &&
      wiredEntrySource.includes('movingIds = new Set((anim.airStrikeReturnMoves ?? []).map((move) => move.unitId));'),
    'air strike playback should pin strikers at target during combat/casualty and hide survivors at base until return animation completes'
  );
  assert.ok(
    resolutionPlaybackSource.includes('function buildResolutionPlaybackState(') &&
      gameSceneSource.includes('const { phase } = buildResolutionPlaybackState(anim, elapsed);'),
    'resolution playback phase derivation should be centralized for all unit/scenario animation paths'
  );
  assert.ok(
    source.includes('if (!validation.success) {') &&
      source.includes('airStrikeModeActive = false;') &&
      source.includes('rangedModeActive = false;'),
    'invalid ranged/strike target clicks should cancel planning mode'
  );
  assert.ok(
    !source.includes('function formatAirStrikeTargetLabel(') && !source.includes('function formatRangedTargetUnitLabel('),
    'renderer should not keep dead local strike target label helpers after formatter extraction'
  );
}

/**
 * Defines the `testKillUpdateTextOmitsPlayerSuffixes` function shape (function testKillUpdateTextOmitsPlayerSuffixes(): void).

 * Purpose: Supports maintainability by documenting why `testKillUpdateTextOmitsPlayerSuffixes` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testKillUpdateTextOmitsPlayerSuffixes(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const buildKillToastFormatterBundleFn = getFunctionSource(source, 'buildKillToastFormatterBundle');

  assert.ok(
    !buildKillToastFormatterBundleFn.includes("' (AI)'") && !buildKillToastFormatterBundleFn.includes("' (human)'"),
    'kill/update formatter should not append AI/human suffixes'
  );
}

/**
 * Defines the `testTacticalRubbleTooltipAndTerrainVariantContracts` function shape (function testTacticalRubbleTooltipAndTerrainVariantContracts(): void).

 * Purpose: Supports maintainability by documenting why `testTacticalRubbleTooltipAndTerrainVariantContracts` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function testTacticalRubbleTooltipAndTerrainVariantContracts(): void {
  const gameScenePath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'gameScene.ts');
  const rendererSource = fs.readFileSync(gameScenePath, 'utf8');
  const terrainTooltipStatePath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'terrainTooltipStrategicState.ts');
  const terrainTooltipStateSource = fs.readFileSync(terrainTooltipStatePath, 'utf8');
  const terrainTooltipHtmlPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'terrainTooltipHtml.ts');
  const terrainTooltipHtmlSource = fs.readFileSync(terrainTooltipHtmlPath, 'utf8');
  const terrainStylesPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'terrainVisualStyles.ts');
  const terrainStylesSource = fs.readFileSync(terrainStylesPath, 'utf8');
  const drawTerrainHexesFn = getFunctionSource(rendererSource, 'drawTerrainHexes');
  const featureLabelsForTacticalChildFn = getFunctionSource(terrainTooltipStateSource, 'featureLabelsForTacticalChild');
  const terrainStateForPointerFn = getFunctionSource(terrainTooltipStateSource, 'terrainStateForPointer');
  const formatTerrainTooltipHtmlFn = getFunctionSource(terrainTooltipHtmlSource, 'formatTerrainTooltipHtml');

  assert.ok(
    drawTerrainHexesFn.includes('if (tacticalActive) return;'),
    'res1 terrain fills/styles should be suppressed while res4 child hex rendering is active'
  );
  assert.ok(
    !featureLabelsForTacticalChildFn.includes("labels.push('Rubble')") &&
      !getFunctionSource(terrainTooltipStateSource, 'featureLabelsForStrategicHex').includes('Rubble') &&
      !getFunctionSource(terrainTooltipStateSource, 'getStrategicFeaturesSummary').includes('Rubble'),
    'feature lines omit Rubble'
  );
  assert.ok(
    !getFunctionSource(terrainTooltipStateSource, 'getStrategicTerrainSummary').includes('Urban') &&
      !getFunctionSource(terrainTooltipStateSource, 'getStrategicTerrainSummary').includes('Rubble'),
    'a world hex terrain summary stays the kind mix'
  );
  assert.ok(
    featureLabelsForTacticalChildFn.includes('tacticalRoadRailSideMasksForChild') &&
      featureLabelsForTacticalChildFn.includes("labels.push('Road')") &&
      featureLabelsForTacticalChildFn.includes("labels.push('Rail')") &&
      !featureLabelsForTacticalChildFn.includes('tacticalBattleSnapshot'),
    'res4 feature labels should list Road/Rail from global tacticalRoadRailSidesByH3 for explored hexes in strategic and tactical modes'
  );
  assert.ok(
    terrainTooltipStateSource.includes('function tacticalRoadRailSideMasksForChild') &&
      terrainTooltipStateSource.includes('S.tacticalRoadRailSidesByH3.get(detailH3)'),
    'res4 tooltip Features and Effects should share tacticalRoadRailSideMasksForChild lookup'
  );
  assert.ok(
    terrainStateForPointerFn.includes('isRubble: detail?.isRubble ?? false'),
    'res4 tooltip state should preserve rubble override flags from terrain detail state'
  );
  assert.ok(
    formatTerrainTooltipHtmlFn.includes('formatTerrainVariantSuffix(state)'),
    'terrain tooltip rendering should use shared variant suffix formatting for urban/rubble'
  );
  assertMatches(
    terrainStylesSource,
    /const isRubble = options\?\.isRubble === true;/,
    'terrain fill logic should derive rubble variant directly from the rubble override flag'
  );
  assertMatches(
    terrainStylesSource,
    /const isUrban = !isRubble && options\?\.isUrban === true;/,
    'terrain fill logic should derive urban variant directly from the urban override flag'
  );
}

/**
 * Defines the `testTacticalDrawBranchSkipsStrategicStaleIntel` function shape (function testTacticalDrawBranchSkipsStrategicStaleIntel(): void).

 * Purpose: Guards milestone-2.1 no-fog tactical rendering against strategic stale-intel overlays.
 * When to use: Regression signal when refactoring `drawGameScene` tactical early return.
 * Expected outcome: The tactical-only slice of `drawGameScene` never calls `drawStaleEnemyIntel`.
 * Exceptions: None.
 */
function testTacticalDrawBranchSkipsStrategicStaleIntel(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'gameScene.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const drawSceneFn = getFunctionSource(source, 'drawGameScene');
  const tacticalIdx = drawSceneFn.indexOf('if (S.tacticalBattleSnapshot)');
  assert.ok(tacticalIdx >= 0, 'drawGameScene should branch on tactical snapshot');
  const tacticalReturnIdx = drawSceneFn.indexOf('return;', tacticalIdx);
  assert.ok(tacticalReturnIdx > tacticalIdx, 'tactical branch should return before strategic-only overlays');
  const tacticalSlice = drawSceneFn.slice(tacticalIdx, tacticalReturnIdx);
  assert.ok(
    !tacticalSlice.includes('drawStaleEnemyIntel'),
    'tactical draw branch must not apply strategic fog-of-war stale intel rendering'
  );
  assert.ok(tacticalSlice.includes('drawUnits('), 'tactical branch should still draw tactical unit markers');
}

/**
 * Defines the `testTacticalDrawingSkipsExploredGateWhenTactical` function shape (function testTacticalDrawingSkipsExploredGateWhenTactical(): void).

 * Purpose: Confirms tactical terrain drawing does not hide the enclosing tactical parent behind strategic exploration fog (milestone 2.1 Phase K).
 * When to use: Regression guard when refactoring `drawTacticalTerrainHexes` parent filtering.
 * Expected outcome: With a battle snapshot, terrain drawing iterates `tacticalChildH3Indexes`. Without one, explored parents still gate the geometric children.
 * Exceptions: None.
 */
function testTacticalDrawingSkipsExploredGateWhenTactical(): void {
  const terrainPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'terrainRendering.ts');
  const source = fs.readFileSync(terrainPath, 'utf8');
  const fn = getFunctionSource(source, 'drawTacticalTerrainHexes');
  assert.ok(
    fn.includes('paintBattleFootprintTerrain'),
    'drawTacticalTerrainHexes should paint tacticalChildH3Indexes while a battle snapshot is set'
  );
  assert.ok(
    fn.includes('if (!exploredHexes.has(parent.h3Index)) continue;'),
    'drawTacticalTerrainHexes should keep the explored-parent path when no battle snapshot is set'
  );
}

/**
 * Defines the `testTacticalEntryLayerPlanningAndContestedContracts` function shape (function testTacticalEntryLayerPlanningAndContestedContracts(): void).

 * Purpose: Static regression tests for milestone-2.1 Phase B tactical magnifier visibility rules (planning-only, contested strategic, mirrored vertical offset).
 * When to use: CI guard when refactoring `syncTacticalEntryButton` or overlay layout.
 * Expected outcome: Source encodes planning+tactical-active gate, co-presence contest check, and magnifyTop symmetric offset below the hex midpoint (same distance as overlay text is below center).
 * Exceptions: None.
 */
function testTacticalEntryLayerPlanningAndContestedContracts(): void {
  const entryPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'tacticalEntryLayer.ts');
  const source = fs.readFileSync(entryPath, 'utf8');
  assert.ok(
    !source.includes('HIDE_MAGIFIERS_WHEN_TACTICAL_BATTLE_SESSION_ACTIVE'),
    'syncTacticalEntryButton should not reference removed optional magnifier-hide flag'
  );
  assert.ok(
    /if\s*\(\s*S\.gameState\.phase\s*!==\s*'planning'\s*\|\|\s*S\.tacticalBattleSnapshot\s*\)/.test(source),
    'syncTacticalEntryButton should gate overlays on planning phase OR renderer tactical snapshot in one condition'
  );
  assert.ok(
    source.includes('if (areResolutionDiceChipsShowing(S.resolutionMoveAnimation)) {'),
    'syncTacticalEntryButton should hide magnifiers while resolution dice chips are showing'
  );
  assert.ok(
    source.includes('if (!isContestedStrategicHex(S.gameState, hx.h3Index)) continue;'),
    'syncTacticalEntryButton should only place buttons on contested res1 hexes'
  );
  assert.ok(
    source.includes("u.player === 'human'") && source.includes("u.player === 'opponent'"),
    'tactical entry eligibility should require both human and opponent parent units in the same hex'
  );
  assert.ok(
    source.includes('offsetFromCenterToOverlayText') && source.includes('center.y + offsetFromCenterToOverlayText'),
    'syncTacticalEntryButton should place the magnifier below center by the same |y| offset the overlay text uses from center'
  );
  assert.ok(
    source.includes('class="tactical-entry-btn"') && source.includes('&#128269;'),
    'syncTacticalEntryButton should emit magnifying-glass tactical entry buttons'
  );
}

/**
 * Defines the `testStrategicAndTacticalBranchesShareOrderOverlayPipeline` function shape.

 * Purpose: Guards the shared order-overlay pipeline so tactical/strategic `drawGameScene` paths cannot drop pending support overlays independently.
 * When to use: Regression signal when refactoring `drawGameScene` or `orderOverlayStages`.
 * Expected outcome: Both branches call `drawPendingMarchesHoverAndSupportOrderStack` from the shared module (which stages hover preview then support overlays).
 * Exceptions: None.
 */
function testStrategicAndTacticalBranchesShareOrderOverlayPipeline(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'gameScene.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const drawSceneFn = getFunctionSource(source, 'drawGameScene');
  assert.ok(
    source.includes("from './orderOverlayStages'") && source.includes('drawPendingMarchesHoverAndSupportOrderStack'),
    'renderer should import shared order overlay stack helper'
  );
  const stackCalls = drawSceneFn.match(/drawPendingMarchesHoverAndSupportOrderStack\(/g) ?? [];
  assert.ok(stackCalls.length >= 2, 'drawGameScene should invoke shared pending march/hover/support stack in tactical and strategic paths');
}

/**
 * Defines the `testMainMapInteractionsDelegatesHumanUnitIconSelectionToPolicyModule` function shape.

 * Purpose: Guards the shared click-selection policy for human unit icon hits on the main map.
 * When to use: Regression signal when refactoring `mainMapInteractions` selection branches.
 * Expected outcome: Icon hit path delegates to `applyHumanUnitIconClickSelectionPolicy` and clears use the shared timer helper.
 * Exceptions: None.
 */
function testMainMapInteractionsDelegatesHumanUnitIconSelectionToPolicyModule(): void {
  const interactionsPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'mainMapInteractions.ts');
  const source = fs.readFileSync(interactionsPath, 'utf8');
  assert.ok(
    source.includes("from './mapClickSelectionPolicy'") &&
      source.includes('applyHumanUnitIconClickSelectionPolicy(') &&
      source.includes('clearDeferredHumanUnitSingleSelectTimer()'),
    'main map interactions should delegate human unit icon selection to shared policy helpers'
  );
}

/**
 * Defines the `testParityDiagnosticsBreadcrumbsCoverPlanningAndPositionSourceBoundaries` function shape.

 * Purpose: Guards parity diagnostics instrumentation around double-click planning and tactical draft-vs-committed source selection.
 * When to use: Regression signal when refactoring `mapDoubleClickHandler`, `mapClickSelectionPolicy`, or `tacticalDraftMarchOverlay`.
 * Expected outcome: Breadcrumb helper imports and event keys remain wired at the parity-sensitive boundaries.
 * Exceptions: None.
 */
function testParityDiagnosticsBreadcrumbsCoverPlanningAndPositionSourceBoundaries(): void {
  const interactionsPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'mapDoubleClickHandler.ts');
  const selectionPolicyPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'mapClickSelectionPolicy.ts');
  const tacticalOverlayPath = path.resolve(process.cwd(), 'src', 'renderer', 'tactical', 'tacticalDraftMarchOverlay.ts');
  const interactionsSource = fs.readFileSync(interactionsPath, 'utf8');
  const selectionPolicySource = fs.readFileSync(selectionPolicyPath, 'utf8');
  const tacticalOverlaySource = fs.readFileSync(tacticalOverlayPath, 'utf8');
  assert.ok(
    interactionsSource.includes('emitParityDiagnosticsBreadcrumb') &&
      interactionsSource.includes("'planning.doubleClickAccepted'") &&
      interactionsSource.includes("'planning.doubleClickIgnored'") &&
      interactionsSource.includes("'planning.doubleClickRejected'"),
    'main map double-click handling should emit parity breadcrumbs for planning decisions'
  );
  assert.ok(
    selectionPolicySource.includes('emitParityDiagnosticsBreadcrumb') &&
      selectionPolicySource.includes("'selection.deferSingleSelect'") &&
      selectionPolicySource.includes("'selection.applyDeferredSingleSelect'"),
    'main map click-selection policy should emit parity breadcrumbs for deferred single-select behavior'
  );
  assert.ok(
    tacticalOverlaySource.includes('emitParityDiagnosticsBreadcrumb') &&
      tacticalOverlaySource.includes("'tactical.positionSourceSelection'"),
    'tactical draft overlay helpers should emit parity breadcrumbs for draft-vs-committed position source selection'
  );
}

/**
 * Defines the `testTacticalMapViewLocksZoomPanAndRestoresWorld` function shape (function testTacticalMapViewLocksZoomPanAndRestoresWorld(): void).

 * Purpose: Static regression tests for Leaflet tactical camera constraints and exit restoration.
 * When to use: CI guard when refactoring `enterTacticalMapView` / `exitTacticalMapView`.
 * Expected outcome: Enter clamps min/max zoom and maxBounds to the tactical footprint with animated bounds; exit restores the loaded map extent and saved zoom limits.
 * Exceptions: None.
 */
function testTacticalMapViewLocksZoomPanAndRestoresWorld(): void {
  const tacticalMapPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'tacticalMapView.ts');
  const source = fs.readFileSync(tacticalMapPath, 'utf8');
  const enterFn = getFunctionSource(source, 'enterTacticalMapView');
  assert.ok(
    enterFn.includes('map.setMaxBounds(tacticalBounds)') || enterFn.includes('map.setMaxBounds?.(tacticalBounds)'),
    'enterTacticalMapView should clamp Leaflet pan to the tactical footprint bounds'
  );
  assert.ok(
    enterFn.includes('setMinZoom(map.getZoom())') || enterFn.includes('map.setMinZoom(map.getZoom())'),
    'enterTacticalMapView should lock tactical min zoom to the level reached after fitting the footprint'
  );
  assert.ok(
    enterFn.includes('tacticalFlyMaxZoom') || enterFn.includes('maxZoom: tacticalFlyMaxZoom'),
    'enterTacticalMapView should use a raised tactical fly max zoom for a closer default view'
  );
  assert.ok(
    enterFn.includes('map.flyToBounds') || enterFn.includes('map.fitBounds'),
    'enterTacticalMapView should animate or fit bounds into the tactical footprint'
  );
  const exitFn = getFunctionSource(source, 'exitTacticalMapView');
  assert.ok(
    exitFn.includes('restoreLoadedMapExtent()'),
    'exitTacticalMapView should restore the loaded map extent after tactical mode'
  );
  assert.ok(
    exitFn.includes('restoreLoadedMapExtent(true)'),
    'exitTacticalMapView should fit the loaded map extent when no strategic home view was saved'
  );
  assert.ok(
    exitFn.includes('map.setMinZoom(S.preTacticalLeafletMinZoom)') &&
      exitFn.includes('map.setMaxZoom(S.preTacticalLeafletMaxZoom)'),
    'exitTacticalMapView should restore pre-tactical min/max zoom when captured'
  );
}

/**
 * Defines the `testResolutionMovingStackGroupsMixedEmbarkedAndNavalMoves` function shape (function testResolutionMovingStackGroupsMixedEmbarkedAndNavalMoves(): void).

 * Purpose: Static regression tests for resolution-phase movement stacks (naval + embarked cargo grouped animation).
 * When to use: CI guard when refactoring `drawMovingUnits` in `pathDrawing.ts`.
 * Expected outcome: Source encodes groupKey, aggregation, mixed-type label, and count badge layout for stacked moves.
 * Exceptions: None.
 */
function testResolutionMovingStackGroupsMixedEmbarkedAndNavalMoves(): void {
  const pathDrawingPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'pathDrawing.ts');
  const source = fs.readFileSync(pathDrawingPath, 'utf8');
  const drawMovingUnitsFn = getFunctionSource(source, 'drawMovingUnits');

  assert.ok(
    drawMovingUnitsFn.includes('const groupKey = `${move.player}|${move.fromH3Index}|${move.toH3Index}`;'),
    'drawMovingUnits should group by player+origin+destination so naval + embarked cargo animate as one stack'
  );
  assert.ok(
    drawMovingUnitsFn.includes('existing.count += 1;') &&
      drawMovingUnitsFn.includes('existing.unitTypes.add(move.unitType);'),
    'drawMovingUnits should aggregate grouped move count and unit-type set for mixed stacks'
  );
  assert.ok(
    drawMovingUnitsFn.includes("const label = group.unitTypes.size > 1 ? '*' : (UNIT_TYPE_LABELS[move.unitType] ?? '?');"),
    'drawMovingUnits should show mixed-type stack marker when grouped moves include multiple unit types'
  );
  assert.ok(
    drawMovingUnitsFn.includes('if (group.count > 1) {') &&
      drawMovingUnitsFn.includes('p.x + STACK_OFFSET_X') &&
      drawMovingUnitsFn.includes('p.y + STACK_OFFSET_Y') &&
      drawMovingUnitsFn.includes('ctx.fillText(String(group.count), badgeX, badgeY);'),
    'drawMovingUnits should render grouped movement as stacked markers with a count badge'
  );
}

/**
 * Verifies consolidation seams: sanitizer import, stroke helper, tooltip factory, combat overlay extract, draw order.
 *
 * Purpose: Source-text contracts for renderer maintainability extractions that lack canvas unit tests.
 * When to use: After consolidating build-count, support strokes, tooltips, or resolution combat overlays.
 * Expected outcome: Assertions pass when public exports and draw-order call sequences remain intact.
 * Exceptions: None.
 */
function testMaintainabilityConsolidationSeams(): void {
  const multiPopupPath = path.resolve(process.cwd(), 'src', 'renderer', 'gameplay', 'buildQueueMultiPopup.ts');
  const multiPopupSource = fs.readFileSync(multiPopupPath, 'utf8');
  assert.ok(
    multiPopupSource.includes("from './buildQueuePopupFormatting'") &&
      multiPopupSource.includes('sanitizeBuildCountInputText') &&
      !multiPopupSource.includes('function sanitizeCount'),
    'multi build popup should reuse sanitizeBuildCountInputText from formatting leaf'
  );

  const orderDrawingPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'orderDrawing.ts');
  const orderDrawingSource = fs.readFileSync(orderDrawingPath, 'utf8');
  assert.ok(
    orderDrawingSource.includes('function strokeSupportOrderLines') &&
      orderDrawingSource.includes('export function drawRangedAttackLines') &&
      orderDrawingSource.includes('export function drawAirStrikeLines') &&
      orderDrawingSource.includes('export function drawRangedResolutionShotLines'),
    'support-order drawers should share strokeSupportOrderLines while keeping public exports'
  );

  const blockTooltipPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'orderBlockHexTooltip.ts');
  const slowerTooltipPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'orderSlowerHexTooltip.ts');
  const blockTooltipSource = fs.readFileSync(blockTooltipPath, 'utf8');
  const slowerTooltipSource = fs.readFileSync(slowerTooltipPath, 'utf8');
  assert.ok(
    blockTooltipSource.includes("from './createTransientPointerTooltip'") &&
      slowerTooltipSource.includes("from './createTransientPointerTooltip'") &&
      blockTooltipSource.includes('export function hideOrderBlockHexTooltip') &&
      slowerTooltipSource.includes('export function hideOrderSlowerHexTooltip') &&
      slowerTooltipSource.includes('persistent: true'),
    'order block/slower tooltips should use createTransientPointerTooltip with stable public exports'
  );
  const transientTooltipPath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'createTransientPointerTooltip.ts');
  const transientTooltipSource = fs.readFileSync(transientTooltipPath, 'utf8');
  assert.ok(
    transientTooltipSource.includes('ttl?.clear()') && !transientTooltipSource.includes('ttl.clear()'),
    'a persistent order tooltip must not call a dismiss timer it does not have'
  );

  const tacticalOrdersPath = path.resolve(process.cwd(), 'src', 'renderer', 'gameplay', 'tacticalOrders.ts');
  const tacticalOrdersSource = fs.readFileSync(tacticalOrdersPath, 'utf8');
  assert.ok(
    tacticalOrdersSource.includes('function replacePendingOrdersForSelected') &&
      tacticalOrdersSource.includes('export function replacePendingRangedAttacksForSelected') &&
      tacticalOrdersSource.includes('export function replacePendingAirStrikesForSelected') &&
      tacticalOrdersSource.includes('export function replacePendingFerryOrdersForSelected'),
    'pending order replacements should share a helper while keeping public exports'
  );
  const initCorePath = path.resolve(process.cwd(), 'src', 'renderer', 'map', 'initCore.ts');
  const initCoreSource = fs.readFileSync(initCorePath, 'utf8');
  assert.ok(
    initCoreSource.includes('selectionSupportButtonMode(') &&
      tacticalOrdersSource.includes('selectionSupportButtonMode('),
    'Ranged and Strike button visibility must share selectionSupportButtonMode'
  );

  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'gameScene.ts');
  const rendererSource = fs.readFileSync(rendererPath, 'utf8');
  const overlaysPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'resolutionCombatOverlays.ts');
  const overlaysSource = fs.readFileSync(overlaysPath, 'utf8');
  const symbolPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'resolutionSymbolDrawing.ts');
  const symbolSource = fs.readFileSync(symbolPath, 'utf8');
  assert.ok(
    rendererSource.includes("from './resolutionCombatOverlays'") &&
      rendererSource.includes('drawResolutionCombatAndCasualtyOverlays') &&
      overlaysSource.includes('drawCombatLightning(ctx, knownCombatHexes, pulseOpacity)') &&
      overlaysSource.includes('drawCasualtyOverlay(ctx, knownCasualtyHexes, pulseOpacity)') &&
      overlaysSource.indexOf('drawCombatLightning') < overlaysSource.indexOf('drawCasualtyOverlay') &&
      symbolSource.includes('resolution/lightning_bolt.svg') &&
      symbolSource.includes('resolution/x_destroyed.svg') &&
      !symbolSource.includes('agent_wars_icons') &&
      symbolSource.includes('ctx.globalAlpha = opacity'),
    'resolution combat overlays should draw the status bolt and destruction mark at the pulse opacity, lightning before casualties'
  );

  const drawGameSceneFn = getFunctionSource(rendererSource, 'drawGameScene');
  const shotIdx = drawGameSceneFn.indexOf('drawRangedResolutionShotLines');
  const unitsIdx = drawGameSceneFn.indexOf('drawUnits');
  const combatIdx = drawGameSceneFn.indexOf('drawResolutionCombatAndCasualtyOverlays');
  assert.ok(shotIdx >= 0 && unitsIdx >= 0 && combatIdx >= 0, 'drawGameScene should call shot lines, units, and combat overlays');
  assert.ok(shotIdx < unitsIdx, 'shot connectors should be drawn before units');
  assert.ok(unitsIdx < combatIdx, 'units should be drawn before lightning/casualty overlays');
  assert.ok(
    (drawGameSceneFn.match(/drawRangedResolutionShotLines/g) ?? []).length >= 2 &&
      (drawGameSceneFn.match(/drawResolutionCombatAndCasualtyOverlays/g) ?? []).length >= 2,
    'tactical and strategic branches should each draw shot lines and combat overlays'
  );
}

/**
 * Defines the `run` function shape (function run(): void).

 * Purpose: Supports maintainability by documenting why `run` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function run(): void {
  testRedrawAndResizeDelegateToSharedScene();
  testZoomHidesStrategicMapUnits();
  testCommittedPathsRemainVisibleDuringResolutionAnimation();
  testProductionLabelContractsForExploredVsUnexploredHexes();
  testInfrastructureGlyphSetsComeFromTacticalOverrides();
  testAirFerryDoubleClickContracts();
  testAirStrikeAndAirGlyphContracts();
  testKillUpdateTextOmitsPlayerSuffixes();
  testTacticalRubbleTooltipAndTerrainVariantContracts();
  testResolutionMovingStackGroupsMixedEmbarkedAndNavalMoves();
  testTacticalDrawBranchSkipsStrategicStaleIntel();
  testTacticalDrawingSkipsExploredGateWhenTactical();
  testTacticalEntryLayerPlanningAndContestedContracts();
  testStrategicAndTacticalBranchesShareOrderOverlayPipeline();
  testMainMapInteractionsDelegatesHumanUnitIconSelectionToPolicyModule();
  testParityDiagnosticsBreadcrumbsCoverPlanningAndPositionSourceBoundaries();
  testTacticalMapViewLocksZoomPanAndRestoresWorld();
  testMaintainabilityConsolidationSeams();
  console.log('rendererConsolidation.test.ts passed');
}

run();
