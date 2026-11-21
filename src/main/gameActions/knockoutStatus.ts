/**
 * How close each active side is to being knocked out, for the strategic briefing.
 *
 * Purpose: Every commander sees its own and each enemy's city hex count and how much of its home is lost, from the same counts the knockout rule uses.
 * When to use: While building the strategic system prompt, outside a battle.
 * Expected outcome: A pure builder over rows the caller read, and a thin database reader that feeds it.
 * Exceptions: The database reader propagates roster, control, and baseline errors. The prompt builder that calls it catches and logs them.
 */

import { activeSeats, findSeat, isSeatActive, type SeatRecord } from '../../shared/seatRoster';
import type { SeatId } from '../../shared/seatIds';
import { dbGetOne, getHexControlMap, getScenarioHomeRegionHexes, getSeatRoster, listStrategicInfrastructureRows } from '../gameDb';
import { loadScenarioState, REGION_VS_REGION_SCENARIO_ID } from '../gameDb/scenarioState';
import { logDebug, logTrace } from '../logger';
import { baselineUrbanCellsForControlWin, effectiveControlWinMinUrbanShare } from './endOfTurnOutcome';
import { computeHomeControlProgress, computeHomeLossProgress, type HomeLossProgress } from './homeControlProgress';

/**
 * One city hex a side holds.
 *
 * Purpose: The briefing lists the city hexes of a side that is close to being knocked out.
 * When to use: `SideKnockoutStatus.cityHexes`.
 * Expected outcome: A hex id and its current urban cell count.
 * Exceptions: None.
 */
export interface KnockoutCityHex {
  /**
   * The strategic hex id.
   *
   * Contract: A hex the side controls with `urbanCells` above zero.
   * When to use: Formatting a hex code for the prompt.
   * Expected outcome: An H3 index.
   * Exceptions: None.
   */
  readonly h3Index: string;
  /**
   * Current urban cells in the hex.
   *
   * Contract: The stored `urbanHexCount`, the same count the no-city-hexes rule uses. A positive integer.
   * When to use: Ordering and printing the listing.
   * Expected outcome: A positive integer.
   * Exceptions: None.
   */
  readonly urbanCells: number;
}

/**
 * Knockout status of one active side.
 *
 * Purpose: One row per side holds everything the briefing prints about it.
 * When to use: `KnockoutStatusForSeat.own` and `.enemies`.
 * Expected outcome: Counts from true control, even when fog of war is on.
 * Exceptions: None.
 */
export interface SideKnockoutStatus {
  /**
   * The side.
   *
   * Contract: An active seat.
   * When to use: Matching a row to a roster seat.
   * Expected outcome: A `SeatId`.
   * Exceptions: None.
   */
  readonly seatId: SeatId;
  /**
   * The side's display name.
   *
   * Contract: The seat's stored `homeRegion`, trimmed.
   * When to use: The enemy row's label.
   * Expected outcome: A non-empty name for a seated side.
   * Exceptions: None.
   */
  readonly name: string;
  /**
   * City hexes the side holds.
   *
   * Contract: Hexes it controls with current `urbanHexCount` above zero, by urban cells descending, then hex id ascending.
   * When to use: The city hex count and the near-knockout listing.
   * Expected outcome: Possibly empty.
   * Exceptions: None.
   */
  readonly cityHexes: readonly KnockoutCityHex[];
  /**
   * How much of the side's own home other seats and Neutral hold.
   *
   * Contract: `computeHomeLossProgress` with this seat as owner.
   * When to use: The share or every-hex line.
   * Expected outcome: The counts the knockout rule would use.
   * Exceptions: None.
   */
  readonly homeLoss: HomeLossProgress;
  /**
   * Original urban cells of this side's home that the viewer holds.
   *
   * Contract: For an enemy row, `computeHomeControlProgress` with the viewer as controller. For the viewer's own row, 0.
   * When to use: The "of them yours" count on an enemy line.
   * Expected outcome: A non-negative integer.
   * Exceptions: None.
   */
  readonly viewerHeldHomeUrbanCells: number;
}

/**
 * Knockout status the strategic briefing prints for one commander.
 *
 * Purpose: One value carries the viewer's row, each enemy's row, and the share they were all computed with.
 * When to use: The return value of `buildKnockoutStatus` and `knockoutStatusForSeat`.
 * Expected outcome: Enemies are active seats other than the viewer, in seat order.
 * Exceptions: None.
 */
export interface KnockoutStatusForSeat {
  /**
   * The effective share every row used.
   *
   * Contract: A fraction, or null when the every-hex fallback applies.
   * When to use: The objective text and the progress lines.
   * Expected outcome: The value passed to the builder.
   * Exceptions: None.
   */
  readonly share: number | null;
  /**
   * The viewer's own row.
   *
   * Contract: The viewer is an active seat.
   * When to use: The "Your side" line.
   * Expected outcome: A status with `viewerHeldHomeUrbanCells` 0.
   * Exceptions: None.
   */
  readonly own: SideKnockoutStatus;
  /**
   * One row per active enemy.
   *
   * Contract: Seat order. Seats already out are absent.
   * When to use: The enemy lines.
   * Expected outcome: Possibly empty.
   * Exceptions: None.
   */
  readonly enemies: readonly SideKnockoutStatus[];
}

/**
 * Builds the knockout status of one commander and each active enemy.
 *
 * Purpose: The briefing and the knockout rule use the same home-loss counts. This function reads no database, so tests can feed it rows.
 * When to use: `knockoutStatusForSeat`, and tests.
 * Expected outcome: A status, or null when the viewer is not on the roster or is already out.
 * Exceptions: None. The baseline callback's exceptions propagate.
 */
export function buildKnockoutStatus(args: {
  readonly viewerSeatId: SeatId;
  readonly seats: readonly SeatRecord[];
  readonly homeHexesBySeat: ReadonlyMap<SeatId, readonly string[]>;
  readonly controlByHex: ReadonlyMap<string, string | null | undefined>;
  readonly infrastructure: readonly { readonly h3Index: string; readonly urbanHexCount: number }[];
  readonly baselineUrbanCellsForHex: (h3Index: string) => number;
  readonly minUrbanShare: number | null;
}): KnockoutStatusForSeat | null {
  const viewer = findSeat(args.seats, args.viewerSeatId);
  if (!viewer || !isSeatActive(viewer)) {
    logTrace('buildKnockoutStatus', { viewerSeatId: args.viewerSeatId, viewerActive: false });
    return null;
  }
  const enemySeats = activeSeats(args.seats).filter((seat) => seat.seatId !== args.viewerSeatId);
  logTrace('buildKnockoutStatus', { viewerSeatId: args.viewerSeatId, enemyCount: enemySeats.length });
  const urbanByHex = new Map(args.infrastructure.map((row) => [row.h3Index, row.urbanHexCount]));
  const rowFor = (seat: SeatRecord): SideKnockoutStatus => {
    const homeHexes = args.homeHexesBySeat.get(seat.seatId) ?? [];
    const cityHexes = [...args.controlByHex.entries()]
      .flatMap(([h3Index, controller]) => {
        const urbanCells = urbanByHex.get(h3Index) ?? 0;
        return controller === seat.seatId && urbanCells > 0 ? [{ h3Index, urbanCells }] : [];
      })
      .sort((a, b) => b.urbanCells - a.urbanCells || (a.h3Index < b.h3Index ? -1 : a.h3Index > b.h3Index ? 1 : 0));
    const homeLoss = computeHomeLossProgress({
      homeHexes,
      ownerSeatId: seat.seatId,
      controlByHex: args.controlByHex,
      baselineUrbanCellsForHex: args.baselineUrbanCellsForHex,
      minUrbanShare: args.minUrbanShare,
    });
    const viewerHeldHomeUrbanCells = seat.seatId === args.viewerSeatId
      ? 0
      : computeHomeControlProgress({
          homeHexes,
          controller: args.viewerSeatId,
          controlByHex: args.controlByHex,
          baselineUrbanCellsForHex: args.baselineUrbanCellsForHex,
          minUrbanShare: args.minUrbanShare,
        }).heldUrbanCells;
    return { seatId: seat.seatId, name: seat.homeRegion.trim(), cityHexes, homeLoss, viewerHeldHomeUrbanCells };
  };
  return { share: args.minUrbanShare, own: rowFor(viewer), enemies: enemySeats.map(rowFor) };
}

/**
 * Reads the match and builds one commander's knockout status.
 *
 * Purpose: The strategic prompt prints each side's city hex count and home loss from true control, the same data the knockout rule reads.
 * When to use: While building the strategic system prompt, outside a battle.
 * Expected outcome: Null unless the match is region-versus-region and the seat is active on the roster. Otherwise the status. Nothing is written.
 * Exceptions: Propagates a roster read error and a baseline lookup that throws. It catches nothing.
 */
export function knockoutStatusForSeat(seatId: SeatId): KnockoutStatusForSeat | null {
  const scenario = loadScenarioState({ getOne: dbGetOne });
  if (scenario.scenarioId !== REGION_VS_REGION_SCENARIO_ID) {
    logTrace('knockoutStatusForSeat', { seatId, scenarioId: scenario.scenarioId });
    return null;
  }
  const seats = getSeatRoster();
  const effectiveShare = effectiveControlWinMinUrbanShare();
  const status = buildKnockoutStatus({
    viewerSeatId: seatId,
    seats,
    homeHexesBySeat: new Map(seats.map((seat) => [seat.seatId, getScenarioHomeRegionHexes(seat.homeRegion)])),
    controlByHex: getHexControlMap(),
    infrastructure: listStrategicInfrastructureRows(),
    baselineUrbanCellsForHex: (h3Index) => baselineUrbanCellsForControlWin(h3Index, effectiveShare),
    minUrbanShare: effectiveShare,
  });
  logDebug('knockoutStatusForSeat', { seatId, enemyCount: status?.enemies.length ?? 0, share: effectiveShare });
  return status;
}
