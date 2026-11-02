/**
 * Battle map and rules lookups the model can call during a consult.
 *
 * Purpose: A gated prompt omits rules and map cells the model can still ask for.
 * When to use: `executeRequestOrdersTool`, before the substring dispatch.
 * Expected outcome: `{ status: 'ok' }` with rule text or a legend and grid, or `{ status: 'error' }`.
 * Exceptions: A bad center, radius, or topic returns an error result and does not throw.
 */

import { gridDisk } from 'h3-js';
import { logDebug, logError } from '../logger';
import type { GameStateSnapshot } from '../gameDb';
import type { CoordinateContext } from '../briefing/map/coordinateContext';
import { HEX_CODE_PATTERN } from '../briefing/map/coordinateContext';
import { getH3IndexForCode, getHexCodeForContext } from '../briefing/map/hexCoordinates';
import { renderTacticalWindowGridMarkdown } from '../briefing/map/briefingMapSection';
import { TACTICAL_MAP_WINDOW_RADIUS } from '../briefing/map/tacticalAsciiGridProjection';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { originBonusSettingsFromSnapshot } from '../../shared/originBonusRules';
import { ALL_BUILD_UNIT_TYPES } from '../../shared/ipc/productionTypes';
import {
  buildAirEmploymentRule,
  buildCasualtySortRule,
  buildCombatStatsLine,
  buildDestinationOccupancyRule,
  buildMovementBudgetRule,
  buildNavalClause,
  buildRangedReachRule,
  buildResolutionOrderRule,
  buildWeatherRule,
  type GameRuleTextGates,
} from '../openRouter/promptSpec/gameRuleText';
import { buildFortificationRule } from '../openRouter/promptSpec/gameRuleFortificationText';
import { buildMissileEmploymentRule } from '../openRouter/promptSpec/gameRuleMissileText';
import { buildMercenaryRule } from '../openRouter/promptSpec/gameRuleMercenaryText';
import type { PromptCoordinateMode } from '../openRouter/promptSpec/envelopeContract';

/**
 * Frozen names of the map and rules tools.
 *
 * Purpose: Dispatch and the Planning group share one list.
 * When to use: Exact-name checks before substring routing.
 * Expected outcome: `get_map`, then `rules`.
 * Exceptions: None.
 */
export const REFERENCE_TOOL_NAMES = ['get_map', 'rules'] as const;

/**
 * Topics `rules` accepts, in prompt order.
 *
 * Purpose: The schema, the prompt line, the pointer, and the error list stay the same list.
 * When to use: The tool schema and `ruleTextForTopic`.
 * Expected outcome: Twelve topic ids.
 * Exceptions: None.
 */
export const RULES_TOPICS = [
  'weather',
  'movement',
  'line-of-sight',
  'casualties',
  'stacking',
  'naval',
  'air',
  'fortifications',
  'missiles',
  'mercenaries',
  'resolution',
  'combat-stats',
] as const;

/** Comma-separated topics, shared by the prompt line, the pointer, and the unknown-topic error. */
const RULES_TOPIC_LIST = RULES_TOPICS.join(', ');

/**
 * Line appended after the combat rules when `rules` is enabled.
 *
 * Purpose: The printed rules are the ones that apply. The model can still ask for a rule that was left out.
 * When to use: `buildSystemPromptForTools` when the enabled list contains `rules`.
 * Expected outcome: One sentence naming every topic.
 * Exceptions: None.
 */
export const RULES_POINTER_LINE =
  `Call rules(topic) for a rule that is not printed above. Topics: ${RULES_TOPIC_LIST}.`;

/** Largest `get_map` radius, in grid steps. */
const GET_MAP_RADIUS_MAX = 8;

/**
 * Runs `get_map` or `rules`.
 *
 * Purpose: One entry for both reference tools so dispatch can branch on the name list.
 * When to use: When the tool name is in `REFERENCE_TOOL_NAMES`.
 * Expected outcome: An ok result or an error result. `get_map` during a strategic consult is an error.
 * Exceptions: Renderer and lookup failures are logged and returned as an error result.
 */
export function executeReferenceTool(args: {
  readonly toolName: string;
  readonly execArgs: unknown;
  readonly state: GameStateSnapshot;
  readonly coordinateContext: CoordinateContext;
  readonly tacticalBattle: TacticalBattleSnapshot | undefined;
  readonly resolveToH3: (lat: number, lng: number) => string | undefined;
}): Record<string, unknown> {
  const mode = args.coordinateContext.mode;
  logDebug('referenceTools executeReferenceTool', { toolName: args.toolName, mode });
  if (args.toolName === 'get_map') return executeGetMap(args);
  if (args.toolName === 'rules') return executeRules(args.execArgs, mode, args.state);
  logError('referenceTools executeReferenceTool: unexpected name', { toolName: args.toolName });
  return { status: 'error', error: `Unknown tool ${args.toolName}.` };
}

/**
 * Full rule text for one topic, with every gate open.
 *
 * Purpose: The tool returns the mode's full rule, including a sentence the live prompt left out.
 * When to use: `executeRules`.
 * Expected outcome: The builder's text, or null when the topic is not in `RULES_TOPICS`.
 * Exceptions: None.
 */
function ruleTextForTopic(topic: string, mode: PromptCoordinateMode, state: GameStateSnapshot): string | null {
  const gates = forcedOpenGates(mode, state);
  switch (topic) {
    case 'weather':
      return buildWeatherRule(gates);
    case 'movement':
      return buildMovementBudgetRule(mode);
    case 'line-of-sight':
      return buildRangedReachRule(mode, true);
    case 'casualties':
      return buildCasualtySortRule(true);
    case 'stacking':
      return buildDestinationOccupancyRule(mode);
    case 'naval':
      return buildNavalClause(mode).trim();
    case 'air':
      return buildAirEmploymentRule(gates);
    case 'fortifications':
      return buildFortificationRule(gates);
    case 'missiles':
      return buildMissileEmploymentRule(gates);
    case 'mercenaries':
      return buildMercenaryRule();
    case 'resolution':
      return buildResolutionOrderRule(mode);
    case 'combat-stats':
      return buildCombatStatsLine(mode, true, []);
    default:
      return null;
  }
}

/**
 * Gate object that turns every optional combat sentence on.
 *
 * Purpose: `rules` must not repeat the prompt's situation gates.
 * When to use: `ruleTextForTopic`.
 * Expected outcome: Weather, air, naval, missiles, and fortifications are included. Tactical weather still omits the strategic sentences.
 * Exceptions: None.
 */
function forcedOpenGates(mode: PromptCoordinateMode, state: GameStateSnapshot): GameRuleTextGates {
  return {
    coordinateMode: mode,
    hasAirUnits: true,
    hasNavalUnits: true,
    hasMissileUnits: true,
    hasFortifiedCells: true,
    ordersEnabled: true,
    originBonusSettings: { ...originBonusSettingsFromSnapshot(state), weatherBonusEnabled: true },
    weatherApplies: true,
    includeArmorTerrainEntry: true,
    includeMountainLineOfSight: true,
    includeMissileCasualty: true,
    includeFortificationRule: true,
    includeWeatherAirSentence: true,
    tacticalTypesPresent: [...ALL_BUILD_UNIT_TYPES],
  };
}

/**
 * `rules` result for one topic argument.
 *
 * Purpose: The model asks for a section that the prompt may have omitted.
 * When to use: `executeReferenceTool` when the name is `rules`.
 * Expected outcome: `{ status: 'ok', topic, text }` or an error that lists the topics.
 * Exceptions: None.
 */
function executeRules(execArgs: unknown, mode: PromptCoordinateMode, state: GameStateSnapshot): Record<string, unknown> {
  const topic = execArgs && typeof execArgs === 'object' && !Array.isArray(execArgs)
    ? (execArgs as { topic?: unknown }).topic
    : undefined;
  if (typeof topic !== 'string') {
    return { status: 'error', error: `Unknown topic. Topics: ${RULES_TOPIC_LIST}.` };
  }
  const text = ruleTextForTopic(topic, mode, state);
  if (!text) {
    logDebug('referenceTools executeRules unknown topic', { topic, mode });
    return { status: 'error', error: `Unknown topic. Topics: ${RULES_TOPIC_LIST}.` };
  }
  logDebug('referenceTools executeRules', { topic, mode, chars: text.length });
  return { status: 'ok', topic, text };
}

/**
 * Map around one battle cell.
 *
 * Purpose: The briefing map is a window. This fills in cells outside it.
 * When to use: `executeReferenceTool` when the name is `get_map`.
 * Expected outcome: Legend and fenced grid for the disk clipped to the footprint. No coordinates and no H3 index.
 * Exceptions: A strategic call, a bad radius, or a center outside the footprint returns an error result.
 */
function executeGetMap(args: {
  readonly execArgs: unknown;
  readonly state: GameStateSnapshot;
  readonly coordinateContext: CoordinateContext;
  readonly tacticalBattle: TacticalBattleSnapshot | undefined;
  readonly resolveToH3: (lat: number, lng: number) => string | undefined;
}): Record<string, unknown> {
  if (!args.tacticalBattle || args.coordinateContext.mode !== 'tactical') {
    return { status: 'error', error: 'get_map is only available during a battle.' };
  }
  const record = args.execArgs && typeof args.execArgs === 'object' && !Array.isArray(args.execArgs)
    ? (args.execArgs as { center?: unknown; radius?: unknown })
    : {};
  const radius = parseGetMapRadius(record.radius);
  if (radius === null) {
    return { status: 'error', error: `radius must be an integer from 0 to ${GET_MAP_RADIUS_MAX}.` };
  }
  const centerH3 = resolveGetMapCenter(record.center, args.coordinateContext, args.resolveToH3);
  const footprint = new Set(args.tacticalBattle.tacticalChildH3Indexes);
  if (!centerH3 || !footprint.has(centerH3)) {
    return { status: 'error', error: 'That cell is not on this battle map.' };
  }
  let disk: string[];
  try {
    disk = gridDisk(centerH3, radius).filter((cell) => footprint.has(cell));
  } catch (err) {
    logError('referenceTools executeGetMap gridDisk failed', err);
    return { status: 'error', error: 'That cell is not on this battle map.' };
  }
  const center = getHexCodeForContext(centerH3, args.coordinateContext);
  if (!center || disk.length === 0) {
    return { status: 'error', error: 'That cell is not on this battle map.' };
  }
  try {
    const map = renderTacticalWindowGridMarkdown({
      state: args.state,
      tacticalBattle: args.tacticalBattle,
      windowCells: disk,
    });
    logDebug('referenceTools executeGetMap', { radius, cellCount: disk.length });
    return { status: 'ok', center, radius, cellCount: disk.length, map };
  } catch (err) {
    logError('referenceTools executeGetMap render failed', err);
    return { status: 'error', error: 'That cell is not on this battle map.' };
  }
}

/**
 * Integer radius in range, or the window default when the argument is omitted.
 *
 * Purpose: The model may leave radius off. Values outside 0 to 8 are rejected.
 * When to use: `executeGetMap`.
 * Expected outcome: A number, or null when the argument is present and illegal.
 * Exceptions: None.
 */
function parseGetMapRadius(value: unknown): number | null {
  if (value === undefined) return TACTICAL_MAP_WINDOW_RADIUS;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > GET_MAP_RADIUS_MAX) return null;
  return value;
}

/**
 * H3 index for a briefing code or a decoded latitude and longitude pair.
 *
 * Purpose: The argument decoder replaces a code with a pair before this tool runs. Direct calls may still pass a code.
 * When to use: `executeGetMap`.
 * Expected outcome: The cell, or null when the code or pair does not resolve.
 * Exceptions: A bad code is logged and returns null.
 */
function resolveGetMapCenter(
  center: unknown,
  context: CoordinateContext,
  resolveToH3: (lat: number, lng: number) => string | undefined
): string | null {
  try {
    if (typeof center === 'string' && HEX_CODE_PATTERN.test(center)) {
      return getH3IndexForCode(center, context) ?? null;
    }
    if (Array.isArray(center) && center.length === 2 && typeof center[0] === 'number' && typeof center[1] === 'number') {
      return resolveToH3(center[0], center[1]) ?? null;
    }
  } catch (err) {
    logError('referenceTools resolveGetMapCenter failed', err);
  }
  return null;
}
