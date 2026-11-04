/**
 * Airlift checks the ship embark path calls when the carrier is an air unit.
 *
 * Purpose: Boarding and fighting rules for one infantry unit on an air unit, without the port and coast checks a ship uses.
 * When to use: `applyEmbarkOrdersForPlayer`, the stack slot editor, and combat filters.
 * Expected outcome: Infantry on the same hex can board an empty air unit. That infantry does not fight until it leaves.
 * Exceptions: None.
 */

import { carrierAcceptsLandUnit, landUnitFightsWhileEmbarked } from '../../shared/carrierCargoRules';
import { dbGetOne } from '../gameDb';
import { logTrace } from '../logger';

/**
 * Facts for one air embark attempt.
 *
 * Purpose: Keeps the check under the argument limit.
 * When to use: `airliftEmbarkAllowed`.
 * Expected outcome: Both units, their types, owners, hexes, and the land types already assigned to the air unit.
 * Exceptions: None.
 */
export type AirliftEmbarkArgs = {
  readonly landPlayer: string;
  readonly landUnitType: string;
  readonly landH3Index: string;
  readonly carrierPlayer: string;
  readonly carrierUnitType: string;
  readonly carrierH3Index: string;
  readonly embarkedLandUnitTypes: readonly string[];
};

/**
 * Whether this pair may write an airlift assignment.
 *
 * Purpose: The air branch of embark. A ship does not call this.
 * When to use: Before inserting a row whose carrier is an air unit.
 * Expected outcome: True when both units share a hex and a player, the land unit is infantry, the carrier is air, and the air unit has room.
 * Exceptions: None.
 */
export function airliftEmbarkAllowed(args: AirliftEmbarkArgs): boolean {
  logTrace('airlift airliftEmbarkAllowed', {
    landUnitType: args.landUnitType,
    carrierUnitType: args.carrierUnitType,
    sameHex: args.landH3Index === args.carrierH3Index,
  });
  if (args.landPlayer !== args.carrierPlayer) return false;
  if (args.landH3Index !== args.carrierH3Index) return false;
  if (args.carrierUnitType !== 'air') return false;
  return carrierAcceptsLandUnit(args.carrierUnitType, args.landUnitType, args.embarkedLandUnitTypes);
}

/**
 * Whether a land unit assigned to an air unit is left out of combat.
 *
 * Purpose: Air cargo never fights, on any terrain.
 * When to use: Ranged fire, melee, and anti-air lists.
 * Expected outcome: True when the land unit's carrier is an air unit.
 * Exceptions: None. A missing assignment is false.
 */
export function isLandUnitEmbarkedOnAir(landUnitId: string): boolean {
  const row = dbGetOne<{ unitType: string }>(
    `SELECT nu.unit_type AS unitType
     FROM unit_transport_assignments uta
     JOIN units nu ON nu.id = uta.naval_unit_id
     WHERE uta.land_unit_id = ?`,
    [landUnitId]
  );
  logTrace('airlift isLandUnitEmbarkedOnAir', { landUnitId, carrierUnitType: row?.unitType ?? null });
  return row?.unitType === 'air';
}

/**
 * Whether this land unit is left out of ranged fire and melee.
 *
 * Purpose: Air cargo sits out on every terrain. Ship cargo sits out only on water.
 * When to use: The combat lists that used to call `isEmbarkedLandUnitOnWater` alone.
 * Expected outcome: True when the shared fight predicate is false for the carrier. False when the unit is not embarked.
 * Exceptions: None.
 */
export function landUnitSitsOutCombat(landUnitId: string): boolean {
  const row = dbGetOne<{ unitType: string; terrain: string }>(
    `SELECT nu.unit_type AS unitType, hx.terrain AS terrain
     FROM unit_transport_assignments uta
     JOIN units nu ON nu.id = uta.naval_unit_id
     JOIN units lu ON lu.id = uta.land_unit_id
     JOIN hexes hx ON hx.h3_index = lu.h3_index
     WHERE uta.land_unit_id = ?`,
    [landUnitId]
  );
  logTrace('airlift landUnitSitsOutCombat', { landUnitId, carrierUnitType: row?.unitType ?? null });
  if (!row) return false;
  return !landUnitFightsWhileEmbarked(row.unitType, row.terrain);
}
