/**
 * Strategic airport-chain lookup against the live map.
 *
 * Purpose: Validation, the hover preview, and resolution share one graph, built from the database rather than a fogged snapshot.
 * When to use: Strategic ferry only. Tactical ferry stays one hop and does not call this module.
 * Expected outcome: The shared route result, unchanged.
 * Exceptions: None. A closed database surfaces as an empty airport list, and the route then refuses the destination.
 */

import { findAirportFerryRoute, type AirportFerryRouteResult } from '../../shared/airportFerryRoute';
import { computeGridDistancePure, isWithinGridRangePure } from '../../shared/h3GridRangePure';
import { isNeutralBorderHex } from '../../shared/h3Resolutions';
import { dbGetAll, dbGetOne, getHexController } from '../gameDb';
import { readPersistedOriginBonusSettings } from '../gameDb/originBonusConfig';
import { logDebug } from '../logger';
import { strategicFerryRangeOnState } from '../weather/weatherMatch';
import { weatherTagsForBirthHex } from '../weather/weatherPackLoad';

/**
 * One strategic ferry search for a unit that is already on the map.
 *
 * Purpose: Callers pass the unit and the two hexes. This module loads airports, weather, and grid distance.
 * When to use: `validateFerryOrder`, group ferry paths, the hover preview, and ferry resolution.
 * Expected outcome: The fields the shared search needs, named once.
 * Exceptions: None.
 */
export type StrategicAirportFerryArgs = {
  readonly unitId: string;
  readonly originH3Index: string;
  readonly destinationH3Index: string;
  readonly owner: string;
};

/**
 * Searches the owner's intact airports for a chain from the unit's hex to the destination.
 *
 * Purpose: The single-hop range stays the edge limit. The path may visit as many airports as that limit allows.
 * When to use: Any strategic ferry decision that used to call `isWithinAirFerryGridRange` once.
 * Expected outcome: The shared result. A missing destination airport is not intact.
 * Exceptions: None.
 */
export function resolveStrategicAirportFerry(args: StrategicAirportFerryArgs): AirportFerryRouteResult {
  const weatherSettings = readPersistedOriginBonusSettings({ getOne: dbGetOne, hasDb: () => true });
  const turnNumber = dbGetOne<{ turn_number: number }>('SELECT turn_number FROM turn_state WHERE id = 1')?.turn_number ?? 1;
  const birth = dbGetOne<{ birth_h3_index: string | null }>(
    'SELECT birth_h3_index FROM units WHERE id = ?',
    [args.unitId]
  )?.birth_h3_index;
  const weatherState = {
    weatherBonusEnabled: weatherSettings.weatherBonusEnabled,
    turnNumber,
    startMonth: weatherSettings.startMonth,
  };
  const tags = weatherTagsForBirthHex(birth);
  const airports = dbGetAll<{ h3Index: string }>(
    'SELECT h3_index AS h3Index FROM res_s_infrastructure WHERE airport_count > 0'
  );
  const result = findAirportFerryRoute({
    originH3Index: args.originH3Index,
    destinationH3Index: args.destinationH3Index,
    owner: args.owner,
    nodes: airports.map((row) => ({
      h3Index: row.h3Index,
      owner: getHexController(row.h3Index) ?? '',
      intact: true,
      neutralBorder: isNeutralBorderHex(row.h3Index),
    })),
    gridDistance: (fromH3Index, toH3Index) => computeGridDistancePure(fromH3Index, toH3Index),
    unmeasuredHopWithinRange: (fromH3Index, toH3Index, hopRangeHexes) =>
      isWithinGridRangePure(fromH3Index, toH3Index, hopRangeHexes),
    hopRangeHexes: (destinationH3Index) =>
      strategicFerryRangeOnState({ weatherTags: tags }, destinationH3Index, weatherState),
  });
  logDebug('airFerryRoute resolveStrategicAirportFerry', {
    unitId: args.unitId,
    originH3Index: args.originH3Index,
    destinationH3Index: args.destinationH3Index,
    reachable: result.reachable,
  });
  return result;
}
