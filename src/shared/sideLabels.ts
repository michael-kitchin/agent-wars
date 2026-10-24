import { isNeutralOwnerId, isSeatId, HUMAN_SEAT_ID } from './seatIds';
import { shortSideName, type SeatSnapshot } from './seatRoster';

/**
 * The roster fields a side label needs.
 *
 * Purpose: Callers can pass a full snapshot or a smaller row.
 * When to use: The arguments of the label functions in this module.
 * Expected outcome: `homeRegion` is the full name. `outTurn` null means the seat is still in the match.
 * Exceptions: None.
 */
export type SideLabelSeat = Pick<SeatSnapshot, 'seatId' | 'seatOrder' | 'homeRegion' | 'outTurn'>;

/**
 * Home lists a label can read without taking a whole snapshot.
 *
 * Purpose: Tooltips and the selection panel share one way to find who claims a hex.
 * When to use: `homeSeatIdsAtHex`.
 * Expected outcome: The seat map names every home that contains the hex.
 * Exceptions: None.
 */
export interface HomeHexLists {
  /**
   * Home hexes keyed by seat.
   *
   * Contract: Each value is that seat's home. A hex may appear in more than one value.
   * When to use: Whenever the snapshot has this map.
   * Expected outcome: A hex in a list belongs to that seat.
   * Exceptions: None.
   */
  readonly homeRegionHexesBySeat?: Readonly<Record<string, readonly string[]>>;
}

/**
 * Seat ids whose home contains one hex.
 *
 * Purpose: Control suffixes and home chips need every home, including a third seat.
 * When to use: Before `formatHexControlLabel` or `formatHomeChip`.
 * Expected outcome: Seat ids in roster insertion order. Empty when the hex is not a home.
 * Exceptions: None.
 */
export function homeSeatIdsAtHex(h3Index: string, lists: HomeHexLists): string[] {
  const bySeat = lists.homeRegionHexesBySeat;
  if (!bySeat) return [];
  return Object.entries(bySeat)
    .filter(([, hexes]) => hexes.includes(h3Index))
    .map(([seatId]) => seatId);
}

/**
 * The human seat when the match has one.
 *
 * Purpose: Observe mode has no viewer, so no side reads as "You".
 * When to use: Any label that says "You" or "your home".
 * Expected outcome: The human seat id, or null when every seat is AI.
 * Exceptions: None.
 */
export function viewerSeatIdForRoster(seats: readonly Pick<SeatSnapshot, 'seatId' | 'kind'>[]): string | null {
  return seats.find((seat) => seat.kind === HUMAN_SEAT_ID)?.seatId ?? null;
}

/**
 * Full name of a seat as one viewer should read it.
 *
 * Purpose: The viewer's own side is "You". Everyone else is the home name.
 * When to use: Control lines and home suffixes.
 * Expected outcome: "You" or `homeRegion`. A missing seat returns its id.
 * Exceptions: None.
 */
function sideDisplayName(seatId: string, seats: readonly SideLabelSeat[], viewerSeatId: string | null): string {
  const seat = seats.find((row) => row.seatId === seatId);
  if (viewerSeatId != null && seatId === viewerSeatId) return 'You';
  return seat?.homeRegion ?? seatId;
}

/**
 * Sorts home seats into seat order.
 *
 * Purpose: Shared-home text stays stable.
 * When to use: The home suffix.
 * Expected outcome: Known seats only, lowest `seatOrder` first.
 * Exceptions: None.
 */
function homesInOrder(homeSeatIds: readonly string[], seats: readonly SideLabelSeat[]): SideLabelSeat[] {
  return homeSeatIds
    .map((seatId) => seats.find((seat) => seat.seatId === seatId))
    .filter((seat): seat is SideLabelSeat => seat != null)
    .sort((left, right) => left.seatOrder - right.seatOrder);
}

/**
 * "Control:" text for a world hex the viewer can see.
 *
 * Purpose: Replaces the two fixed words Human and AI with the roster.
 * When to use: After the caller has decided the hex is visible, or that it is a home hex.
 * Expected outcome: The controller's name, then a home suffix. A null or Neutral controller reads "Neutral".
 *   No home means no suffix.
 * Exceptions: None. A hidden hex is the caller's "Unknown", not this function's.
 */
export function formatHexControlLabel(args: {
  readonly controllerId: string | null;
  readonly homeSeatIds: readonly string[];
  readonly viewerSeatId: string | null;
  readonly seats: readonly SideLabelSeat[];
}): string {
  const homes = homesInOrder(args.homeSeatIds, args.seats);
  const controllerIsSeat = args.controllerId != null && isSeatId(args.controllerId);
  const controllerName = controllerIsSeat
    ? sideDisplayName(args.controllerId!, args.seats, args.viewerSeatId)
    : 'Neutral';
  if (homes.length === 0) return controllerName;
  if (homes.length >= 2) {
    const names = homes.map((seat) => sideDisplayName(seat.seatId, args.seats, args.viewerSeatId));
    return `${controllerName} (${names.join(' & ')} homes)`;
  }
  const home = homes[0]!;
  if (args.viewerSeatId != null && home.seatId === args.viewerSeatId) return `${controllerName} (your home)`;
  if (home.outTurn != null) return `${controllerName} (was ${home.homeRegion})`;
  return `${controllerName} (${home.homeRegion} home)`;
}

/**
 * A unit's name as a given viewer should read it.
 *
 * Purpose: A third side needs a short name on units that are not the viewer's. A two-sided match does not.
 * When to use: Stack rows, hover names, kill labels, and the selection panel.
 * Expected outcome: `baseName` for the viewer's units and for every seat in a two-seat match.
 *   "Neutral · {baseName}" for Neutral. "{short name} · {baseName}" otherwise.
 * Exceptions: None.
 */
export function formatUnitNameForViewer(args: {
  readonly baseName: string;
  readonly ownerId: string;
  readonly viewerSeatId: string | null;
  readonly seats: readonly SideLabelSeat[];
}): string {
  if (isNeutralOwnerId(args.ownerId)) return `Neutral · ${args.baseName}`;
  if (args.viewerSeatId != null && args.ownerId === args.viewerSeatId) return args.baseName;
  if (args.seats.length === 2) return args.baseName;
  const seat = args.seats.find((row) => row.seatId === args.ownerId);
  if (!seat) return args.baseName;
  return `${shortSideName(seat.homeRegion)} · ${args.baseName}`;
}

/**
 * The selection panel's home chip, or null when the hex has nothing to say.
 *
 * Purpose: The chip is shorter than the tooltip's control line.
 * When to use: World hexes. Battle cells pass no homes and no Neutral controller.
 * Expected outcome: "Home" for the viewer's home. "{short name} home" for one other home.
 *   Short names joined for a shared home. "Neutral" for Neutral land that is not a home. Null otherwise.
 * Exceptions: None.
 */
export function formatHomeChip(args: {
  readonly homeSeatIds: readonly string[];
  readonly controllerId: string | null;
  readonly viewerSeatId: string | null;
  readonly seats: readonly SideLabelSeat[];
}): { readonly kind: 'home' | 'enemy-home'; readonly text: string } | null {
  const homes = homesInOrder(args.homeSeatIds, args.seats);
  if (homes.length === 1 && args.viewerSeatId != null && homes[0]!.seatId === args.viewerSeatId) {
    return { kind: 'home', text: 'Home' };
  }
  if (homes.length === 1) return { kind: 'enemy-home', text: `${shortSideName(homes[0]!.homeRegion)} home` };
  if (homes.length >= 2) {
    const names = homes.map((seat) => shortSideName(seat.homeRegion));
    return { kind: 'enemy-home', text: `${names.join(' & ')} homes` };
  }
  if (args.controllerId != null && isNeutralOwnerId(args.controllerId)) return { kind: 'enemy-home', text: 'Neutral' };
  return null;
}
