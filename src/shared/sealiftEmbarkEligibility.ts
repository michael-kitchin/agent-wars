/**
 * Shared embark/debark eligibility that treats land seaports like coastal occupancy, not water-port control.
 *
 * Purpose: Strategic sealift and tactical opponent embark share one rule after seaport-to-coastal promotion is removed.
 * When to use: Occupied stacks deciding whether cargo may board or leave a naval unit.
 * Expected outcome: Native coastal and land seaports always allow; water seaports still require hex control.
 * Exceptions: None; callers supply already-resolved seaport and control flags.
 */

import { isLandSeaportHex, isNativeNavalTransitTerrain } from './navalStrategicEdges';

/**
 * Terrain and ownership flags needed to decide sealift at one hex.
 *
 * Purpose: Keeps eligibility free of DB row types.
 * When to use: Pass native hex terrain (never seaport-promoted coastal), seaport presence, and whether the acting player controls the hex.
 * Expected outcome: `hasSeaport` is a boolean already resolved by the caller.
 * Exceptions: None.
 */
export interface SealiftHexEligibilityAttrs {
  /**
   * Native passability / terrain bucket.
   *
   * Contract: Must not be rewritten to coastal solely because a seaport exists.
   * When to use: From `hexes.terrain`.
   * Expected outcome: Combined with `terrainKind` for transit vs land-seaport classification.
   * Exceptions: Unknown strings are treated as inland land.
   */
  nativeTerrain: string;
  /**
   * Optional pipeline kind.
   *
   * Contract: `coastal` is native coastal even when `nativeTerrain` is not `water`.
   * When to use: Pass `hexes.terrainKind` when present.
   * Expected outcome: Preserves coastline embark without a seaport.
   * Exceptions: None.
   */
  terrainKind?: string;
  /**
   * Whether the hex has at least one intact seaport.
   *
   * Contract: True when `seaportCount > 0`.
   * When to use: Always set.
   * Expected outcome: Distinguishes land seaports from seaport-less inland land.
   * Exceptions: None.
   */
  hasSeaport: boolean;
  /**
   * Whether the acting player currently controls the hex.
   *
   * Contract: Used only for water seaports.
   * When to use: Pass `controller_player_id === actingPlayer`.
   * Expected outcome: Ignored for native coastal and land seaports.
   * Exceptions: None.
   */
  hexControlledByPlayer: boolean;
}

/**
 * Returns whether cargo may embark at this hex for the acting player.
 *
 * Purpose: Coastal and occupied land seaports do not require a control check; water seaports do.
 * When to use: Strategic `canPlayerEmbarkFromHex` and tactical opponent embark validation.
 * Expected outcome: True for native coastal, land seaports, and controlled water seaports.
 * Exceptions: None.
 */
export function canEmbarkAtHex(attrs: SealiftHexEligibilityAttrs): boolean {
  if (attrs.nativeTerrain === 'coastal' || attrs.terrainKind === 'coastal') return true;
  if (isLandSeaportHex({ nativeTerrain: attrs.nativeTerrain, terrainKind: attrs.terrainKind, hasSeaport: attrs.hasSeaport })) {
    return true;
  }
  if (isNativeNavalTransitTerrain(attrs.nativeTerrain, attrs.terrainKind) && attrs.hasSeaport) {
    return attrs.hexControlledByPlayer;
  }
  return false;
}

/**
 * Returns whether cargo may manually debark at this hex for the acting player.
 *
 * Purpose: Land seaports match coastal (always); wetlands keep their existing always-debark rule; water seaports need control.
 * When to use: Stack-popup debark and `canManualDebarkFromHex`.
 * Expected outcome: True for coastal, wetlands, land seaports, and controlled water seaports.
 * Exceptions: None.
 */
export function canManualDebarkAtHex(attrs: SealiftHexEligibilityAttrs): boolean {
  if (attrs.nativeTerrain === 'coastal' || attrs.terrainKind === 'coastal') return true;
  if (attrs.nativeTerrain === 'wetlands' || attrs.terrainKind === 'wetlands') return true;
  if (isLandSeaportHex({ nativeTerrain: attrs.nativeTerrain, terrainKind: attrs.terrainKind, hasSeaport: attrs.hasSeaport })) {
    return true;
  }
  if (attrs.nativeTerrain === 'water' && attrs.hasSeaport) return attrs.hexControlledByPlayer;
  return canEmbarkAtHex(attrs);
}
