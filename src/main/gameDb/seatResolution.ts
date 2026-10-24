/**
 * Turns a new-match seat list into roster rows.
 *
 * Purpose: One place checks the count, the single human, and that each side has its own home.
 * When to use: `resetGameForNewMatch` after the map is loaded and before the database is wiped.
 * Expected outcome: Seat order 1 is the human when there is one. AI seats follow in row order.
 * Exceptions: Throws when the list or the homes cannot start a match.
 */

import { logDebug, logError } from '../logger';
import { HUMAN_SEAT_ID, MAX_SEATS, MIN_SEATS, aiSeatIdForIndex } from '../../shared/seatIds';
import type { SeatRecord } from '../../shared/seatRoster';
import type { NewGameSeatInput } from '../../shared/ipc/ordersTypes';
import { installedSideGroups, listScenarioHomeRegions } from '../regionScenario';

/**
 * A roster row whose commander has not been stored yet.
 *
 * Purpose: Reset stores the commander after this function returns. Random is still only a choice here.
 * When to use: The return value of `resolveNewMatchSeats`.
 * Expected outcome: Outcome fields are empty. `commanderInput` is null for the human seat.
 * Exceptions: None.
 */
export interface ResolvedNewMatchSeat extends Omit<SeatRecord, 'commander'> {
  /**
   * The commander the screen sent for this AI seat.
   *
   * Contract: Null for the human seat and for an AI seat that sent none.
   * When to use: While building the stored commander.
   * Expected outcome: A missing value becomes Balanced standing orders.
   * Exceptions: None.
   */
  readonly commanderInput: NewGameSeatInput['commander'] | null;
}

/**
 * Resolves homes, seat ids, and seat order for a new match.
 *
 * Purpose: Regional homes become side-group display names. Global homes stay UN subregion names.
 * When to use: After `ensureGameMapLoaded` so installed groups and the region list are available.
 * Expected outcome: Two to four rows. Throws before any row is written.
 * Exceptions: Throws when the count is outside 2 to 4, when two humans are present, when a side group is unknown or repeated, when a known global region is repeated, or when no unused home remains.
 */
export function resolveNewMatchSeats(input: {
  readonly mapKind: 'global' | 'regional';
  readonly seats: readonly NewGameSeatInput[];
}): ResolvedNewMatchSeat[] {
  logDebug('seatResolution resolveNewMatchSeats', {
    mapKind: input.mapKind,
    seatCount: input.seats.length,
  });
  assertSeatCount(input.seats);
  const homeRegions = input.mapKind === 'regional'
    ? regionalHomeNames(input.seats)
    : globalHomeNames(input.seats);
  return assignSeatIdentity(input.seats, homeRegions);
}

/**
 * Rejects a list that is not two to four sides, or that has two humans.
 *
 * Purpose: Those matches cannot be stored in the roster.
 * When to use: Before homes are resolved.
 * Expected outcome: Returns when the list is usable.
 * Exceptions: Throws with a message that names the count or the second human.
 */
function assertSeatCount(seats: readonly NewGameSeatInput[]): void {
  if (seats.length < MIN_SEATS || seats.length > MAX_SEATS) {
    const err = new Error(`A match needs ${MIN_SEATS} to ${MAX_SEATS} sides`);
    logError('seatResolution assertSeatCount', { seatCount: seats.length, err });
    throw err;
  }
  const humanCount = seats.filter((seat) => seat.kind === HUMAN_SEAT_ID).length;
  if (humanCount > 1) {
    const err = new Error('A match can have only one human side');
    logError('seatResolution assertSeatCount: two humans', err);
    throw err;
  }
}

/**
 * Resolves each row to a side-group display name.
 *
 * Purpose: The screen sends group ids. The roster stores display names.
 * When to use: Regional maps only.
 * Expected outcome: One display name per row. A blank id takes the first unused installed group.
 * Exceptions: Throws when no groups are loaded, an id is unknown, an id is repeated, or every group is already taken.
 */
function regionalHomeNames(seats: readonly NewGameSeatInput[]): string[] {
  const groups = installedSideGroups();
  if (!groups) {
    const err = new Error('No side groups are loaded');
    logError('seatResolution regionalHomeNames: none loaded', err);
    throw err;
  }
  const used = new Set<string>();
  return seats.map((seat) => {
    const requested = (seat.sideGroupId ?? '').trim();
    const named = requested ? groups.find((group) => group.id === requested) : undefined;
    if (requested && !named) {
      const err = new Error('Unknown side group');
      logError('seatResolution regionalHomeNames: unknown', { sideGroupId: requested, err });
      throw err;
    }
    if (named && used.has(named.id)) {
      const err = new Error('Each side needs a different side group');
      logError('seatResolution regionalHomeNames: duplicate', { sideGroupId: named.id, err });
      throw err;
    }
    const chosen = named ?? groups.find((group) => !used.has(group.id));
    if (!chosen) {
      const err = new Error('Not enough side groups for every side');
      logError('seatResolution regionalHomeNames: exhausted', err);
      throw err;
    }
    used.add(chosen.id);
    return chosen.displayName;
  });
}

/**
 * Resolves each row to a UN subregion name.
 *
 * Purpose: A blank or unknown name must still start a match, using a region no earlier row took.
 * When to use: The global map only.
 * Expected outcome: One listed region per row. A repeated known name throws.
 * Exceptions: Throws when a known region is repeated or no unused listed region remains.
 */
function globalHomeNames(seats: readonly NewGameSeatInput[]): string[] {
  const names = listScenarioHomeRegions();
  const used = new Set<string>();
  return seats.map((seat) => {
    const requested = (seat.homeRegion ?? '').trim();
    const known = names.includes(requested);
    if (known && used.has(requested)) {
      const err = new Error('Each side needs a different home region');
      logError('seatResolution globalHomeNames: duplicate', { homeRegion: requested, err });
      throw err;
    }
    const chosen = known ? requested : names.find((name) => !used.has(name));
    if (!chosen) {
      const err = new Error('Not enough home regions for every side');
      logError('seatResolution globalHomeNames: exhausted', err);
      throw err;
    }
    used.add(chosen);
    return chosen;
  });
}

/**
 * Gives each row a seat id and a seat order.
 *
 * Purpose: The human is always seat 1. AI ids follow the order of the AI rows, starting at the first AI seat.
 * When to use: After every row has a home name.
 * Expected outcome: Rows in seat order. Outcome fields are empty.
 * Exceptions: None. The count check already keeps the AI index inside 1 to 4.
 */
function assignSeatIdentity(
  seats: readonly NewGameSeatInput[],
  homeRegions: readonly string[]
): ResolvedNewMatchSeat[] {
  const humanIndexes = seats.flatMap((seat, index) => (seat.kind === HUMAN_SEAT_ID ? [index] : []));
  const aiIndexes = seats.flatMap((seat, index) => (seat.kind === 'ai' ? [index] : []));
  return [...humanIndexes, ...aiIndexes].map((sourceIndex, position) => {
    const seat = seats[sourceIndex]!;
    const aiNumber = position - humanIndexes.length + 1;
    return {
      seatId: seat.kind === HUMAN_SEAT_ID ? HUMAN_SEAT_ID : aiSeatIdForIndex(aiNumber),
      seatOrder: position + 1,
      kind: seat.kind,
      homeRegion: homeRegions[sourceIndex]!,
      commanderInput: seat.kind === HUMAN_SEAT_ID ? null : (seat.commander ?? null),
      outTurn: null,
      outBy: null,
      outReasons: [],
      place: null,
      consultationCount: 0,
      costUsd: 0,
    };
  });
}
