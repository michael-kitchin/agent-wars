import { aiOnlyBeatsLeft, formatAiOnlyBeatsLeftPrompt } from '../../shared/aiOnlyBeatLimit';
import { briefingOwnSeatId, ownHomeHexes } from '../briefing/briefingPerspective';
import { isNeutralOwnerId } from '../../shared/seatIds';
import type { GameStateSnapshot } from '../gameDb';
import { getAndClearAiToolLimitExceededLastTurn } from '../gameDb';
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
import { seatBuildCapabilities } from './seatBuildCapabilities';
import { buildSealiftBriefingBlock } from './briefingSectionsSealift';
import { buildStatusInjectionTexts } from './requestOrdersInjection';
import type { CampaignPlan } from './campaignRules';
import {
  buildAdjacentCellsFallbackBlock,
  formatControlProgressLine,
  buildEnemyUnitsPromptLine,
  buildLatLngPreamble,
  buildTacticalLatLngPreamble,
  buildProductionSubmitClause,
  buildAvailableToolsIntro,
  buildToolUsageGuidance,
  formatLatLng as formatLatLngWithPrecision,
  getInitialUserMessage,
  getMovementOrderInstruction,
} from './promptText';
import { buildScenarioObjectiveRulesBlock, buildScenarioProgressLines, buildTacticalBattleGoalClause, buildWinConditionReminderClause } from './scenarioGoals';
import {
  NAVAL_PLAN_ROUTE_LAND_TARGET_HINT,
  NAVAL_PLAN_ROUTE_PROMPT_SUFFIX,
} from '../navalMovementMessages';
import { AIR_PLAN_ROUTE_PROMPT_SUFFIX, getFilteredToolMetadata } from './openRouterToolCatalog';
import { getToolFlags } from './openRouterToolGroups';
import { homeControlProgressForSeat } from '../gameActions/endOfTurnOutcome';
import { buildSidesPromptBlock } from './promptSpec/sidesBlock';
import { logDebug, logError } from '../logger';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { combatRuleGatesForPrompt } from './promptSpec/gameRuleSituationGates';
import {
  commandedSideName,
  doctrineForPrompt,
  enemyHomesForPrompt,
  formatHomeRegionHexCodesForPrompt,
  hexesInMoreThanOneHome,
  observedEnemyGroups,
  sidesSeatsForPrompt,
} from './consultPromptPartsHelpers';
import {
  SECTION_TITLE_AVAILABLE_TOOLS,
  SECTION_TITLE_BATTLE_CONTEXT,
  SECTION_TITLE_CURRENT_SITUATION,
  SECTION_TITLE_BEST_OPTIONS_THIS_TURN,
  SECTION_TITLE_RULES,
  SECTION_TITLE_COORDINATES,
  SECTION_TITLE_EXAMPLE_RESPONSE,
  SECTION_TITLE_RESPONSE_FORMAT,
  SECTION_TITLE_STRATEGIC_CONTEXT,
  SECTION_TITLE_SCENARIO_PROGRESS,
  SECTION_TITLE_UNIT_ROSTER,
  SECTION_TITLE_YOUR_COMMAND,
  shiftMarkdownHeadings,
  subHeading,
  topLevelHeading,
  wrapLongProseLines,
} from './promptSpec/sectionHeadings';
import { buildProductionRulesParagraphs, buildRulesSections } from './promptSpec/gameRuleText';
import { buildBriefingGuideSection } from './promptSpec/briefingGuideText';
import { briefingDistanceCaveatLines } from '../briefing/briefingDistanceCaveat';
import { getMaxUnitsPerType, parseGameSize } from '../../shared/gameSize';
import { RULES_POINTER_LINE } from '../tools/referenceTools';
import { originBonusSettingsFromSnapshot } from '../../shared/originBonusRules';
import { buildContextCoaching, buildOrdersGuidanceSection, type CoachingGates } from './promptSpec/coachingText';
import { buildToolBudgetExceededWarning } from './requestOrdersFlowSupport';

/**
 * Splits one consultation into stable system text and the live situation.
 *
 * Purpose: The system text can be cached. The situation carries the clock, the briefing, and the opening.
 * When to use: `buildSystemPromptForTools` and `buildConsultMessages`.
 * Expected outcome: Two wrapped strings. The system text has no turn, date, unit positions, or beats left. The situation starts with `# Current Situation`. An AI-only battle with a numeric beat limit puts the beats-left paragraph on the next line after the clock.
 * Exceptions: A home-control lookup failure is logged and the progress lines use what remains.
 */
export function buildConsultPromptParts(input: {
  readonly state: GameStateSnapshot;
  readonly coordMap: {
    latLngByH3: Map<string, [number, number]>;
    format: (h3: string) => string;
    resolveToH3: (lat: number, lng: number) => string | undefined;
  };
  readonly enabledToolNames?: string[];
  readonly briefingOverride?: string;
  readonly coordinateContext?: CoordinateContext;
  readonly includeExitBattle?: boolean;
  /**
   * When true, the chat request will attach the JSON schema.
   *
   * Contract: Omitted means false. A rejection mid-consult does not rebuild this text.
   * When to use: `requestOrdersFlow`, from the profile and the session rejection mark.
   * Expected outcome: The response format omits the skeleton and the strict-schema line.
   * Exceptions: None.
   */
  readonly structuredOutputs?: boolean;
  /**
   * Battle whose sub-units still carry birth terrain.
   *
   * Contract: Omitted on a strategic consult. The plan-state units do not carry origin.
   * When to use: Tactical `requestOrders`, passing the same snapshot the briefing used.
   * Expected outcome: Naval terrain-entry reads birth terrain from these sub-units.
   * Exceptions: None.
   */
  readonly tacticalBattle?: TacticalBattleSnapshot | null;
  /**
   * Production attention sentence already computed for this briefing.
   *
   * Contract: Omit to compute it here. Pass the briefing's value, including null, so the opening matches the briefing.
   * When to use: `requestOrdersFlow`, after it has already built the briefing injection.
   * Expected outcome: The opening names the Production flag only when this string is non-null. A supplied value skips a second injection.
   * Exceptions: None.
   */
  readonly productionAttention?: string | null;
  /**
   * The consult's campaign plan.
   *
   * Contract: Omitted or null keeps today's standing-order suggestions on the no-briefing path.
   * When to use: `requestOrdersFlow` after it resolved the campaign.
   * Expected outcome: Passed to `buildStatusInjectionTexts`. A precomputed briefing does not read it again.
   * Exceptions: None.
   */
  readonly campaignPlan?: CampaignPlan | null;
  /**
   * Campaign attention sentence already computed for this briefing.
   *
   * Contract: Omit to compute it here. Pass the briefing's value, including null, so the opening matches the briefing.
   * When to use: `requestOrdersFlow`, after it has already built the briefing injection.
   * Expected outcome: The opening names Campaign Orders only when this string is non-null.
   * Exceptions: None.
   */
  readonly campaignAttention?: string | null;
  /**
   * Whether the briefing's Operation Options table has a row.
   *
   * Contract: Omitted means false. Pass the briefing injection's flag, including false.
   * When to use: `requestOrdersFlow`, after it has built the briefing.
   * Expected outcome: The opening mentions Operation Options only when this is true.
   * Exceptions: None.
   */
  readonly hasOperationOptions?: boolean;
}): { staticSystemText: string; situationText: string } {
  const state = input.state;
  const coordMap = input.coordMap;
  const enabledToolNames = input.enabledToolNames;
  const briefingOverride = input.briefingOverride;
  const coordinateContext = input.coordinateContext ?? { mode: 'strategic' as const };
  const includeExitBattle = input.includeExitBattle === true;
  const beatsLeft =
    coordinateContext.mode === 'tactical' &&
    includeExitBattle &&
    typeof coordinateContext.tacticalTurnNumber === 'number'
      ? aiOnlyBeatsLeft(coordinateContext.tacticalTurnNumber, state.aiOnlyBeatLimit ?? null)
      : null;
  const structuredOutputs = input.structuredOutputs === true;
  const tacticalBattle = input.tacticalBattle ?? null;
  logDebug('openRouter buildConsultPromptParts', {
    turnNumber: state.turnNumber,
    phase: state.phase,
    toolNameCount: enabledToolNames?.length ?? 0,
    hasBriefingOverride: Boolean(briefingOverride?.length),
    coordinateMode: coordinateContext.mode,
    battleId: coordinateContext.battleId ?? null,
    includeExitBattle,
    beatsLeft,
    structuredOutputs,
    skippedStatusInjection: Boolean(briefingOverride?.length) && input.productionAttention !== undefined,
  });
  const { latLngByH3, format, resolveToH3 } = coordMap;
  const formatLatLng = (ll: [number, number]) => formatLatLngWithPrecision(ll, LATLNG_DECIMAL_PLACES);
  const ownSeat = briefingOwnSeatId(state);
  const opponentUnits = state.units.filter((u) => u.player === ownSeat);
  const flags = getToolFlags(enabledToolNames);

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
  const strategicProduction = flags.productionEnabled && coordinateContext.mode !== 'tactical';
  const capabilities = strategicProduction
    ? seatBuildCapabilities(state, ownSeat)
    : { canBuildNaval: false, canBuildMissile: false };
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
    campaignEnabled: coordinateContext.mode !== 'tactical' && state.scenarioId === 'region_vs_region' && flags.ordersEnabled,
    operationsEnabled: coordinateContext.mode !== 'tactical' && flags.ordersEnabled,
    postureEnabled: coordinateContext.mode !== 'tactical' && flags.ordersEnabled,
    controlWinMinUrbanShare: controlWinMinUrbanShare ?? null,
    seatCount,
    turnLimitVictory: state.victory?.rule === 'most_city_hexes_at_turn_limit',
    doctrine: doctrineForPrompt(state),
    includeExitBattle,
    hasMissileUnits: hasMissile && coordinateContext.mode !== 'tactical',
    canBuildNaval: capabilities.canBuildNaval,
    canBuildMissile: capabilities.canBuildMissile,
    mercenariesAvailable: strategicProduction && state.mercenaryEconomy != null,
  };
  const toolPromptLines = filtered.map((m) => {
    let line = m.promptLine;
    if (m.name === 'plan_route' && !hasNaval) {
      line = line.replace(NAVAL_PLAN_ROUTE_PROMPT_SUFFIX, '');
    }
    if (m.name === 'plan_route' && (!hasAir || coordinateContext.mode === 'tactical')) {
      line = line.replace(AIR_PLAN_ROUTE_PROMPT_SUFFIX, '');
    }
    return line;
  });
  const toolsIntro = buildAvailableToolsIntro(flags, hasPrecomputedBriefing, coordinateContext.mode, {
    hasAirUnits: hasAir,
    hasBestOptionsTable,
  });
  const toolGuidance = buildToolUsageGuidance(flags, hasPrecomputedBriefing, coordinateContext.mode);
  const toolsSection =
    filtered.length === 0
      ? `${topLevelHeading(SECTION_TITLE_AVAILABLE_TOOLS)}\n\nNo tools available.`
      : `${topLevelHeading(SECTION_TITLE_AVAILABLE_TOOLS)}

${toolsIntro}
${toolPromptLines.map((line, i) => `${i + 1}. ${line}`).join('\n')}${toolGuidance}`;

  const attentionSupplied = input.productionAttention !== undefined;
  const injection = !hasPrecomputedBriefing || !attentionSupplied
    ? buildStatusInjectionTexts({
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
        campaignPlan: input.campaignPlan ?? null,
      })
    : {
        memoryText: '',
        standingOrderText: '',
        productionText: '',
        productionAttention: input.productionAttention ?? null,
        pausedProductionAttention: null,
        campaignText: '',
        operationsText: '',
        offeredCandidates: [],
        hasOperationOptions: input.hasOperationOptions === true,
        campaignAttention: input.campaignAttention ?? null,
        additionalAttention: [],
      };
  const memoryBlock = flags.memoryEnabled ? injection.memoryText + '\n\n' : '';
  const campaignBlock = injection.campaignText.trim().length > 0 ? `${injection.campaignText}\n\n` : '';
  const operationsBlock = injection.operationsText.trim().length > 0 ? `${injection.operationsText}\n\n` : '';
  const standingOrderBlock = flags.ordersEnabled ? injection.standingOrderText + '\n\n' : '';
  const productionBlock = flags.productionEnabled ? injection.productionText + '\n\n' : '';
  const airOpsRaw = buildAirOperationsBriefingBlock(state, format, coordinateContext.mode);
  const missileRaw = buildMissileForcesBriefingBlock(state, format, coordinateContext.mode);
  const mercenaryRaw = buildMercenariesBriefingBlock(state, format, coordinateContext.mode, {
    productionEnabled: flags.productionEnabled,
    campaignTargetH3: input.campaignPlan?.objective.targetH3 ?? null,
  });
  const sealiftRaw = buildSealiftBriefingBlock(state, format, coordinateContext.mode);
  const underBriefing = (block: string): string =>
    hasPrecomputedBriefing && block.length > 0 ? shiftMarkdownHeadings(block, 1) : block;
  const airOpsBlock = airOpsRaw ? `${underBriefing(airOpsRaw)}\n\n` : '';
  const missileBlock = missileRaw ? `${underBriefing(missileRaw)}\n\n` : '';
  const mercenaryBlock = mercenaryRaw ? `${underBriefing(mercenaryRaw)}\n\n` : '';
  const sealiftBlock = sealiftRaw ? `${underBriefing(sealiftRaw)}\n\n` : '';

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
    hasPrecomputedBriefing
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
  const homeControlLines: string[] = [];
  const scenarioHomeLines: string[] = [];
  if (state.scenarioId === 'region_vs_region' && coordinateContext.mode !== 'tactical' && enemyHomes.length > 0) {
    homeControlLines.push(formatControlProgressLine('Your home region control', ownHomeRegionControl.controlled, ownHomeRegionControl.total));
    const ownExclusive = homePartitions
      ? (!homePartitions.equalAsSets ? homePartitions.aiExclusive : [])
      : ownHomeHexes(state).filter((hex) => !sharedHomeHexes.includes(hex));
    if (ownExclusive.length > 0) {
      scenarioHomeLines.push(`- Your home region hexes are: ${formatHomeRegionHexCodesForPrompt(ownExclusive)}`);
    }
    for (const home of enemyHomes) {
      const counts = countControlledHexesInRegion(state.strategicControl ?? [], home.hexes, ownSeat);
      homeControlLines.push(formatControlProgressLine(`Your control of ${home.name}'s home region`, counts.controlled, counts.total));
      const exclusive = homePartitions
        ? (!homePartitions.equalAsSets ? homePartitions.humanExclusive : [])
        : home.hexes.filter((hex) => !sharedHomeHexes.includes(hex));
      if (exclusive.length > 0) {
        scenarioHomeLines.push(`- ${home.name} home region hexes are: ${formatHomeRegionHexCodesForPrompt(exclusive)}`);
      }
    }
    if (sharedHomeHexes.length > 0) {
      scenarioHomeLines.push(`- These hexes are in more than one home region: ${formatHomeRegionHexCodesForPrompt(sharedHomeHexes)}`);
    }
    if (typeof controlWinMinUrbanShare === 'number') {
      scenarioHomeLines.push('- Those hex counts are territory, and the control win is the urban-cell share in the scenario objective.');
    }
  }

  const contextCoaching = buildContextCoaching(coachingGates);
  const coachingContextBlock = `${topLevelHeading(
    coordinateContext.mode === 'tactical' ? SECTION_TITLE_BATTLE_CONTEXT : SECTION_TITLE_STRATEGIC_CONTEXT
  )}\n\n${contextCoaching}`;
  const urbanProgress = coordinateContext.mode === 'tactical'
    ? []
    : buildScenarioProgressLines(state, {
        controlWinMinUrbanShare,
        enemyProgress: homeControl?.pairs.map((pair) => ({
          name: pair.enemyName,
          ownAgainstEnemy: pair.ownAgainstEnemy,
          enemyAgainstOwn: pair.enemyAgainstOwn,
        })),
      });
  const progressLines = coordinateContext.mode === 'tactical'
    ? []
    : [
        formatControlProgressLine('Explored', exploredLandHexes, totalLandHexes, 'land hexes'),
        formatControlProgressLine('Controlled', controlledLandHexes, totalLandHexes, 'land hexes'),
        ...homeControlLines,
        ...urbanProgress,
      ];
  const progressBlock = progressLines.length > 0
    ? `${underBriefing(`${topLevelHeading(SECTION_TITLE_SCENARIO_PROGRESS)}\n\n${progressLines.join('\n')}`)}\n\n`
    : '';
  const scenarioRules = coordinateContext.mode === 'tactical'
    ? ''
    : buildScenarioObjectiveRulesBlock(state, { controlWinMinUrbanShare });
  const scenarioSystem = [scenarioRules, scenarioHomeLines.join('\n')].filter((part) => part.length > 0).join('\n');
  const sidesBlock = coordinateContext.mode === 'tactical'
    ? ''
    : buildSidesPromptBlock({
        ownSeatId: ownSeat,
        seats: sidesSeatsForPrompt(state, ownSeat),
        includeNeutral: state.units.some((unit) => isNeutralOwnerId(unit.player)),
        includeMercenaryNote: state.units.some((unit) => unit.isMercenary === true),
      });
  const liveStatus = hasPrecomputedBriefing
    ? `${briefingOverride}\n\n`
    : `${memoryBlock}${campaignBlock}${operationsBlock}${standingOrderBlock}${productionBlock}`;
  const rosterBody = hasPrecomputedBriefing ? humanUnitsLine : `${ownUnitsLine}${humanUnitsLine}${adjacentCellsBlock}`;

  const standingOrdersIssuable = flags.ordersEnabled && coordinateContext.mode !== 'tactical';
  const finalJsonContract = buildFinalJsonContractInstruction({
    includeMemoryUpdates: flags.memoryEnabled,
    includeProductionOrders: flags.productionEnabled,
    includeAirActions: hasAir,
    includeMissileActions: hasMissile && coordinateContext.mode !== 'tactical',
    includeNavalActions: hasNaval,
    includeStandingOrderActions: standingOrdersIssuable,
    includeExitBattle,
    includeCampaignTarget: coachingGates.campaignEnabled === true,
    includeOperations: coachingGates.operationsEnabled === true,
    includePosture: coachingGates.operationsEnabled === true,
    movementOrderInstruction,
    submitMemoryClause,
    productionSubmitClause: buildProductionSubmitClause(flags),
    coordinateMode: coordinateContext.mode,
    structuredOutputs,
  });
  const finalJsonExample = getFinalJsonOrdersExampleBlock({
    includeMemoryUpdates: flags.memoryEnabled,
    includeProductionOrders: flags.productionEnabled,
    includeAirActions: hasAir,
    includeMissileActions: hasMissile && coordinateContext.mode !== 'tactical',
    includeStandingOrderActions: standingOrdersIssuable,
    includeExitBattle,
    coordinateMode: coordinateContext.mode,
  });
  const limitExceededLastTurn = getAndClearAiToolLimitExceededLastTurn(ownSeat);
  const warning =
    limitExceededLastTurn && (flags.planningEnabled || flags.ordersEnabled)
      ? `${buildToolBudgetExceededWarning()}\n\n`
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
  const rulesBody = buildRulesSections({
    ...combatRuleGatesForPrompt({
      units: state.units,
      hexes: state.hexes,
      strategicInfrastructure: state.strategicInfrastructure,
      coordinateContext,
      ownSeat,
      hasAirUnits: hasAir,
      hasNavalUnits: hasNaval,
      hasMissileUnits: hasMissile,
      canBuildNaval: capabilities.canBuildNaval,
      canBuildMissile: capabilities.canBuildMissile,
      standingOrdersIssuable,
      originBonusSettings: originBonusSettingsFromSnapshot(state),
      rangedTargetHint: combatTargetHint,
      productionEnabled: flags.productionEnabled && coordinateContext.mode !== 'tactical',
      tacticalSubUnits: tacticalBattle?.subUnits,
    }),
    navalPlanRouteHint: navalPlanRouteHint.trim(),
    extraCombatText: combatAssessHint.trim(),
    productionRules: flags.productionEnabled && coordinateContext.mode !== 'tactical'
      ? buildProductionRulesParagraphs(getMaxUnitsPerType(parseGameSize(state.gameSize)))
      : [],
    rulesPointer: filtered.some((tool) => tool.name === 'rules') ? RULES_POINTER_LINE : '',
  });
  const ordersGuidance = buildOrdersGuidanceSection(coachingGates);
  const briefingGuide = buildBriefingGuideSection({
    coordinateMode: coordinateContext.mode === 'tactical' ? 'tactical' : 'strategic',
    hasPrecomputedBriefing,
    distanceCaveatLines: briefingDistanceCaveatLines(state),
    includeOddsKey: hasPrecomputedBriefing,
    memoryEnabled: flags.memoryEnabled,
    hasAirUnits: hasAir,
    hasNavalUnits: hasNaval,
    hasMissileUnits: hasMissile,
  });
  const dateClause = state.currentDateLabel ? `, date: ${state.currentDateLabel}` : '';
  const turnPhaseHeader =
    coordinateContext.mode === 'tactical'
      ? `Strategic turn: ${state.turnNumber}${dateClause}, tactical beat: ${coordinateContext.tacticalTurnNumber ?? '?'}, phase: ${state.phase}.`
      : `Current turn: ${state.turnNumber}${dateClause}, phase: ${state.phase}.`;
  const opening = getInitialUserMessage(flags, hasPrecomputedBriefing, coordinateContext.mode, {
    hasAirUnits: hasAir,
    hasMissileUnits: hasMissile && coordinateContext.mode !== 'tactical',
    hasBestOptionsTable,
    includeExitBattle,
    hasProductionAttention: injection.productionAttention !== null,
    hasCampaignOrders: injection.campaignAttention !== null,
    hasOperationOptions: input.hasOperationOptions === true,
  });
  const staticSystemText = wrapLongProseLines(`${topLevelHeading(SECTION_TITLE_YOUR_COMMAND)}

You command ${commandedSideName(state)} in a WEGO (simultaneous movement) hex wargame with ${seatCount} sides. Every other side is your enemy, and so are neutral garrisons.

${winConditionReminder}${scenarioSystem.length > 0 ? `\n\n${scenarioSystem}` : ''}${sidesBlock.length > 0 ? `\n\n${sidesBlock}` : ''}

${topLevelHeading(SECTION_TITLE_COORDINATES)}

${latLngBlock}

${topLevelHeading(SECTION_TITLE_RULES)}

${rulesBody}

${coachingContextBlock}

${briefingGuide.length > 0 ? `${briefingGuide}\n\n` : ''}${toolsSection}

${ordersGuidance.length > 0 ? `${ordersGuidance}\n\n` : ''}${topLevelHeading(SECTION_TITLE_RESPONSE_FORMAT)}

${finalJsonContract}

${subHeading(SECTION_TITLE_EXAMPLE_RESPONSE)}

${finalJsonExample}`);
  const situationText = wrapLongProseLines(`${topLevelHeading(SECTION_TITLE_CURRENT_SITUATION)}

${turnPhaseHeader}

${beatsLeft === null ? '' : `${formatAiOnlyBeatsLeftPrompt(beatsLeft)}\n\n`}${warning}${liveStatus}${progressBlock}${airOpsBlock}${missileBlock}${mercenaryBlock}${sealiftBlock}${hasPrecomputedBriefing ? subHeading(SECTION_TITLE_UNIT_ROSTER) : topLevelHeading(SECTION_TITLE_UNIT_ROSTER)}

${rosterBody}

${opening}`);
  logDebug('openRouter buildConsultPromptParts lengths', {
    mode: coordinateContext.mode,
    turnNumber: state.turnNumber,
    staticChars: staticSystemText.length,
    situationChars: situationText.length,
  });
  return { staticSystemText, situationText };
}

/**
 * Joins the system text and the situation text for callers that still want one string.
 *
 * Purpose: Outline and hex-code audits read the whole consultation without caring which message holds a heading.
 * When to use: `buildSystemPromptForTools` and tests that search the joined prompt.
 * Expected outcome: The system text, a blank line, then the situation text.
 * Exceptions: None.
 */
export function joinConsultPromptParts(parts: {
  readonly staticSystemText: string;
  readonly situationText: string;
}): string {
  logDebug('openRouter joinConsultPromptParts', {
    staticChars: parts.staticSystemText.length,
    situationChars: parts.situationText.length,
  });
  return `${parts.staticSystemText}\n\n${parts.situationText}`;
}
