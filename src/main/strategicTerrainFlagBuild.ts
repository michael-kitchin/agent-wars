import type { ClassifierThresholds, HexMetadataRecordTactical } from './terrainMetadataLoad';
import type { PipelineTerrainKind } from '../shared/pipelineTerrain';
import { classifyTacticalTerrainKind, tacticalCellPassesMountainTest } from './terrainClassifierFromMetadata';
import { strategicFlagsFromCounts } from '../shared/strategicTerrainFlags';
import { strategicParentOf } from '../shared/h3Resolutions';

/**
 * Counts that decide one strategic hex's stop and cover flags.
 *
 * Purpose: The pack walk accumulates land, mountain-test, and arctic cells before applying the half rule.
 * When to use: Inside `buildStrategicTerrainFlagSets` only.
 * Expected outcome: Zero until a non-water tactical cell is seen.
 * Exceptions: None.
 */
interface CellCounts {
  /**
   * Tactical cells in the hex that are not water.
   *
   * Contract: The denominator of the half-cell test.
   * When to use: After the pack walk, before `strategicFlagsFromCounts`.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  land: number;
  /**
   * Land cells that pass the mountain test.
   *
   * Contract: Forest and arctic labels do not remove a cell from this count.
   * When to use: The rugged half of `strategicFlagsFromCounts`.
   * Expected outcome: A non-negative integer no larger than `land`.
   * Exceptions: None.
   */
  rugged: number;
  /**
   * Land cells whose kind is arctic.
   *
   * Contract: Water, wetlands, and coastal cells are not included.
   * When to use: The arctic half of `strategicFlagsFromCounts`.
   * Expected outcome: A non-negative integer no larger than `land`.
   * Exceptions: None.
   */
  arctic: number;
}

/**
 * Builds the rugged, arctic, and city sets for the loaded pack.
 *
 * Purpose: Classification owns the cell walk. Pathfinding only reads the resulting sets.
 * When to use: Once, at the end of building the terrain classification snapshot.
 * Expected outcome: A hex is rugged or arctic when at least half its land cells qualify. A hex is a city when its urban count is at least 86.
 * Exceptions: None. Water cells are not land. A forested cell that passes the mountain test still counts as rugged.
 */
export function buildStrategicTerrainFlagSets(input: {
  records: readonly HexMetadataRecordTactical[];
  thresholds: ClassifierThresholds;
  nodataFallback: PipelineTerrainKind;
  urbanHexCountByStrategicH3: ReadonlyMap<string, number>;
}): { rugged: string[]; arctic: string[]; city: string[] } {
  const counts = new Map<string, CellCounts>();
  for (const row of input.records) {
    const kind = classifyTacticalTerrainKind(row, input.thresholds, input.nodataFallback);
    if (kind === 'water') continue;
    const parent = strategicParentOf(row.h3_index);
    const current = counts.get(parent) ?? { land: 0, rugged: 0, arctic: 0 };
    current.land += 1;
    if (tacticalCellPassesMountainTest(row, input.thresholds)) current.rugged += 1;
    if (kind === 'arctic') current.arctic += 1;
    counts.set(parent, current);
  }
  const rugged: string[] = [];
  const arctic: string[] = [];
  const city: string[] = [];
  const parents = new Set<string>([...counts.keys(), ...input.urbanHexCountByStrategicH3.keys()]);
  for (const parent of parents) {
    const cell = counts.get(parent) ?? { land: 0, rugged: 0, arctic: 0 };
    const flags = strategicFlagsFromCounts(
      cell.land,
      cell.rugged,
      cell.arctic,
      input.urbanHexCountByStrategicH3.get(parent) ?? 0
    );
    if (flags.rugged) rugged.push(parent);
    if (flags.arctic) arctic.push(parent);
    if (flags.city) city.push(parent);
  }
  return { rugged, arctic, city };
}
