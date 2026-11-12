/**
 * @file briefingDistanceCaveat.ts
 * Distance-caveat sentences for the cached system prompt.
 *
 * Purpose: These sentences depend on fog settings, not on the current turn, so the briefing no longer repeats them.
 * When to use: When building the Reading the Briefing section.
 * Expected outcome: The same sentences the briefing used to print, in the same order, or an empty list.
 * Exceptions: None.
 */

import type { GameStateSnapshot } from '../gameDb';
import {
  FOG_PATH_DISTANCE_BRIEFING_LINE,
  OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE,
  usesFogPathDistanceBriefing,
  usesOmniscientGridProximity,
} from '../tools/assessUnitProximity';
import { buildIntelStalenessRule } from '../openRouter/promptSpec/gameRuleText';
import { logTrace } from '../logger';

/**
 * Returns the omniscient grid-proximity sentence when that distance mode is on.
 *
 * Purpose: The sentence explains grid proximity and belongs with the other distance caveats.
 * When to use: From `briefingDistanceCaveatLines` only.
 * Expected outcome: The shared sentence, or ''.
 * Exceptions: None.
 */
function omniscientGridProximityLine(state: GameStateSnapshot): string {
  const h3Index = state.hexes[0]?.h3Index;
  logTrace('briefingDistanceCaveat omniscientGridProximityLine', {
    turnNumber: state.turnNumber,
    h3Index: h3Index ?? null,
  });
  if (!h3Index) return '';
  return usesOmniscientGridProximity({ fogOfWarEnabled: state.fogOfWarEnabled, h3Index })
    ? OMNISCIENT_GRID_PROXIMITY_BRIEFING_LINE
    : '';
}

/**
 * Returns the turn-invariant distance and intel-age sentences for one state.
 *
 * Purpose: The system prompt prints these once; the briefing must not repeat them.
 * When to use: When the briefing is precomputed and a distance caveat applies.
 * Expected outcome: The grid-proximity line, or the staleness rule and then the fog-path line. An empty list when neither applies.
 * Exceptions: None.
 */
export function briefingDistanceCaveatLines(state: GameStateSnapshot): string[] {
  const h3Index = state.hexes[0]?.h3Index;
  const gridLine = omniscientGridProximityLine(state);
  const lines = gridLine.length > 0
    ? [gridLine]
    : [
        state.fogOfWarEnabled === true ? buildIntelStalenessRule() : '',
        h3Index && usesFogPathDistanceBriefing({ fogOfWarEnabled: state.fogOfWarEnabled, h3Index })
          ? FOG_PATH_DISTANCE_BRIEFING_LINE
          : '',
      ].filter((line) => line.length > 0);
  logTrace('briefingDistanceCaveat briefingDistanceCaveatLines', { turnNumber: state.turnNumber, lineCount: lines.length });
  return lines;
}
