/**
 * Reads the end-of-turn facts and writes the decision.
 *
 * Purpose: The pure rules stay free of SQL. This module gathers homes, control, and city counts, then stores the outcome.
 * When to use: At the end of strategic resolution, and when the human ends the match from the knockout dialog.
 * Expected outcome: Roster places and, when the match is over, `game_over`, `winner`, and `game_end_reason`.
 * Exceptions: Propagates SQLite errors and a baseline lookup that throws.
 */

import { activeGameMap } from '../../shared/activeGameMap';
import { activeSeats } from '../../shared/seatRoster';
import type { SeatId } from '../../shared/seatIds';
import { countCityHexesBySeat, rankSeatsByCityHexes } from '../../shared/victoryRules';
import {
  dbGetOne,
  dbRun,
  getHexControlMap,
  getScenarioHomeRegionHexes,
  getSeatRoster,
  listStrategicInfrastructureRows,
  sumUrbanHexCountForHexes,
} from '../gameDb';
import { readVictorySettings, setGameOutcomeWithOps } from '../gameDb/gameConfigKv';
import { writeSeatKnockout, writeSeatPlace } from '../gameDb/seatRosterStore';
import { logDebug, logError, logTrace } from '../logger';
import { getStrategicProductionContext, isTerrainClassificationCacheLoaded } from '../terrainClassificationCache';
import { computeHomeControlProgress, computeHomeLossProgress } from './homeControlProgress';
import { decideEndOfTurnOutcome, type EndOfTurnOutcome } from './endOfTurnOutcomeRules';

/**
 * The share the home-loss rule will actually apply, or null for the every-hex fallback.
 *
 * Purpose: A map whose classification cache is not loaded must not throw while counting baseline urban cells.
 * When to use: The end-of-turn check and the prompt helper, so they cannot disagree.
 * Expected outcome: The profile share when it is a number and the cache is loaded. Otherwise null, and the home is lost only when every home hex is held by other sides or Neutral.
 * Exceptions: None.
 */
export function effectiveControlWinMinUrbanShare(): number | null {
  const share = activeGameMap().controlWinMinUrbanShare;
  if (typeof share === 'number' && !isTerrainClassificationCacheLoaded()) {
    logError(
      'effectiveControlWinMinUrbanShare: classification cache is not loaded; home loss uses the every-hex fallback',
      new Error('terrain classification cache is not loaded')
    );
    return null;
  }
  logTrace('effectiveControlWinMinUrbanShare', { share });
  return share;
}

/**
 * Original urban cells in one strategic hex, for the home-loss rule.
 *
 * Purpose: The share uses the generated baseline. A missing cache falls back to counting hexes instead.
 * When to use: `computeHomeLossProgress` and `computeHomeControlProgress` while the effective share is known.
 * Expected outcome: The baseline count, or 0 when the every-hex fallback is in force because the cache is not loaded.
 * Exceptions: `getStrategicProductionContext` can throw when the cache is loaded but the hex is missing.
 */
export function baselineUrbanCellsForControlWin(h3Index: string, effectiveShare: number | null): number {
  if (effectiveShare === null && !isTerrainClassificationCacheLoaded()) return 0;
  return getStrategicProductionContext({ h3Index }).urbanHexCount;
}

/**
 * Decides the outcome of the turn that just resolved.
 *
 * Purpose: One database read of the roster, homes, control, and city counts, then the pure rules. A side loses its home when other sides and Neutral together hold the share of its original urban cells, and `outBy` is the seat holding the most of that home.
 * When to use: After production and control, before the turn number advances.
 * Expected outcome: The decision for `turnNumber`. Nothing is written.
 * Exceptions: Propagates SQLite errors and a baseline lookup that throws.
 */
export function evaluateEndOfTurnOutcome(turnNumber: number): EndOfTurnOutcome {
  const seats = getSeatRoster();
  const victory = readVictorySettings({ getOne: dbGetOne, run: dbRun });
  logDebug('evaluateEndOfTurnOutcome', { turnNumber, seatCount: seats.length, rule: victory.rule });
  const controlByHex = getHexControlMap();
  const effectiveShare = effectiveControlWinMinUrbanShare();
  const homeHexes = new Map(seats.map((seat) => [seat.seatId, getScenarioHomeRegionHexes(seat.homeRegion)]));
  const baselineUrbanCellsForHex = (h3Index: string): number => baselineUrbanCellsForControlWin(h3Index, effectiveShare);
  const progress = (attacker: SeatId, victim: SeatId) => computeHomeControlProgress({
    homeHexes: homeHexes.get(victim) ?? [],
    controller: attacker,
    controlByHex,
    baselineUrbanCellsForHex,
    minUrbanShare: effectiveShare,
  });
  const infrastructure = listStrategicInfrastructureRows();
  const cityHexCountBySeat = countCityHexesBySeat(
    [...controlByHex.entries()].map(([h3Index, controllerPlayerId]) => ({ h3Index, controllerPlayerId })),
    infrastructure
  );
  const intactHomeUrbanCellsBySeat = new Map(
    seats.map((seat) => [seat.seatId, sumUrbanHexCountForHexes(homeHexes.get(seat.seatId) ?? [])])
  );
  return decideEndOfTurnOutcome({
    turnNumber,
    seats,
    victory,
    homeControlLost: (victim) => computeHomeLossProgress({
      homeHexes: homeHexes.get(victim) ?? [],
      ownerSeatId: victim,
      controlByHex,
      baselineUrbanCellsForHex,
      minUrbanShare: effectiveShare,
    }).homeLost,
    cityHexCountBySeat,
    intactHomeUrbanCellsBySeat,
    homeCityCellsControlledBy: (victim, controller) => progress(controller, victim).heldUrbanCells,
  });
}

/**
 * Writes knockouts, final places, and game-over flags.
 *
 * Purpose: A place is written only for a seat knocked out on this turn or ranked because the match ended.
 * When to use: Immediately after `evaluateEndOfTurnOutcome`, and from `endMatchByHuman`.
 * Expected outcome: Roster rows for those seats change. When the match is over, `game_over` is 1.
 * Exceptions: Propagates SQLite errors.
 */
export function recordEndOfTurnOutcome(outcome: EndOfTurnOutcome, turnNumber: number): void {
  logDebug('recordEndOfTurnOutcome', {
    turnNumber,
    knockoutCount: outcome.knockouts.length,
    gameOver: outcome.gameOver,
    endReason: outcome.endReason,
  });
  const ops = { run: dbRun };
  for (const knockout of outcome.knockouts) {
    writeSeatKnockout(ops, {
      seatId: knockout.seatId,
      outTurn: turnNumber,
      outBy: knockout.outBy,
      outReasons: knockout.reasons,
      place: knockout.place,
    });
  }
  for (const [seatId, place] of outcome.finalPlaces) {
    writeSeatPlace(ops, seatId, place);
  }
  if (outcome.gameOver && outcome.endReason) {
    setGameOutcomeWithOps({ run: dbRun, getOne: dbGetOne }, { winnerSeatId: outcome.winnerSeatId, endReason: outcome.endReason });
  }
}

/**
 * Ends the match by ranking the seats that are still active.
 *
 * Purpose: The human can leave a match that is still being played. Nothing calls this until the knockout dialog does.
 * When to use: When the human chooses to end the match.
 * Expected outcome: Active seats receive city-hex places. `game_end_reason` is `ended_by_human`. No new knockout is written.
 * Exceptions: Propagates SQLite errors.
 */
export function endMatchByHuman(turnNumber: number): EndOfTurnOutcome {
  const active = activeSeats(getSeatRoster());
  const cityHexCountBySeat = countCityHexesBySeat(
    [...getHexControlMap().entries()].map(([h3Index, controllerPlayerId]) => ({ h3Index, controllerPlayerId })),
    listStrategicInfrastructureRows()
  );
  const finalPlaces = rankSeatsByCityHexes(active.map((seat) => seat.seatId), cityHexCountBySeat);
  const first = [...finalPlaces.entries()].filter(([, place]) => place === 1);
  const outcome: EndOfTurnOutcome = {
    knockouts: [],
    gameOver: true,
    endReason: 'ended_by_human',
    finalPlaces,
    winnerSeatId: first.length === 1 ? first[0]![0] : null,
  };
  logDebug('endMatchByHuman', { turnNumber, activeCount: active.length });
  recordEndOfTurnOutcome(outcome, turnNumber);
  return outcome;
}
