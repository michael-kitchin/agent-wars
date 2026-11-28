/**
 * Hand-built knockout status rows for prompt tests.
 *
 * Purpose: Tests of the standings need status rows without a database, and should build them one way.
 * When to use: A test that ranks sides by city hexes.
 * Expected outcome: Rows whose seat, name, and city-hex count come from the caller.
 * Exceptions: None.
 */

import type { SeatId } from '../../shared/seatIds';
import type { SideKnockoutStatus } from '../gameActions/knockoutStatus';

/**
 * Builds one side's knockout status row holding a number of city hexes.
 *
 * Purpose: The standings read only the seat, the name, and the city-hex count.
 * When to use: Each side of a status passed to the standings.
 * Expected outcome: A row with `cityHexCount` one-cell city hexes and fixed home-loss fields.
 * Exceptions: None.
 */
export function sideStatusWithCityHexes(seatId: SeatId, name: string, cityHexCount: number): SideKnockoutStatus {
  return {
    seatId,
    name,
    cityHexes: Array.from({ length: cityHexCount }, (_unused, index) => ({ h3Index: `${name}-${index}`, urbanCells: 1 })),
    homeLoss: {
      lostUrbanCells: 0,
      totalUrbanCells: 1,
      neededUrbanCells: 1,
      lostHexes: 0,
      totalHexes: 1,
      everyHexRule: false,
      homeLost: false,
    },
    viewerHeldHomeUrbanCells: 0,
  };
}
