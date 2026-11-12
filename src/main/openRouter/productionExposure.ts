/**
 * Cities an enemy can reach soon enough that fortifying them is worth a queue slot.
 *
 * Purpose: Fortifying a city no enemy can reach soon wastes production that credits could turn into mercenaries.
 * When to use: The production briefing and the idle-hex list.
 * Expected outcome: A set of the seat's city hexes within `PRODUCTION_EXPOSED_RADIUS` of a visible or remembered enemy.
 * Exceptions: None.
 */

import type { GameStateSnapshot } from '../gameDb';
import type { HopDistance } from './campaignRules';
import { computeGridDistanceWithPathFallbackPure } from '../../shared/h3GridRangePure';
import { logTrace } from '../logger';

/**
 * How close an enemy must be before a city counts as exposed.
 *
 * Purpose: Farther threats do not justify a fortification queue over credits.
 * When to use: `listExposedCityHexes` and the production coaching sentence.
 * Expected outcome: Four hops.
 * Exceptions: None.
 */
export const PRODUCTION_EXPOSED_RADIUS = 4;

/**
 * Column name for the exposed flag in the controlled-hex queue table.
 *
 * Purpose: The model reads one word for whether this city should queue fortification.
 * When to use: The production table header.
 * Expected outcome: `Exposed`.
 * Exceptions: None.
 */
export const EXPOSED_COLUMN_HEADER = 'Exposed';

/**
 * The seat's cities with an active enemy nearby.
 *
 * Purpose: The queue table and the idle list share one exposure rule.
 * When to use: Once per production briefing. Pass a test hop when the snapshot uses a fake grid.
 * Expected outcome: The seat's city hexes with an active enemy unit, visible or remembered in intel, within `PRODUCTION_EXPOSED_RADIUS` hops. An intel row with no owner counts. Neutral units never count.
 * Exceptions: None.
 */
export function listExposedCityHexes(
  state: GameStateSnapshot,
  seatId: string,
  hopDistance: HopDistance = computeGridDistanceWithPathFallbackPure
): Set<string> {
  const activeEnemySeatIds = new Set(
    (state.seats ?? []).filter((seat) => seat.seatId !== seatId && seat.outTurn == null).map((seat) => seat.seatId as string)
  );
  const threatHexes = [
    ...state.units.filter((unit) => activeEnemySeatIds.has(unit.player)).map((unit) => unit.h3Index),
    ...(state.enemyIntel ?? [])
      .filter((row) => row.player === undefined || activeEnemySeatIds.has(row.player))
      .map((row) => row.lastKnownH3Index),
  ];
  const urbanByH3 = new Map((state.strategicInfrastructure ?? []).map((row) => [row.h3Index, row.urbanHexCount]));
  const exposed = new Set<string>();
  for (const row of state.strategicControl ?? []) {
    if (row.controllerPlayerId !== seatId || (urbanByH3.get(row.h3Index) ?? 0) <= 0) continue;
    const near = threatHexes.some((h3) => {
      const distance = hopDistance(row.h3Index, h3);
      return distance !== null && distance <= PRODUCTION_EXPOSED_RADIUS;
    });
    if (near) exposed.add(row.h3Index);
  }
  logTrace('productionExposure listExposedCityHexes', { seatId, threatCount: threatHexes.length, exposedCount: exposed.size });
  return exposed;
}
