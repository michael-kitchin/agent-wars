import { briefingOwnSeatId, enemyHomeHexes, ownHomeHexes } from '../briefing/briefingPerspective';
import { isNeutralOwnerId, type SeatId } from '../../shared/seatIds';
import { findSeat, isSeatActive, sortSeatsByOrder, type Doctrine } from '../../shared/seatRoster';
import type { GameStateSnapshot } from '../gameDb';
import { getAndClearAiToolLimitExceededLastTurn, getSeatRoster } from '../gameDb';
import { unitHasDirectRangedPlanning } from '../../shared/rangePerimeterModel';
import { LATLNG_DECIMAL_PLACES } from '../mapData';
import { getValidDestinationsUnoccupied } from '../oneStepMoveDestinations';
import {
  computeHomeRegionHexPartitionsForPrompting,
  countControlledHexesInRegion,
} from '../../shared/homeRegionRules';
import { buildFinalJsonContractInstruction, getFinalJsonOrdersExampleBlock } from './promptContracts';
import { buildAirOperationsBriefingBlock } from './briefingSectionsAirOps';
import { buildMissileForcesBriefingBlock } from './briefingSectionsMissiles';
import { buildMercenariesBriefingBlock } from './briefingSectionsMercenaries';
import { isMissileUnitType } from '../../shared/missileRules';
import { buildSealiftBriefingBlock } from './briefingSectionsSealift';
import { buildStatusInjectionTexts } from './requestOrdersInjection';
import {
  buildAdjacentCellsFallbackBlock,
  formatControlProgressLine,
  buildEnemyUnitsPromptLine,
  type EnemyRosterGroup,
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
import { homeControlProgressForSeat } from '../gameActions/endOfTurnOutcome';
import { buildSidesPromptBlock, type SidesPromptSeat } from './promptSpec/sidesBlock';
import { logDebug, logError } from '../logger';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
import { SECTION_TITLE_AVAILABLE_TOOLS, SECTION_TITLE_BEST_OPTIONS_THIS_TURN, topLevelHeading } from './promptSpec/sectionHeadings';
import { buildCombatRulesParagraph } from './promptSpec/gameRuleText';
import { originBonusSettingsFromSnapshot } from '../../shared/originBonusRules';
import { buildContextCoaching, type CoachingGates } from './promptSpec/coachingText';
import { buildToolBudgetExceededWarning } from './requestOrdersFlowSupport';

/** Home regions are defined at strategic; always encode with the strategic registry, not tactical. */
const HOME_REGION_HEX_COORD_CTX = { mode: 'strategic' as const };

/**
 * Defines the `formatHomeRegionHexCodesForPrompt` function shape (function formatHomeRegionHexCodesForPrompt()).

 * Purpose: Maps home-region H3 indexes to strategic briefing hex codes for LLM-visible comma-separated lists.
 * When to use: Strategic `region_vs_region` home-region hex bullets in `buildSystemPromptForTools` only.
 * Expected outcome: Comma-separated strategic codes via `h3ToCode` strategic context; falls back to raw `h3` on lookup failure.
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
  const ownSeat = briefingOwnSeatId(state);
  const opponentUnits = state.units.filter((u) => u.player === ownSeat);
  const flags = getToolFlags(enabledToolNames);

  const limitExceededLastTurn = getAndClearAiToolLimitExceededLastTurn(ownSeat);
  const showLimitWarning = limitExceededLastTurn && (flags.planningEnabled || flags.ordersEnabled);
  const warning = showLimitWarning ? buildToolBudgetExceededWarning() : '';

  const opponentRoster = opponentUnits
    .filter((u) => latLngByH3.has(u.h3Index))
    .map((u) => `${u.id} (${u.unitType}) at ${format(u.h3Index)}`)
    .join('; ');
  const enemyGroups = observedEnemyGroups(state, ownSeat, latLngByH3, format);
  const tacticalBattleActive = coordinateContext.mode === 'tactical';
  const filtered = getFilteredToolMetadata(enabledToolNames, coordinateContext.mode);
  const hasNaval = opponentUnits.some((u) => u.unitType === 'naval');
  const hasAir = opponentUnits.some((u) => u.unitType === 'air');
  const hasMissile = opponentUnits.some((u) => isMissileUnitType(u.unitType));
  const hasPrecomputedBriefing = briefingOverride != null && briefingOverride.length > 0;
  const hasBestOptionsTable =
    hasPrecomputedBriefing && (briefingOverride ?? '').includes(SECTION_TITLE_BEST_OPTIONS_THIS_TURN);
  const enemyHomes = coordinateContext.mode === 'tactical' ? [] : enemyHomesForPrompt(state);
  const homePartitions =
    state.scenarioId === 'region_vs_region' && enemyHomes.length === 1
      ? computeHomeRegionHexPartitionsForPrompting(ownHomeHexes(state), enemyHomes[0]?.hexes ?? [])
      : null;
  const sharedHomeHexes = homePartitions
    ? homePartitions.intersection
    : hexesInMoreThanOneHome([ownHomeHexes(state), ...enemyHomes.map((home) => home.hexes)]);
  let homeControl: ReturnType<typeof homeControlProgressForSeat> = null;
  if (coordinateContext.mode !== 'tactical') {
    try {
      homeControl = homeControlProgressForSeat(ownSeat);
    } catch (err) {
      logError('openRouterBuildSystemPrompt: home control progress failed', err);
      homeControl = null;
    }
  }
  const controlWinMinUrbanShare = homeControl?.controlWinMinUrbanShare;
  const seatCount = state.seats && state.seats.length > 0 ? state.seats.length : 2;
  const coachingGates: CoachingGates = {
    coordinateMode: coordinateContext.mode,
    planningEnabled: flags.planningEnabled,
    ordersEnabled: flags.ordersEnabled && coordinateContext.mode !== 'tactical',
    memoryEnabled: flags.memoryEnabled && coordinateContext.mode !== 'tactical',
    productionEnabled: flags.productionEnabled && coordinateContext.mode !== 'tactical',
    hasAirUnits: hasAir,
    hasNavalUnits: hasNaval,
    hasBestOptionsTable,
    homeRegionsOverlap: state.scenarioId === 'region_vs_region' && sharedHomeHexes.length > 0,
    hasObservedEnemy: enemyGroups.some((group) => group.roster.length > 0),
    includeScenarioWinPaths: state.scenarioId === 'region_vs_region' && coordinateContext.mode !== 'tactical',
    controlWinMinUrbanShare: controlWinMinUrbanShare ?? null,
    seatCount,
    turnLimitVictory: state.victory?.rule === 'most_city_hexes_at_turn_limit',
    doctrine: doctrineForPrompt(state),
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
  const missileRaw = buildMissileForcesBriefingBlock(state, format, coordinateContext.mode);
  const mercenaryRaw = buildMercenariesBriefingBlock(state, format, coordinateContext.mode, { productionEnabled: flags.productionEnabled });
  const sealiftRaw = buildSealiftBriefingBlock(state, format, coordinateContext.mode);
  const airOpsBlock = airOpsRaw ? `${airOpsRaw}\n\n` : '';
  const missileBlock = missileRaw ? `${missileRaw}\n\n` : '';
  const mercenaryBlock = mercenaryRaw ? `${mercenaryRaw}\n\n` : '';
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

  const humanUnitsLine = buildEnemyUnitsPromptLine(enemyGroups);
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
  const controlledLandHexes = (state.strategicControl ?? []).filter(
    (row) => row.controllerPlayerId === ownSeat && landHexSet.has(row.h3Index)
  ).length;
  const ownHomeRegionControl = countControlledHexesInRegion(state.strategicControl ?? [], ownHomeHexes(state), ownSeat);
  let regionHomeProgressAndHexBullets = '';
  if (state.scenarioId === 'region_vs_region' && coordinateContext.mode !== 'tactical' && enemyHomes.length > 0) {
    const lineOwn = formatControlProgressLine('Your home region control', ownHomeRegionControl.controlled, ownHomeRegionControl.total);
    const ownExclusive = homePartitions
      ? (!homePartitions.equalAsSets ? homePartitions.aiExclusive : [])
      : ownHomeHexes(state).filter((hex) => !sharedHomeHexes.includes(hex));
    const aiHexLine = ownExclusive.length > 0
      ? `\n- Your home region hexes are: ${formatHomeRegionHexCodesForPrompt(ownExclusive)}`
      : '';
    const enemyLines = enemyHomes.map((home) => {
      const counts = countControlledHexesInRegion(state.strategicControl ?? [], home.hexes, ownSeat);
      const controlLine = formatControlProgressLine(`Your control of ${home.name}'s home region`, counts.controlled, counts.total);
      const exclusive = homePartitions
        ? (!homePartitions.equalAsSets ? homePartitions.humanExclusive : [])
        : home.hexes.filter((hex) => !sharedHomeHexes.includes(hex));
      const hexLine = exclusive.length > 0
        ? `\n- ${home.name} home region hexes are: ${formatHomeRegionHexCodesForPrompt(exclusive)}`
        : '';
      return `\n${controlLine}${hexLine}`;
    }).join('');
    const overlapLine = sharedHomeHexes.length > 0
      ? `\n- These hexes are in more than one home region: ${formatHomeRegionHexCodesForPrompt(sharedHomeHexes)}`
      : '';
    const territorySentence =
      typeof controlWinMinUrbanShare === 'number'
        ? '\n- Those hex counts are territory, and the control win is the urban-cell share in the scenario objective.'
        : '';
    regionHomeProgressAndHexBullets = `\n${lineOwn}${aiHexLine}${enemyLines}${overlapLine}${territorySentence}`;
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
    coordinateContext.mode === 'tactical'
      ? ''
      : buildRegionVsRegionScenarioObjectiveBlock(state, {
          controlWinMinUrbanShare,
          enemyProgress: homeControl?.pairs.map((pair) => ({
            name: pair.enemyName,
            ownAgainstEnemy: pair.ownAgainstEnemy,
            enemyAgainstOwn: pair.enemyAgainstOwn,
          })),
        });
  const sidesBlock = coordinateContext.mode === 'tactical'
    ? ''
    : buildSidesPromptBlock({
        ownSeatId: ownSeat,
        seats: sidesSeatsForPrompt(state, ownSeat),
        includeNeutral: state.units.some((unit) => isNeutralOwnerId(unit.player)),
        includeMercenaryNote: state.units.some((unit) => unit.isMercenary === true),
      });
  const sidesPrefix = sidesBlock.length > 0 ? `${sidesBlock}\n\n` : '';
  const scenarioPrefix = scenarioObjectiveBlock.length > 0 ? `${scenarioObjectiveBlock}\n\n` : '';
  const mainBlock = briefingOverride != null && briefingOverride.length > 0
    ? `${briefingOverride}\n\n${sidesPrefix}${scenarioPrefix}${coachingContextBlock}\n\n${airOpsBlock}${missileBlock}${mercenaryBlock}${sealiftBlock}${toolsSection}\n\n${humanUnitsLine}`
    : `${memoryBlock}${standingOrderBlock}${productionBlock}${sidesPrefix}${scenarioPrefix}${coachingContextBlock}\n\n${airOpsBlock}${missileBlock}${mercenaryBlock}${sealiftBlock}${toolsSection}\n\n${ownUnitsLine}${humanUnitsLine}${adjacentCellsBlock}`;

  const standingOrdersIssuable = flags.ordersEnabled && coordinateContext.mode !== 'tactical';
  const finalJsonContract = buildFinalJsonContractInstruction({
    includeMemoryUpdates: flags.memoryEnabled,
    includeProductionOrders: flags.productionEnabled,
    includeAirActions: hasAir,
    includeMissileActions: hasMissile && coordinateContext.mode !== 'tactical',
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
    includeMissileActions: hasMissile && coordinateContext.mode !== 'tactical',
    includeStandingOrderActions: standingOrdersIssuable,
    coordinateMode: coordinateContext.mode,
  });
  const scoutingDirective =
    coordinateContext.mode === 'tactical'
      ? ''
      : enemyGroups.every((group) => group.roster.length === 0)
        ? '\n\nNo enemy units are currently observed. Enemy forces may be out of view.'
        : '';
  const winConditionReminder =
    coordinateContext.mode === 'tactical'
      ? buildTacticalBattleGoalClause()
      : buildWinConditionReminderClause({
          scenarioId: state.scenarioId,
          controlWinMinUrbanShare: typeof controlWinMinUrbanShare === 'number' ? controlWinMinUrbanShare : null,
          victoryRule: state.victory?.rule ?? null,
          turnLimit: state.victory?.turnLimit ?? null,
        });
  const latLngBlock =
    coordinateContext.mode === 'tactical'
      ? buildTacticalLatLngPreamble(LATLNG_DECIMAL_PLACES)
      : buildLatLngPreamble();
  const combatRulesParagraph = buildCombatRulesParagraph({
    coordinateMode: coordinateContext.mode,
    hasAirUnits: hasAir,
    hasMissileUnits: hasMissile,
    hasNavalUnits: hasNaval,
    ordersEnabled: standingOrdersIssuable,
    originBonusSettings: originBonusSettingsFromSnapshot(state),
    hasFortifiedCells: coordinateContext.hasFortifiedCells === true,
  });
  const combatRulesWithToolHints = combatTargetHint
    ? combatRulesParagraph.replace(
        'or targetUnitId (not your move destination).',
        `or targetUnitId (not your move destination)${combatTargetHint}.`
      )
    : combatRulesParagraph;
  const dateClause = state.currentDateLabel ? `, date: ${state.currentDateLabel}` : '';
  const turnPhaseHeader =
    coordinateContext.mode === 'tactical'
      ? `Strategic turn: ${state.turnNumber}${dateClause}, tactical beat: ${coordinateContext.tacticalTurnNumber ?? '?'}, phase: ${state.phase}.`
      : `Current turn: ${state.turnNumber}${dateClause}, phase: ${state.phase}.`;
  const prompt = `You command ${commandedSideName(state)} in a WEGO (simultaneous movement) hex wargame with ${seatCount} sides. Every other side is your enemy, and so are neutral garrisons. ${turnPhaseHeader}

${winConditionReminder}${scoutingDirective}${warning}

${latLngBlock}

${combatRulesWithToolHints}${navalPlanRouteHint}${combatAssessHint}

${mainBlock}

${finalJsonContract}

${finalJsonExample}`;
  return prompt;
}

/**
 * Stored doctrine of the commander being briefed.
 *
 * Purpose: A random draw is hidden on the snapshot until the match is over, and the prompt still has to teach it.
 * When to use: The coaching gates for this consultation.
 * Expected outcome: The roster's stored doctrine when a database is open. Otherwise the snapshot's doctrine, or Balanced.
 * Exceptions: A closed database is caught and the snapshot is used. The drawn value is not written to a player-facing log.
 */
function doctrineForPrompt(state: GameStateSnapshot): Doctrine {
  try {
    const stored = findSeat(getSeatRoster(), briefingOwnSeatId(state))?.commander?.doctrine;
    if (stored === 'aggressive' || stored === 'cautious' || stored === 'balanced') return stored;
  } catch (err) {
    logError('openRouterBuildSystemPrompt: doctrine lookup failed', err);
  }
  const fromSnapshot = state.seats?.find((seat) => seat.seatId === briefingOwnSeatId(state))?.commander?.doctrine;
  if (fromSnapshot === 'aggressive' || fromSnapshot === 'cautious' || fromSnapshot === 'balanced') return fromSnapshot;
  return 'balanced';
}

/**
 * Home display name of the commander being briefed.
 *
 * Purpose: The identity sentence names the side, not a generic enemy commander.
 * When to use: The opening line of `buildSystemPromptForTools`.
 * Expected outcome: The roster home when a roster is present, otherwise `your side`.
 * Exceptions: None.
 */
function commandedSideName(state: GameStateSnapshot): string {
  const seats = state.seats ?? [];
  if (seats.length > 0) {
    const name = seats.find((seat) => seat.seatId === briefingOwnSeatId(state))?.homeRegion.trim() ?? '';
    if (name.length > 0) return name;
  }
  return 'your side';
}

/**
 * Seat rows for the Sides table.
 *
 * Purpose: A roster supplies the rows.
 * When to use: Strategic prompts. Tactical prompts omit the table.
 * Expected outcome: Roster rows. One placeholder row when the roster is absent.
 * Exceptions: None.
 */
function sidesSeatsForPrompt(state: GameStateSnapshot, ownSeatId: SeatId): SidesPromptSeat[] {
  if (state.seats && state.seats.length > 0) {
    return state.seats.map((seat) => ({
      seatId: seat.seatId,
      seatOrder: seat.seatOrder,
      homeRegion: seat.homeRegion,
      outTurn: seat.outTurn,
    }));
  }
  return [{ seatId: ownSeatId, seatOrder: 1, homeRegion: commandedSideName(state), outTurn: null }];
}

/**
 * Active enemy homes in seat order.
 *
 * Purpose: Home-control lines are one per enemy, using that enemy's own hex list.
 * When to use: Strategic prompts.
 * Expected outcome: Names and hex lists. One fallback row when the roster or the hex map is absent.
 * Exceptions: None.
 */
function enemyHomesForPrompt(state: GameStateSnapshot): { name: string; hexes: readonly string[] }[] {
  const seats = state.seats ?? [];
  const homes = state.homeRegionHexesBySeat;
  if (seats.length > 0 && homes) {
    const own = briefingOwnSeatId(state);
    return sortSeatsByOrder(seats)
      .filter((seat) => seat.seatId !== own && isSeatActive(seat))
      .map((seat) => ({ name: seat.homeRegion, hexes: homes[seat.seatId] ?? [] }));
  }
  return [{ name: 'the enemy', hexes: enemyHomeHexes(state) }];
}

/**
 * Hexes that appear in at least two of the given home lists.
 *
 * Purpose: The shared-cell line covers every overlap, including two enemy homes.
 * When to use: When there is more than one enemy and the two-set partition does not apply.
 * Expected outcome: Hexes whose membership count is greater than one. Order follows first appearance.
 * Exceptions: None.
 */
function hexesInMoreThanOneHome(lists: readonly (readonly string[])[]): string[] {
  const counts = new Map<string, number>();
  for (const list of lists) {
    for (const hex of new Set(list)) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts.keys()].filter((hex) => (counts.get(hex) ?? 0) > 1);
}

/**
 * Observed enemy units grouped by side, then Neutral.
 *
 * Purpose: The roster line names the side that owns each observed unit.
 * When to use: Strategic and tactical system prompts. Groups with an empty roster are kept so the line helper can drop them.
 * Expected outcome: Active enemies in seat order, then a Neutral group when a neutral unit is located. Without a roster, one group uses the human home name.
 * Exceptions: None.
 */
function observedEnemyGroups(
  state: GameStateSnapshot,
  ownSeat: SeatId,
  latLngByH3: Map<string, [number, number]>,
  format: (h3: string) => string
): EnemyRosterGroup[] {
  const located = state.units.filter((unit) => unit.player !== ownSeat && latLngByH3.has(unit.h3Index));
  const summary = (unit: { id: string; unitType: string; h3Index: string }): string =>
    `${unit.id} (${unit.unitType}) at ${format(unit.h3Index)}`;
  const groups: EnemyRosterGroup[] = [];
  const seats = state.seats ?? [];
  if (seats.length > 0) {
    for (const seat of sortSeatsByOrder(seats)) {
      if (seat.seatId === ownSeat || !isSeatActive(seat)) continue;
      groups.push({
        name: seat.homeRegion,
        roster: located.filter((unit) => unit.player === seat.seatId).map(summary).join('; '),
      });
    }
  } else {
    const name = 'Enemy';
    groups.push({
      name,
      roster: located.filter((unit) => !isNeutralOwnerId(unit.player)).map(summary).join('; '),
    });
  }
  const neutralRoster = located.filter((unit) => isNeutralOwnerId(unit.player)).map(summary).join('; ');
  if (neutralRoster.length > 0) groups.push({ name: 'Neutral', roster: neutralRoster });
  return groups;
}
