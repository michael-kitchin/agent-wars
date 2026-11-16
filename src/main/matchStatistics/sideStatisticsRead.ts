/**
 * Reads one turn's statistics for every seat from the open match.
 *
 * Purpose: The recorder needs each side's units, hexes, production, treasury, and upkeep at a turn boundary.
 * When to use: From `recordTurnStatistics`, with the roster, at a strategic step.
 * Expected outcome: One `SideStatistics` per seat, in side order, with `unitsLost` still null.
 * Exceptions: Propagates a SQLite error.
 */

import type { BasicDbOps } from '../gameDb/dbOps';
import { readMercenaryFunds } from '../gameDb/mercenaryEconomyRead';
import { logTrace } from '../logger';
import {
  emptyUnitCounts,
  STATISTIC_MERCENARY_TYPES,
  STATISTIC_UNIT_TYPES,
  type SeatForStatistics,
  type SideStatistics,
} from '../../shared/matchStatistics';

/**
 * Counts a seat's units by type, split into built and mercenary.
 *
 * Purpose: Built units and mercenaries are separate charts.
 * When to use: Once per seat.
 * Expected outcome: Both records have every type key. A type outside the lists is ignored.
 * Exceptions: Propagates a SQLite error.
 */
function readUnitCounts(
  ops: BasicDbOps,
  seatId: string
): { readonly builtUnits: Record<string, number>; readonly mercenaryUnits: Record<string, number> } {
  const builtUnits = emptyUnitCounts(STATISTIC_UNIT_TYPES);
  const mercenaryUnits = emptyUnitCounts(STATISTIC_MERCENARY_TYPES);
  const rows = ops.getAll<{ unit_type: string; is_mercenary: number; n: number }>(
    'SELECT unit_type, is_mercenary, COUNT(*) AS n FROM units WHERE player = ? GROUP BY unit_type, is_mercenary',
    [seatId]
  );
  for (const row of rows) {
    const target = row.is_mercenary === 1 ? mercenaryUnits : builtUnits;
    if (row.unit_type in target) target[row.unit_type] = row.n;
  }
  return { builtUnits, mercenaryUnits };
}

/**
 * Reads the hex, production, and stored-point totals for one seat.
 *
 * Purpose: Production capacity counts city cells in controlled hexes, leaving out neutral-border hexes, as the top bar does.
 * When to use: Once per seat.
 * Expected outcome: The controlled hex count, the capacity, and the unspent points.
 * Exceptions: Propagates a SQLite error.
 */
function readHexTotals(
  ops: BasicDbOps,
  seatId: string
): { readonly hexes: number; readonly productionPerTurn: number; readonly storedPoints: number } {
  const hexes = ops.getOne<{ n: number }>('SELECT COUNT(*) AS n FROM res_s_control WHERE controller_player_id = ?', [seatId])?.n ?? 0;
  const production = ops.getOne<{ n: number | null }>(
    `SELECT SUM(i.urban_hex_count) AS n
     FROM res_s_control c
     JOIN res_s_infrastructure i ON i.h3_index = c.h3_index
     JOIN hexes h ON h.h3_index = c.h3_index
     WHERE c.controller_player_id = ? AND (h.map_role IS NULL OR h.map_role <> 'neutral_border')`,
    [seatId]
  )?.n;
  const stored = ops.getOne<{ n: number | null }>(
    `SELECT SUM(p.stored_points) AS n
     FROM res_s_control c
     JOIN res_s_build_progress p ON p.h3_index = c.h3_index
     WHERE c.controller_player_id = ?`,
    [seatId]
  )?.n;
  return { hexes, productionPerTurn: production ?? 0, storedPoints: stored ?? 0 };
}

/**
 * Reads every seat's statistics for the current state of the open match.
 *
 * Purpose: One call returns the numbers a strategic turn records, with no fog of war applied.
 * When to use: At a strategic step boundary. The caller passes the roster so this module does not import the database barrel.
 * Expected outcome: One entry per seat, in `seatOrder`, with every unit type present. `unitsLost` is null for the caller to fill in.
 * Exceptions: Propagates a SQLite error.
 */
export function readSideStatistics(ops: BasicDbOps, seats: readonly SeatForStatistics[]): SideStatistics[] {
  logTrace('sideStatisticsRead readSideStatistics', { seatCount: seats.length });
  return [...seats]
    .sort((left, right) => left.seatOrder - right.seatOrder)
    .map((seat) => {
      const funds = readMercenaryFunds(ops, seat.seatId);
      return {
        seatId: seat.seatId,
        out: seat.outTurn != null,
        ...readUnitCounts(ops, seat.seatId),
        ...readHexTotals(ops, seat.seatId),
        treasury: funds.credits,
        upkeepPerTurn: funds.upkeepPerTurn,
        unitsLost: null,
        costUsd: seat.costUsd,
      };
    });
}
