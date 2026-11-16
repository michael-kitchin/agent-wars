import { getGameState } from '../gameDb';
import { hexHasSeaport } from '../movementTerrain';
import { isNativeNavalTransitTerrain } from '../../shared/navalStrategicEdges';
import { seaAccessCheckForHexes } from '../../shared/seaAccess';

/**
 * Lists land seaports on the seeded map by whether they have sea access.
 *
 * Purpose: Sea access tests need one port with and one port without water or coast in or next to the hex.
 * When to use: Inside `withTempGameDb`, after the match is seeded.
 * Expected outcome: `dry` holds every land seaport with no sea access, `wet` every land seaport with it, both in hex order.
 * Exceptions: None.
 */
export function listLandSeaportsBySeaAccess(): { dry: string[]; wet: string[] } {
  const hexes = getGameState().hexes;
  const check = seaAccessCheckForHexes(hexes);
  const dry: string[] = [];
  const wet: string[] = [];
  for (const hex of hexes) {
    if (isNativeNavalTransitTerrain(hex.terrain, hex.terrainKind)) continue;
    if (!hexHasSeaport(hex.h3Index)) continue;
    (check(hex.h3Index) ? wet : dry).push(hex.h3Index);
  }
  return { dry, wet };
}
