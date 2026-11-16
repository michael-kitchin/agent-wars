/**
 * The sea access rule: a ship needs water or coast in or next to the hex it is built or boarded at.
 *
 * Purpose: One pure rule shared by the engine, the commanders' prompts, and the renderer.
 * When to use: Wherever a naval build, a naval mercenary raise, or boarding at a land seaport is judged.
 * Expected outcome: A boolean that never changes during a match, because terrain is fixed.
 * Exceptions: None.
 */

import { gridDisk } from 'h3-js';
import { isNativeNavalTransitTerrain } from './navalStrategicEdges';

/**
 * Native terrain of one hex, as the sea access rule reads it.
 *
 * Purpose: Names the two fields the rule needs so callers do not pass whole hex rows.
 * When to use: As the return type of a `SeaAccessTerrainLookup`.
 * Expected outcome: `terrain` is the stored `hexes.terrain`, never seaport-promoted.
 * Exceptions: None.
 */
export interface SeaAccessTerrain {
  /**
   * Native terrain of the hex.
   *
   * Contract: The stored `hexes.terrain` value, never promoted by a seaport.
   * When to use: Read by `hasSeaAccess` through `isNativeNavalTransitTerrain`.
   * Expected outcome: `water` and `coastal` count as transit.
   * Exceptions: None.
   */
  readonly terrain: string;
  /**
   * Terrain kind of the hex, when known.
   *
   * Contract: `coastal` also counts as transit.
   * When to use: Pass it whenever the source row carries it.
   * Expected outcome: Absent means the kind is unknown and ignored.
   * Exceptions: None.
   */
  readonly terrainKind?: string;
}

/**
 * Looks up the native terrain of a hex by id.
 *
 * Purpose: Lets the rule run over a database read, a snapshot, or a test fixture.
 * When to use: As the second argument of `hasSeaAccess`.
 * Expected outcome: The terrain, or undefined for a hex the source does not know (treated as land).
 * Exceptions: None.
 */
export type SeaAccessTerrainLookup = (h3Index: string) => SeaAccessTerrain | undefined;

/**
 * Answers whether one hex has sea access.
 *
 * Purpose: Lets build, hire, and prompt code take the answer as an injectable parameter.
 * When to use: As the type of a `seaAccessOf` parameter.
 * Expected outcome: True when `hasSeaAccess` is true for the hex.
 * Exceptions: None.
 */
export type SeaAccessCheck = (h3Index: string) => boolean;

/**
 * Tells whether the hex, or a hex next to it, is water or coast.
 *
 * Purpose: Ships cannot be built or boarded at a seaport they cannot sail out of.
 * When to use: With a lookup of true native terrain; never with a viewer's fog-masked terrain.
 * Expected outcome: True when h3Index or a cell of `gridDisk(h3Index, 1)` is transit terrain. A cell the lookup does not know is land.
 * Exceptions: None. A `gridDisk` failure returns false.
 */
export function hasSeaAccess(h3Index: string, terrainOf: SeaAccessTerrainLookup): boolean {
  let disk: string[];
  try {
    disk = gridDisk(h3Index, 1);
  } catch {
    return false;
  }
  return disk.some((cell) => {
    const found = terrainOf(cell);
    return found !== undefined && isNativeNavalTransitTerrain(found.terrain, found.terrainKind);
  });
}

/**
 * Builds a sea access check over a list of hexes.
 *
 * Purpose: Gives the renderer and tests a `SeaAccessCheck` without a database.
 * When to use: Renderer code and tests only. Main-process code uses `hexHasSeaAccess`, because a commander's snapshot can mask terrain.
 * Expected outcome: A function that answers from one Map built once over the list.
 * Exceptions: None.
 */
export function seaAccessCheckForHexes(
  hexes: readonly { readonly h3Index: string; readonly terrain: string; readonly terrainKind?: string }[]
): SeaAccessCheck {
  const byId = new Map<string, SeaAccessTerrain>();
  for (const hex of hexes) byId.set(hex.h3Index, { terrain: hex.terrain, terrainKind: hex.terrainKind });
  return (h3Index) => hasSeaAccess(h3Index, (h) => byId.get(h));
}

/**
 * Reason shown when a naval item is refused for lack of sea access.
 *
 * Purpose: One sentence for the build queue functions and the commanders' tool.
 * When to use: As the failure text of a refused naval queue change.
 * Expected outcome: The exact sentence below.
 * Exceptions: None.
 */
export const NAVAL_NO_SEA_ACCESS_REASON =
  'Ships cannot be built here: this seaport has no water or coast next to it.';

/**
 * Tooltip label for a seaport with no sea access.
 *
 * Purpose: Tells the player why a port builds no ships.
 * When to use: In the hex tooltip's Features line instead of `Seaports`.
 * Expected outcome: The exact label below.
 * Exceptions: None.
 */
export const SEAPORT_NO_SEA_ACCESS_LABEL = 'Seaports (no sea access)';

/**
 * Wording of the sea access requirement inside rule text.
 *
 * Purpose: One phrase for the commanders' naval cost line.
 * When to use: Appended to the naval requirement list in the rules line.
 * Expected outcome: The exact phrase below.
 * Exceptions: None.
 */
export const NAVAL_SEA_ACCESS_RULE_PART = 'water or coast in or next to the hex';
