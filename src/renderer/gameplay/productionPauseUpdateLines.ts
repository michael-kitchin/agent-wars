/**
 * The Updates line for production that paused because the seat was not standing there.
 *
 * Purpose: The turn report names those hexes with the same place lookup as fortification pauses.
 * When to use: Strategic Ready, beside the fortification pause lines.
 * Expected outcome: One sentence when any hex paused, otherwise an empty list.
 * Exceptions: A rejected caption lookup is logged by `placeNamesForHexes` and becomes the unnamed place.
 */

import { formatBuildPausedLine } from '../../shared/productionBuildability';
import type { ReadyResult } from '../../shared/ipcTypes';
import { placeNamesForHexes } from './fortificationUpdateLines';

/**
 * Names each paused hex and formats the Updates sentence.
 *
 * Purpose: The toast builder receives a finished sentence.
 * When to use: `announceResolutionTurnUpdate`.
 * Expected outcome: One `formatBuildPausedLine` sentence, or no lines when nothing paused.
 * Exceptions: A rejected caption lookup is logged and uses the unnamed place.
 */
export async function productionPauseUpdateLinesFor(readySlice: ReadyResult): Promise<string[]> {
  const hexes = readySlice.humanBuildPausedHexes ?? [];
  if (hexes.length === 0) return [];
  return [formatBuildPausedLine(await placeNamesForHexes(hexes))];
}
