/**
 * How many land units a carrier may hold, and whether that cargo can fight.
 *
 * Purpose: Ships and air units share one capacity check so a second copy of the numbers cannot drift.
 * When to use: Embark validation, the stack slot editor, and combat filters.
 * Expected outcome: Air carries one infantry unit. A ship carries one armor unit or up to two infantry. Air cargo never fights.
 * Exceptions: None.
 */

/**
 * Infantry an air unit can carry.
 *
 * Purpose: The airlift load. Ships do not use this number.
 * When to use: Prompts and tests that need the cap. Callers should prefer `carrierAcceptsLandUnit`.
 * Expected outcome: 1.
 * Exceptions: None.
 */
export const AIRLIFT_INFANTRY_CAPACITY = 1;

/**
 * Whether this carrier can take the land unit given what is already aboard.
 *
 * Purpose: One gate for a ship and an air unit.
 * When to use: Before inserting a `unit_transport_assignments` row.
 * Expected outcome: True only for an empty air unit taking infantry, an empty ship taking armor or infantry, or a ship that already has one infantry and no armor taking a second infantry.
 * Exceptions: None.
 */
export function carrierAcceptsLandUnit(
  carrierUnitType: string,
  landUnitType: string,
  embarkedLandUnitTypes: readonly string[]
): boolean {
  if (carrierUnitType === 'air') {
    return landUnitType === 'infantry' && embarkedLandUnitTypes.length < AIRLIFT_INFANTRY_CAPACITY;
  }
  if (carrierUnitType !== 'naval') return false;
  const hasArmor = embarkedLandUnitTypes.includes('armor');
  if (landUnitType === 'armor') return embarkedLandUnitTypes.length === 0;
  if (landUnitType === 'infantry') {
    const infantryCount = embarkedLandUnitTypes.filter((unitType) => unitType === 'infantry').length;
    return !hasArmor && infantryCount < 2;
  }
  return false;
}

/**
 * Whether embarked land still fights on this carrier and terrain.
 *
 * Purpose: Air cargo is out of every fight. Ship cargo sits out combat only on water.
 * When to use: Ranged fire, melee, and anti-air eligibility.
 * Expected outcome: False for air on any terrain. False for a ship on water. True for a ship on any other terrain.
 * Exceptions: None.
 */
export function landUnitFightsWhileEmbarked(carrierUnitType: string, terrain: string): boolean {
  if (carrierUnitType === 'air') return false;
  if (carrierUnitType === 'naval') return terrain !== 'water';
  return true;
}
