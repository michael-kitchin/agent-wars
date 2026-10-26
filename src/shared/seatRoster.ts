/**
 * Roster types and pure helpers for a match of two to four seats.
 *
 * Purpose: Ordering, activity, enemies, and the snapshot the renderer sees live here so the
 * database module is not required to answer them. Short names are re-exported from shortSideName.ts.
 * When to use: After a roster has been read, and while building prompts or labels.
 * Expected outcome: Helpers do not mutate the roster they are given.
 * Exceptions: None. This module does not import the main-process logger.
 */

import { isAiSeatId, type AiSeatId, type SeatId } from './seatIds';

/**
 * Kind stored for the seat a person plays.
 *
 * Purpose: `seat.kind` is compared with this constant. The human seat id is a different idea, even though both strings are `human`.
 * When to use: Roster rows, new-game rows, and any check for the human kind.
 * Expected outcome: The string `human`, which the seats table CHECK constraint stores.
 * Exceptions: None.
 */
export const HUMAN_SEAT_KIND = 'human' as const;

/**
 * Kind stored for a seat a commander plays.
 *
 * Purpose: `seat.kind` is compared with this constant rather than a bare `'ai'` literal.
 * When to use: Roster rows, new-game rows, and any check for an AI kind.
 * Expected outcome: The string `ai`, which the seats table CHECK constraint stores.
 * Exceptions: None.
 */
export const AI_SEAT_KIND = 'ai' as const;

/**
 * Whether a seat is played by a person or by a commander.
 *
 * Purpose: Observe mode has no human seat. A human seat has no commander.
 * When to use: Roster rows and snapshot filtering.
 * Expected outcome: `HUMAN_SEAT_KIND` or `AI_SEAT_KIND`.
 * Exceptions: None.
 */
export type SeatKind = typeof HUMAN_SEAT_KIND | typeof AI_SEAT_KIND;

/**
 * The three doctrines a commander can play.
 *
 * Purpose: Random draws one of these. Balanced is the default and adds no prompt block.
 * When to use: Stored doctrine and prompt selection.
 * Expected outcome: `'aggressive'`, `'balanced'`, or `'cautious'`.
 * Exceptions: None.
 */
export const DOCTRINES = ['aggressive', 'balanced', 'cautious'] as const;

/**
 * A doctrine that can appear in a prompt.
 *
 * Purpose: Narrows a string to one of `DOCTRINES`.
 * When to use: Prompt building after a choice has been drawn.
 * Expected outcome: One of the three doctrine ids.
 * Exceptions: None.
 */
export type Doctrine = (typeof DOCTRINES)[number];

/**
 * Doctrine choices offered at setup, including Random.
 *
 * Purpose: The interface stores the choice. Random is not itself a prompt block.
 * When to use: New-game rows and the commander popover.
 * Expected outcome: A doctrine id or `'random'`.
 * Exceptions: None.
 */
export const DOCTRINE_CHOICES = [...DOCTRINES, 'random'] as const;

/**
 * A doctrine choice, including Random.
 *
 * Purpose: What the human picked, before a random draw is revealed.
 * When to use: Seat commander settings.
 * Expected outcome: A `Doctrine` or `'random'`.
 * Exceptions: None.
 */
export type DoctrineChoice = (typeof DOCTRINE_CHOICES)[number];

/**
 * Doctrine used when a commander was never given one.
 *
 * Purpose: New-game rows and a missing stored doctrine stay on today's opponent behavior.
 * When to use: Roster reads and new AI rows.
 * Expected outcome: `'balanced'`.
 * Exceptions: None.
 */
export const DEFAULT_DOCTRINE: Doctrine = 'balanced';

/**
 * Why a seat was knocked out. Several can apply on the same turn.
 *
 * Purpose: The stored reason ids, in the order they are recorded.
 * When to use: Outcome recording and knockout notices.
 * Expected outcome: `'home_control'`, then `'no_city_hexes'`, then `'home_cities_destroyed'`.
 * Exceptions: None.
 */
export type SeatOutReason = 'home_control' | 'no_city_hexes' | 'home_cities_destroyed';

/**
 * An AI seat's model, effort, and doctrine.
 *
 * Purpose: The human seat has no commander. Each AI seat has one.
 * When to use: Consults and the commander summary.
 * Expected outcome: `modelId` null means standing orders only. `doctrine` is the doctrine
 * actually played, including the draw when the choice is `'random'`.
 * Exceptions: None.
 */
export interface SeatCommander {
  /**
   * The model this commander calls, or null when it runs standing orders only.
   *
   * Contract: Null means no model. A string is the model id stored for the seat.
   * When to use: Before starting a consult.
   * Expected outcome: Null skips the model and uses standing orders.
   * Exceptions: None.
   */
  readonly modelId: string | null;
  /**
   * Reasoning effort sent with the model, or null for the model's default.
   *
   * Contract: Null means the model default. A string is the effort id the model supports.
   * When to use: While building the request profile.
   * Expected outcome: An unsupported effort is dropped by the profile helper, not here.
   * Exceptions: None.
   */
  readonly reasoningEffort: string | null;
  /**
   * The doctrine the human picked, including Random.
   *
   * Contract: `'random'` is a choice, not a prompt block. The other values are doctrines.
   * When to use: Setup, the commander summary, and deciding whether to hide the draw.
   * Expected outcome: One of `DOCTRINE_CHOICES`.
   * Exceptions: None.
   */
  readonly doctrineChoice: DoctrineChoice;
  /**
   * Whether an OpenRouter key is stored for this commander.
   *
   * Contract: True when a key is stored. The secret itself is not on this object.
   * When to use: Deciding whether Run can call the model for this seat.
   * Expected outcome: False on a roster row read from SQL. A snapshot copies the flag passed to `toSeatSnapshot`.
   * Exceptions: None.
   */
  readonly hasApiKey: boolean;
  /**
   * The doctrine the commander actually plays.
   *
   * Contract: When the choice is Random, this is the draw. Otherwise it matches the choice.
   * When to use: Prompt building.
   * Expected outcome: One of `DOCTRINES`.
   * Exceptions: None.
   */
  readonly doctrine: Doctrine;
}

/**
 * One side of a match, as stored.
 *
 * Purpose: The roster row the main process keeps. `homeRegion` is the side group's
 * display name on a regional map and the UN subregion name on the global map.
 * When to use: After reading the `seats` table, and as the input to a snapshot.
 * Expected outcome: `outReasons` is empty while the seat is active. `place` is set at
 * knockout and at game end. `commander` is null for the human seat.
 * Exceptions: None.
 */
export interface SeatRecord {
  /**
   * Stored id of this side.
   *
   * Contract: The human seat is `HUMAN_SEAT_ID`. AI seats are the first AI seat through `'opponent4'`.
   * When to use: Unit owner, fog, and roster lookups.
   * Expected outcome: A `SeatId`.
   * Exceptions: None.
   */
  readonly seatId: SeatId;
  /**
   * List and color order, from 1 to 4.
   *
   * Contract: Seat 1 is the human whenever the match has one. Observe mode starts at 1 with no human.
   * When to use: Sorting, colors, and place lists.
   * Expected outcome: An integer from 1 to 4, unique in the roster.
   * Exceptions: None.
   */
  readonly seatOrder: number;
  /**
   * Whether a person or a commander plays the seat.
   *
   * Contract: `HUMAN_SEAT_KIND` has a null commander. `AI_SEAT_KIND` has a commander.
   * When to use: Consults and the "you" label.
   * Expected outcome: `HUMAN_SEAT_KIND` or `AI_SEAT_KIND`.
   * Exceptions: None.
   */
  readonly kind: SeatKind;
  /**
   * Home name used by prompts and hex lookup.
   *
   * Contract: On a regional map this is the side group's display name. On the global map it is the UN subregion name.
   * When to use: Home hex lookup and labels. Short names are computed, not stored.
   * Expected outcome: A non-empty name `getScenarioHomeRegionHexes` can resolve.
   * Exceptions: None.
   */
  readonly homeRegion: string;
  /**
   * The AI seat's commander, or null for the human seat.
   *
   * Contract: Null only when `kind` is `HUMAN_SEAT_KIND`.
   * When to use: Consults and the commander summary.
   * Expected outcome: A `SeatCommander` or null.
   * Exceptions: None.
   */
  readonly commander: SeatCommander | null;
  /**
   * Turn on which the seat was knocked out, or null while it is active.
   *
   * Contract: Null means the seat is still playing.
   * When to use: Active-seat filters and the "Out, turn N" label.
   * Expected outcome: A positive turn number, or null.
   * Exceptions: None.
   */
  readonly outTurn: number | null;
  /**
   * The seat credited with the knockout, or null when none is.
   *
   * Contract: Set only once the seat is out. Null when no other seat controlled its home cities.
   * When to use: Standings and knockout notices.
   * Expected outcome: A `SeatId` or null.
   * Exceptions: None.
   */
  readonly outBy: SeatId | null;
  /**
   * Every knockout reason that held, in record order.
   *
   * Contract: Empty while the seat is active. Otherwise `home_control`, then `no_city_hexes`, then `home_cities_destroyed`, keeping only those that held.
   * When to use: Notices and the roster read.
   * Expected outcome: A readonly array of `SeatOutReason`.
   * Exceptions: None.
   */
  readonly outReasons: readonly SeatOutReason[];
  /**
   * Finishing place, set at knockout and at game end.
   *
   * Contract: Null until the seat is placed. Ties share a place.
   * When to use: Standings.
   * Expected outcome: A positive integer, or null.
   * Exceptions: None.
   */
  readonly place: number | null;
  /**
   * How many consultations this AI seat has finished.
   *
   * Contract: Zero for a human seat and at the start of a match.
   * When to use: The commander card.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly consultationCount: number;
  /**
   * Model cost charged to this AI seat, in US dollars.
   *
   * Contract: Zero for a human seat and at the start of a match.
   * When to use: The commander card and the match total.
   * Expected outcome: A non-negative number.
   * Exceptions: None.
   */
  readonly costUsd: number;
}

/**
 * A seat as the renderer receives it.
 *
 * Purpose: A random doctrine stays hidden until game over.
 * When to use: `GameStateSnapshot.seats`.
 * Expected outcome: Same as `SeatRecord`, except `commander.doctrine` is null while a
 * random draw is hidden.
 * Exceptions: None.
 */
export interface SeatSnapshot extends Omit<SeatRecord, 'commander'> {
  /**
   * Commander settings the renderer may show.
   *
   * Contract: Null for the human seat. `doctrine` is null while a random draw is hidden.
   * When to use: Snapshot rows sent to the renderer.
   * Expected outcome: A chosen doctrine is always present. A random doctrine appears only after reveal.
   * Exceptions: None.
   */
  readonly commander: (Omit<SeatCommander, 'doctrine'> & { readonly doctrine: Doctrine | null }) | null;
}

/**
 * Copies seats into seat order.
 *
 * Purpose: Lists, colors, and knockouts agree on one order.
 * When to use: Before rendering or walking the roster.
 * Expected outcome: A new array sorted by `seatOrder` ascending. The input is unchanged.
 * Exceptions: None.
 */
export function sortSeatsByOrder<T extends Pick<SeatRecord, 'seatOrder'>>(seats: readonly T[]): T[] {
  return [...seats].sort((left, right) => left.seatOrder - right.seatOrder);
}

/**
 * Returns whether a seat is still in the match.
 *
 * Purpose: Knocked-out seats stay on the roster but drop out of planning and fog.
 * When to use: Before consults, fog, and enemy lists.
 * Expected outcome: `true` when `outTurn` is null.
 * Exceptions: None.
 */
export function isSeatActive(seat: Pick<SeatRecord, 'outTurn'>): boolean {
  return seat.outTurn === null;
}

/**
 * Active seats in seat order.
 *
 * Purpose: Win checks and fog consider only seats that have not been knocked out.
 * When to use: End of turn and per-seat fog.
 * Expected outcome: Seats with `outTurn === null`, sorted by `seatOrder`.
 * Exceptions: None.
 */
export function activeSeats<T extends Pick<SeatRecord, 'outTurn' | 'seatOrder'>>(seats: readonly T[]): T[] {
  return sortSeatsByOrder(seats.filter((seat) => isSeatActive(seat)));
}

/**
 * Active AI seats in seat order.
 *
 * Purpose: Consults run for commanders, not for the human seat.
 * When to use: Planning and Ready gather.
 * Expected outcome: Active seats whose `kind` is `AI_SEAT_KIND`, in seat order.
 * Exceptions: None.
 */
export function activeAiSeats<T extends Pick<SeatRecord, 'outTurn' | 'seatOrder' | 'kind'>>(
  seats: readonly T[]
): T[] {
  return sortSeatsByOrder(seats.filter((seat) => isSeatActive(seat) && seat.kind === AI_SEAT_KIND));
}

/**
 * Active AI seat ids in seat order.
 *
 * Purpose: Consults and loss notes need ids, not full rows.
 * When to use: After a roster is in hand. `activeAiSeats` already sorts, so the ids come back in seat order.
 * Expected outcome: Ids of active seats whose kind is `AI_SEAT_KIND`. A seat id that is not an AI seat id is dropped.
 * Exceptions: None.
 */
export function activeAiSeatIds(
  seats: readonly Pick<SeatRecord, 'seatId' | 'outTurn' | 'seatOrder' | 'kind'>[]
): AiSeatId[] {
  return activeAiSeats(seats)
    .map((seat) => seat.seatId)
    .filter((seatId): seatId is AiSeatId => isAiSeatId(seatId));
}

/**
 * The human seat, if the match has one.
 *
 * Purpose: Observe mode has none. The interface uses this to decide who "you" is.
 * When to use: Top bar, standings, and view-as defaults.
 * Expected outcome: The seat with `kind === HUMAN_SEAT_KIND`, or null.
 * Exceptions: None.
 */
export function findHumanSeat<T extends Pick<SeatRecord, 'kind'>>(seats: readonly T[]): T | null {
  return seats.find((seat) => seat.kind === HUMAN_SEAT_KIND) ?? null;
}

/**
 * Finds a seat by id.
 *
 * Purpose: Callers have an id from a unit or a hex and need the roster row.
 * When to use: After reading `units.player` or a controller id.
 * Expected outcome: The matching seat, or null when the id is missing or is not a seat.
 * Exceptions: None.
 */
export function findSeat<T extends Pick<SeatRecord, 'seatId'>>(seats: readonly T[], seatId: string): T | null {
  return seats.find((seat) => seat.seatId === seatId) ?? null;
}

/**
 * Active enemies of a seat, in seat order.
 *
 * Purpose: Every other active seat is an enemy. Knocked-out seats are not.
 * When to use: Prompts and targeting lists.
 * Expected outcome: Seat ids of active seats other than `seatId`, sorted by `seatOrder`.
 * Exceptions: None.
 */
export function enemySeatIdsOf(
  seats: readonly Pick<SeatRecord, 'seatId' | 'outTurn' | 'seatOrder'>[],
  seatId: SeatId
): SeatId[] {
  return activeSeats(seats)
    .filter((seat) => seat.seatId !== seatId)
    .map((seat) => seat.seatId);
}

/**
 * Copies a seat for the renderer, hiding a random doctrine until game over.
 *
 * Purpose: The commander's own prompt may contain the draw. The interface may not, until
 * the match is over.
 * When to use: While building `GameStateSnapshot.seats`. `revealDoctrine` is true when
 * the match is over.
 * Expected outcome: A chosen doctrine is always copied. A random doctrine is null until
 * `revealDoctrine` is true. `hasApiKey` is the boolean passed in. A human seat keeps `commander: null`.
 * Exceptions: None.
 */
export function toSeatSnapshot(seat: SeatRecord, revealDoctrine: boolean, hasApiKey: boolean): SeatSnapshot {
  if (seat.commander === null) {
    return { ...seat, commander: null };
  }
  const hideRandomDoctrine = seat.commander.doctrineChoice === 'random' && !revealDoctrine;
  return {
    ...seat,
    commander: {
      modelId: seat.commander.modelId,
      reasoningEffort: seat.commander.reasoningEffort,
      doctrineChoice: seat.commander.doctrineChoice,
      hasApiKey,
      doctrine: hideRandomDoctrine ? null : seat.commander.doctrine,
    },
  };
}

/**
 * Re-exports the short home name used on chips and unit labels.
 *
 * Purpose: Callers already import `shortSideName` from this module. The rule lives in `shortSideName.ts`.
 * When to use: Labels shown to someone other than the unit's owner.
 * Expected outcome: The same string `shortSideName` returns from that module.
 * Exceptions: None.
 */
export { shortSideName } from './shortSideName';
