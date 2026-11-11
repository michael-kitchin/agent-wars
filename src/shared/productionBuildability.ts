/**
 * Where a seat may build, and the paused flag on a snapshot.
 *
 * Purpose: A seat builds in its home region and where it has a unit or a fortification. Elsewhere the queue pauses.
 * When to use: The production spend loop, the build popup, and the map label share this rule.
 * Expected outcome: True when the hex is home, holds one of the seat's units, or is fortified. The flag is set only on the viewer's own paused rows, unless the viewer is observe-all.
 * Exceptions: None.
 */

import type { GameStateSnapshot } from './ipc/gameStateTypes';
import { isSeatId } from './seatIds';

/**
 * Whether the controlling seat may build on this hex.
 *
 * Purpose: Home, a unit, or a fortification is enough. Callers ask only for the hex's controller, so a fortification there is that seat's.
 * When to use: The spend loop and the planning view.
 * Expected outcome: True for a home hex, a hex in `seatUnitHexes`, or a positive `fortifiedCount`.
 * Exceptions: None.
 */
export function isHexBuildableForSeat(args: {
  readonly h3Index: string;
  readonly homeHexes: ReadonlySet<string>;
  readonly seatUnitHexes: ReadonlySet<string>;
  readonly fortifiedCount: number;
}): boolean {
  return args.homeHexes.has(args.h3Index) || args.seatUnitHexes.has(args.h3Index) || args.fortifiedCount > 0;
}

/**
 * Copies a snapshot and marks the viewer's paused production rows.
 *
 * Purpose: The map label reads `buildPaused` without a second query. Another side's flag would reveal whether it has units there.
 * When to use: After the per-seat snapshot is assembled. Pass null for observe-all.
 * Expected outcome: The same snapshot when it has no queue totals. Otherwise paused rows of the viewer, or of every seat when the viewer is null, have `buildPaused: true`.
 * Exceptions: None.
 */
export function withBuildPausedFlags(state: GameStateSnapshot, viewerSeatId: string | null): GameStateSnapshot {
  const totals = state.strategicBuildQueueTotals;
  if (!totals) return state;
  const homes = new Map<string, ReadonlySet<string>>();
  for (const [seatId, hexes] of Object.entries(state.homeRegionHexesBySeat ?? {})) {
    homes.set(seatId, new Set(hexes));
  }
  const unitHexes = new Map<string, Set<string>>();
  for (const unit of state.units) {
    const hexes = unitHexes.get(unit.player) ?? new Set<string>();
    hexes.add(unit.h3Index);
    unitHexes.set(unit.player, hexes);
  }
  const controllerOf = new Map(
    (state.strategicControl ?? []).map((row) => [row.h3Index, row.controllerPlayerId])
  );
  const fortifiedOf = new Map(
    (state.strategicInfrastructure ?? []).map((row) => [row.h3Index, row.fortifiedCount ?? 0])
  );
  const strategicBuildQueueTotals = totals.map((row) => {
    const controller = controllerOf.get(row.h3Index) ?? null;
    if (!controller || !isSeatId(controller)) return row;
    if (viewerSeatId !== null && controller !== viewerSeatId) return row;
    const buildable = isHexBuildableForSeat({
      h3Index: row.h3Index,
      homeHexes: homes.get(controller) ?? new Set<string>(),
      seatUnitHexes: unitHexes.get(controller) ?? new Set<string>(),
      fortifiedCount: fortifiedOf.get(row.h3Index) ?? 0,
    });
    if (buildable) return row;
    return { ...row, buildPaused: true as const };
  });
  return { ...state, strategicBuildQueueTotals };
}

/**
 * Hexes where a raise would let the seat build again.
 *
 * Purpose: The Raise Options table marks the cells where a raise would let the seat build again.
 * When to use: With the snapshot the seat is briefed on. It reads only that seat's control, units, and home.
 * Expected outcome: The H3 indexes the seat controls that have city cells and fail `isHexBuildableForSeat`.
 * Exceptions: None.
 */
export function listOccupationPausedHexes(state: GameStateSnapshot, seatId: string): Set<string> {
  const homeHexes = new Set(state.homeRegionHexesBySeat?.[seatId] ?? []);
  const seatUnitHexes = new Set(state.units.filter((unit) => unit.player === seatId).map((unit) => unit.h3Index));
  const infrastructure = new Map((state.strategicInfrastructure ?? []).map((row) => [row.h3Index, row]));
  const paused = new Set<string>();
  for (const row of state.strategicControl ?? []) {
    if (row.controllerPlayerId !== seatId) continue;
    const infra = infrastructure.get(row.h3Index);
    if (!infra || infra.urbanHexCount <= 0) continue;
    const buildable = isHexBuildableForSeat({
      h3Index: row.h3Index,
      homeHexes,
      seatUnitHexes,
      fortifiedCount: infra.fortifiedCount ?? 0,
    });
    if (!buildable) paused.add(row.h3Index);
  }
  return paused;
}
