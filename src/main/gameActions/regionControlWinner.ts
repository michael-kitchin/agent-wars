/**
 * End-of-turn region-vs-region win evaluation.
 *
 * Victory paths: (1) control of the enemy home, which is every enemy home hex on the global map and at least 75% of that home's generated urban cells on a regional map, or (2) elimination of all current tactical urban cells across the enemy home while your home still has at least one. A home with no generated urban cells falls back to every hex. Strategic unit elimination alone is not evaluated here.
 */

import { activeGameMap } from '../../shared/activeGameMap';
import {
  dbGetOne,
  getHexControlMap,
  getScenarioHomeRegionHexes,
  sumUrbanHexCountForHexes,
} from '../gameDb';
import { loadScenarioState, REGION_VS_REGION_SCENARIO_ID } from '../gameDb/scenarioState';
import { logDebug, logError, logTrace } from '../logger';
import { getStrategicProductionContext, isTerrainClassificationCacheLoaded } from '../terrainClassificationCache';
import { computeHomeControlProgress, type HomeControlProgress } from './homeControlProgress';

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
 * The share the control rule will actually apply, or null for every hex.
 *
 * Purpose: A regional map whose classification cache is not loaded must not throw while counting baseline urban cells.
 * When to use: The winner and the prompt helper, so they cannot disagree.
 * Expected outcome: The profile share when it is a number and the cache is loaded. Otherwise null.
 * Exceptions: None.
 */
function effectiveControlWinMinUrbanShare(): number | null {
  const share = activeGameMap().controlWinMinUrbanShare;
  if (typeof share === 'number' && !isTerrainClassificationCacheLoaded()) {
    logError(
      'regionControlWinner: classification cache is not loaded; control win uses every hex',
      new Error('terrain classification cache is not loaded')
    );
    return null;
  }
  return share;
}

/**
 * Progress for both sides against each other's homes.
 *
 * Purpose: The winner's exclusivity check and the prompt read the same two results.
 * When to use: After both home lists are known.
 * Expected outcome: Human progress is against the AI home. Opponent progress is against the human home. The share is the one that was applied.
 * Exceptions: The baseline lookup can throw when the cache is loaded but a hex is missing.
 */
function bothHomeControlProgress(
  humanHomeHexes: readonly string[],
  aiHomeHexes: readonly string[]
): { human: HomeControlProgress; opponent: HomeControlProgress; effectiveShare: number | null } {
  const effectiveShare = effectiveControlWinMinUrbanShare();
  const controlByHex = getHexControlMap();
  const baselineUrbanCellsForHex = (h3Index: string): number =>
    effectiveShare === null && !isTerrainClassificationCacheLoaded()
      ? 0
      : getStrategicProductionContext({ h3Index }).urbanHexCount;
  return {
    human: computeHomeControlProgress({
      homeHexes: aiHomeHexes,
      controller: 'human',
      controlByHex,
      baselineUrbanCellsForHex,
      minUrbanShare: effectiveShare,
    }),
    opponent: computeHomeControlProgress({
      homeHexes: humanHomeHexes,
      controller: 'opponent',
      controlByHex,
      baselineUrbanCellsForHex,
      minUrbanShare: effectiveShare,
    }),
    effectiveShare,
  };
}

/**
 * Determines whether either side wins the region-vs-region scenario at end of turn (control or urban elimination).
 *
 * Purpose: Keeps scenario-specific win logic out of melee finalize while remaining callable from ready.
 * When to use: After combat and production when all control flips and infrastructure updates are applied for the turn.
 * Expected outcome: Returns `human` / `opponent` when that side alone meets the control rule, else when one side’s enemy-home urban sum is zero while the other’s home still has urban; `null` when neither applies.
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
  const progress = bothHomeControlProgress(humanRegionHexes, aiRegionHexes);
  const humanControlsAiRegion = progress.human.controlWinMet;
  const aiControlsHumanRegion = progress.opponent.controlWinMet;
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
    controlWinMinUrbanShare: progress.effectiveShare,
    humanProgress: progress.human,
    opponentProgress: progress.opponent,
    totalUrbanAiHome,
    totalUrbanHumanHome,
    urbanWinner,
    winner,
    enemyHomeHexCount: aiRegionHexes.length,
    humanHomeHexCount: humanRegionHexes.length,
  });
  return winner;
}

/**
 * Progress the strategic prompt can print for a regional control win.
 *
 * Purpose: The prompt uses the same share the winner applied, and stays on the every-hex wording when that share is null.
 * When to use: While building the strategic system prompt.
 * Expected outcome: Null when the scenario is not region-versus-region or the effective share is null. Otherwise both progress values and the share.
 * Exceptions: None. A lookup failure is the caller's to catch.
 */
export function getRegionHomeControlProgressForPrompt(): {
  ai: HomeControlProgress;
  human: HomeControlProgress;
  controlWinMinUrbanShare: number;
} | null {
  logTrace('getRegionHomeControlProgressForPrompt');
  const scenario = loadScenarioState({ getOne: dbGetOne });
  if (scenario.scenarioId !== REGION_VS_REGION_SCENARIO_ID) return null;
  const humanRegionHexes = getScenarioHomeRegionHexes(scenario.humanHomeRegion);
  const aiRegionHexes = getScenarioHomeRegionHexes(scenario.aiHomeRegion);
  const progress = bothHomeControlProgress(humanRegionHexes, aiRegionHexes);
  if (progress.effectiveShare === null) return null;
  return {
    ai: progress.opponent,
    human: progress.human,
    controlWinMinUrbanShare: progress.effectiveShare,
  };
}
