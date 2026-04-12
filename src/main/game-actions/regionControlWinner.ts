/**
 * End-of-turn region-control win evaluation for the region-vs-region scenario.
 */

import { dbGetOne, listAllHexControls, getScenarioHomeRegionHexes } from '../gameDb';
import { loadScenarioState, REGION_VS_REGION_SCENARIO_ID } from '../game-db/scenarioState';
import { logTrace } from '../logger';

/**
 * Determines whether either side has captured the opponent's home region this turn.
 *
 * Purpose: Keeps scenario-specific win logic out of melee finalize while remaining callable from ready.
 * When to use: After combat and production when all control flips are applied for the turn.
 * Expected outcome: Returns a winner id when a full home-region capture is satisfied, else null.
 * Exceptions: None.
 */
export function evaluateRegionControlWinnerAtEndOfTurn(): 'human' | 'opponent' | null {
  logTrace('evaluateRegionControlWinnerAtEndOfTurn');
  const scenario = loadScenarioState({ getOne: dbGetOne });
  if (scenario.scenarioId !== REGION_VS_REGION_SCENARIO_ID) return null;
  const humanHomeRegion = scenario.humanHomeRegion;
  const aiHomeRegion = scenario.aiHomeRegion;
  const humanRegionHexes = getScenarioHomeRegionHexes(humanHomeRegion);
  const aiRegionHexes = getScenarioHomeRegionHexes(aiHomeRegion);
  if (humanRegionHexes.length <= 0 || aiRegionHexes.length <= 0) return null;
  const controlByHex = new Map(listAllHexControls().map((row) => [row.h3Index, row.controllerPlayerId]));
  const humanControlsAiRegion = aiRegionHexes.every((h3Index) => controlByHex.get(h3Index) === 'human');
  const aiControlsHumanRegion = humanRegionHexes.every((h3Index) => controlByHex.get(h3Index) === 'opponent');
  if (humanControlsAiRegion && !aiControlsHumanRegion) return 'human';
  if (aiControlsHumanRegion && !humanControlsAiRegion) return 'opponent';
  return null;
}
