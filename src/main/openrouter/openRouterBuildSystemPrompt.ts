import type { GameStateSnapshot } from '../gameDb';
import { getAndClearAiToolLimitExceededLastTurn } from '../gameDb';
import { getAttack, getDefense, getRange } from '../combatConstants';
import { H3_RESOLUTION, LATLNG_DECIMAL_PLACES } from '../mapData';
import { getValidDestinationsUnoccupied } from '../oneStepMoveDestinations';
import { getInjectionText } from '../tools/tool4Memory';
import { getInjectionText as getStandingOrderInjectionText } from '../tools/tool5StandingOrders';
import { countControlledHexesInRegion } from '../../shared/homeRegionRules';
import { buildFinalJsonContractInstruction, getFinalJsonOrdersExampleBlock } from './promptContracts';
import { buildAirOperationsBriefingBlock, buildProductionBriefingBlock, buildSealiftBriefingBlock } from './briefingSections';
import {
  buildAdjacentCellsFallbackBlock,
  formatControlProgressLine,
  buildHumanUnitsPromptLine,
  buildLatLngPreamble,
  buildProductionSubmitClause,
  buildToolUsageGuidance,
  formatLatLng as formatLatLngWithPrecision,
  getMovementOrderInstruction,
} from './promptText';
import { buildPrimaryScenarioGoalOpeningClause, buildRegionVsRegionScenarioObjectiveBlock } from './scenarioGoals';
import {
  NAVAL_MOVEMENT_PROMPT_RULE,
  NAVAL_PLAN_ROUTE_LAND_TARGET_HINT,
} from '../navalMovementMessages';
import { getFilteredToolMetadata } from './openRouterToolCatalog';
import { getToolFlags } from './openRouterToolGroups';
import { logDebug } from '../logger';
import type { CoordinateContext } from '../briefing/map/coordinateContext';

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
  const warning = showLimitWarning
    ? '\n\nWARNING: Last turn\'s planning exceeded the tool-call limit (50 rounds). You submitted no explicit orders. Ensure you submit your final orders JSON promptly after gathering the information you need.\n'
    : '';

  const opponentRoster = opponentUnits
    .filter((u) => latLngByH3.has(u.h3Index))
    .map((u) => `${u.id} (${u.unitType}) at ${format(u.h3Index)}`)
    .join('; ');
  const humanRoster = humanUnits
    .filter((u) => latLngByH3.has(u.h3Index))
    .map((u) => `${u.id} (${u.unitType}) at ${format(u.h3Index)}`)
    .join('; ');

  const unitTypes: Array<'infantry' | 'armor' | 'naval' | 'air'> = ['infantry', 'armor', 'naval', 'air'];
  const combatSummary = unitTypes
    .map(
      (t) =>
        `${t}: ${getAttack(t)} attack / ${getDefense(t)} defense${getRange(t) >= 1 ? `, range ${getRange(t)}` : ', melee only'}`
    )
    .join('; ');

  const filtered = getFilteredToolMetadata(enabledToolNames);
  const toolsIntroPurpose = flags.planningEnabled
    ? 'plan movement and assess the battlefield'
    : flags.assessmentEnabled
      ? 'assess the tactical situation'
      : undefined;
  const hasPrecomputedBriefing = briefingOverride != null && briefingOverride.length > 0;
  const toolsIntro = toolsIntroPurpose
    ? hasPrecomputedBriefing
      ? 'Use the Commander\'s Briefing above for assessments and possible unit actions; use tools selectively for exact routing (plan_route), standing-order checks (query_orders), memory lookup (memory_read), and production queue checks/sets when needed.'
      : `Use these tools to ${toolsIntroPurpose} before submitting orders. You may use multiple rounds of tool calls and mix tool types if that helps.` +
        (flags.memoryEnabled ? ' Memory: use memory_read as needed; persist notes via memoryUpdates in your final JSON.' : '')
    : 'Use only the tools listed below. Do not call tools that are not in the list.';
  const toolGuidance = buildToolUsageGuidance(flags, hasPrecomputedBriefing);
  const toolsSection =
    filtered.length === 0
      ? '# Available Tools\n\nNo tools available.'
      : `# Available Tools

${toolsIntro}
${filtered.map((m, i) => `${i + 1}. ${m.promptLine}`).join('\n')}${toolGuidance}`;

  const memoryBlock = flags.memoryEnabled ? getInjectionText('opponent', state.turnNumber) + '\n\n' : '';
  const standingOrderBlock = flags.ordersEnabled
    ? getStandingOrderInjectionText('opponent', state, coordinateContext) + '\n\n'
    : '';
  const productionBlock = flags.productionEnabled
    ? buildProductionBriefingBlock({
        productionEnabled: flags.productionEnabled,
        state,
        latLngByH3,
        resolveToH3,
        formatHexLabel: (ll) => {
          const h3 = resolveToH3(ll[0], ll[1]);
          return h3 ? format(h3) : formatLatLng(ll);
        },
      }) + '\n\n'
    : '';
  const airOpsBlock = buildAirOperationsBriefingBlock(state, format) + '\n\n';
  const sealiftBlock = buildSealiftBriefingBlock(state, format) + '\n\n';

  const hasNaval = opponentUnits.some((u) => u.unitType === 'naval');
  const hasRanged = opponentUnits.some((u) => getRange(u.unitType as 'infantry' | 'armor' | 'naval') >= 1);

  const combatTargetHint = flags.estimationEnabled ? ' (e.g. use estimate_combat to pick the best)' : '';
  const navalCoaching = hasNaval
    ? ` Naval units can attack land units at 1 or 2 hexes (range 2). Add ranged_attack when a naval unit is within 2 hexes of an enemy at turn start. ${NAVAL_MOVEMENT_PROMPT_RULE}${flags.planningEnabled ? NAVAL_PLAN_ROUTE_LAND_TARGET_HINT : ''}`
    : '';
  const combatAssessHint = flags.assessmentEnabled && hasRanged
    ? ' When assess_unit reports canAttackThisTurn with attackType "ranged" for an enemy, add ranged_attack with targetHexCode as that enemy\'s cell code from the operational map (or targetUnitId).' +
      (hasNaval ? ' Naval inRangedRange: add ranged_attack for that naval unit.' : '') +
      ' Note: inEnemyRangedRange = enemy can fire at you; inRangedRange = you can fire at them.'
    : '';

  const adjacentCellsBlock = flags.fallbackMovementEnabled
    ? buildAdjacentCellsFallbackBlock(state, opponentUnits, coordMap, getValidDestinationsUnoccupied)
    : '';
  const movementOrderInstruction = getMovementOrderInstruction(flags);
  const submitMemoryClause = flags.memoryEnabled
    ? ' Use optional "memoryUpdates" for memory writes/deletes (applied from JSON only; there are no memory_write or memory_delete tools).'
    : ' When Memory tools are not listed above, omit "memoryUpdates" or use []; any entries are ignored.';

  const humanUnitsLine = buildHumanUnitsPromptLine(humanRoster);
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
  const homeRegionOwnershipSummary =
    state.scenarioId === 'region_vs_region'
      ? `\n${formatControlProgressLine('Your home region control', ownHomeRegionControl.controlled, ownHomeRegionControl.total)}\n${formatControlProgressLine("Your control of opponent's home region", opponentHomeRegionControl.controlled, opponentHomeRegionControl.total)}`
      : '';
  const strategicContextBlock = `Strategic context:
- At least one enemy unit remains in play, and the human player is actively searching for your forces with intent to destroy them.
- Your priorities are:
  (1) Expand territorial control toward likely enemy positions
  (2) Disperse infantry as scouts to maximize visibility
  (3) Maximize unit production (idle production capacity is wasted)
  (4) Engage the enemy and destroy them
- ${formatControlProgressLine('Explored', exploredLandHexes, totalLandHexes, 'land hexes').slice(2)}
- ${formatControlProgressLine('Controlled', controlledLandHexes, totalLandHexes, 'land hexes').slice(2)}${homeRegionOwnershipSummary}`;
  const scenarioObjectiveBlock = buildRegionVsRegionScenarioObjectiveBlock(state);
  const mainBlock = briefingOverride != null && briefingOverride.length > 0
    ? `${briefingOverride}\n\n${scenarioObjectiveBlock ? `${scenarioObjectiveBlock}\n\n` : ''}${strategicContextBlock}\n\n${airOpsBlock}${sealiftBlock}${toolsSection}\n\nYour units (ID, type, briefing hex): ${opponentRoster || 'none'}\n${humanUnitsLine}`
    : `${memoryBlock}${standingOrderBlock}${productionBlock}${scenarioObjectiveBlock ? `${scenarioObjectiveBlock}\n\n` : ''}${strategicContextBlock}\n\n${airOpsBlock}${sealiftBlock}${toolsSection}\n\nYour units (ID, type, briefing hex): ${opponentRoster || 'none'}\n${humanUnitsLine}${adjacentCellsBlock}`;

  const finalJsonContract = buildFinalJsonContractInstruction({
    includeMemoryUpdates: flags.memoryEnabled,
    includeProductionOrders: flags.productionEnabled,
    movementOrderInstruction,
    submitMemoryClause,
    productionSubmitClause: buildProductionSubmitClause(flags),
  });
  const finalJsonExample = getFinalJsonOrdersExampleBlock({
    includeMemoryUpdates: flags.memoryEnabled,
    includeProductionOrders: flags.productionEnabled,
  });
  const scoutingDirective = humanRoster.length === 0
    ? ' No human units are currently observed: prioritize scouting this turn by moving units along plausible approach routes to reveal enemy positions; do not remain static unless required for immediate defense.'
    : '';
  const primaryGoal = buildPrimaryScenarioGoalOpeningClause();
  const prompt = `You are the opponent in a WEGO (simultaneous movement) hex wargame. Current turn: ${state.turnNumber}, phase: ${state.phase}. ${primaryGoal} Move toward observed enemy forces to bring them into ranged, melee, or air-strike range as rules allow; do not stay passive.${scoutingDirective}${warning}

${buildLatLngPreamble(H3_RESOLUTION, LATLNG_DECIMAL_PLACES)}

Combat: d6 per shot — attack hits on roll ≤ attack stat; defense hits on roll ≤ defense. ${combatSummary}. Ranged uses pre-move positions. At most one ranged_attack per unit from turn-start range; use exactly one of targetHexCode (enemy cell from the map) or targetUnitId (not your move destination)${combatTargetHint}. Infantry may use ranged_attack only at strategic range 1 (adjacent res1 hex); use movement and melee when that is not enough. If a legal ranged_attack or air strike is available this turn, take it — these attacks resolve from turn-start positions and do not prevent movement in the same turn. Drop invalid attacks before submit.${navalCoaching}${combatAssessHint}

${mainBlock}

${finalJsonContract}

${finalJsonExample}`;
  return prompt;
}
