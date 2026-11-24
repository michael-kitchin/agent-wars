/**
 * Where a side may load or unload a ship.
 *
 * Purpose: Reads a hex's terrain, seaports, and control to say whether embarking or manual debarking is legal there.
 * When to use: Stack popup state, slot edits, and commander embark orders.
 * Expected outcome: One answer per hex that every sealift entry point shares.
 * Exceptions: None.
 */
import { readHexEmbarkFacts } from '../hexEmbarkFacts';
import { logTrace } from '../logger';
import { normalizeMovementTerrain } from '../movementTerrain';
import { hexHasSeaAccess } from '../gameDb/seaAccessReads';
import { canEmbarkAtHex, canManualDebarkAtHex } from '../../shared/sealiftEmbarkEligibility';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { isLandSeaportHex } from '../../shared/navalStrategicEdges';
import type { SealiftContextMode } from '../../shared/ipcTypes';

/**
 * Documents the `HexEmbarkContext` interface as a named contract surface (export interface HexEmbarkContext).

 * Purpose: Supports maintainability by documenting why `HexEmbarkContext` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface HexEmbarkContext {
    /**
   * Specifies the contract for the `normalizedMovementTerrain` member (normalizedMovementTerrain: string;).

   * Contract: Describes stable behavior for callers of `normalizedMovementTerrain` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
normalizedMovementTerrain: string;
    /**
   * Native hex terrain bucket before kind normalization.
   *
   * Contract: Must not be seaport-promoted coastal.
   * When to use: Sealift eligibility together with `terrainKind` and `seaportCount`.
   * Expected outcome: Distinguishes land seaports from native coastal.
   * Exceptions: None.
   */
nativeTerrain: string;
    /**
   * Optional pipeline terrain kind.
   *
   * Contract: `coastal` is native coastal embark terrain.
   * When to use: Pass `hexes.terrain_kind`.
   * Expected outcome: Combined with `nativeTerrain` for transit vs land seaport.
   * Exceptions: None.
   */
terrainKind?: string;
    /**
   * Specifies the contract for the `seaportCount` member (seaportCount: number;).

   * Contract: Describes stable behavior for callers of `seaportCount` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
seaportCount: number;
    /**
   * Specifies the contract for the `controllerPlayerId` member (controllerPlayerId: string | null;).

   * Contract: Describes stable behavior for callers of `controllerPlayerId` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
controllerPlayerId: string | null;
}

/**
 * Defines the `getHexEmbarkContext` function shape (function getHexEmbarkContext(h3Index: string): HexEmbarkContext | null).

 * Purpose: Supports maintainability by documenting why `getHexEmbarkContext` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function getHexEmbarkContext(h3Index: string): HexEmbarkContext | null {
  const facts = readHexEmbarkFacts(h3Index);
  if (!facts) return null;
  const normalizedMovementTerrain = normalizeMovementTerrain({
    h3Index,
    terrain: facts.nativeTerrain,
    terrainKind: facts.terrainKind,
  });
  return { normalizedMovementTerrain, ...facts };
}

/**
 * Returns whether the acting player may embark cargo at this hex.
 *
 * Purpose: Shared predicate for stack context mode, slot IPC, and LLM `applyEmbarkOrdersForPlayer`.
 * When to use: Before treating a hex as a valid embark port.
 * Expected outcome: True for native coastal, land seaports with sea access, and water seaports this player controls.
 * Exceptions: False when the hex is missing from `hexes`.
 */
export function canPlayerEmbarkFromHex(h3Index: string, playerId: string): boolean {
  const context = getHexEmbarkContext(h3Index);
  if (!context) return false;
  return canEmbarkAtHex({
    nativeTerrain: context.nativeTerrain,
    terrainKind: context.terrainKind,
    hasSeaport: context.seaportCount > 0,
    hexControlledByPlayer: context.controllerPlayerId === playerId,
    seaAccess: context.seaportCount > 0 && hexHasSeaAccess(h3Index),
  });
}

/**
 * Returns whether a player may manually debark cargo at a hex (stack popup debark button).
 *
 * Purpose: Central debark eligibility for UI and `executeSealiftSlotUpdate`; coastal hexes always allow debark, water seaports allow debark when controlled.
 * When to use: Before enabling debark controls or accepting debark IPC (`landUnitId === null`).
 * Expected outcome: True for coastal stacks and controlled water seaports; false for open ocean.
 * Exceptions: None.
 */
export function canManualDebarkFromHex(h3Index: string, playerId: string): boolean {
  logTrace('sealift canManualDebarkFromHex', { h3Index, playerId });
  const context = getHexEmbarkContext(h3Index);
  if (!context) return false;
  return canManualDebarkAtHex({
    nativeTerrain: context.nativeTerrain,
    terrainKind: context.terrainKind,
    hasSeaport: context.seaportCount > 0,
    hexControlledByPlayer: context.controllerPlayerId === playerId,
  });
}

/**
 * Classifies a hex for the human stack sealift UI.
 *
 * Purpose: Embark dropdowns enable only where the human may embark; water means no valid embark on that hex.
 * When to use: `readSealiftStackState` and tactical stack state that reuses this classifier.
 * Expected outcome: `coastal_port` for native coastal, land seaports with water or coast in or next to the hex, and controlled water seaports; `water` for open ocean and enemy or uncontrolled water seaports; `coastal_no_port` when movement terrain is coastal but embark is not allowed; `port_no_sea_access` for a land seaport with no sea access, where boarding is refused and debark stays allowed; `unsupported` when the hex is missing or inland without a seaport.
 * Exceptions: None.
 */
export function getSealiftStackContextModeForHex(h3Index: string): SealiftContextMode {
  logTrace('sealift getSealiftStackContextModeForHex', { h3Index });
  const context = getHexEmbarkContext(h3Index);
  if (!context) return 'unsupported';
  if (canPlayerEmbarkFromHex(h3Index, HUMAN_SEAT_ID)) return 'coastal_port';
  if (context.normalizedMovementTerrain === 'water') return 'water';
  if (context.normalizedMovementTerrain === 'coastal') return 'coastal_no_port';
  const landSeaport = isLandSeaportHex({
    nativeTerrain: context.nativeTerrain,
    terrainKind: context.terrainKind,
    hasSeaport: context.seaportCount > 0,
  });
  if (landSeaport) return 'port_no_sea_access';
  return 'unsupported';
}
