/**
 * Strategic fortification soak against the open match database.
 *
 * Purpose: Combat resolution stays free of SQL. This module strips a cell and records the loss.
 * When to use: Once per strategic turn, then pass the hooks into ranged fire, melee, and air strikes.
 * Expected outcome: A hit on the controller's units removes one fortified cell. A hit on anyone else does not.
 * Exceptions: Propagates SQLite errors from the cell write.
 */

import {
  getHexController,
  getStrategicInfrastructureForHex,
  listFortifiedCellsForHex,
  setTacticalCellFortified,
} from '../gameDb';
import {
  recordFortificationLoss,
  type FortificationCombatHooks,
  type FortificationLossTally,
  type FortificationVictim,
} from '../fortificationCombat';
import type { FortificationReport } from '../../shared/ipc/fortificationTypes';
import { logDebug, logTrace } from '../logger';

/**
 * Removes one fortified cell and records it.
 *
 * Purpose: `absorbHit` and `stripOne` share the pick and the write.
 * When to use: After the caller has decided the hex may lose a fortification.
 * Expected outcome: False, with no random draw, when no fortified cell is listed. Otherwise one cell is cleared and the tally grows by 1.
 * Exceptions: Propagates SQLite errors.
 */
function stripListedCell(h3Index: string, next: () => number, tally: FortificationLossTally): boolean {
  const cells = listFortifiedCellsForHex(h3Index);
  if (cells.length === 0) return false;
  const cell = cells[Math.floor(next() * cells.length)];
  if (!cell) return false;
  setTacticalCellFortified(cell, false);
  recordFortificationLoss(tally, h3Index, 1);
  logDebug('fortificationCombatLedger stripListedCell', { h3Index, cell, remainingListed: cells.length - 1 });
  return true;
}

/**
 * Builds the soak hooks for one strategic turn.
 *
 * Purpose: Ranged fire, melee, and air strikes share one way of spending a fortification.
 * When to use: Right after the turn's combat `next` exists, including a melee-intercept resume.
 * Expected outcome: `absorbHit` is true only for the hex controller, and only when a cell was cleared. `stripOne` skips the owner check. Neither draws when no fortified cell is listed.
 * Exceptions: Propagates SQLite errors.
 */
export function createStrategicFortificationHooks(args: {
  readonly next: () => number;
  readonly tally: FortificationLossTally;
}): FortificationCombatHooks {
  logDebug('createStrategicFortificationHooks', { recordedHexes: args.tally.size });
  return {
    absorbHit(victim: FortificationVictim): boolean {
      if (getStrategicInfrastructureForHex(victim.h3Index).fortifiedCount <= 0) return false;
      if (getHexController(victim.h3Index) !== victim.player) return false;
      return stripListedCell(victim.h3Index, args.next, args.tally);
    },
    isEnemyFortifiedHex(h3Index: string, attackerPlayer: string): boolean {
      const controller = getHexController(h3Index);
      const fortified = controller !== null
        && controller !== attackerPlayer
        && getStrategicInfrastructureForHex(h3Index).fortifiedCount > 0;
      logTrace('fortificationCombatLedger isEnemyFortifiedHex', { h3Index, attackerPlayer, controller, fortified });
      return fortified;
    },
    stripOne(h3Index: string): boolean {
      if (getStrategicInfrastructureForHex(h3Index).fortifiedCount <= 0) return false;
      return stripListedCell(h3Index, args.next, args.tally);
    },
  };
}

/**
 * Turns the turn tally into report rows.
 *
 * Purpose: The turn report names each hex that lost fortifications, under the side that owned them.
 * When to use: After strategic fighting and before control resolution, so `ownerId` is still the side that held the hex.
 * Expected outcome: One row per hex whose tally is above 0, sorted by hex. `remaining` is the fortified count still on the hex.
 * Exceptions: Propagates SQLite errors from the controller and infrastructure reads.
 */
export function buildFortificationReports(tally: FortificationLossTally): FortificationReport[] {
  const hexes = [...tally.keys()].filter((h3Index) => (tally.get(h3Index) ?? 0) > 0).sort((left, right) => left.localeCompare(right));
  const reports = hexes.map((h3Index) => ({
    h3Index,
    ownerId: getHexController(h3Index),
    lost: tally.get(h3Index) ?? 0,
    remaining: getStrategicInfrastructureForHex(h3Index).fortifiedCount,
  }));
  logDebug('buildFortificationReports', { reportCount: reports.length });
  return reports;
}
