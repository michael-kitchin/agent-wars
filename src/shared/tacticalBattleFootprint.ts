/**
 * Playable tactical cells for one battle: the enclosing hex's children plus three neighboring rings.
 *
 * Purpose: Movement, drawing, and briefing codes share one frozen list, while placement and destruction stay on the children.
 * When to use: Snapshot build, city labels, and tooltip codes. Callers already hold the enclosing strategic hex.
 * Expected outcome: The same frozen record for one hex until the active map profile or the loaded footprint changes. A normal hexagon has 607 entries when all six neighboring strategic hexes are on the map. On a regional map's edge, margin cells whose strategic hex is not on the map are left out.
 * Exceptions: Throws the H3 library's error when the enclosing index is not a cell. This module does not log; label painting calls it per cell.
 */

import { gridDisk } from 'h3-js';
import { activeGameMap, registerActiveGameMapReset } from './activeGameMap';
import { indexToCode, sortCellsForStableLlmCodes } from './hexLlmCodeAssignment';
import { strategicH3Resolution, strategicParentOf, tacticalChildrenOf, tacticalH3Resolution } from './h3Resolutions';
import { isOnMap, loadedStrategicFootprintVersion } from './loadedStrategicFootprint';

/**
 * Extra tactical rings around the enclosing hex's own children.
 *
 * Purpose: One battle size for every map profile. The ring count is in tactical steps, so resolution 4 and resolution 6 stay the same shape.
 * When to use: Building the footprint. Do not pass this to placement.
 * Expected outcome: 3.
 * Exceptions: None.
 */
export const TACTICAL_BATTLE_MARGIN_RINGS = 3;

/**
 * Cached cells and codes for one enclosing strategic hex.
 *
 * Purpose: Placement uses `coreChildH3Indexes`. Play, drawing, and codes use `h3Indexes`.
 * When to use: After `tacticalBattleFootprint`.
 * Expected outcome: Frozen arrays and a code map that rejects later writes. The next call for the same hex returns these instances.
 * Exceptions: None.
 */
export type TacticalBattleFootprint = {
  /**
   * Geometric tactical children of the enclosing hex.
   *
   * Purpose: Deployment and infrastructure writes stay on the hex that opened the battle.
   * When to use: Placement ordering and airport, seaport, and rubble gates.
   * Expected outcome: `tacticalChildrenOf` for that hex, frozen.
   * Exceptions: None.
   */
  readonly coreChildH3Indexes: readonly string[];
  /**
   * Core cells plus every tactical cell within three rings, in stable code order.
   *
   * Purpose: Briefing codes, pathfinding, and the map share one sequence.
   * When to use: The battle's playable list.
   * Expected outcome: A frozen array. A normal hexagon has 607 entries when all six neighboring strategic hexes are on the map. On a regional map's edge, margin cells whose strategic hex is not on the map are left out.
   * Exceptions: None.
   */
  readonly h3Indexes: readonly string[];
  /**
   * Two-character code for each footprint cell, in `h3Indexes` order.
   *
   * Purpose: A margin cell keeps one code in the briefing and on the map.
   * When to use: `tacticalBattleHexCode` and the tactical coordinate registry.
   * Expected outcome: `indexToCode` of the cell's place in `h3Indexes`.
   * Exceptions: None.
   */
  readonly codeByH3: ReadonlyMap<string, string>;
};

const footprintByKey = new Map<string, TacticalBattleFootprint>();

/**
 * Drops cached footprints.
 *
 * Purpose: Resolution is part of the key, and a profile change must not keep the previous grid.
 * When to use: Registered when this module loads. Main and the renderer each have their own copy.
 * Expected outcome: The next lookup rebuilds.
 * Exceptions: None.
 */
function resetTacticalBattleFootprintCache(): void {
  footprintByKey.clear();
}

registerActiveGameMapReset(resetTacticalBattleFootprintCache);

/**
 * Returns the code map with write methods that throw.
 *
 * Purpose: Callers receive the cached instance. A later `set` would change codes already shown.
 * When to use: Once, before the record is cached.
 * Expected outcome: `get` still works. `set`, `delete`, and `clear` throw.
 * Exceptions: Those three methods throw `TypeError`.
 */
function frozenCodeMap(entries: Iterable<readonly [string, string]>): ReadonlyMap<string, string> {
  const map = new Map(entries);
  const reject = (): never => {
    throw new TypeError('tactical battle footprint code map is frozen');
  };
  map.set = reject as Map<string, string>['set'];
  map.delete = reject as Map<string, string>['delete'];
  map.clear = reject;
  return map;
}

/**
 * Builds the core, the three-ring footprint, and its codes for one enclosing hex.
 *
 * Purpose: The cache stores this record. Callers must not rebuild the rings themselves.
 * When to use: The first lookup for a cache key.
 * Expected outcome: Frozen arrays. Every core cell is kept. A margin cell is kept only when its strategic parent is on the loaded map. Codes are assigned after that filter, so they stay contiguous.
 * Exceptions: Throws the H3 library's error when `enclosingStrategicH3Index` is not a cell.
 */
function buildTacticalBattleFootprint(enclosingStrategicH3Index: string): TacticalBattleFootprint {
  const coreChildH3Indexes = Object.freeze([...tacticalChildrenOf(enclosingStrategicH3Index)]);
  const coreSet = new Set<string>(coreChildH3Indexes);
  const cells = new Set<string>(coreChildH3Indexes);
  for (const cell of coreChildH3Indexes) {
    for (const near of gridDisk(cell, TACTICAL_BATTLE_MARGIN_RINGS)) {
      if (coreSet.has(near) || isOnMap(strategicParentOf(near))) cells.add(near);
    }
  }
  const h3Indexes = Object.freeze(sortCellsForStableLlmCodes([...cells]));
  const codeByH3 = frozenCodeMap(h3Indexes.map((h3, index) => [h3, indexToCode(index)]));
  return { coreChildH3Indexes, h3Indexes, codeByH3 };
}

/**
 * Returns the cached footprint for one enclosing strategic hex.
 *
 * Purpose: Snapshot build and label painting share the rings and the code order.
 * When to use: When a battle, a tooltip, or the coordinate registry needs the playable cells.
 * Expected outcome: The same frozen record on the next call in this process. A different hex, or a different map resolution, is a different record.
 * Exceptions: Throws the H3 library's error when `enclosingStrategicH3Index` is not a cell.
 */
export function tacticalBattleFootprint(enclosingStrategicH3Index: string): TacticalBattleFootprint {
  const key = `${activeGameMap().id}:${strategicH3Resolution()}:${tacticalH3Resolution()}:${loadedStrategicFootprintVersion()}:${enclosingStrategicH3Index}`;
  const cached = footprintByKey.get(key);
  if (cached) return cached;
  const built = buildTacticalBattleFootprint(enclosingStrategicH3Index);
  footprintByKey.set(key, built);
  return built;
}

/**
 * Returns the briefing code for one cell in an enclosing hex's footprint.
 *
 * Purpose: The renderer builds its own cache. A code filled in the main process is not visible there.
 * When to use: City labels and the battle tooltip. Pass the enclosing hex the battle already holds.
 * Expected outcome: The two-character code, or `undefined` when the cell is not in the footprint.
 * Exceptions: Throws the H3 library's error when the enclosing index is not a cell. Does not log.
 */
export function tacticalBattleHexCode(
  enclosingStrategicH3Index: string,
  tacticalH3Index: string
): string | undefined {
  return tacticalBattleFootprint(enclosingStrategicH3Index).codeByH3.get(tacticalH3Index);
}

/**
 * Chooses the terrain kind a battle cell keeps.
 *
 * Purpose: The kind captured when the battle started stays in force, so a terrain row loaded later cannot turn that cell into water under a unit already standing there. A feature-override row is a change made in this match, so that cell follows the live kind.
 * When to use: Battle painting, the battle-cell tooltip, and the terrain refresh after infrastructure damage.
 * Expected outcome: The live kind when the cell has a feature override and that kind is non-blank. Otherwise the captured kind when it is non-blank. Otherwise the live kind. Undefined when both are blank or missing.
 * Exceptions: None.
 */
export function battleCellTerrainKind(args: {
  readonly frozenKind: string | undefined;
  readonly liveKind: string | undefined;
  readonly cellHasFeatureOverride: boolean;
}): string | undefined {
  const live = args.liveKind?.trim() ?? '';
  if (args.cellHasFeatureOverride && live.length > 0) return live;
  const frozen = args.frozenKind?.trim() ?? '';
  if (frozen.length > 0) return frozen;
  return live.length > 0 ? live : undefined;
}

/**
 * Terrain kind for each playable cell.
 *
 * Purpose: A margin cell keeps its own tactical kind. A missing row uses the geometric parent's kind when that hex is loaded, then the enclosing hex's kind.
 * When to use: Snapshot build, terrain refresh, battle painting, and the battle tooltip. Pass kinds already loaded. This function does not read the database.
 * Expected outcome: One kind per cell. The parent-then-enclosing fallback covers an on-map cell with no tactical row. Off-map cells are left out of the footprint before this function runs.
 * Exceptions: An invalid cell id skips the parent lookup and uses the enclosing kind. Does not log.
 */
export function tacticalBattleTerrainKindByCell(args: {
  cells: readonly string[];
  tacticalKindByH3: ReadonlyMap<string, string>;
  enclosingKind: string;
  loadedStrategicKindByH3: ReadonlyMap<string, string>;
}): Record<string, string> {
  const kinds: Record<string, string> = {};
  for (const cell of args.cells) {
    const tacticalKind = args.tacticalKindByH3.get(cell);
    if (tacticalKind !== undefined && tacticalKind.trim().length > 0) {
      kinds[cell] = tacticalKind;
      continue;
    }
    let parentKind: string | undefined;
    try {
      parentKind = args.loadedStrategicKindByH3.get(strategicParentOf(cell));
    } catch {
      parentKind = undefined;
    }
    kinds[cell] = parentKind !== undefined && parentKind.trim().length > 0 ? parentKind : args.enclosingKind;
  }
  return kinds;
}
