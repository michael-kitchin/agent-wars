/**
 * Reading each AI seat's posture and whether its lead activity ran, for a turn's statistics.
 *
 * Purpose: The charts' posture strip needs, per turn and per commander, the posture in force, whether the commander declared it, and whether the activity that posture leads actually ran.
 * When to use: From `recordTurnStatistics` and `refreshedTurnStatistics`, once per strategic step.
 * Expected outcome: One report per active AI seat. The human seat and seats that left the match get none.
 * Exceptions: `readPostureReports` propagates a SQLite error. The recorder catches it.
 */

import { isAiSeatId } from '../../shared/seatIds';
import { campaignApproachOf, type CampaignObjective } from '../../shared/campaignTypes';
import type { PostureReport, SeatForStatistics } from '../../shared/matchStatistics';
import type { Operation } from '../../shared/operationTypes';
import { DEFAULT_POSTURE, type Posture } from '../../shared/postureTypes';
import { readCampaignObjectives } from '../gameDb/campaignObjectiveMemory';
import type { GameConfigKvDbOps } from '../gameDb/gameConfigKv';
import { readOperations } from '../gameDb/operationMemory';
import { readPosture } from '../gameDb/postureMemory';
import { logDebug, logTrace } from '../logger';

/**
 * What decides whether a posture's lead activity ran for one seat.
 *
 * Purpose: Groups the seat's stored state so the decision stays a pure function of it.
 * When to use: The argument of `postureActing`.
 * Expected outcome: The posture, the seat's stored campaign and operations, and whether it launched a missile.
 * Exceptions: None.
 */
export interface PostureActingInput {
  /**
   * The posture in force for the seat.
   *
   * Contract: A member of `POSTURES`.
   * When to use: Choosing which activity counts as the lead.
   * Expected outcome: The stored posture, or the default.
   * Exceptions: None.
   */
  readonly posture: Posture;
  /**
   * The seat's stored campaign objective.
   *
   * Contract: Null when the seat has none.
   * When to use: The overland posture.
   * Expected outcome: The objective as stored.
   * Exceptions: None.
   */
  readonly objective: CampaignObjective | null;
  /**
   * The seat's stored operations.
   *
   * Contract: Empty when the seat has none.
   * When to use: The maritime and blitz postures.
   * Expected outcome: The operations as stored.
   * Exceptions: None.
   */
  readonly operations: readonly Operation[];
  /**
   * Whether one of the seat's missiles was launched since the previous strategic step.
   *
   * Contract: True when the caller's `launchedSeatIds` holds the seat.
   * When to use: The strangle posture.
   * Expected outcome: A boolean.
   * Exceptions: None.
   */
  readonly launchedMissile: boolean;
}

/**
 * Decides whether a posture's lead activity ran.
 *
 * Purpose: Overland leads with the land campaign assaulting, maritime with a sea operation at sea or landed, blitz with an air operation, and strangle with a missile launch.
 * When to use: Once per seat per turn, from `readPostureReports`.
 * Expected outcome: True when the posture's lead activity ran.
 * Exceptions: None.
 */
export function postureActing(input: PostureActingInput): boolean {
  const { posture, objective, operations, launchedMissile } = input;
  let acting: boolean;
  switch (posture) {
    case 'overland':
      acting = objective !== null && objective.phase === 'assault' && campaignApproachOf(objective) === 'land';
      break;
    case 'maritime':
      acting = operations.some((op) => op.method === 'sea' && (op.phase === 'transit' || op.phase === 'assault'));
      break;
    case 'blitz':
      acting = operations.some((op) => op.method === 'air');
      break;
    case 'strangle':
      acting = launchedMissile;
      break;
  }
  logTrace('postureReportsRead postureActing', { posture, acting });
  return acting;
}

/**
 * What `readPostureReports` needs.
 *
 * Purpose: Keeps the reader's signature to one argument.
 * When to use: The argument of `readPostureReports`.
 * Expected outcome: The database, the roster, and the seats that launched a missile.
 * Exceptions: None.
 */
export interface PostureReportsArgs {
  /**
   * The match database.
   *
   * Contract: Reads `game_config` only.
   * When to use: Reading the postures, campaigns, and operations.
   * Expected outcome: The recorder's `gameDbOps`.
   * Exceptions: None.
   */
  readonly ops: Pick<GameConfigKvDbOps, 'getOne'>;
  /**
   * The roster the statistics use.
   *
   * Contract: Seats in side order.
   * When to use: Choosing which seats get a report.
   * Expected outcome: The rows the recorder passes.
   * Exceptions: None.
   */
  readonly seats: readonly SeatForStatistics[];
  /**
   * The seats that launched a missile since the previous strategic step.
   *
   * Contract: The caller decides the set, so this reader never takes the noted launches itself. `recordTurnStatistics` passes `spentMissileSeatIds` for the step's turn. `refreshedTurnStatistics` passes the seats whose recorded report was strangle and acting, so a refresh keeps that answer.
   * When to use: The strangle posture's acting test.
   * Expected outcome: Seat ids, possibly empty.
   * Exceptions: None.
   */
  readonly launchedSeatIds: ReadonlySet<string>;
}

/**
 * Reads one report per active AI seat.
 *
 * Purpose: Each report names the seat's posture, whether it was declared, and whether the lead activity ran. A seat with no stored posture is on the default and not declared.
 * When to use: Once per strategic step. Each store is read once, not once per seat.
 * Expected outcome: Reports in the roster's order, for seats that are AI seats and still in the match.
 * Exceptions: Propagates a SQLite error.
 */
export function readPostureReports(args: PostureReportsArgs): PostureReport[] {
  const { ops, seats, launchedSeatIds } = args;
  logDebug('postureReportsRead readPostureReports', { seatCount: seats.length, launchedCount: launchedSeatIds.size });
  const objectives = readCampaignObjectives(ops);
  const operations = readOperations(ops);
  const reports: PostureReport[] = [];
  for (const seat of seats) {
    if (!isAiSeatId(seat.seatId) || seat.outTurn != null) continue;
    const stored = readPosture(ops, seat.seatId);
    const posture = stored?.posture ?? DEFAULT_POSTURE;
    reports.push({
      seatId: seat.seatId,
      posture,
      declared: stored !== null,
      acting: postureActing({
        posture,
        objective: objectives.get(seat.seatId) ?? null,
        operations: operations.get(seat.seatId) ?? [],
        launchedMissile: launchedSeatIds.has(seat.seatId),
      }),
    });
  }
  return reports;
}
