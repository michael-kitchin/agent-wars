/**
 * Builds a tech bonus lookup from the live game database.
 *
 * Purpose: Roll sites share one reader for the match flag and the generated urban counts.
 * When to use: Once beside the origin lookup, before the first rolling phase.
 * Expected outcome: Zeros when tech is off, the cache is unloaded, or a unit has no birth hex.
 * Exceptions: None.
 */

import { dbGetOne, isDbReady } from '../gameDb';
import { readPersistedOriginBonusSettings } from '../gameDb/originBonusConfig';
import { logDebug } from '../logger';
import { urbanHexCountForTech } from './techLevelForBirthHex';
import { createTechHitBonusLookup, type TechHitBonusLookup, type TechLookupUnit } from './techHitBonusLookup';

/**
 * Builds the tech lookup for the units about to roll.
 *
 * Purpose: Strategic resolution passes the strategic unit list. Tactical resolution passes the battle's sub-units.
 * When to use: Once per phase, with the ids the rolls will ask for.
 * Expected outcome: Each id maps to that unit's birth-hex bonus. Ids missing from `units` add nothing.
 * Exceptions: None.
 */
export function buildTechHitBonusLookupFromDb(units: readonly TechLookupUnit[]): TechHitBonusLookup {
  logDebug('techHitBonusLookupDb buildTechHitBonusLookupFromDb', { units: units.length });
  return createTechHitBonusLookup({
    settings: readPersistedOriginBonusSettings({ hasDb: isDbReady, getOne: dbGetOne }),
    units,
    urbanHexCountAt: urbanHexCountForTech,
  });
}
