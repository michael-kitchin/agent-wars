/**
 * Draw and resolution source contracts moved out of the over-limit renderer assertion file.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import { getFunctionSource } from './testSupport/rendererSourceAssertions';

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
 * Defines the `testTacticalDrawBranchSkipsStrategicStaleIntel` function shape (function testTacticalDrawBranchSkipsStrategicStaleIntel(): void).

 * Purpose: Guards no-fog tactical rendering against strategic stale-intel overlays.
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

 * Purpose: Confirms tactical terrain drawing does not hide the enclosing tactical parent behind strategic exploration fog.
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
 * Runs this file's source contracts.
 *
 * Purpose: The test runner executes this file as a script, the same way the previous combined file ran.
 * When to use: The call at the bottom of this file.
 * Expected outcome: Each contract function runs, and a thrown assertion fails the process.
 * Exceptions: Assertion errors propagate.
 */
function run(): void {
  testRedrawAndResizeDelegateToSharedScene();
  testZoomHidesStrategicMapUnits();
  testCommittedPathsRemainVisibleDuringResolutionAnimation();
  testResolutionMovingStackGroupsMixedEmbarkedAndNavalMoves();
  testTacticalDrawBranchSkipsStrategicStaleIntel();
  testTacticalDrawingSkipsExploredGateWhenTactical();
  testStrategicAndTacticalBranchesShareOrderOverlayPipeline();
  testMaintainabilityConsolidationSeams();
  console.log('rendererDrawConsolidation.test.ts passed');
}

run();
