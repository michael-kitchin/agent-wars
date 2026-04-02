/**
 * Verifies renderer draw-path consolidation remains intact.
 * Run with: node dist/main/rendererConsolidation.test.js
 */

import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Extracts one top-level function body from a TypeScript source string.
 */
function getFunctionSource(source: string, functionName: string): string {
  const signature = `function ${functionName}(`;
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `Expected function ${functionName} to exist`);

  const openBrace = source.indexOf('{', start);
  assert.ok(openBrace >= 0, `Expected function ${functionName} to have a body`);

  let depth = 0;
  for (let i = openBrace; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') depth -= 1;
    if (depth === 0) return source.slice(start, i + 1);
  }

  throw new Error(`Unterminated function body for ${functionName}`);
}

function assertMatches(source: string, pattern: RegExp, message: string): void {
  assert.ok(pattern.test(source), message);
}

function testRedrawAndResizeDelegateToSharedScene(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');

  const resizeFn = getFunctionSource(source, 'resizeAndRedraw');
  const redrawFn = getFunctionSource(source, 'redraw');

  assert.ok(
    resizeFn.includes('drawGameScene(ctx, w, h, gameState);'),
    'resizeAndRedraw should delegate to drawGameScene'
  );
  assert.ok(
    redrawFn.includes('drawGameScene(ctx, w, h, gameState);'),
    'redraw should delegate to drawGameScene'
  );

  assert.ok(!resizeFn.includes('drawTerrainHexes('), 'resizeAndRedraw should not duplicate scene rendering steps');
  assert.ok(!redrawFn.includes('drawTerrainHexes('), 'redraw should not duplicate scene rendering steps');
}

function testSharedSceneStillRendersStaleIntel(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const drawSceneFn = getFunctionSource(source, 'drawGameScene');

  assert.ok(
    drawSceneFn.includes('drawStaleEnemyIntel(ctx, state);'),
    'drawGameScene should render stale enemy intel markers'
  );
}

function testCommittedPathsRemainVisibleDuringResolutionAnimation(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const drawSceneFn = getFunctionSource(source, 'drawGameScene');
  const shouldDrawCommittedOrderPathsFn = getFunctionSource(source, 'shouldDrawCommittedOrderPaths');
  const shouldDrawHoveredPathPreviewFn = getFunctionSource(source, 'shouldDrawHoveredPathPreview');
  const hiddenDuringPreviewFn = getFunctionSource(source, 'getCommittedOrderUnitsHiddenDuringPreview');

  assert.ok(
    drawSceneFn.includes('const shouldDrawCommittedPaths = shouldDrawCommittedOrderPaths();'),
    'drawGameScene should use shared committed-path visibility policy helper'
  );
  assert.ok(
    shouldDrawCommittedOrderPathsFn.includes('return !ctrlKeyActive;'),
    'shouldDrawCommittedOrderPaths should hide committed paths while ctrl is held for stack selection'
  );
  assert.ok(
    drawSceneFn.includes('if (shouldDrawCommittedPaths && !hideCommittedOrderLinesAfterReady && humanStandingOrders.length > 0 && state.units.length)'),
    'drawGameScene should keep committed paths visible once planned when ctrl is not held'
  );
  assert.ok(
    drawSceneFn.includes('const shouldDrawPathPreview = shouldDrawHoveredPathPreview();'),
    'drawGameScene should use shared hover-preview visibility policy helper'
  );
  assert.ok(
    shouldDrawHoveredPathPreviewFn.includes('return !ctrlKeyActive && selectedUnitIds.length > 0;'),
    'shouldDrawHoveredPathPreview should gate hover path preview by ctrl and active selection'
  );
  assert.ok(
    drawSceneFn.includes('if (shouldDrawPathPreview && !anim) drawHoverRoutePreview(ctx);'),
    'drawGameScene should only draw hover path preview when preview rendering is enabled'
  );
  assert.ok(
    drawSceneFn.includes(
      'const hiddenCommittedUnitIdsWhilePreviewing = getCommittedOrderUnitsHiddenDuringPreview(shouldDrawPathPreview);'
    ),
    'drawGameScene should use helper to compute committed-path exclusions while previewing'
  );
  assert.ok(
    hiddenDuringPreviewFn.includes('if (!shouldDrawPathPreview || !hoverRoutePreview) return null;') &&
      hiddenDuringPreviewFn.includes('return new Set(selectedUnitIds);'),
    'getCommittedOrderUnitsHiddenDuringPreview should hide committed paths for units being replanned while preview is visible'
  );
  assert.ok(
    drawSceneFn.includes('drawStandingOrderLines(ctx, humanStandingOrders, state.units, hiddenCommittedUnitIdsWhilePreviewing);'),
    'drawGameScene should pass preview exclusion set into committed-path rendering'
  );
  assert.ok(
    !drawSceneFn.includes('if (!anim && !hideCommittedOrderLinesAfterReady'),
    'drawGameScene should not suppress committed paths while animation is active'
  );
  assert.ok(
    !source.includes('hideCommittedOrderLinesAfterReady = true;'),
    'renderer should not force-hide committed paths after ready'
  );
}

function testProductionLabelContractsForExploredVsUnexploredHexes(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const drawProductionFn = getFunctionSource(source, 'drawRes1ProductionOverlays');
  const syncBuildEntryFn = getFunctionSource(source, 'syncBuildEntryButton');
  const drawHoverPreviewFn = getFunctionSource(source, 'drawHoverRoutePreview');
  const shouldDrawHoveredPathPreviewFn = getFunctionSource(source, 'shouldDrawHoveredPathPreview');

  assert.ok(
    drawProductionFn.includes('if (shouldRenderRes4Hexes()) return'),
    'drawRes1ProductionOverlays should draw no production labels when res4 hexes are shown'
  );
  assert.ok(
    drawProductionFn.includes('const overlayContext = buildProductionOverlayContext(gameState);'),
    'drawRes1ProductionOverlays should build a shared overlay context once per draw'
  );
  assertMatches(
    drawProductionFn,
    /if\s*\(!explored\s*&&\s*!overlayContext\.mapInspectionHeld\)\s*continue;/,
    'drawRes1ProductionOverlays should only show unexplored production labels while T is held'
  );
  assert.ok(
    drawProductionFn.includes('!overlayContext.mapInspectionHeld') &&
      drawProductionFn.includes('isRes1HexHumanUrbanProduction(gameState, hx)'),
    'drawRes1ProductionOverlays should restrict non-inspection labels to shared human-urban production rule'
  );
  assertMatches(
    drawProductionFn,
    /:\s*`\$\{Math\.max\(0,\s*capacityPerTurn\)\.toLocaleString\(\)\}c`;/,
    'drawRes1ProductionOverlays should show unexplored labels in N1c-only format'
  );
  assert.ok(
    drawProductionFn.includes('const hasClickableBuildEntryForHex =') &&
      drawProductionFn.includes('explored &&') &&
      drawProductionFn.includes('isRes1HexHumanUrbanProduction(gameState, hx)') &&
      drawProductionFn.includes('if (hasClickableBuildEntryForHex) {'),
    'drawRes1ProductionOverlays should hide non-clickable label when clickable build entry exists'
  );
  assert.ok(
    drawProductionFn.includes('overlayContext.revealAllControllerQueues'),
    'drawRes1ProductionOverlays should branch queue visibility by overlay context'
  );

  assert.ok(
    syncBuildEntryFn.includes('if (res4On) {') && syncBuildEntryFn.includes('hideBuildPopup()'),
    'syncBuildEntryButton should suppress build UI and close build popup on res4 zoom'
  );
  assert.ok(
    syncBuildEntryFn.includes('if (!explored) continue;'),
    'syncBuildEntryButton should only render clickable buttons for explored hexes'
  );
  assert.ok(
    syncBuildEntryFn.includes('isRes1HexHumanUrbanProduction(gameState, hx)'),
    'syncBuildEntryButton should use shared human-urban production eligibility'
  );
  assert.ok(
    drawHoverPreviewFn.includes('if (!shouldDrawHoveredPathPreview()) return;') &&
      shouldDrawHoveredPathPreviewFn.includes('return !ctrlKeyActive && selectedUnitIds.length > 0;'),
    'drawHoverRoutePreview should use shared policy to suppress path-plan preview while ctrl is held and when nothing is selected'
  );
}

function testStackCalloutSingleUnitNonCtrlClosesPopup(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const showStackCalloutFn = getFunctionSource(source, 'showStackCallout');
  const stackSingleUnitHandlerFn = getFunctionSource(source, 'onStackSingleUnitToggleClick');

  assert.ok(
    showStackCalloutFn.includes('onStackSingleUnitToggleClick(') &&
      stackSingleUnitHandlerFn.includes('if (!ctrlKeyActive) {') &&
      stackSingleUnitHandlerFn.includes('hideStackCallout();'),
    'stack single-unit handler should close popup after non-ctrl unit button clicks'
  );
}

function testModifierDrivenPopoverCloseRulesCentralized(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const modifierRulesFn = getFunctionSource(source, 'applyModifierDrivenPopoverCloseRules');
  const keydownHandlerFn = getFunctionSource(source, 'init');

  assert.ok(
    modifierRulesFn.includes("if (reason === 'ctrl_pressed')") &&
      modifierRulesFn.includes('hideBuildPopup();') &&
      modifierRulesFn.includes("if (reason === 'ctrl_released')") &&
      modifierRulesFn.includes('hideStackCallout();'),
    'modifier-driven popover close rules should centralize ctrl pressed/released behavior'
  );
  assert.ok(
    keydownHandlerFn.includes("applyModifierDrivenPopoverCloseRules('ctrl_pressed');") &&
      keydownHandlerFn.includes("applyModifierDrivenPopoverCloseRules('ctrl_released');"),
    'init key handlers should delegate popover-close behavior to shared modifier rule helper'
  );
}

function run(): void {
  testRedrawAndResizeDelegateToSharedScene();
  testSharedSceneStillRendersStaleIntel();
  testCommittedPathsRemainVisibleDuringResolutionAnimation();
  testProductionLabelContractsForExploredVsUnexploredHexes();
  testStackCalloutSingleUnitNonCtrlClosesPopup();
  testModifierDrivenPopoverCloseRulesCentralized();
  console.log('rendererConsolidation.test.ts passed');
}

run();