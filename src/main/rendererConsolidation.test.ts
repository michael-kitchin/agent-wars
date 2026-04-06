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
    resizeFn.includes('drawGameScene(ctx, w, h, S.gameState);'),
    'resizeAndRedraw should delegate to drawGameScene'
  );
  assert.ok(
    redrawFn.includes('drawGameScene(ctx, w, h, S.gameState);'),
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
    drawSceneFn.includes('drawStaleEnemyIntel(ctx, state, inferUnitTypeLabelFromId);'),
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
    shouldDrawCommittedOrderPathsFn.includes('return !S.ctrlKeyActive;'),
    'shouldDrawCommittedOrderPaths should hide committed paths while ctrl is held for stack selection'
  );
  assert.ok(
    drawSceneFn.includes(
      'if (shouldDrawCommittedPaths && !S.hideCommittedOrderLinesAfterReady && S.humanStandingOrders.length > 0 && state.units.length)'
    ),
    'drawGameScene should keep committed paths visible once planned when ctrl is not held'
  );
  assert.ok(
    drawSceneFn.includes('const shouldDrawPathPreview = shouldDrawHoveredPathPreview();'),
    'drawGameScene should use shared hover-preview visibility policy helper'
  );
  assert.ok(
    shouldDrawHoveredPathPreviewFn.includes('return !S.ctrlKeyActive && S.selectedUnitIds.length > 0;'),
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
    !source.includes('S.hideCommittedOrderLinesAfterReady = true;'),
    'renderer should not force-hide committed paths after ready'
  );
}

function testProductionLabelContractsForExploredVsUnexploredHexes(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const drawProductionFn = getFunctionSource(source, 'drawRes1ProductionOverlays');
  const syncBuildEntryFn = getFunctionSource(source, 'syncBuildEntryButton');
  const getUrbanProductionCapacityForHexFn = getFunctionSource(source, 'getUrbanProductionCapacityForHex');
  const isRes1HexHumanUrbanProductionFn = getFunctionSource(source, 'isRes1HexHumanUrbanProduction');
  const drawHoverPreviewFn = getFunctionSource(source, 'drawHoverRoutePreview');
  const shouldDrawHoveredPathPreviewFn = getFunctionSource(source, 'shouldDrawHoveredPathPreview');

  assert.ok(
    drawProductionFn.includes('if (shouldRenderRes4Hexes()) return'),
    'drawRes1ProductionOverlays should draw no production labels when res4 hexes are shown'
  );
  assert.ok(
    drawProductionFn.includes('const overlayContext = buildProductionOverlayContext(S.gameState);'),
    'drawRes1ProductionOverlays should build a shared overlay context once per draw'
  );
  assertMatches(
    drawProductionFn,
    /if\s*\(!explored\s*&&\s*!overlayContext\.mapInspectionHeld\)\s*continue;/,
    'drawRes1ProductionOverlays should only show unexplored production labels while T is held'
  );
  assert.ok(
    drawProductionFn.includes('!overlayContext.mapInspectionHeld') &&
      drawProductionFn.includes('isRes1HexHumanUrbanProduction(S.gameState, hx)'),
    'drawRes1ProductionOverlays should include shared human-urban production eligibility checks'
  );
  assert.ok(
    drawProductionFn.includes(
      'const canShowLabelWithoutInspection = isRes1HexHumanUrbanProduction(S.gameState, hx) || controlledByHuman;'
    ),
    'drawRes1ProductionOverlays should keep 0c labels visible on explored human-controlled non-urban hexes'
  );
  assert.ok(
    drawProductionFn.includes('const hasClickableBuildEntryForHex =') &&
      drawProductionFn.includes('isRes1HexHumanUrbanProduction(S.gameState, hx)'),
    'drawRes1ProductionOverlays should keep build-entry clickability restricted to human urban-production hexes'
  );
  assertMatches(
    drawProductionFn,
    /:\s*`\$\{Math\.max\(0,\s*capacityPerTurn\)\.toLocaleString\(\)\}c`;/,
    'drawRes1ProductionOverlays should show unexplored labels in N1c-only format'
  );
  assert.ok(
    drawProductionFn.includes('const hasClickableBuildEntryForHex =') &&
      drawProductionFn.includes('explored &&') &&
      drawProductionFn.includes('isRes1HexHumanUrbanProduction(S.gameState, hx)') &&
      drawProductionFn.includes('if (hasClickableBuildEntryForHex) {'),
    'drawRes1ProductionOverlays should hide non-clickable label when clickable build entry exists'
  );
  assert.ok(
    drawProductionFn.includes('const capacityPerTurn = getUrbanProductionCapacityForHex(hx.h3Index);'),
    'drawRes1ProductionOverlays should derive production capacity from shared canonical urban-res4 count helper'
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
    syncBuildEntryFn.includes('isRes1HexHumanUrbanProduction(S.gameState, hx)'),
    'syncBuildEntryButton should use shared human-urban production eligibility'
  );
  assert.ok(
    isRes1HexHumanUrbanProductionFn.includes('getUrbanProductionCapacityForHex(hx.h3Index) > 0'),
    'isRes1HexHumanUrbanProduction should use canonical urban-res4 count for build eligibility'
  );
  assert.ok(
    getUrbanProductionCapacityForHexFn.includes('countUrbanRes4HexesInRes1Hex(h3Index)'),
    'getUrbanProductionCapacityForHex should compute from live urban res4-child count'
  );
  assert.ok(
    drawHoverPreviewFn.includes('if (!shouldDrawHoveredPathPreview()) return;') &&
      shouldDrawHoveredPathPreviewFn.includes('return !S.ctrlKeyActive && S.selectedUnitIds.length > 0;'),
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
      stackSingleUnitHandlerFn.includes('if (!S.ctrlKeyActive) {') &&
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

function testInfrastructureGlyphSetsComeFromRes4Overrides(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const drawInfraFn = getFunctionSource(source, 'drawTerrainInfrastructureOverlays');
  const hasVisibleRes1InfraFn = getFunctionSource(source, 'hasVisibleRes1InfrastructureGlyphs');

  assert.ok(
    source.includes('const nextState = deriveInfrastructureOverlayState(rows);') &&
      source.includes('terrainInfraRes4Airport = nextState.terrainInfraRes4Airport;') &&
      source.includes('terrainInfraRes4Seaport = nextState.terrainInfraRes4Seaport;'),
    'applyRes4TerrainOverrides should use centralized derivation for res4 airport/seaport glyph sets'
  );
  assert.ok(
    source.includes('terrainInfraRes1Airport = nextState.terrainInfraRes1Airport;') &&
      source.includes('terrainInfraRes1Seaport = nextState.terrainInfraRes1Seaport;'),
    'applyRes4TerrainOverrides should use centralized derivation for res1 airport/seaport glyph sets'
  );
  assert.ok(
    !source.includes('.getTerrainInfrastructureHints()'),
    'renderer init should not overwrite live glyph sets with major-only terrain hint snapshots'
  );
  assert.ok(
    !drawInfraFn.includes('if (unitHexes.has(hx.h3Index)) continue;') &&
      !drawInfraFn.includes('if (unitHexes.has(parent.h3Index)) continue;'),
    'drawTerrainInfrastructureOverlays should not suppress airport/seaport glyphs on hexes that contain units'
  );
  assert.ok(
    !hasVisibleRes1InfraFn.includes('!unitHexes.has(h3Index)'),
    'hasVisibleRes1InfrastructureGlyphs should remain true for explored infra hexes even when units are present'
  );
}

function testAirFerryDoubleClickContracts(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const orderDrawingPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'orderDrawing.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
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
    formatPendingFerryOrderSidebarLabelFn.includes('?h (ferry)') &&
      !formatPendingFerryOrderSidebarLabelFn.includes('destinationH3Index} (ferry)'),
    'ferry sidebar labels should avoid raw H3 fallback and stay in Nh notation'
  );
  assert.ok(
    source.includes("from './rendering/orderDrawing'") &&
      source.includes('drawPendingFerryLines(ctx, S.pendingFerryOrders, state.units, hexList, drawLineArrow);') &&
      orderDrawingSource.includes('function drawPendingFerryLines(') &&
      orderDrawingSource.includes('drawLineArrow('),
    'pending ferry planning should render filled map arrows like other planned movement'
  );
}

function testAirStrikeAndAirGlyphContracts(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const rendererConstantsPath = path.resolve(process.cwd(), 'src', 'renderer', 'core', 'constants.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const rendererConstantsSource = fs.readFileSync(rendererConstantsPath, 'utf8');
  const inferUnitTypeLabelFromIdFn = getFunctionSource(source, 'inferUnitTypeLabelFromId');

  assert.ok(
    rendererConstantsSource.includes("air: 'S'") && source.includes("from './core/constants'"),
    'air unit type label should render as S'
  );
  assert.ok(
    inferUnitTypeLabelFromIdFn.includes("if (unitId.includes('-air-')) return 'S';"),
    'unit-id fallback label should map air units to S instead of ?'
  );
  assert.ok(
    source.includes("from './gameplay/turnUpdateSummary'") &&
      source.includes('buildTurnUpdateBullets({') &&
      source.includes('formatKillLine: killToastFormatter.formatKillLine'),
    'ready update bullets should be delegated to shared turn update summary helpers'
  );
  assert.ok(
    source.includes("btnEl.style.display = S.airStrikeModeActive ? 'none' : 'inline-block';"),
    'Strike button should hide while strike planning mode is active'
  );
  assert.ok(
    source.includes("from './gameplay/orderLabelFormatting'") &&
      source.includes('formatPendingRangedAttackSidebarLabel(S.gameState, r)') &&
      source.includes('formatPendingAirStrikeSidebarLabel(S.gameState, strike)') &&
      source.includes('formatPendingFerryOrderSidebarLabel(S.gameState, ferry)'),
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
      source.includes('inAirStrikeOutbound') &&
      source.includes('inAirStrikeReturn'),
    'resolution playback should include outbound/return air-strike movement phases'
  );
  assert.ok(
    source.includes('const knownHumanAirStrikeTargetHexes = new Set(') &&
      source.includes(".filter((move) => move.player === 'human')") &&
      source.includes('.filter((h3) => !knownHumanAirStrikeTargetHexes.has(h3))'),
    'unknown battle announcements should not include known human air-strike target hexes'
  );
  assert.ok(
    source.includes('phase.inAirStrikeLightning || phase.inAirStrikeCasualty') &&
      source.includes('h3Index: move.toH3Index') &&
      source.includes('movingIds = new Set((anim.airStrikeReturnMoves ?? []).map((move) => move.unitId));'),
    'air strike playback should pin strikers at target during combat/casualty and hide survivors at base until return animation completes'
  );
  assert.ok(
    source.includes('function buildResolutionPlaybackState(') &&
      source.includes('const { phase } = buildResolutionPlaybackState(anim, elapsed);'),
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

function testKillUpdateTextOmitsPlayerSuffixes(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const source = fs.readFileSync(rendererPath, 'utf8');
  const buildKillToastFormatterBundleFn = getFunctionSource(source, 'buildKillToastFormatterBundle');

  assert.ok(
    !buildKillToastFormatterBundleFn.includes("' (AI)'") && !buildKillToastFormatterBundleFn.includes("' (human)'"),
    'kill/update formatter should not append AI/human suffixes'
  );
}

function testRes4RubbleTooltipAndTerrainVariantContracts(): void {
  const rendererPath = path.resolve(process.cwd(), 'src', 'renderer', 'renderer.ts');
  const rendererSource = fs.readFileSync(rendererPath, 'utf8');
  const terrainStylesPath = path.resolve(process.cwd(), 'src', 'renderer', 'rendering', 'terrainVisualStyles.ts');
  const terrainStylesSource = fs.readFileSync(terrainStylesPath, 'utf8');
  const drawTerrainHexesFn = getFunctionSource(rendererSource, 'drawTerrainHexes');
  const featureLabelsForRes4ChildFn = getFunctionSource(rendererSource, 'featureLabelsForRes4Child');
  const terrainStateForPointerFn = getFunctionSource(rendererSource, 'terrainStateForPointer');
  const formatTerrainTooltipHtmlFn = getFunctionSource(rendererSource, 'formatTerrainTooltipHtml');

  assert.ok(
    drawTerrainHexesFn.includes('if (res4Active) return;'),
    'res1 terrain fills/styles should be suppressed while res4 child hex rendering is active'
  );
  assert.ok(
    featureLabelsForRes4ChildFn.includes('detail?.isRubble') &&
      featureLabelsForRes4ChildFn.includes("labels.push('Rubble')"),
    'res4 feature labels should include rubble when a child override marks rubble'
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

function run(): void {
  testRedrawAndResizeDelegateToSharedScene();
  testSharedSceneStillRendersStaleIntel();
  testCommittedPathsRemainVisibleDuringResolutionAnimation();
  testProductionLabelContractsForExploredVsUnexploredHexes();
  testStackCalloutSingleUnitNonCtrlClosesPopup();
  testModifierDrivenPopoverCloseRulesCentralized();
  testInfrastructureGlyphSetsComeFromRes4Overrides();
  testAirFerryDoubleClickContracts();
  testAirStrikeAndAirGlyphContracts();
  testKillUpdateTextOmitsPlayerSuffixes();
  testRes4RubbleTooltipAndTerrainVariantContracts();
  testResolutionMovingStackGroupsMixedEmbarkedAndNavalMoves();
  console.log('rendererConsolidation.test.ts passed');
}

run();
