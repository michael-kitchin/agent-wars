import type { GameStateSnapshot } from '../gameDb';
import { getAndClearAiToolLimitExceededLastTurn } from '../gameDb';
import { unitHasDirectRangedPlanning } from '../../shared/rangePerimeterModel';
import { H3_RESOLUTION, LATLNG_DECIMAL_PLACES } from '../mapData';
import { getValidDestinationsUnoccupied } from '../oneStepMoveDestinations';
import {
  computeHomeRegionHexPartitionsForPrompting,
  countControlledHexesInRegion,
} from '../../shared/homeRegionRules';
import { buildFinalJsonContractInstruction, getFinalJsonOrdersExampleBlock } from './promptContracts';
import { buildAirOperationsBriefingBlock } from './briefingSectionsAirOps';
import { buildSealiftBriefingBlock } from './briefingSectionsSealift';
import { buildStatusInjectionTexts } from './requestOrdersInjection';
import {
  buildAdjacentCellsFallbackBlock,
  formatControlProgressLine,
  buildHumanUnitsPromptLine,
  buildLatLngPreamble,
  buildTacticalLatLngPreamble,
  buildProductionSubmitClause,
  buildAvailableToolsIntro,
  buildToolUsageGuidance,
  formatLatLng as formatLatLngWithPrecision,
  getMovementOrderInstruction,
} from './promptText';
import { buildRegionVsRegionScenarioObjectiveBlock, buildTacticalBattleGoalClause, buildWinConditionReminderClause } from './scenarioGoals';
import {
  NAVAL_PLAN_ROUTE_LAND_TARGET_HINT,
  NAVAL_PLAN_ROUTE_PROMPT_SUFFIX,
} from '../navalMovementMessages';
import { getFilteredToolMetadata } from './openRouterToolCatalog';
import { getToolFlags } from './openRouterToolGroups';
import { logDebug } from '../logger';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
import { SECTION_TITLE_AVAILABLE_TOOLS, SECTION_TITLE_BEST_OPTIONS_THIS_TURN, topLevelHeading } from './promptSpec/sectionHeadings';
import { buildCombatRulesParagraph } from './promptSpec/gameRuleText';
import { buildContextCoaching, type CoachingGates } from './promptSpec/coachingText';
import { buildToolBudgetExceededWarning } from './requestOrdersFlowSupport';

/** Home regions are defined at strategic res1; always encode with the strategic registry, not tactical res4. */
const HOME_REGION_HEX_COORD_CTX = { mode: 'strategic' as const };

/**
 * Defines the `formatHomeRegionHexCodesForPrompt` function shape (function formatHomeRegionHexCodesForPrompt()).

 * Purpose: Maps home-region H3 indexes to strategic briefing hex codes for LLM-visible comma-separated lists.
 * When to use: Strategic `region_vs_region` home-region hex bullets in `buildSystemPromptForTools` only.
 * Expected outcome: Comma-separated res1 codes via `h3ToCode` strategic context; falls back to raw `h3` on lookup failure.
 * Exceptions: None; empty input returns an empty string.
 */
function formatHomeRegionHexCodesForPrompt(h3Indexes: readonly string[]): string {
  const parts: string[] = [];
  for (const h3 of h3Indexes) {
    try {
      parts.push(h3ToCode(h3, HOME_REGION_HEX_COORD_CTX));
    } catch {
      parts.push(h3);
    }
  }
  return parts.join(', ');
}

export function buildSystemPromptForTools(
  state: GameStateSnapshot,
  coordMap: {
    latLngByH3: Map<string, [number, number]>;
    format: (h3: string) => string;
    resolveToH3: (lat: number, lng: number) => string | undefined;
  },
  enabledToolNames?: string[],
  briefingOverride?: string,
  coordinateContext: CoordinateContext = { mode: 'strategic' }
): string {
  logDebug('openRouter buildSystemPromptForTools', {
    turnNumber: state.turnNumber,
    phase: state.phase,
    toolNameCount: enabledToolNames?.length ?? 0,
    hasBriefingOverride: Boolean(briefingOverride?.length),
    coordinateMode: coordinateContext.mode,
    battleId: coordinateContext.battleId ?? null,
  });
  const { latLngByH3, format, resolveToH3 } = coordMap;
  const formatLatLng = (ll: [number, number]) => formatLatLngWithPrecision(ll, LATLNG_DECIMAL_PLACES);
  const opponentUnits = state.units.filter((u) => u.player === 'opponent');
  const humanUnits = state.units.filter((u) => u.player === 'human');
  const flags = getToolFlags(enabledToolNames);

  const limitExceededLastTurn = getAndClearAiToolLimitExceededLastTurn();
  const showLimitWarning = limitExceededLastTurn && (flags.planningEnabled || flags.ordersEnabled);
  const warning = showLimitWarning ? buildToolBudgetExceededWarning() : '';

  const opponentRoster = opponentUnits
    .filter((u) => latLngByH3.has(u.h3Index))
    .map((u) => `${u.id} (${u.unitType}) at ${format(u.h3Index)}`)
    .join('; ');
  const humanRoster = humanUnits
    .filter((u) => latLngByH3.has(u.h3Index))
    .map((u) => `${u.id} (${u.unitType}) at ${format(u.h3Index)}`)
    .join('; ');

  const tacticalBattleActive = coordinateContext.mode === 'tactical';
  const filtered = getFilteredToolMetadata(enabledToolNames, coordinateContext.mode);
  const hasNaval = opponentUnits.some((u) => u.unitType === 'naval');
  const hasAir = opponentUnits.some((u) => u.unitType === 'air');
  const hasPrecomputedBriefing = briefingOverride != null && briefingOverride.length > 0;
  const hasBestOptionsTable =
    hasPrecomputedBriefing && (briefingOverride ?? '').includes(SECTION_TITLE_BEST_OPTIONS_THIS_TURN);
  const homePartitions =
    state.scenarioId === 'region_vs_region' && coordinateContext.mode !== 'tactical'
      ? computeHomeRegionHexPartitionsForPrompting(state.aiHomeRegionHexes, state.humanHomeRegionHexes)
      : null;
  const coachingGates: CoachingGates = {
    coordinateMode: coordinateContext.mode,
    planningEnabled: flags.planningEnabled,
    ordersEnabled: flags.ordersEnabled && coordinateContext.mode !== 'tactical',
    memoryEnabled: flags.memoryEnabled && coordinateContext.mode !== 'tactical',
    productionEnabled: flags.productionEnabled && coordinateContext.mode !== 'tactical',
    hasAirUnits: hasAir,
    hasNavalUnits: hasNaval,
    hasBestOptionsTable,
    homeRegionsOverlap: (homePartitions?.intersection.length ?? 0) > 0,
    hasObservedEnemy: humanRoster.length > 0,
    includeScenarioWinPaths: state.scenarioId === 'region_vs_region' && coordinateContext.mode !== 'tactical',
  };
  const toolPromptLines = filtered.map((m) => {
    let line = m.promptLine;
    if (m.name === 'plan_route' && !hasNaval) {
      line = line.replace(NAVAL_PLAN_ROUTE_PROMPT_SUFFIX, '');
    }
    return line;
  });
  const toolsIntro = buildAvailableToolsIntro(flags, hasPrecomputedBriefing, coordinateContext.mode, {
    hasAirUnits: hasAir,
    hasBestOptionsTable,
  });
  const toolGuidance = buildToolUsageGuidance(flags, hasPrecomputedBriefing, coordinateContext.mode, coachingGates);
  const toolsSection =
    filtered.length === 0
      ? `${topLevelHeading(SECTION_TITLE_AVAILABLE_TOOLS)}\n\nNo tools available.`
      : `${topLevelHeading(SECTION_TITLE_AVAILABLE_TOOLS)}

${toolsIntro}
${toolPromptLines.map((line, i) => `${i + 1}. ${line}`).join('\n')}${toolGuidance}`;

  const injection = buildStatusInjectionTexts({
    memoryEnabled: flags.memoryEnabled,
    ordersEnabled: flags.ordersEnabled,
    productionEnabled: flags.productionEnabled,
    state,
    latLngByH3,
    resolveToH3,
    formatHexLabel: (ll) => {
      const h3 = resolveToH3(ll[0], ll[1]);
      return h3 ? format(h3) : formatLatLng(ll);
    },
    coordinateContext,
  });
  const memoryBlock = flags.memoryEnabled ? injection.memoryText + '\n\n' : '';
  const standingOrderBlock = flags.ordersEnabled ? injection.standingOrderText + '\n\n' : '';
  const productionBlock = flags.productionEnabled ? injection.productionText + '\n\n' : '';
  const airOpsRaw = buildAirOperationsBriefingBlock(state, format, coordinateContext.mode);
  const sealiftRaw = buildSealiftBriefingBlock(state, format, coordinateContext.mode);
  const airOpsBlock = airOpsRaw ? `${airOpsRaw}\n\n` : '';
  const sealiftBlock = sealiftRaw ? `${sealiftRaw}\n\n` : '';

  const hasRanged = opponentUnits.some((u) => unitHasDirectRangedPlanning(u.unitType, tacticalBattleActive));

  const combatTargetHint =
    flags.estimationEnabled && !hasPrecomputedBriefing
      ? ' (e.g. use estimate_combat to pick the best)'
      : '';
  const navalPlanRouteHint =
    hasNaval && flags.planningEnabled ? NAVAL_PLAN_ROUTE_LAND_TARGET_HINT : '';
  const combatAssessHint =
    flags.assessmentEnabled && hasRanged && !hasPrecomputedBriefing
      ? ' When assess_unit reports canAttackThisTurn with attackType "ranged" for an enemy, add ranged_attack with targetHexCode as that enemy\'s cell code from the operational map (or targetUnitId).' +
        (hasNaval ? ' Naval inRangedRange: add ranged_attack for that naval unit.' : '') +
        ' Note: inEnemyRangedRange = enemy can fire at you; inRangedRange = you can fire at them.'
      : '';

  const adjacentCellsBlock = flags.fallbackMovementEnabled
    ? buildAdjacentCellsFallbackBlock(state, opponentUnits, coordMap, getValidDestinationsUnoccupied)
    : '';
  const movementOrderInstruction = getMovementOrderInstruction(
    flags,
    coordinateContext.mode,
    hasBestOptionsTable
  );
  const submitMemoryClause = flags.memoryEnabled
    ? ' Use optional "memoryUpdates" for memory writes/deletes (applied from JSON only; there are no memory_write or memory_delete tools).'
    : ' When Memory tools are not listed above, omit "memoryUpdates" or use []; any entries are ignored.';

  const humanUnitsLine = buildHumanUnitsPromptLine(humanRoster);
  const ownUnitsLine =
    hasPrecomputedBriefing
      ? ''
      : `Your units (ID, type, briefing hex): ${opponentRoster || 'none'}\n`;
  const landHexes = state.hexes.filter((hex) => hex.terrain === 'land');
  const totalLandHexes = landHexes.length;
  const landHexSet = new Set(landHexes.map((hex) => hex.h3Index));
  const exploredHexesRaw = Array.isArray(state.exploredHexes)
    ? state.exploredHexes
    : state.hexes.map((hex) => hex.h3Index);
  const exploredLandHexes = exploredHexesRaw.filter((h3Index) => landHexSet.has(h3Index)).length;
  const controlledLandHexes = (state.res1Control ?? []).filter(
    (row) => row.controllerPlayerId === 'opponent' && landHexSet.has(row.h3Index)
  ).length;
  const ownHomeRegionControl = countControlledHexesInRegion(state.res1Control ?? [], state.aiHomeRegionHexes, 'opponent');
  const opponentHomeRegionControl = countControlledHexesInRegion(state.res1Control ?? [], state.humanHomeRegionHexes, 'opponent');
  let regionHomeProgressAndHexBullets = '';
  if (homePartitions) {
    const lineOwn = formatControlProgressLine('Your home region control', ownHomeRegionControl.controlled, ownHomeRegionControl.total);
    const lineEnemyHome = formatControlProgressLine(
      "Your control of the enemy's home region",
      opponentHomeRegionControl.controlled,
      opponentHomeRegionControl.total
    );
    const p = homePartitions;
    const aiHexLine =
      !p.equalAsSets && p.aiExclusive.length > 0
        ? `\n- Your home region hexes are: ${formatHomeRegionHexCodesForPrompt(p.aiExclusive)}`
        : '';
    const humanHexLine =
      !p.equalAsSets && p.humanExclusive.length > 0
        ? `\n- Your enemy's home region hexes are: ${formatHomeRegionHexCodesForPrompt(p.humanExclusive)}`
        : '';
    const overlapLine =
      p.intersection.length > 0
        ? `\n- These hexes are in both home regions: ${formatHomeRegionHexCodesForPrompt(p.intersection)}`
        : '';
    regionHomeProgressAndHexBullets = `\n${lineOwn}${aiHexLine}\n${lineEnemyHome}${humanHexLine}${overlapLine}`;
  }

  const contextCoaching = buildContextCoaching(coachingGates);
  const tacticalContextBlock = `Strategic context:
${contextCoaching}`;

  const strategicContextBlock = `Strategic context:
${contextCoaching}
- ${formatControlProgressLine('Explored', exploredLandHexes, totalLandHexes, 'land hexes').slice(2)}
- ${formatControlProgressLine('Controlled', controlledLandHexes, totalLandHexes, 'land hexes').slice(2)}${regionHomeProgressAndHexBullets}`;

  const coachingContextBlock =
    coordinateContext.mode === 'tactical' ? tacticalContextBlock : strategicContextBlock;

  const scenarioObjectiveBlock =
    coordinateContext.mode === 'tactical' ? '' : buildRegionVsRegionScenarioObjectiveBlock(state);
  const mainBlock = briefingOverride != null && briefingOverride.length > 0
    ? `${briefingOverride}\n\n${scenarioObjectiveBlock ? `${scenarioObjectiveBlock}\n\n` : ''}${coachingContextBlock}\n\n${airOpsBlock}${sealiftBlock}${toolsSection}\n\n${humanUnitsLine}`
    : `${memoryBlock}${standingOrderBlock}${productionBlock}${scenarioObjectiveBlock ? `${scenarioObjectiveBlock}\n\n` : ''}${coachingContextBlock}\n\n${airOpsBlock}${sealiftBlock}${toolsSection}\n\n${ownUnitsLine}${humanUnitsLine}${adjacentCellsBlock}`;

  const standingOrdersIssuable = flags.ordersEnabled && coordinateContext.mode !== 'tactical';
  const finalJsonContract = buildFinalJsonContractInstruction({
    includeMemoryUpdates: flags.memoryEnabled,
    includeProductionOrders: flags.productionEnabled,
    includeAirActions: hasAir,
    includeNavalActions: hasNaval,
    includeStandingOrderActions: standingOrdersIssuable,
    movementOrderInstruction,
    submitMemoryClause,
    productionSubmitClause: buildProductionSubmitClause(flags),
    coordinateMode: coordinateContext.mode,
  });
  const finalJsonExample = getFinalJsonOrdersExampleBlock({
    includeMemoryUpdates: flags.memoryEnabled,
    includeProductionOrders: flags.productionEnabled,
    includeAirActions: hasAir,
    includeStandingOrderActions: standingOrdersIssuable,
    coordinateMode: coordinateContext.mode,
  });
  const scoutingDirective =
    coordinateContext.mode === 'tactical'
      ? ''
      : humanRoster.length === 0
        ? '\n\nNo human units are currently observed. Enemy forces may be out of view.'
        : '';
  const winConditionReminder =
    coordinateContext.mode === 'tactical'
      ? buildTacticalBattleGoalClause()
      : buildWinConditionReminderClause({ scenarioId: state.scenarioId });
  const latLngBlock =
    coordinateContext.mode === 'tactical'
      ? buildTacticalLatLngPreamble(LATLNG_DECIMAL_PLACES)
      : buildLatLngPreamble(H3_RESOLUTION, LATLNG_DECIMAL_PLACES);
  const combatRulesParagraph = buildCombatRulesParagraph({
    coordinateMode: coordinateContext.mode,
    hasAirUnits: hasAir,
    hasNavalUnits: hasNaval,
    ordersEnabled: standingOrdersIssuable,
  });
  const combatRulesWithToolHints = combatTargetHint
    ? combatRulesParagraph.replace(
        'or targetUnitId (not your move destination).',
        `or targetUnitId (not your move destination)${combatTargetHint}.`
      )
    : combatRulesParagraph;
  const turnPhaseHeader =
    coordinateContext.mode === 'tactical'
      ? `Strategic turn: ${state.turnNumber}, tactical beat: ${coordinateContext.tacticalTurnNumber ?? '?'}, phase: ${state.phase}.`
      : `Current turn: ${state.turnNumber}, phase: ${state.phase}.`;
  const prompt = `You are the enemy commander in a WEGO (simultaneous movement) hex wargame. ${turnPhaseHeader}

${winConditionReminder}${scoutingDirective}${warning}

${latLngBlock}

${combatRulesWithToolHints}${navalPlanRouteHint}${combatAssessHint}

${mainBlock}

${finalJsonContract}

${finalJsonExample}`;
  return prompt;
}
