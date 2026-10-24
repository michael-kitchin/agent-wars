/**
 * Reads and replaces the `seats` table.
 *
 * Purpose: One module owns SQL against the roster so later writers stay in this file.
 * When to use: Reset, snapshots, and any later roster update.
 * Expected outcome: Rows come back in seat order. A bad `out_reasons` value becomes an empty list.
 * Exceptions: `replaceSeatRoster` propagates SQLite errors, including a duplicate seat order.
 */

import { logDebug, logError, logTrace } from '../logger';
import { isSeatId, type AiSeatId, type SeatId, HUMAN_SEAT_ID } from '../../shared/seatIds';
import {
  DEFAULT_DOCTRINE,
  DOCTRINES,
  DOCTRINE_CHOICES,
  type Doctrine,
  type DoctrineChoice,
  type SeatCommander,
  type SeatKind,
  type SeatOutReason,
  type SeatRecord,
} from '../../shared/seatRoster';
import type { DbReadOps, DbWriteOps } from './dbOps';

/**
 * One `seats` row as SQLite returns it.
 *
 * Purpose: Column names stay at the SQL boundary.
 * When to use: `readSeatRoster` only.
 * Expected outcome: Nullable text columns arrive as null when unset.
 * Exceptions: None.
 */
type SeatRow = {
  readonly seat_id: string;
  readonly seat_order: number;
  readonly kind: string;
  readonly home_region: string;
  readonly model_id: string | null;
  readonly reasoning_effort: string | null;
  readonly doctrine_choice: string | null;
  readonly doctrine: string | null;
  readonly out_turn: number | null;
  readonly out_by: string | null;
  readonly out_reasons: string;
  readonly place: number | null;
  readonly consultation_count: number;
  readonly cost_usd: number;
};

const SEAT_OUT_REASONS: readonly SeatOutReason[] = ['home_control', 'no_city_hexes', 'home_cities_destroyed'];

/**
 * Returns whether a stored doctrine id is one of the three prompt doctrines.
 *
 * Purpose: A null or unknown doctrine column falls back to Balanced.
 * When to use: While mapping an AI row.
 * Expected outcome: True for aggressive, balanced, and cautious.
 * Exceptions: None.
 */
function isDoctrine(value: string | null): value is Doctrine {
  return value !== null && (DOCTRINES as readonly string[]).includes(value);
}

/**
 * Returns whether a stored choice is a doctrine or Random.
 *
 * Purpose: A null choice is filled from the doctrine that will actually play.
 * When to use: While mapping an AI row.
 * Expected outcome: True for the three doctrines and `'random'`.
 * Exceptions: None.
 */
function isDoctrineChoice(value: string | null): value is DoctrineChoice {
  return value !== null && (DOCTRINE_CHOICES as readonly string[]).includes(value);
}

/**
 * Parses `out_reasons` into known reason ids.
 *
 * Purpose: A corrupt cell must not crash a snapshot.
 * When to use: While mapping a roster row.
 * Expected outcome: The stored array when every entry is a known reason. Otherwise an empty array.
 * Exceptions: None. Invalid JSON and unknown ids are logged.
 */
function readOutReasons(seatId: string, raw: string): readonly SeatOutReason[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    logError('seatRosterStore readOutReasons: invalid JSON', { seatId, raw, err });
    return [];
  }
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string' || !SEAT_OUT_REASONS.includes(entry as SeatOutReason))) {
    logError('seatRosterStore readOutReasons: unknown reason', { seatId, raw });
    return [];
  }
  return parsed as SeatOutReason[];
}

/**
 * Maps one SQL row onto a seat record.
 *
 * Purpose: The human seat has no commander. An AI seat always has a doctrine.
 * When to use: `readSeatRoster` only.
 * Expected outcome: A `SeatRecord`, or null when the seat id or kind is not one this game stores.
 * Exceptions: None. A bad id or kind is logged and skipped.
 */
function seatFromRow(row: SeatRow): SeatRecord | null {
  if (!isSeatId(row.seat_id) || (row.kind !== HUMAN_SEAT_ID && row.kind !== 'ai')) {
    logError('seatRosterStore seatFromRow: unknown seat', { seatId: row.seat_id, kind: row.kind });
    return null;
  }
  const kind: SeatKind = row.kind;
  const doctrine = isDoctrine(row.doctrine) ? row.doctrine : DEFAULT_DOCTRINE;
  const outBy = row.out_by === null ? null : isSeatId(row.out_by) ? row.out_by : null;
  if (row.out_by !== null && outBy === null) {
    logError('seatRosterStore seatFromRow: unknown out_by', { seatId: row.seat_id, outBy: row.out_by });
  }
  return {
    seatId: row.seat_id,
    seatOrder: row.seat_order,
    kind,
    homeRegion: row.home_region,
    commander: kind === HUMAN_SEAT_ID
      ? null
      : {
          modelId: row.model_id,
          reasoningEffort: row.reasoning_effort,
          doctrineChoice: isDoctrineChoice(row.doctrine_choice) ? row.doctrine_choice : doctrine,
          doctrine,
        },
    outTurn: row.out_turn,
    outBy,
    outReasons: readOutReasons(row.seat_id, row.out_reasons),
    place: row.place,
    consultationCount: row.consultation_count,
    costUsd: row.cost_usd,
  };
}

/**
 * Reads the roster in seat order.
 *
 * Purpose: Snapshots and seeding ask who is playing without each caller writing SQL.
 * When to use: After the database is open.
 * Expected outcome: Every valid row, sorted by `seat_order`. Invalid rows are logged and omitted.
 * Exceptions: Propagates SQLite errors from `getAll`.
 */
export function readSeatRoster(ops: Pick<DbReadOps, 'getAll'>): SeatRecord[] {
  logTrace('seatRosterStore readSeatRoster');
  const rows = ops.getAll<SeatRow>(
    `SELECT seat_id, seat_order, kind, home_region, model_id, reasoning_effort, doctrine_choice, doctrine,
            out_turn, out_by, out_reasons, place, consultation_count, cost_usd
     FROM seats
     ORDER BY seat_order`
  );
  return rows.flatMap((row) => {
    const seat = seatFromRow(row);
    return seat === null ? [] : [seat];
  });
}

/**
 * Replaces every roster row.
 *
 * Purpose: A new match and later seat edits write the whole roster in one place.
 * When to use: After the seats for a match are known.
 * Expected outcome: The table contains exactly `seats`, in the order given.
 * Exceptions: Throws when SQLite rejects a row, including a duplicate `seat_order`.
 */
export function replaceSeatRoster(ops: Pick<DbWriteOps, 'run'>, seats: readonly SeatRecord[]): void {
  logDebug('seatRosterStore replaceSeatRoster', { seatCount: seats.length, seatIds: seats.map((seat) => seat.seatId) });
  ops.run('DELETE FROM seats');
  for (const seat of seats) {
    ops.run(
      `INSERT INTO seats (
         seat_id, seat_order, kind, home_region, model_id, reasoning_effort, doctrine_choice, doctrine,
         out_turn, out_by, out_reasons, place, consultation_count, cost_usd
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        seat.seatId,
        seat.seatOrder,
        seat.kind,
        seat.homeRegion,
        seat.commander?.modelId ?? null,
        seat.commander?.reasoningEffort ?? null,
        seat.commander?.doctrineChoice ?? null,
        seat.commander?.doctrine ?? null,
        seat.outTurn,
        seat.outBy,
        JSON.stringify(seat.outReasons),
        seat.place,
        seat.consultationCount,
        seat.costUsd,
      ]
    );
  }
}

/**
 * Records one seat's knockout.
 *
 * Purpose: The end-of-turn writer stores every reason, the credited seat, and the shared place together.
 * When to use: For each seat in `knockouts`. Do not call it for a seat that was already out.
 * Expected outcome: That row's `out_turn`, `out_by`, `out_reasons`, and `place` match the decision.
 * Exceptions: Propagates SQLite errors. A missing seat id updates nothing.
 */
export function writeSeatKnockout(
  ops: Pick<DbWriteOps, 'run'>,
  knockout: { seatId: SeatId; outTurn: number; outBy: SeatId | null; outReasons: readonly SeatOutReason[]; place: number }
): void {
  logDebug('seatRosterStore writeSeatKnockout', {
    seatId: knockout.seatId,
    outTurn: knockout.outTurn,
    outBy: knockout.outBy,
    reasons: knockout.outReasons,
    place: knockout.place,
  });
  ops.run(
    `UPDATE seats SET out_turn = ?, out_by = ?, out_reasons = ?, place = ? WHERE seat_id = ?`,
    [knockout.outTurn, knockout.outBy, JSON.stringify(knockout.outReasons), knockout.place, knockout.seatId]
  );
}

/**
 * Adds one consult to an AI seat's count and cost.
 *
 * Purpose: Each commander keeps its own consultation count and dollars.
 * When to use: After a consult that finished or that spent money, including a failure that reported a cost.
 * Expected outcome: `consultation_count` increases by one. `cost_usd` increases by the finite positive cost, or by zero.
 * Exceptions: Propagates SQLite errors. A missing seat updates nothing.
 */
export function recordSeatConsultation(
  ops: Pick<DbWriteOps, 'run'>,
  seatId: AiSeatId,
  costUsd: number
): void {
  const cost = Number.isFinite(costUsd) && costUsd > 0 ? costUsd : 0;
  logDebug('seatRosterStore recordSeatConsultation', { seatId, costUsd: cost });
  ops.run(
    'UPDATE seats SET consultation_count = consultation_count + 1, cost_usd = cost_usd + ? WHERE seat_id = ?',
    [cost, seatId]
  );
}

/**
 * Records a place for a seat that was still active when the match ended.
 *
 * Purpose: Turn-limit and mutual-wipe ranks are not knockouts, so `out_turn` stays null.
 * When to use: For each entry of `finalPlaces`.
 * Expected outcome: That row's `place` is updated. The rest of the row is unchanged.
 * Exceptions: Propagates SQLite errors.
 */
export function writeSeatPlace(ops: Pick<DbWriteOps, 'run'>, seatId: SeatId, place: number): void {
  logDebug('seatRosterStore writeSeatPlace', { seatId, place });
  ops.run('UPDATE seats SET place = ? WHERE seat_id = ?', [place, seatId]);
}

/**
 * The doctrine stored after a mid-match choice change.
 *
 * Purpose: A named doctrine replaces the one being played. Random keeps the draw already stored.
 * When to use: `updateSeatCommander` only.
 * Expected outcome: The choice itself, or the stored doctrine when the choice is Random. An unknown stored
 * doctrine becomes balanced.
 * Exceptions: None.
 */
function doctrineAfterChoice(choice: DoctrineChoice, stored: Doctrine): Doctrine {
  if (choice === 'random') return (DOCTRINES as readonly string[]).includes(stored) ? stored : DEFAULT_DOCTRINE;
  return choice;
}

/**
 * Updates one AI seat's model, effort, and doctrine choice.
 *
 * Purpose: Commander settings belong on the seat. The app-wide Opponent tab copies into the first AI seat until that tab is gone.
 * When to use: The commander IPC, and when the app-wide model or effort changes during a match.
 * Expected outcome: The updated row. A named choice sets `doctrine` to that choice. Random keeps the stored doctrine.
 * Exceptions: Throws when the seat is missing, human, or already knocked out. Propagates SQLite errors.
 */
export function updateSeatCommander(
  ops: Pick<DbReadOps, 'getAll'> & Pick<DbWriteOps, 'run'>,
  seatId: SeatId,
  commander: Pick<SeatCommander, 'modelId' | 'reasoningEffort' | 'doctrineChoice'>
): SeatRecord {
  logDebug('seatRosterStore updateSeatCommander', {
    seatId,
    hasModel: Boolean(commander.modelId?.trim()),
    doctrineChoice: commander.doctrineChoice,
  });
  const seat = readSeatRoster(ops).find((row) => row.seatId === seatId);
  if (!seat || seat.kind !== 'ai' || seat.commander === null) {
    throw new Error(`Cannot update a commander for ${seatId}`);
  }
  if (seat.outTurn !== null) {
    throw new Error(`Cannot update a commander for a knocked-out seat ${seatId}`);
  }
  const nextCommander: SeatCommander = {
    modelId: commander.modelId,
    reasoningEffort: commander.reasoningEffort,
    doctrineChoice: commander.doctrineChoice,
    doctrine: doctrineAfterChoice(commander.doctrineChoice, seat.commander.doctrine),
  };
  ops.run(
    `UPDATE seats SET model_id = ?, reasoning_effort = ?, doctrine_choice = ?, doctrine = ? WHERE seat_id = ?`,
    [nextCommander.modelId, nextCommander.reasoningEffort, nextCommander.doctrineChoice, nextCommander.doctrine, seatId]
  );
  return { ...seat, commander: nextCommander };
}
