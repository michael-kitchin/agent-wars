/**
 * Shared predicates for mixed land + naval selections and dual-domain hex occupancy.
 *
 * Purpose: Single source of truth for march preview and order validation when a selection mixes land units with naval
 * and when a hovered/destination hex must support both domains (native coastal or land seaport berth).
 * When to use: From `humanMarchPreview` hover preview and `gameActions` march validation paths that share the same rules.
 * Expected outcome: Consistent mixed-stack and mixed-terrain decisions across preview and commit validation.
 * Exceptions: None; callers supply hex terrain fields from the same snapshot sources they already use.
 */

import { terrainIsPassableForDomain } from '../pathfinding';
import { logTrace } from '../logger';
import { selectionHasMixedLandAndNaval as selectionHasMixedLandAndNavalCore } from '../../shared/humanMarchPreviewGroupAssembly';
import { isLandSeaportHex, isNativeNavalTransitTerrain } from '../../shared/navalStrategicEdges';

/**
 * Minimal unit shape for detecting a land + naval selection mix.
 *
 * Purpose: Avoid coupling this helper to full unit / DB row types while still reading `unitType`.
 * When to use: Pass the same unit list the preview or validator already has in memory.
 * Expected outcome: `true` only when at least one naval unit and at least one infantry or armor unit are present.
 * Exceptions: None.
 */
export type MixedLandNavalSelectionUnit = { unitType: string };

/**
 * Hex terrain fields sufficient to decide mixed land+naval occupancy.
 *
 * Purpose: Aligns with snapshot hex rows; `hasSeaport` is injected so tests stay database-free.
 * When to use: For a single candidate hex (hovered cell or march destination).
 * Expected outcome: Native coastal or land seaport returns true; omit `hasSeaport` (or false) for seaport-less land.
 * Exceptions: None.
 */
export type MixedLandNavalTerrainHex = {
  h3Index: string;
  terrain: string;
  terrainKind?: string;
  hasSeaport?: boolean;
};

/**
 * Returns whether the selection contains both naval units and land combat units (infantry or armor).
 *
 * Purpose: Drives shared invalid/reason paths when land and naval cannot share the same destination rules.
 * When to use: After resolving selected units for the current player in preview or order validation.
 * Expected outcome: `true` only when both domains are represented in the selection.
 * Exceptions: None.
 */
export function selectionHasMixedLandAndNaval(
  units: ReadonlyArray<{ unitType: string }>
): boolean {
  logTrace('humanMarchPreviewMixedSelection selectionHasMixedLandAndNaval', { unitCount: units.length });
  return selectionHasMixedLandAndNavalCore(units);
}

/**
 * Returns whether a hex can host a mixed land + naval stack (native coastal or land seaport).
 *
 * Purpose: Mixed orders are legal only where land units can occupy and naval units can berth or sail.
 * When to use: With the same hex terrain snapshot used for pathfinding in the caller; pass `hasSeaport` from infra.
 * Expected outcome: True for native coastal and for land seaports; false for pure water and seaport-less inland land.
 * Exceptions: None.
 */
export function hexSupportsMixedLandAndNaval(hex: MixedLandNavalTerrainHex): boolean {
  logTrace('humanMarchPreviewMixedSelection hexSupportsMixedLandAndNaval', { h3Index: hex.h3Index });
  const hasSeaport = hex.hasSeaport === true;
  if (isLandSeaportHex({ nativeTerrain: hex.terrain, terrainKind: hex.terrainKind, hasSeaport })) {
    return true;
  }
  const nativeCoastal =
    isNativeNavalTransitTerrain(hex.terrain, hex.terrainKind) &&
    terrainIsPassableForDomain(hex.terrainKind === 'coastal' ? 'coastal' : hex.terrain, 'land') &&
    terrainIsPassableForDomain(hex.terrainKind === 'coastal' ? 'coastal' : hex.terrain, 'water');
  return nativeCoastal;
}
