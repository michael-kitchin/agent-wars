/**
 * Reads whether a seat can build on a hex from the open match.
 *
 * Purpose: The spend loop asks once for every hex. The build popup asks for one hex.
 * When to use: After control is known and before points are spent. A seat missing from the roster has an empty home set.
 * Expected outcome: True in the seat's home region, on a hex holding one of its units, or on a fortified hex.
 * Exceptions: Propagates SQLite errors.
 */

import { isHexBuildableForSeat } from '../../shared/productionBuildability';
import type { SeatId } from '../../shared/seatIds';
import { dbGetAll, dbGetOne, getScenarioHomeRegionHexes, getSeatRoster } from '../gameDb';
import { logDebug, logTrace } from '../logger';

/**
 * A one-pass answer for every seat.
 *
 * Purpose: The production loop should not re-read homes and units for every hex.
 * When to use: Once, before the per-hex loop.
 * Expected outcome: `isBuildable` uses the sets read at construction.
 * Exceptions: None.
 */
export interface BuildabilityContext {
  /**
   * Whether the seat may build on the hex.
   *
   * Contract: True for the seat's home, a hex holding one of its units, or a positive fortification count.
   * When to use: Once per controlled hex that still has a queue.
   * Expected outcome: The shared rule, using the sets this context already read.
   * Exceptions: None.
   */
  readonly isBuildable: (seatId: SeatId, h3Index: string, fortifiedCount: number) => boolean;
}

/**
 * Reads every seat's home and every owner's unit hexes.
 *
 * Purpose: One query for units, one home lookup per roster seat.
 * When to use: At the start of production.
 * Expected outcome: A context whose answer does not change if units move later in the same call.
 * Exceptions: Propagates SQLite errors.
 */
export function readBuildabilityContext(): BuildabilityContext {
  logDebug('gameActions readBuildabilityContext');
  const homes = new Map<SeatId, ReadonlySet<string>>();
  for (const seat of getSeatRoster()) {
    homes.set(seat.seatId, new Set(getScenarioHomeRegionHexes(seat.homeRegion)));
  }
  const rows = dbGetAll<{ player: string; h3Index: string }>(
    'SELECT DISTINCT player, h3_index AS h3Index FROM units'
  );
  const unitHexes = new Map<string, Set<string>>();
  for (const row of rows) {
    const hexes = unitHexes.get(row.player) ?? new Set<string>();
    hexes.add(row.h3Index);
    unitHexes.set(row.player, hexes);
  }
  return {
    isBuildable(seatId, h3Index, fortifiedCount) {
      return isHexBuildableForSeat({
        h3Index,
        homeHexes: homes.get(seatId) ?? new Set<string>(),
        seatUnitHexes: unitHexes.get(seatId) ?? new Set<string>(),
        fortifiedCount,
      });
    },
  };
}

/**
 * Whether one seat may build on one hex right now.
 *
 * Purpose: The build popup answers for the hex the player opened, without reading every unit.
 * When to use: While building the queue view for the requester.
 * Expected outcome: The same rule as `readBuildabilityContext`, from a fresh read.
 * Exceptions: Propagates SQLite errors.
 */
export function isHexBuildableNow(seatId: SeatId, h3Index: string, fortifiedCount: number): boolean {
  logTrace('gameActions isHexBuildableNow', { seatId, h3Index, fortifiedCount });
  const seat = getSeatRoster().find((row) => row.seatId === seatId);
  const homeHexes = new Set(seat ? getScenarioHomeRegionHexes(seat.homeRegion) : []);
  const present = dbGetOne<{ present: number }>(
    'SELECT 1 AS present FROM units WHERE player = ? AND h3_index = ? LIMIT 1',
    [seatId, h3Index]
  );
  return isHexBuildableForSeat({
    h3Index,
    homeHexes,
    seatUnitHexes: present ? new Set([h3Index]) : new Set<string>(),
    fortifiedCount,
  });
}
