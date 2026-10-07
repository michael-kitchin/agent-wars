/**
 * Builds origin bonus lookups from the live game database.
 *
 * Purpose: Keeps database reads out of `originHitBonusLookup.ts` and out of the combat roll sites.
 * When to use: At the start of each strategic turn resolution and each tactical resolution step.
 * Expected outcome: With no open database, the settings read as off and every lookup gives 0.
 * Exceptions: None.
 */
import type { OriginBonusSettings } from '../../shared/originBonusTypes';
import type { TacticalBattleSnapshot } from '../../shared/tacticalBattleTypes';
import { dbGetOne, isDbReady, listUnitsForSnapshot } from '../gameDb';
import { readPersistedOriginBonusSettings } from '../gameDb/originBonusConfig';
import { logDebug, logTrace } from '../logger';
import { getStrategicMajorityCountryNamesFromSnapshot } from '../unitOrigin/tacticalBirthCountryCache';
import {
  noOriginHitBonus,
  createStrategicOriginHitBonusLookup,
  createTacticalOriginHitBonusLookup,
  type OriginHitBonusLookup,
} from './originHitBonusLookup';

/**
 * Reads the current match's origin bonus flags.
 *
 * Purpose: One place that wires the persisted settings reader to the `gameDb` facade.
 * When to use: Main-process code that resolves dice or builds lookups.
 * Expected outcome: The persisted flags, or both off when no database is open.
 * Exceptions: None.
 */
export function readOriginBonusSettingsFromDb(): OriginBonusSettings {
  logTrace('originHitBonusLookupDb readOriginBonusSettingsFromDb');
  return readPersistedOriginBonusSettings({ hasDb: isDbReady, getOne: dbGetOne });
}

/**
 * Builds the strategic lookup for the current turn.
 *
 * Purpose: Strategic air-strike, ranged, and melee rolls.
 * When to use: Once per strategic turn resolution, before the first rolling phase.
 * Expected outcome: `noOriginHitBonus` without listing units when the country bonus is off; otherwise a lookup over every unit's origin and each hex's majority country.
 * Exceptions: None.
 */
export function buildStrategicOriginHitBonusLookupFromDb(): OriginHitBonusLookup {
  const settings = readOriginBonusSettingsFromDb();
  logDebug('originHitBonusLookupDb buildStrategicOriginHitBonusLookupFromDb', { ...settings });
  if (!settings.countryBonusEnabled) return noOriginHitBonus;
  const countryNames = getStrategicMajorityCountryNamesFromSnapshot();
  return createStrategicOriginHitBonusLookup({
    settings,
    units: listUnitsForSnapshot(),
    countryNameAt: (strategicH3Index) => countryNames.get(strategicH3Index) ?? null,
  });
}

/**
 * Builds the tactical lookup for one resolution step of a battle.
 *
 * Purpose: Tactical air-strike, ranged, and melee rolls.
 * When to use: At the start of each tactical rolling step, with the battle snapshot that step starts from.
 * Expected outcome: A lookup over the battle's sub-unit origins and frozen cell data; `noOriginHitBonus` when both flags are off.
 * Exceptions: None.
 */
export function buildTacticalOriginHitBonusLookupFromDb(battle: TacticalBattleSnapshot): OriginHitBonusLookup {
  logDebug('originHitBonusLookupDb buildTacticalOriginHitBonusLookupFromDb', { battleId: battle.battleId });
  return createTacticalOriginHitBonusLookup({ settings: readOriginBonusSettingsFromDb(), battle });
}
