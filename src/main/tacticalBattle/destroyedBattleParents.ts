import { buildLossFlagFacts } from '../../shared/lossFlagFacts';
import type { DestroyedBattleParent } from '../../shared/destroyedBattleParent';
import type { GameStateSnapshot } from '../../shared/ipcTypes';
import { buildUnitDisplayNameLookup, fallbackDisplayNameFromUnitId } from '../../shared/unitDisplayNames';
import { dbGetOne } from '../gameDb';
import { logDebug } from '../logger';
import { readPersistedOriginBonusSettings } from '../gameDb/originBonusConfig';
import { techLevelForBirthHex } from '../techBonus/techLevelForBirthHex';
import { weatherTagsForBirthHex } from '../weather/weatherPackLoad';

/**
 * Units this battle has removed, in the order they were recorded.
 *
 * Purpose: Beats append to one list, and ending the battle hands that list to the popup once.
 * When to use: `recordDestroyedBattleParents` and `takeDestroyedBattleParents`.
 * Expected outcome: Empty after a start, a take, or a clear.
 * Exceptions: None.
 */
let recorded: DestroyedBattleParent[] = [];

/**
 * Ids already in `recorded`.
 *
 * Purpose: A parent deleted twice, or also returned as transport fallout, is listed once.
 * When to use: `recordDestroyedBattleParents`.
 * Expected outcome: The same membership as `recorded`.
 * Exceptions: None.
 */
const recordedIds = new Set<string>();

/**
 * Drops every remembered battle loss.
 *
 * Purpose: A new battle must not inherit units destroyed in the previous one.
 * When to use: When a battle starts.
 * Expected outcome: The next take returns only units destroyed after this call.
 * Exceptions: None.
 */
export function clearDestroyedBattleParents(): void {
  logDebug('clearDestroyedBattleParents', {
    count: recorded.length,
    ids: recorded.map((unit) => unit.id),
  });
  recorded = [];
  recordedIds.clear();
}

/**
 * Appends units a delete actually removed.
 *
 * Purpose: Both tactical delete sites share one list.
 * When to use: With the array returned by `deleteStrategicParentUnitAndApplyTransportOutcome`.
 * Expected outcome: New ids are kept in order. An id already recorded is skipped. An empty array changes nothing.
 * Exceptions: None.
 */
export function recordDestroyedBattleParents(units: readonly DestroyedBattleParent[]): void {
  const added: string[] = [];
  for (const unit of units) {
    if (recordedIds.has(unit.id)) continue;
    recordedIds.add(unit.id);
    recorded.push(unit);
    added.push(unit.id);
  }
  logDebug('recordDestroyedBattleParents', { count: added.length, ids: added });
}

/**
 * Returns the remembered units and forgets them.
 *
 * Purpose: Ending a battle hands the popup its list and leaves nothing for the next battle.
 * When to use: From each session-end function, after bailout deletes have been recorded.
 * Expected outcome: The units recorded since the last clear or take. The stored list is empty afterward.
 * Exceptions: None.
 */
export function takeDestroyedBattleParents(): DestroyedBattleParent[] {
  const taken = recorded;
  recorded = [];
  recordedIds.clear();
  logDebug('takeDestroyedBattleParents', {
    count: taken.length,
    ids: taken.map((unit) => unit.id),
  });
  return taken;
}

/**
 * Names units and copies the flag facts the loss line needs, from the roster still in the database.
 *
 * Purpose: Display names and birth records have to be read before the rows are deleted.
 * When to use: From the strategic-parent delete, with the units that delete is about to remove and the full roster.
 * Expected outcome: One described unit per removed row. A name comes from the roster lookup, or from the id when the lookup has no row. A unit with no origin has no flag facts.
 * Exceptions: None.
 */
export function describeDestroyedBattleParents(
  removed: readonly GameStateSnapshot['units'][number][],
  roster: readonly GameStateSnapshot['units'][number][]
): DestroyedBattleParent[] {
  logDebug('describeDestroyedBattleParents', {
    removedCount: removed.length,
    ids: removed.map((unit) => unit.id),
  });
  const names = buildUnitDisplayNameLookup(roster);
  const settings = readPersistedOriginBonusSettings({ getOne: dbGetOne, hasDb: () => true });
  const facts = buildLossFlagFacts(removed, {
    weatherEnabled: settings.weatherBonusEnabled === true,
    techEnabled: settings.techBonusEnabled === true,
    weatherTagsFor: weatherTagsForBirthHex,
    techLevelFor: techLevelForBirthHex,
  });
  return removed.map((unit) => {
    const fact = facts.get(unit.id);
    const described: DestroyedBattleParent = {
      id: unit.id,
      ownerId: unit.player,
      unitType: unit.unitType,
      displayName: names.get(unit.id) ?? fallbackDisplayNameFromUnitId(unit.id),
      h3Index: unit.h3Index,
    };
    if (!fact?.origin) return described;
    return {
      ...described,
      origin: fact.origin,
      ...(typeof fact.formedTurn === 'number' ? { formedTurn: fact.formedTurn } : {}),
      ...(fact.weatherTags ? { weatherTags: fact.weatherTags } : {}),
      ...(fact.techLevel ? { techLevel: fact.techLevel } : {}),
    };
  });
}
