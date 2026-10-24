/**
 * Which seat a briefing or assessment treats as its own side.
 */

import { AI_SEAT_IDS, isAiSeatId, type AiSeatId } from '../../shared/seatIds';
import { logTrace } from '../logger';

/**
 * One roster row the home-hex helpers need.
 *
 * Purpose: Briefings can read homes without depending on the full seat snapshot.
 * When to use: `enemyHomeHexes` only.
 * Expected outcome: `outTurn` null means the seat is still active.
 * Exceptions: None.
 */
type HomeSeat = { readonly seatId: string; readonly outTurn: number | null };

/**
 * AI seat that plans a tactical battle.
 *
 * Purpose: The battle's other party is the commander when that party is an AI seat. Neutral battles and snapshots that omit the party keep the first AI seat.
 * When to use: Tactical assessments and the tactical plan snapshot.
 * Expected outcome: `opposingPartyId` when it is an AI seat; otherwise the first AI seat.
 * Exceptions: None.
 */
export function briefingSeatForBattle(battle: { readonly opposingPartyId?: string }): AiSeatId {
  const party = battle.opposingPartyId;
  const seatId = party !== undefined && isAiSeatId(party) ? party : AI_SEAT_IDS[0];
  logTrace('briefingPerspective briefingSeatForBattle', { opposingPartyId: party ?? null, seatId });
  return seatId;
}

/**
 * Seat whose units are "yours" in this snapshot.
 *
 * Purpose: Consultations set `playerPerspective` to the commander being briefed. Snapshots that omit it keep the first AI seat, the only AI seat of a two-sided match.
 * When to use: Own-versus-enemy splits in briefing text, map markers, assessments, and combat estimates.
 * Expected outcome: The perspective when it is an AI seat; otherwise the first AI seat.
 * Exceptions: None.
 */
export function briefingOwnSeatId(state: { readonly playerPerspective?: string }): AiSeatId {
  const perspective = state.playerPerspective;
  const seatId = perspective !== undefined && isAiSeatId(perspective) ? perspective : AI_SEAT_IDS[0];
  logTrace('briefingPerspective briefingOwnSeatId', { playerPerspective: perspective ?? null, seatId });
  return seatId;
}

/**
 * Home hexes of every other active seat.
 *
 * Purpose: Best Options and home-control lines treat those hexes as enemy homeland. Neutral has no home.
 * When to use: When the snapshot carries a roster and a home map.
 * Expected outcome: Union of the other active seats' homes. Empty when the roster or the map is absent.
 * Exceptions: None.
 */
export function enemyHomeHexes(state: {
  readonly playerPerspective?: string;
  readonly seats?: readonly HomeSeat[];
  readonly homeRegionHexesBySeat?: Readonly<Record<string, readonly string[]>>;
}): readonly string[] {
  const own = briefingOwnSeatId(state);
  const seats = state.seats ?? [];
  const homes = state.homeRegionHexesBySeat;
  const hexes =
    seats.length > 0 && homes
      ? seats.filter((seat) => seat.seatId !== own && seat.outTurn == null).flatMap((seat) => homes[seat.seatId] ?? [])
      : [];
  logTrace('briefingPerspective enemyHomeHexes', { own, hexCount: hexes.length });
  return hexes;
}

/**
 * Home hexes of the briefing seat.
 *
 * Purpose: "Your home region" counts follow the commander, not a fixed side.
 * When to use: System-prompt home control.
 * Expected outcome: That seat's list from `homeRegionHexesBySeat`. Empty when the map has no row for the seat.
 * Exceptions: None.
 */
export function ownHomeHexes(state: {
  readonly playerPerspective?: string;
  readonly homeRegionHexesBySeat?: Readonly<Record<string, readonly string[]>>;
}): readonly string[] {
  const hexes = state.homeRegionHexesBySeat?.[briefingOwnSeatId(state)] ?? [];
  logTrace('briefingPerspective ownHomeHexes', { hexCount: hexes.length });
  return hexes;
}
