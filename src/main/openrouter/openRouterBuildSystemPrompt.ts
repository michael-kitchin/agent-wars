import type { GameStateSnapshot } from '../gameDb';
import { getAndClearAiToolLimitExceededLastTurn } from '../gameDb';
import { getAttack, getDefense, getRange } from '../combatConstants';
import { RANGED_RANGE_BY_UNIT_TYPE } from '../../shared/tacticalRanges';
import { unitHasDirectRangedPlanning } from '../../shared/rangePerimeterModel';
import { H3_RESOLUTION, LATLNG_DECIMAL_PLACES } from '../mapData';
import { getValidDestinationsUnoccupied } from '../oneStepMoveDestinations';
import { getInjectionText } from '../tools/tool4Memory';
import { getInjectionText as getStandingOrderInjectionText } from '../tools/tool5StandingOrders';
import {
  computeHomeRegionHexPartitionsForPrompting,
  countControlledHexesInRegion,
} from '../../shared/homeRegionRules';
import { buildFinalJsonContractInstruction, getFinalJsonOrdersExampleBlock } from './promptContracts';
import { buildAirOperationsBriefingBlock, buildProductionBriefingBlock, buildSealiftBriefingBlock } from './briefingSections';
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
import { ALL_BUILD_UNIT_TYPES } from '../../shared/ipc/productionTypes';
import { buildRegionVsRegionScenarioObjectiveBlock, buildTacticalBattleGoalClause, buildWinConditionReminderClause } from './scenarioGoals';
import {
  NAVAL_MOVEMENT_PROMPT_RULE,
  NAVAL_PLAN_ROUTE_LAND_TARGET_HINT,
  NAVAL_PLAN_ROUTE_PROMPT_SUFFIX,
} from '../navalMovementMessages';
import { getFilteredToolMetadata } from './openRouterToolCatalog';
import { getToolFlags } from './openRouterToolGroups';
import { logDebug } from '../logger';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import { h3ToCode } from '../briefing/map/hex-code-translator';

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

/** Shared strategy coaching block; strategic prompt also includes `COACHING_STRATEGIC_PRIORITIES` (goals) before this. */
const COACHING_STRATEGY_BLOCK = `- Your strategy is:
    (1) Use speed, surprise, and initiative to break the enemy's cohesion and morale
    (2) Attack the enemy's weaknesses (gaps) and avoid their strengths (surfaces)
    (3) Create maximum disruption with minimum force`;

/** Coaching for the JSON `"message"` field (player-facing taunt/threat), not operational doctrine. */
const COACHING_MESSAGE_BLOCK = `- Your message is:
    Address the human player in character as their enemy commander. Deliver a one-line taunt or threat meant to unnerve them. Psychological warfare only — do not reveal real orders, hex codes, unit ids, or operational intent.`;

const COACHING_STRATEGIC_PRIORITIES = `- Your goals are:
    (1) Engage enemy forces to reduce their combat effectiveness
    (2) Disperse your units to maximize visibility
    (3) Maximize your own unit production
    (4) Protect your home region's production capacity
    (5) Degrade or eliminate the enemy home region's urban production capacity`;

const COACHING_TACTICAL_PRIORITY = `- Your priority is to engage enemy forces and inflict losses when advantageous`;

const STRATEGIC_CONTEXT_OPENING =
  '- At least one enemy unit remains in play, and the human player is actively searching for your forces with intent to destroy them.';

/**
 * Formats the per-type range clause for the Combat stats line in the system prompt.
 *
 * Purpose: Keeps strategic infantry melee-only in LLM coaching while tactical infantry still shows a positive res4 range.
 * When to use: `buildSystemPromptForTools` combat summary only.
 * Expected outcome: Strategic uses `getRange` (`melee only` when range is 0). Tactical uses `RANGED_RANGE_BY_UNIT_TYPE` (air is "strike anywhere in the battle" instead of the large footprint cap).
 * Exceptions: None.
 */
function formatCombatStatRangeClause(unitType: string, tacticalBattleActive: boolean): string {
  if (tacticalBattleActive) {
    if (unitType === 'air') return ', strike anywhere in the battle';
    const r = RANGED_RANGE_BY_UNIT_TYPE[unitType] ?? 0;
    return r >= 1 ? `, range ${r}` : ', melee only';
  }
  const r = getRange(unitType);
  return r >= 1 ? `, range ${r}` : ', melee only';
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

  const unitTypes = [...ALL_BUILD_UNIT_TYPES];
  const tacticalBattleActive = coordinateContext.mode === 'tactical';
  const combatSummary = unitTypes
    .map(
      (t) =>
        `${t}: ${getAttack(t)} attack / ${getDefense(t)} defense${formatCombatStatRangeClause(t, tacticalBattleActive)}`
    )
    .join('; ');

  const filtered = getFilteredToolMetadata(enabledToolNames);
  const hasNaval = opponentUnits.some((u) => u.unitType === 'naval');
  const hasAir = opponentUnits.some((u) => u.unitType === 'air');
  const toolPromptLines = filtered.map((m) => {
    if (m.name === 'plan_route' && !hasNaval) {
      return m.promptLine.replace(NAVAL_PLAN_ROUTE_PROMPT_SUFFIX, '');
    }
    return m.promptLine;
  });
  const hasPrecomputedBriefing = briefingOverride != null && briefingOverride.length > 0;
  const toolsIntro = buildAvailableToolsIntro(flags, hasPrecomputedBriefing, coordinateContext.mode);
  const toolGuidance = buildToolUsageGuidance(flags, hasPrecomputedBriefing, coordinateContext.mode);
  const toolsSection =
    filtered.length === 0
      ? '# Available Tools\n\nNo tools available.'
      : `# Available Tools

${toolsIntro}
${toolPromptLines.map((line, i) => `${i + 1}. ${line}`).join('\n')}${toolGuidance}`;

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
  const airOpsRaw = buildAirOperationsBriefingBlock(state, format, coordinateContext.mode);
  const sealiftRaw = buildSealiftBriefingBlock(state, format, coordinateContext.mode);
  const airOpsBlock = airOpsRaw ? `${airOpsRaw}\n\n` : '';
  const sealiftBlock = sealiftRaw ? `${sealiftRaw}\n\n` : '';

  const hasRanged = opponentUnits.some((u) => unitHasDirectRangedPlanning(u.unitType, tacticalBattleActive));

  const combatTargetHint =
    flags.estimationEnabled && !hasPrecomputedBriefing
      ? ' (e.g. use estimate_combat to pick the best)'
      : '';
  const navalCoaching = hasNaval
    ? ` Naval units can attack land units at 1 or 2 hexes (range 2). Add ranged_attack when a naval unit is within 2 hexes of an enemy at turn start. ${NAVAL_MOVEMENT_PROMPT_RULE}${flags.planningEnabled ? NAVAL_PLAN_ROUTE_LAND_TARGET_HINT : ''}`
    : '';
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
    hasPrecomputedBriefing
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
  const homePartitions =
    state.scenarioId === 'region_vs_region' && coordinateContext.mode !== 'tactical'
      ? computeHomeRegionHexPartitionsForPrompting(state.aiHomeRegionHexes, state.humanHomeRegionHexes)
      : null;
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

  const tacticalContextBlock = `Strategic context:
${COACHING_TACTICAL_PRIORITY}
${COACHING_STRATEGY_BLOCK}
${COACHING_MESSAGE_BLOCK}`;

  const strategicContextBlock = `Strategic context:
${STRATEGIC_CONTEXT_OPENING}
${COACHING_STRATEGIC_PRIORITIES}
${COACHING_STRATEGY_BLOCK}
${COACHING_MESSAGE_BLOCK}
- ${formatControlProgressLine('Explored', exploredLandHexes, totalLandHexes, 'land hexes').slice(2)}
- ${formatControlProgressLine('Controlled', controlledLandHexes, totalLandHexes, 'land hexes').slice(2)}${regionHomeProgressAndHexBullets}`;

  const coachingContextBlock =
    coordinateContext.mode === 'tactical' ? tacticalContextBlock : strategicContextBlock;

  const scenarioObjectiveBlock =
    coordinateContext.mode === 'tactical' ? '' : buildRegionVsRegionScenarioObjectiveBlock(state);
  const mainBlock = briefingOverride != null && briefingOverride.length > 0
    ? `${briefingOverride}\n\n${scenarioObjectiveBlock ? `${scenarioObjectiveBlock}\n\n` : ''}${coachingContextBlock}\n\n${airOpsBlock}${sealiftBlock}${toolsSection}\n\n${humanUnitsLine}`
    : `${memoryBlock}${standingOrderBlock}${productionBlock}${scenarioObjectiveBlock ? `${scenarioObjectiveBlock}\n\n` : ''}${coachingContextBlock}\n\n${airOpsBlock}${sealiftBlock}${toolsSection}\n\n${ownUnitsLine}${humanUnitsLine}${adjacentCellsBlock}`;

  const finalJsonContract = buildFinalJsonContractInstruction({
    includeMemoryUpdates: flags.memoryEnabled,
    includeProductionOrders: flags.productionEnabled,
    includeAirActions: hasAir,
    movementOrderInstruction,
    submitMemoryClause,
    productionSubmitClause: buildProductionSubmitClause(flags),
    coordinateMode: coordinateContext.mode,
  });
  const finalJsonExample = getFinalJsonOrdersExampleBlock({
    includeMemoryUpdates: flags.memoryEnabled,
    includeProductionOrders: flags.productionEnabled,
    includeAirActions: hasAir,
    coordinateMode: coordinateContext.mode,
  });
  const scoutingDirective =
    coordinateContext.mode === 'tactical'
      ? ''
      : humanRoster.length === 0
        ? '\n\nNo human units are currently observed: prioritize scouting this turn by moving units along plausible approach routes to reveal enemy positions; do not remain static unless required for immediate defense.'
        : '';
  const winConditionReminder =
    coordinateContext.mode === 'tactical' ? buildTacticalBattleGoalClause() : buildWinConditionReminderClause();
  const latLngBlock =
    coordinateContext.mode === 'tactical'
      ? buildTacticalLatLngPreamble(LATLNG_DECIMAL_PLACES)
      : buildLatLngPreamble(H3_RESOLUTION, LATLNG_DECIMAL_PLACES);
  const infantryRangedScope = tacticalBattleActive
    ? `Infantry may use ranged_attack at tactical res4 range (baseline ${RANGED_RANGE_BY_UNIT_TYPE.infantry}; terrain may reduce it); use movement and melee when out of range.`
    : 'Infantry has no strategic ranged_attack (melee only); use movement and melee.';
  const combatTempoClause = hasAir
    ? 'If a legal ranged_attack or air strike is available this turn, take it — these attacks resolve from turn-start positions and do not prevent movement in the same turn.'
    : 'If a legal ranged_attack is available this turn, take it — ranged attacks resolve from turn-start positions and do not prevent movement in the same turn.';
  const turnPhaseHeader =
    coordinateContext.mode === 'tactical'
      ? `Strategic turn: ${state.turnNumber}, tactical beat: ${coordinateContext.tacticalTurnNumber ?? '?'}, phase: ${state.phase}.`
      : `Current turn: ${state.turnNumber}, phase: ${state.phase}.`;
  const prompt = `You are the enemy commander in a WEGO (simultaneous movement) hex wargame. ${turnPhaseHeader}

${winConditionReminder}${scoutingDirective}${warning}

${latLngBlock}

Combat: d6 per shot — attack hits on roll ≤ attack stat; defense hits on roll ≤ defense. ${combatSummary}. Ranged uses pre-move positions. At most one ranged_attack per unit from turn-start range; use exactly one of targetHexCode (enemy cell from the map) or targetUnitId (not your move destination)${combatTargetHint}. ${infantryRangedScope} ${combatTempoClause} Drop invalid attacks before submit.${navalCoaching}${combatAssessHint}

${mainBlock}

${finalJsonContract}

${finalJsonExample}`;
  return prompt;
}
