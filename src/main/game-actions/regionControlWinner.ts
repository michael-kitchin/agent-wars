/**
 * End-of-turn region-vs-region win evaluation.
 *
 * Victory paths: (1) full enemy home-region res1 hex control, or (2) elimination of all res4 urban cells
 * aggregated across the enemy home region (`urbanHexCount` sums to zero there) while your home region still has at least one urban cell.
 * Strategic unit elimination alone is not evaluated here (see `meleeInterceptReadyFinalize`).
 */

import {
  dbGetOne,
  getHexControlMap,
  getScenarioHomeRegionHexes,
  sumUrbanHexCountForHexes,
} from '../gameDb';
import { loadScenarioState, REGION_VS_REGION_SCENARIO_ID } from '../game-db/scenarioState';
import { logDebug, logTrace } from '../logger';

/**
 * Chooses the urban-elimination winner from summed urban counts on each side’s home region.
 *
 * Purpose: Encodes mutual-zero (“scorched earth”) as no urban-only winner so play continues until control shifts or urban returns.
 * When to use: Only after control-based wins are ruled out and `totalUrbanAiHome` / `totalUrbanHumanHome` are known.
 * Expected outcome: `human` when AI home has zero urban and human home still has urban; `opponent` symmetrically; `null` when both zero or neither side qualifies.
 * Exceptions: None.
 */
function pickUrbanEliminationWinner(
  totalUrbanAiHome: number,
  totalUrbanHumanHome: number
): 'human' | 'opponent' | null {
  if (totalUrbanAiHome === 0 && totalUrbanHumanHome > 0) return 'human';
  if (totalUrbanHumanHome === 0 && totalUrbanAiHome > 0) return 'opponent';
  return null;
}

/**
 * Determines whether either side wins the region-vs-region scenario at end of turn (control or urban elimination).
 *
 * Purpose: Keeps scenario-specific win logic out of melee finalize while remaining callable from ready.
 * When to use: After combat and production when all control flips and infrastructure updates are applied for the turn.
 * Expected outcome: Returns `human` / `opponent` when exclusive full home-region control applies, else when one side’s enemy-home urban sum is zero while the other’s home still has urban; `null` when neither applies (including mutual urban-zero without a control winner).
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
  const controlByHex = getHexControlMap();
  const humanControlsAiRegion = aiRegionHexes.every((h3Index) => controlByHex.get(h3Index) === 'human');
  const aiControlsHumanRegion = humanRegionHexes.every((h3Index) => controlByHex.get(h3Index) === 'opponent');
  const controlWinner =
    humanControlsAiRegion && !aiControlsHumanRegion
      ? 'human'
      : aiControlsHumanRegion && !humanControlsAiRegion
        ? 'opponent'
        : null;
  const totalUrbanAiHome = sumUrbanHexCountForHexes(aiRegionHexes);
  const totalUrbanHumanHome = sumUrbanHexCountForHexes(humanRegionHexes);
  const urbanWinner = pickUrbanEliminationWinner(totalUrbanAiHome, totalUrbanHumanHome);
  const winner = controlWinner ?? urbanWinner;
  logDebug('evaluateRegionControlWinnerAtEndOfTurn', {
    humanControlsAllEnemyHomeHexes: humanControlsAiRegion,
    opponentControlsAllHumanHomeHexes: aiControlsHumanRegion,
    controlWinner,
    totalUrbanAiHome,
    totalUrbanHumanHome,
    urbanWinner,
    winner,
    enemyHomeHexCount: aiRegionHexes.length,
    humanHomeHexCount: humanRegionHexes.length,
  });
  return winner;
}
