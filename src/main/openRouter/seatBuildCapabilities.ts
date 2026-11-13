/**
 * Whether a seat can still queue a naval unit or a missile.
 *
 * Purpose: Rule and tool text must print before the seat owns the type, and must stop once the cap or the map says it cannot be built.
 * When to use: Once per strategic consult, from the assembler, before coaching and combat-rule gates are built.
 * Expected outcome: Both flags false when no controlled hex can queue that type, or when that type is already at its cap.
 * Exceptions: None. A missing infrastructure row counts as no urban cells, seaports, or airports.
 */

import { isNeutralBorderHex } from '../../shared/h3Resolutions';
import { parseGameSize } from '../../shared/gameSize';
import type { GameStateSnapshot } from '../gameDb';
import { logTrace } from '../logger';
import { getMaxedUnitTypesForPlayer } from '../productionCaps';
import { getAvailableBuildUnitTypes } from '../productionRules';

/**
 * Build rights for one seat on this turn.
 *
 * Purpose: Callers gate naval and missile sentences without reading the production queue.
 * When to use: The return value of `seatBuildCapabilities`.
 * Expected outcome: True only when a controlled hex can queue that type and the seat is under its cap.
 * Exceptions: None.
 */
export interface SeatBuildCapabilities {
  /**
   * The seat can queue a naval unit in a controlled hex.
   *
   * Contract: True when some controlled hex lists `naval` and the naval cap is not reached.
   * When to use: The naval rule and the naval tools line.
   * Expected outcome: False for a seat with no seaport city, or a seat already at the naval cap.
   * Exceptions: None.
   */
  readonly canBuildNaval: boolean;
  /**
   * The seat can queue a missile in a controlled hex.
   *
   * Contract: True when some controlled hex lists `missile` and the missile cap is not reached.
   * When to use: The missile rule and the missile tools line.
   * Expected outcome: False for a seat whose cities are below the missile urban minimum, or a seat already at the missile cap.
   * Exceptions: None.
   */
  readonly canBuildMissile: boolean;
}

/**
 * Reports whether this seat can queue a naval unit or a missile.
 *
 * Purpose: Ownership is the wrong gate. A seat with a qualifying city and room under the cap should be told how the type works.
 * When to use: Strategic consultations with production enabled. Tactical consultations should not call it.
 * Expected outcome: Flags from controlled hexes, their infrastructure, and `getMaxedUnitTypesForPlayer`. Neutral border hexes are skipped. The queue snapshot is not read.
 * Exceptions: None.
 */
export function seatBuildCapabilities(state: GameStateSnapshot, ownSeat: string): SeatBuildCapabilities {
  const infraByH3 = new Map((state.strategicInfrastructure ?? []).map((row) => [row.h3Index, row]));
  const maxed = new Set(getMaxedUnitTypesForPlayer(state.units, ownSeat, parseGameSize(state.gameSize)));
  let canBuildNaval = false;
  let canBuildMissile = false;
  for (const row of state.strategicControl ?? []) {
    if (row.controllerPlayerId !== ownSeat || isNeutralBorderHex(row.h3Index)) continue;
    const infra = infraByH3.get(row.h3Index);
    const available = getAvailableBuildUnitTypes(infra?.urbanHexCount ?? 0, infra?.seaportCount ?? 0, infra?.airportCount ?? 0);
    if (!maxed.has('naval') && available.includes('naval')) canBuildNaval = true;
    if (!maxed.has('missile') && available.includes('missile')) canBuildMissile = true;
  }
  const result = { canBuildNaval, canBuildMissile };
  logTrace('seatBuildCapabilities', { ownSeat, canBuildNaval, canBuildMissile });
  return result;
}
