/**
 * Hexes that show a Hire marker on the human map.
 *
 * Purpose: The marker layer and the canvas-label skip share one set.
 * When to use: When drawing hire markers or hiding the production label under one.
 * Expected outcome: The economy's hire hexes for an active human view, or an empty set.
 * Exceptions: None.
 */

import type { GameStateSnapshot } from './ipc/gameStateTypes';
import { HUMAN_SEAT_ID } from './seatIds';

/**
 * Hire-marker hexes for the snapshot the renderer is showing.
 *
 * Purpose: Observing, an AI view, and a knocked-out human seat show no Hire markers.
 * When to use: Once per marker rebuild and once per production-label pass.
 * Expected outcome: The hexes on `mercenaryEconomy.hireHexes`, or an empty set when this view should not hire.
 * Exceptions: None.
 */
export function hireEntryHexesForHuman(state: GameStateSnapshot): ReadonlySet<string> {
  if (state.playerPerspective !== HUMAN_SEAT_ID) return new Set();
  const human = state.seats?.find((seat) => seat.seatId === HUMAN_SEAT_ID);
  if (state.seats && (human == null || human.outTurn !== null)) return new Set();
  const hexes = state.mercenaryEconomy?.hireHexes;
  if (!hexes) return new Set();
  return new Set(hexes);
}
