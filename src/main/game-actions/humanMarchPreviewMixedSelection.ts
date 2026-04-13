/**
 * Shared predicates for mixed land + naval selections and dual-domain (land + water) hex passability.
 *
 * Purpose: Single source of truth for march preview and order validation when a selection mixes land units with naval
 * and when a hovered/destination hex must support both domains (e.g. coastal / littoral behavior).
 * When to use: From `humanMarchPreview` hover preview and `gameActions` march validation paths that share the same rules.
 * Expected outcome: Consistent mixed-stack and mixed-terrain decisions across preview and commit validation.
 * Exceptions: None; callers supply hex terrain fields from the same snapshot sources they already use.
 */

import { normalizeMovementTerrain } from '../movementTerrain';
import { terrainIsPassableForDomain } from '../pathfinding';
import { logTrace } from '../logger';

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
 * Hex terrain fields sufficient to compute normalized passability for mixed-domain checks.
 *
 * Purpose: Aligns with snapshot hex rows passed into preview and validation without requiring a DB round-trip here.
 * When to use: For a single candidate hex (hovered cell or march destination).
 * Expected outcome: `terrainKind` participates in normalization the same way as `movementTerrain.normalizeMovementTerrain`.
 * Exceptions: None.
 */
export type MixedLandNavalTerrainHex = { h3Index: string; terrain: string; terrainKind?: string };

/**
 * Returns whether the selection contains both naval units and land combat units (infantry or armor).
 *
 * Purpose: Drives shared invalid/reason paths when land and naval cannot share the same destination rules.
 * When to use: After resolving selected units for the current player in preview or order validation.
 * Expected outcome: `true` only when both domains are represented in the selection.
 * Exceptions: None.
 */
export function selectionHasMixedLandAndNaval(units: ReadonlyArray<MixedLandNavalSelectionUnit>): boolean {
  logTrace('humanMarchPreviewMixedSelection selectionHasMixedLandAndNaval', { unitCount: units.length });
  const hasNaval = units.some((unit) => unit.unitType === 'naval');
  const hasLand = units.some((unit) => unit.unitType === 'infantry' || unit.unitType === 'armor');
  return hasNaval && hasLand;
}

/**
 * Returns whether normalized passability for the hex allows both land and water movement domains.
 *
 * Purpose: Detects hexes where a mixed land + naval stack could meaningfully apply shared destination rules.
 * When to use: With the same hex terrain snapshot used for pathfinding passability in the caller.
 * Expected outcome: `true` when `terrainIsPassableForDomain` succeeds for both `land` and `water` on normalized terrain.
 * Exceptions: None.
 */
export function hexSupportsMixedLandAndNaval(hex: MixedLandNavalTerrainHex): boolean {
  logTrace('humanMarchPreviewMixedSelection hexSupportsMixedLandAndNaval', { h3Index: hex.h3Index });
  const passabilityTerrain = normalizeMovementTerrain({
    h3Index: hex.h3Index,
    terrain: hex.terrain,
    terrainKind: hex.terrainKind,
  });
  return (
    terrainIsPassableForDomain(passabilityTerrain, 'land') && terrainIsPassableForDomain(passabilityTerrain, 'water')
  );
}
