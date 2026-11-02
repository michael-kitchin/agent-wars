import { briefingOwnSeatId, enemyHomeHexes } from '../briefing/briefingPerspective';
import { isNeutralOwnerId, type SeatId } from '../../shared/seatIds';
import { findSeat, isSeatActive, sortSeatsByOrder, type Doctrine } from '../../shared/seatRoster';
import { getSeatRoster, type GameStateSnapshot } from '../gameDb';
import { h3ToCode } from '../briefing/map/hexCodeTranslator';
import { logError } from '../logger';
import type { EnemyRosterGroup } from './promptText';
import type { SidesPromptSeat } from './promptSpec/sidesBlock';

/** Home regions are defined at strategic; always encode with the strategic registry, not tactical. */
const HOME_REGION_HEX_COORD_CTX = { mode: 'strategic' as const };

/**
 * Defines the `formatHomeRegionHexCodesForPrompt` function shape (function formatHomeRegionHexCodesForPrompt()).
 *
 * Purpose: Maps home-region H3 indexes to strategic briefing hex codes for LLM-visible comma-separated lists.
 * When to use: Strategic `region_vs_region` home-region hex bullets in the situation message.
 * Expected outcome: Comma-separated strategic codes via `h3ToCode` strategic context; falls back to raw `h3` on lookup failure.
 * Exceptions: None; empty input returns an empty string.
 */
export function formatHomeRegionHexCodesForPrompt(h3Indexes: readonly string[]): string {
  const parts: string[] = [];
  for (const h3 of h3Indexes) {
    try {
      parts.push(h3ToCode(h3, HOME_REGION_HEX_COORD_CTX));
    } catch {
      parts.push(h3);
    }
  }
  return parts.join(', ');
}

/**
 * Stored doctrine of the commander being briefed.
 *
 * Purpose: A random draw is hidden on the snapshot until the match is over, and the prompt still has to teach it.
 * When to use: The coaching gates for this consultation.
 * Expected outcome: The roster's stored doctrine when a database is open. Otherwise the snapshot's doctrine, or Balanced.
 * Exceptions: A closed database is caught and the snapshot is used. The drawn value is not written to a player-facing log.
 */
export function doctrineForPrompt(state: GameStateSnapshot): Doctrine {
  try {
    const stored = findSeat(getSeatRoster(), briefingOwnSeatId(state))?.commander?.doctrine;
    if (stored === 'aggressive' || stored === 'cautious' || stored === 'balanced') return stored;
  } catch (err) {
    logError('openRouterBuildSystemPrompt: doctrine lookup failed', err);
  }
  const fromSnapshot = state.seats?.find((seat) => seat.seatId === briefingOwnSeatId(state))?.commander?.doctrine;
  if (fromSnapshot === 'aggressive' || fromSnapshot === 'cautious' || fromSnapshot === 'balanced') return fromSnapshot;
  return 'balanced';
}

/**
 * Home display name of the commander being briefed.
 *
 * Purpose: The identity sentence names the side, not a generic enemy commander.
 * When to use: The opening line of the system message.
 * Expected outcome: The roster home when a roster is present, otherwise `your side`.
 * Exceptions: None.
 */
export function commandedSideName(state: GameStateSnapshot): string {
  const seats = state.seats ?? [];
  if (seats.length > 0) {
    const name = seats.find((seat) => seat.seatId === briefingOwnSeatId(state))?.homeRegion.trim() ?? '';
    if (name.length > 0) return name;
  }
  return 'your side';
}

/**
 * Seat rows for the Sides table.
 *
 * Purpose: A roster supplies the rows.
 * When to use: Strategic prompts. Tactical prompts omit the table.
 * Expected outcome: Roster rows. One placeholder row when the roster is absent.
 * Exceptions: None.
 */
export function sidesSeatsForPrompt(state: GameStateSnapshot, ownSeatId: SeatId): SidesPromptSeat[] {
  if (state.seats && state.seats.length > 0) {
    return state.seats.map((seat) => ({
      seatId: seat.seatId,
      seatOrder: seat.seatOrder,
      homeRegion: seat.homeRegion,
      outTurn: seat.outTurn,
    }));
  }
  return [{ seatId: ownSeatId, seatOrder: 1, homeRegion: commandedSideName(state), outTurn: null }];
}

/**
 * Active enemy homes in seat order.
 *
 * Purpose: Home-control lines are one per enemy, using that enemy's own hex list.
 * When to use: Strategic prompts.
 * Expected outcome: Names and hex lists. One fallback row when the roster or the hex map is absent.
 * Exceptions: None.
 */
export function enemyHomesForPrompt(state: GameStateSnapshot): { name: string; hexes: readonly string[] }[] {
  const seats = state.seats ?? [];
  const homes = state.homeRegionHexesBySeat;
  if (seats.length > 0 && homes) {
    const own = briefingOwnSeatId(state);
    return sortSeatsByOrder(seats)
      .filter((seat) => seat.seatId !== own && isSeatActive(seat))
      .map((seat) => ({ name: seat.homeRegion, hexes: homes[seat.seatId] ?? [] }));
  }
  return [{ name: 'the enemy', hexes: enemyHomeHexes(state) }];
}

/**
 * Hexes that appear in at least two of the given home lists.
 *
 * Purpose: The shared-cell line covers every overlap, including two enemy homes.
 * When to use: When there is more than one enemy and the two-set partition does not apply.
 * Expected outcome: Hexes whose membership count is greater than one. Order follows first appearance.
 * Exceptions: None.
 */
export function hexesInMoreThanOneHome(lists: readonly (readonly string[])[]): string[] {
  const counts = new Map<string, number>();
  for (const list of lists) {
    for (const hex of new Set(list)) counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return [...counts.keys()].filter((hex) => (counts.get(hex) ?? 0) > 1);
}

/**
 * Observed enemy units grouped by side, then Neutral.
 *
 * Purpose: The roster line names the side that owns each observed unit.
 * When to use: Strategic and tactical situation messages. Groups with an empty roster are kept so the line helper can drop them.
 * Expected outcome: Active enemies in seat order, then a Neutral group when a neutral unit is located. Without a roster, one group uses the human home name.
 * Exceptions: None.
 */
export function observedEnemyGroups(
  state: GameStateSnapshot,
  ownSeat: SeatId,
  latLngByH3: Map<string, [number, number]>,
  format: (h3: string) => string
): EnemyRosterGroup[] {
  const located = state.units.filter((unit) => unit.player !== ownSeat && latLngByH3.has(unit.h3Index));
  const summary = (unit: { id: string; unitType: string; h3Index: string }): string =>
    `${unit.id} (${unit.unitType}) at ${format(unit.h3Index)}`;
  const groups: EnemyRosterGroup[] = [];
  const seats = state.seats ?? [];
  if (seats.length > 0) {
    for (const seat of sortSeatsByOrder(seats)) {
      if (seat.seatId === ownSeat || !isSeatActive(seat)) continue;
      groups.push({
        name: seat.homeRegion,
        roster: located.filter((unit) => unit.player === seat.seatId).map(summary).join('; '),
      });
    }
  } else {
    groups.push({
      name: 'Enemy',
      roster: located.filter((unit) => !isNeutralOwnerId(unit.player)).map(summary).join('; '),
    });
  }
  const neutralRoster = located.filter((unit) => isNeutralOwnerId(unit.player)).map(summary).join('; ');
  if (neutralRoster.length > 0) groups.push({ name: 'Neutral', roster: neutralRoster });
  return groups;
}
